import { describe, expect, it, vi } from 'vitest';

import { getAppDatabase } from '#lib/server/database/app-database.js';
import { useTestDatabase } from '#lib/server/database/test-fixtures.js';
import { createCorrection, retireQuestion } from '#lib/server/feedback/service.js';
import { HTTP_BAD_REQUEST } from '#lib/server/http-status.js';
import { saveImportedPack } from '#lib/server/packs/repository.js';
import { seedSamplePack } from '#lib/server/packs/test-fixtures.js';
import {
  createMockAttempt,
  getMockAttempt,
  getMockCoverage,
  getMockCatalog,
  getResumableMockAttempt,
  saveMockAnswer,
  submitMockAttempt,
} from '#lib/server/quiz/mock-service.js';

describe('mock quiz service', () => {
  let pack: Awaited<ReturnType<typeof seedSamplePack>>;
  let options: Parameters<typeof createMockAttempt>[0];

  useTestDatabase(async () => {
    pack = await seedSamplePack();
    options = {
      durationMinutes: 2,
      examId: pack.exam.id,
      packId: pack.pack.id,
      packVersion: pack.pack.version,
      questionCount: 2,
      random: () => 0,
    };
  });

  describe('catalog and coverage', () => {
    it('blocks an attempt when weighted domain coverage is insufficient', async () => {
      const coverage = await getMockCoverage(pack.exam.id, pack.pack.id, pack.pack.version, 5);

      expect(coverage.gaps).toStrictEqual([
        {
          available: 1,
          id: 'delta-lake',
          missing: 2,
          required: 3,
          title: 'Delta Lake foundations',
        },
        {
          available: 1,
          id: 'pipelines',
          missing: 1,
          required: 2,
          title: 'Data pipeline foundations',
        },
      ]);
      await expect(createMockAttempt({ ...options, questionCount: 5 })).rejects.toMatchObject({
        body: {
          message:
            'Insufficient weighted mock coverage: Delta Lake foundations requires 3, has 1; Data pipeline foundations requires 2, has 1.',
        },
        status: HTTP_BAD_REQUEST,
      });
    });

    it('applies feedback to catalog coverage only for its pack version', async () => {
      const nextVersion = structuredClone(pack);
      nextVersion.pack.version = '1.0.1';
      await saveImportedPack(nextVersion);

      const questionId = 'delta-transaction-basics';
      await retireQuestion(
        {
          examId: pack.exam.id,
          packId: pack.pack.id,
          packVersion: pack.pack.version,
          questionId,
        },
        true,
      );
      await createCorrection({
        correction: { domainId: 'pipelines' },
        examId: nextVersion.exam.id,
        packId: nextVersion.pack.id,
        packVersion: nextVersion.pack.version,
        questionId,
      });

      const catalog = await getMockCatalog(5);
      const originalKey = `${pack.exam.id}|${pack.pack.id}|${pack.pack.version}`;
      const nextKey = `${nextVersion.exam.id}|${nextVersion.pack.id}|${nextVersion.pack.version}`;

      expect(catalog.packs.map(({ packVersion }) => packVersion)).toStrictEqual([
        '1.0.1',
        pack.pack.version,
      ]);
      expect(catalog.coverages[originalKey]?.gaps.map(({ available }) => available)).toStrictEqual([
        0, 1,
      ]);
      expect(catalog.coverages[nextKey]?.gaps.map(({ available }) => available)).toStrictEqual([0]);
    });

    it('keeps catalog reads within a two-query budget for one or multiple versions', async () => {
      const executeQuery = vi.spyOn(getAppDatabase().getExecutor(), 'executeQuery');

      try {
        await getMockCatalog(1);
        expect(executeQuery.mock.calls.length).toBeLessThanOrEqual(2);

        await ['1.0.1', '1.0.2'].reduce(async (previous, version) => {
          await previous;
          const nextVersion = structuredClone(pack);
          nextVersion.pack.version = version;
          await saveImportedPack(nextVersion);
        }, Promise.resolve());

        executeQuery.mockClear();
        await getMockCatalog(1);
        expect(executeQuery.mock.calls.length).toBeLessThanOrEqual(2);
      } finally {
        executeQuery.mockRestore();
      }
    });
  });

  describe('timed attempts', () => {
    it('orders saved answers by timestamp and decodes answer arrays from SQLite', async () => {
      const startedAt = Date.now();
      const attempt = await createMockAttempt({ ...options, now: startedAt });

      await saveMockAnswer(attempt.id, 'pipeline-validation-basics', ['a', 'b'], startedAt + 2000);
      await saveMockAnswer(attempt.id, 'delta-transaction-basics', ['a'], startedAt + 1000);

      await expect(getMockAttempt(attempt.id, startedAt + 3000)).resolves.toMatchObject({
        answers: [
          { answerIds: ['a'], questionId: 'delta-transaction-basics' },
          { answerIds: ['a', 'b'], questionId: 'pipeline-validation-basics' },
        ],
      });
    });

    it('preserves answer insertion order when timestamps tie', async ({ onTestFinished }) => {
      vi.useFakeTimers({ toFake: ['Date'] });
      onTestFinished(() => {
        vi.useRealTimers();
      });

      const attempt = await createMockAttempt(options);
      await saveMockAnswer(attempt.id, 'pipeline-validation-basics', ['a', 'b']);
      await saveMockAnswer(attempt.id, 'delta-transaction-basics', ['a']);

      await expect(getMockAttempt(attempt.id)).resolves.toMatchObject({
        answers: [
          { answerIds: ['a', 'b'], questionId: 'pipeline-validation-basics' },
          { answerIds: ['a'], questionId: 'delta-transaction-basics' },
        ],
      });
    });

    it('resumes the newest tied in-progress attempt and skips closed attempts', async ({
      onTestFinished,
    }) => {
      vi.useFakeTimers({ toFake: ['Date'] });
      onTestFinished(() => {
        vi.useRealTimers();
      });

      const older = await createMockAttempt(options);
      const newer = await createMockAttempt(options);

      await expect(getResumableMockAttempt()).resolves.toMatchObject({ id: newer.id });

      await submitMockAttempt(newer.id);
      await expect(getResumableMockAttempt()).resolves.toMatchObject({ id: older.id });

      await submitMockAttempt(older.id);
      await expect(getResumableMockAttempt()).resolves.toBeUndefined();
      await expect(getMockAttempt('missing-attempt')).resolves.toBeUndefined();
    });

    it('persists answers and the deadline across resume without revealing a score', async () => {
      const startedAt = Date.now();
      const attempt = await createMockAttempt({ ...options, now: startedAt });

      const saved = await saveMockAnswer(
        attempt.id,
        'delta-transaction-basics',
        ['a'],
        startedAt + 10_000,
      );

      expect(saved.answers[0]).toStrictEqual({
        answerIds: ['a'],
        questionId: 'delta-transaction-basics',
      });
      expect(saved.questions[0]).not.toHaveProperty('answerIds');
      expect(saved.answers[0]).not.toHaveProperty('correct');

      await saveMockAnswer(attempt.id, 'pipeline-validation-basics', ['a'], startedAt + 20_000);
      const resumed = await getResumableMockAttempt(startedAt + 30_000);

      expect(resumed).toMatchObject({
        answers: [
          { answerIds: ['a'], questionId: 'delta-transaction-basics' },
          { answerIds: ['a'], questionId: 'pipeline-validation-basics' },
        ],
        id: attempt.id,
        remainingMilliseconds: 90_000,
        status: 'in_progress',
      });
      expect(resumed).not.toHaveProperty('score');
    });

    it('reveals the score and explanations after submit', async () => {
      const startedAt = Date.now();
      const attempt = await createMockAttempt({ ...options, now: startedAt });

      await saveMockAnswer(attempt.id, 'delta-transaction-basics', ['a'], startedAt + 10_000);
      await saveMockAnswer(attempt.id, 'pipeline-validation-basics', ['a'], startedAt + 20_000);
      const completed = await submitMockAttempt(attempt.id, startedAt + 40_000);

      expect(completed).toMatchObject({
        answers: [
          { answerIds: ['a'], correct: true, questionId: 'delta-transaction-basics' },
          { answerIds: ['a'], correct: false, questionId: 'pipeline-validation-basics' },
        ],
        questions: [
          { answerIds: ['a'], id: 'delta-transaction-basics' },
          { answerIds: ['a', 'b'], id: 'pipeline-validation-basics' },
        ],
        score: {
          correct: 1,
          domains: [
            { correct: 1, id: 'delta-lake', percent: 100, total: 1 },
            { correct: 0, id: 'pipelines', percent: 0, total: 1 },
          ],
          passed: false,
          passingThreshold: 70,
          percent: 50,
          total: 2,
        },
        status: 'submitted',
      });
      expect(completed.questions[0]).toHaveProperty('explanation');
      expect(completed.questions[1]).toHaveProperty('explanation');
    });

    it('expires at the deadline and reveals saved answers', async () => {
      const startedAt = Date.now();
      const attempt = await createMockAttempt({ ...options, durationMinutes: 1, now: startedAt });

      await saveMockAnswer(attempt.id, 'delta-transaction-basics', ['a'], startedAt + 1000);
      const expired = await getMockAttempt(attempt.id, startedAt + 60_001);

      expect(expired).toMatchObject({
        answers: [{ answerIds: ['a'], correct: true, questionId: 'delta-transaction-basics' }],
        score: { correct: 1 },
        status: 'expired',
      });
      expect(expired?.questions[0]).toHaveProperty('explanation');
    });

    it('omits pass and fail when the blueprint has no threshold', async () => {
      const packWithoutThreshold = structuredClone(pack);
      packWithoutThreshold.pack.version = '1.0.1';
      delete packWithoutThreshold.passingThreshold;
      await saveImportedPack(packWithoutThreshold);

      const startedAt = Date.now();

      const attempt = await createMockAttempt({
        ...options,
        now: startedAt,
        packVersion: '1.0.1',
        questionCount: 2,
      });

      const completed = await submitMockAttempt(attempt.id, startedAt + 1000);

      expect(completed.score).not.toHaveProperty('passingThreshold');
      expect(completed.score).not.toHaveProperty('passed');
    });
  });
});
