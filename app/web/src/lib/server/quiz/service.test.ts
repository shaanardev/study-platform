import { describe, expect, it, vi } from 'vitest';

import { useTestDatabase } from '#lib/server/database/test-fixtures.js';
import { seedSamplePack } from '#lib/server/packs/test-fixtures.js';
import {
  answerQuestion,
  createPracticeSession,
  getPracticeSession,
  getResumablePracticeSession,
} from '#lib/server/quiz/service.js';
import type { StartPracticeOptions } from '#lib/server/quiz/service.js';

describe('practice sessions', () => {
  let options: StartPracticeOptions;

  useTestDatabase(async () => {
    const pack = await seedSamplePack();
    options = {
      examId: pack.exam.id,
      packId: pack.pack.id,
      packVersion: pack.pack.version,
      questionCount: 1,
      random: () => 0,
    };
  });

  it('grades multiple responses by exact answer set and persists the result', async () => {
    const session = await createPracticeSession({ ...options, domainIds: ['pipelines'] });
    const result = await answerQuestion(session.id, 'pipeline-validation-basics', ['a']);

    expect(session.questions[0]).not.toHaveProperty('answerIds');
    expect(result).toMatchObject({
      answerIds: ['a'],
      answerIdsCorrect: ['a', 'b'],
      correct: false,
    });
    expect(result.explanation).toContain('Quality checks');
    await expect(getPracticeSession(session.id)).resolves.toMatchObject({
      answers: [{ answerIds: ['a'], correct: false, questionId: 'pipeline-validation-basics' }],
    });
  });

  it('completes a session when concurrent answers fill its question set', async () => {
    const questionIds = ['pipeline-validation-basics', 'delta-transaction-basics'];
    const session = await createPracticeSession({ ...options, questionCount: 2, questionIds });

    await Promise.all(questionIds.map(async (id) => await answerQuestion(session.id, id, ['a'])));

    const completed = await getPracticeSession(session.id);

    expect(completed?.status).toBe('completed');
    expect(completed?.answers.map(({ questionId }) => questionId).toSorted()).toStrictEqual(
      questionIds.toSorted(),
    );
  });

  it('preserves answer arrays and insertion order when answer timestamps match', async ({
    onTestFinished,
  }) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    onTestFinished(() => {
      vi.useRealTimers();
    });

    const session = await createPracticeSession({ ...options, questionCount: 2 });

    await answerQuestion(session.id, 'pipeline-validation-basics', ['a', 'b']);
    await answerQuestion(session.id, 'delta-transaction-basics', ['a']);

    await expect(getPracticeSession(session.id)).resolves.toMatchObject({
      answers: [
        { answerIds: ['a', 'b'], questionId: 'pipeline-validation-basics' },
        { answerIds: ['a'], questionId: 'delta-transaction-basics' },
      ],
    });
  });

  it('resumes the latest session when timestamps tie and skips completed sessions', async ({
    onTestFinished,
  }) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    onTestFinished(() => {
      vi.useRealTimers();
    });

    const selected = { ...options, questionIds: ['pipeline-validation-basics'] };
    const older = await createPracticeSession(selected);
    const newer = await createPracticeSession(selected);

    await expect(getResumablePracticeSession()).resolves.toMatchObject({ id: newer.id });

    await answerQuestion(newer.id, 'pipeline-validation-basics', ['a']);
    await expect(getResumablePracticeSession()).resolves.toMatchObject({ id: older.id });

    await answerQuestion(older.id, 'pipeline-validation-basics', ['a']);
    await expect(getResumablePracticeSession()).resolves.toBeUndefined();
  });

  it('returns no session when none exists', async () => {
    await expect(getPracticeSession('missing-session')).resolves.toBeUndefined();
    await expect(getResumablePracticeSession()).resolves.toBeUndefined();
  });

  it('prefers unseen questions and includes missed questions when retrying a domain', async () => {
    const first = await createPracticeSession({ ...options, domainIds: ['pipelines'] });
    await answerQuestion(first.id, 'pipeline-validation-basics', ['c']);

    const mixed = await createPracticeSession(options);
    const retry = await createPracticeSession({ ...options, domainIds: ['pipelines'] });

    expect(mixed.questionIds).toStrictEqual(['delta-transaction-basics']);
    expect(retry.questionIds).toStrictEqual(['pipeline-validation-basics']);
  });

  it('uses the exact questions selected from progress', async () => {
    const session = await createPracticeSession({
      ...options,
      questionIds: ['pipeline-validation-basics'],
    });

    expect(session.questionIds).toStrictEqual(['pipeline-validation-basics']);
  });
});
