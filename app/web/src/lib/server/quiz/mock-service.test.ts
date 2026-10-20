import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { validateExamPack } from '@learning-platform/exam-pack';
import { afterEach, describe, expect, it } from 'vitest';

import { createDatabase } from '#lib/server/database/connection.js';
import { HTTP_BAD_REQUEST } from '#lib/server/http-status.js';
import { saveImportedPack } from '#lib/server/packs/repository.js';
import {
  createMockAttempt,
  getMockAttempt,
  getMockCoverage,
  saveMockAnswer,
  submitMockAttempt,
} from '#lib/server/quiz/mock-service.js';
import { workspacePath } from '#lib/server/workspace-paths.js';

describe('timed mock attempts', () => {
  const dirs: string[] = [];
  const databases: Awaited<ReturnType<typeof createDatabase>>[] = [];

  afterEach(async () => {
    await Promise.all(
      databases.splice(0).map(async (database) => {
        await database.destroy();
      }),
    );
    await Promise.all(
      dirs.splice(0).map(async (dir) => {
        await rm(dir, { force: true, recursive: true });
      }),
    );
  });

  const setup = async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'mock-exam-'));
    dirs.push(directory);
    const databasePath = path.join(directory, 'packs.sqlite');

    const validated = validateExamPack(
      JSON.parse(
        await readFile(workspacePath('packs/incoming/sample-learning-pack.json'), 'utf-8'),
      ),
    );

    expect.assert(validated.valid, validated.errors.join(' '));

    const { pack } = validated;
    const database = await createDatabase(databasePath);
    databases.push(database);
    await saveImportedPack(database, pack);

    return { database, pack };
  };

  it('blocks an attempt when weighted domain coverage is insufficient', async () => {
    const { database, pack } = await setup();

    const coverage = await getMockCoverage(
      pack.exam.id,
      pack.pack.id,
      pack.pack.version,
      5,
      database,
    );

    expect(coverage.gaps).toStrictEqual([
      { available: 1, id: 'delta-lake', missing: 2, required: 3, title: 'Delta Lake foundations' },
      {
        available: 1,
        id: 'pipelines',
        missing: 1,
        required: 2,
        title: 'Data pipeline foundations',
      },
    ]);
    await expect(
      createMockAttempt({
        database,
        durationMinutes: 30,
        examId: pack.exam.id,
        packId: pack.pack.id,
        packVersion: pack.pack.version,
        questionCount: 5,
      }),
    ).rejects.toMatchObject({
      body: {
        message:
          'Insufficient weighted mock coverage: Delta Lake foundations requires 3, has 1; Data pipeline foundations requires 2, has 1.',
      },
      status: HTTP_BAD_REQUEST,
    });
  });

  it('persists answers and deadline across resume, then reveals scoring only after submit', async () => {
    const { database, pack } = await setup();

    const attempt = await createMockAttempt({
      database,
      durationMinutes: 2,
      examId: pack.exam.id,
      now: 10_000,
      packId: pack.pack.id,
      packVersion: pack.pack.version,
      questionCount: 2,
      random: () => 0,
    });

    const [first] = attempt.questions;

    expect.assert(first, 'The mock attempt should include a question.');
    expect(first.id).toBe('delta-transaction-basics');

    const saved = await saveMockAnswer(attempt.id, first.id, ['a'], database, 20_000);

    const [savedAnswer] = saved.answers;
    const [savedQuestion] = saved.questions;

    expect.assert(savedAnswer, 'The saved mock should include an answer.');
    expect.assert(savedQuestion, 'The saved mock should include a question.');

    expect({
      answerCorrect: Object.hasOwn(savedAnswer, 'correct'),
      answerExplanation: Object.hasOwn(savedAnswer, 'explanation'),
      questionAnswerIds: Object.hasOwn(savedQuestion, 'answerIds'),
      questionExplanation: Object.hasOwn(savedQuestion, 'explanation'),
    }).toStrictEqual({
      answerCorrect: false,
      answerExplanation: false,
      questionAnswerIds: false,
      questionExplanation: false,
    });
    const resumed = await getMockAttempt(attempt.id, database, 40_000);

    expect.assert(resumed, 'The mock attempt should remain available.');

    expect({
      answerCount: resumed.answers.length,
      hasScore: Object.hasOwn(resumed, 'score'),
      remainingMilliseconds: resumed.remainingMilliseconds,
    }).toStrictEqual({ answerCount: 1, hasScore: false, remainingMilliseconds: 90_000 });
    const completed = await submitMockAttempt(attempt.id, database, 50_000);
    expect({
      domains: completed.score?.domains.map(({ id, correct, total }) => ({ correct, id, total })),
      hasExplanations: completed.questions.every((question) => 'explanation' in question),
      score: completed.score,
      status: completed.status,
    }).toStrictEqual({
      domains: [
        { correct: 1, id: 'delta-lake', total: 1 },
        { correct: 0, id: 'pipelines', total: 1 },
      ],
      hasExplanations: true,
      score: {
        correct: 1,
        domains: [
          { correct: 1, id: 'delta-lake', percent: 100, title: 'Delta Lake foundations', total: 1 },
          { correct: 0, id: 'pipelines', percent: 0, title: 'Data pipeline foundations', total: 1 },
        ],
        passed: false,
        passingThreshold: 70,
        percent: 50,
        total: 2,
      },
      status: 'submitted',
    });
  });

  it('expires at the persisted deadline and reveals the saved answers', async () => {
    const { database, pack } = await setup();

    const attempt = await createMockAttempt({
      database,
      durationMinutes: 1,
      examId: pack.exam.id,
      now: 5000,
      packId: pack.pack.id,
      packVersion: pack.pack.version,
      questionCount: 2,
      random: () => 0,
    });

    await saveMockAnswer(attempt.id, 'delta-transaction-basics', ['a'], database, 6000);
    const expired = await getMockAttempt(attempt.id, database, 65_000);

    expect.assert(expired, 'The expired mock attempt should remain available.');

    expect(expired.status).toBe('expired');
    expect(expired.score?.correct).toBe(1);
    expect(expired.questions[0]).toHaveProperty('explanation');
  });

  it('does not report pass or fail when the blueprint has no threshold', async () => {
    const { database, pack } = await setup();
    const packWithoutThreshold = structuredClone(pack);
    packWithoutThreshold.pack.version = '1.0.1';
    delete packWithoutThreshold.passingThreshold;
    await saveImportedPack(database, packWithoutThreshold);

    const attempt = await createMockAttempt({
      database,
      durationMinutes: 1,
      examId: pack.exam.id,
      now: 1000,
      packId: pack.pack.id,
      packVersion: '1.0.1',
      questionCount: 2,
      random: () => 0,
    });

    const completed = await submitMockAttempt(attempt.id, database, 2000);
    expect(completed.score).not.toHaveProperty('passingThreshold');
    expect(completed.score).not.toHaveProperty('passed');
  });
});
