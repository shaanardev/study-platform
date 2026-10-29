import type { ExamPack } from '@learning-platform/exam-pack';
import { describe, expect, it, vi } from 'vitest';

import { useTestDatabase } from '#lib/server/database/test-fixtures.js';
import { createCorrection, retireQuestion } from '#lib/server/feedback/service.js';
import { saveImportedPack } from '#lib/server/packs/repository.js';
import { getProgress } from '#lib/server/progress/queries.js';
import {
  createMockAttempt,
  saveMockAnswer,
  submitMockAttempt,
} from '#lib/server/quiz/mock-service.js';
import { answerQuestion, createPracticeSession } from '#lib/server/quiz/service.js';
import type { StartPracticeOptions } from '#lib/server/quiz/service.js';

describe('progress queries', () => {
  let pack: ExamPack;
  let practiceOptions: StartPracticeOptions;
  let mockOptions: Omit<Parameters<typeof createMockAttempt>[0], 'now'>;

  useTestDatabase(async () => {
    pack = {
      domains: [
        { id: 'storage', title: 'Storage', weight: 60 },
        { id: 'compute', title: 'Compute', weight: 40 },
      ],
      exam: { id: 'exam-a', title: 'Cloud exam', version: '2026' },
      pack: { id: 'pack-a', synthetic: false, title: 'Cloud foundations', version: '1.0' },
      questions: [
        {
          answerIds: ['yes'],
          domainId: 'storage',
          explanation: 'Yes.',
          id: 'q-storage',
          options: [
            { id: 'yes', text: 'Yes' },
            { id: 'no', text: 'No' },
          ],
          prompt: 'Storage?',
          sources: [{ label: 'Notes', path: 'notes.md' }],
          type: 'single_choice',
        },
        {
          answerIds: ['yes'],
          domainId: 'compute',
          explanation: 'Yes.',
          id: 'q-compute',
          options: [
            { id: 'yes', text: 'Yes' },
            { id: 'no', text: 'No' },
          ],
          prompt: 'Compute?',
          sources: [{ label: 'Notes', path: 'notes.md' }],
          type: 'single_choice',
        },
      ],
      schemaVersion: 1,
    };

    await saveImportedPack(pack);

    practiceOptions = {
      examId: pack.exam.id,
      packId: pack.pack.id,
      packVersion: pack.pack.version,
      questionCount: 2,
      random: () => 0,
    };
    mockOptions = {
      durationMinutes: 30,
      examId: pack.exam.id,
      packId: pack.pack.id,
      packVersion: pack.pack.version,
      questionCount: 2,
      random: () => 0,
    };
  });

  it('keeps unanswered practice and mock attempts while leaving scores empty', async () => {
    await createPracticeSession(practiceOptions);
    await createMockAttempt({
      ...mockOptions,
      now: Date.now(),
    });

    const progress = await getProgress();

    expect(progress.recentAttempts).toHaveLength(2);
    expect(progress.recentAttempts).toStrictEqual(
      expect.arrayContaining([
        expect.objectContaining({ answeredCount: 0, correctCount: 0, kind: 'practice' }),
        expect.objectContaining({ answeredCount: 0, correctCount: 0, kind: 'mock' }),
      ]),
    );
    expect(progress.domainScores).toStrictEqual([]);
    expect(progress.missedQuestions).toStrictEqual([]);
    expect(progress.nextStudyAction).toStrictEqual({ kind: 'start_practice' });
  });

  it('recommends the weakest domain with its evidence and pack version', async () => {
    const session = await createPracticeSession({
      ...practiceOptions,
      questionCount: 1,
      questionIds: ['q-storage'],
    });

    await answerQuestion(session.id, 'q-storage', ['no']);

    await expect(getProgress()).resolves.toMatchObject({
      nextStudyAction: {
        answeredCount: 1,
        correctCount: 0,
        domainId: 'storage',
        domainTitle: 'Storage',
        examId: pack.exam.id,
        kind: 'domain',
        packId: pack.pack.id,
        packTitle: pack.pack.title,
        packVersion: pack.pack.version,
        percent: 0,
        questionCount: 1,
      },
    });
  });

  it('breaks recommendation ties by pack ID when display titles match', async () => {
    const duplicatePack = structuredClone(pack);
    duplicatePack.pack = { ...duplicatePack.pack, id: 'pack-z' };
    await saveImportedPack(duplicatePack);

    const firstPackSession = await createPracticeSession({
      ...practiceOptions,
      questionCount: 1,
      questionIds: ['q-storage'],
    });

    const duplicatePackSession = await createPracticeSession({
      ...practiceOptions,
      packId: duplicatePack.pack.id,
      questionCount: 1,
      questionIds: ['q-storage'],
    });

    await answerQuestion(firstPackSession.id, 'q-storage', ['no']);
    await answerQuestion(duplicatePackSession.id, 'q-storage', ['no']);

    await expect(getProgress()).resolves.toMatchObject({
      nextStudyAction: { domainId: 'storage', kind: 'domain', packId: 'pack-a' },
    });
  });

  it('orders tied scores and misses consistently before choosing a recommendation', async () => {
    const duplicatePack = structuredClone(pack);
    duplicatePack.pack = { ...duplicatePack.pack, id: 'pack-z' };
    const newerVersionPack = structuredClone(pack);
    newerVersionPack.pack = { ...newerVersionPack.pack, version: '2.0' };
    const duplicateExam = structuredClone(pack);
    duplicateExam.exam = { ...duplicateExam.exam, id: 'exam-z' };

    await saveImportedPack(duplicatePack);
    await saveImportedPack(newerVersionPack);
    await saveImportedPack(duplicateExam);

    await Promise.all(
      [duplicateExam, duplicatePack, newerVersionPack, pack].map(async (variant) => {
        const session = await createPracticeSession({
          ...practiceOptions,
          examId: variant.exam.id,
          packId: variant.pack.id,
          packVersion: variant.pack.version,
          questionCount: 1,
          questionIds: ['q-storage'],
        });

        await answerQuestion(session.id, 'q-storage', ['no']);
      }),
    );

    const progress = await getProgress();

    const expectedPackOrder = [
      { examId: 'exam-a', packId: 'pack-a', packVersion: '1.0' },
      { examId: 'exam-a', packId: 'pack-a', packVersion: '2.0' },
      { examId: 'exam-a', packId: 'pack-z', packVersion: '1.0' },
      { examId: 'exam-z', packId: 'pack-a', packVersion: '1.0' },
    ];

    expect(
      progress.domainScores.map(({ examId, packId, packVersion }) => ({
        examId,
        packId,
        packVersion,
      })),
    ).toStrictEqual(expectedPackOrder);
    expect(
      progress.missedQuestions.map(({ examId, packId, packVersion }) => ({
        examId,
        packId,
        packVersion,
      })),
    ).toStrictEqual(expectedPackOrder);
    expect(progress.nextStudyAction).toMatchObject({
      domainId: 'storage',
      examId: 'exam-a',
      kind: 'domain',
      packId: 'pack-a',
      packVersion: '1.0',
    });
  });

  it('prioritizes repeated misses and keeps the recommendation scoped to the attempt version', async () => {
    const newerPack = structuredClone(pack);
    newerPack.pack = { ...newerPack.pack, title: 'Cloud foundations 2', version: '2.0' };
    await saveImportedPack(newerPack);

    const olderSessionOptions = {
      ...practiceOptions,
      questionCount: 1,
      questionIds: ['q-compute'],
    };

    const first = await createPracticeSession(olderSessionOptions);
    const second = await createPracticeSession(olderSessionOptions);

    const newerVersionSession = await createPracticeSession({
      ...olderSessionOptions,
      packVersion: newerPack.pack.version,
    });

    await answerQuestion(first.id, 'q-compute', ['no']);
    await answerQuestion(second.id, 'q-compute', ['no']);
    await answerQuestion(newerVersionSession.id, 'q-compute', ['no']);

    const progress = await getProgress();

    expect(progress.nextStudyAction).toStrictEqual({
      examId: pack.exam.id,
      kind: 'missed_question',
      missCount: 2,
      packId: pack.pack.id,
      packTitle: pack.pack.title,
      packVersion: pack.pack.version,
      prompt: 'Compute?',
      questionId: 'q-compute',
    });
  });

  it('aggregates answer scores by domain and preserves the attempt pack version for missed questions', async () => {
    const session = await createPracticeSession(practiceOptions);

    await answerQuestion(session.id, 'q-storage', ['yes']);
    await answerQuestion(session.id, 'q-compute', ['no']);

    const progress = await getProgress();

    expect(progress.recentAttempts).toHaveLength(1);
    expect(progress.recentAttempts[0]).toMatchObject({
      answeredCount: 2,
      correctCount: 1,
      examTitle: 'Cloud exam',
      kind: 'practice',
      packTitle: 'Cloud foundations',
      packVersion: '1.0',
      questionCount: 2,
    });
    expect(progress.domainScores).toMatchObject([
      {
        answeredCount: 1,
        correctCount: 0,
        domainId: 'compute',
        domainTitle: 'Compute',
        examId: pack.exam.id,
        packId: pack.pack.id,
        packVersion: pack.pack.version,
        percent: 0,
      },
      {
        answeredCount: 1,
        correctCount: 1,
        domainId: 'storage',
        domainTitle: 'Storage',
        examId: pack.exam.id,
        packId: pack.pack.id,
        packVersion: pack.pack.version,
        percent: 100,
      },
    ]);
    expect(progress.missedQuestions).toMatchObject([
      {
        domainId: 'compute',
        domainTitle: 'Compute',
        examId: pack.exam.id,
        missCount: 1,
        packId: pack.pack.id,
        packVersion: pack.pack.version,
        prompt: 'Compute?',
        questionId: 'q-compute',
      },
    ]);
    expect(progress.nextStudyAction).toMatchObject({
      domainId: 'compute',
      examId: pack.exam.id,
      kind: 'domain',
      packId: pack.pack.id,
      packVersion: pack.pack.version,
      percent: 0,
    });
  });

  it('keeps domain scores and missed prompts isolated by pack version', async () => {
    const newerPack = structuredClone(pack);
    newerPack.pack = { ...newerPack.pack, title: 'Cloud foundations 2', version: '2.0' };

    await saveImportedPack(newerPack);

    const version1Session = await createPracticeSession(practiceOptions);

    const version2Session = await createPracticeSession({
      ...practiceOptions,
      packVersion: newerPack.pack.version,
    });

    await answerQuestion(version1Session.id, 'q-compute', ['no']);
    await answerQuestion(version2Session.id, 'q-compute', ['yes']);

    const progress = await getProgress();

    expect(progress.domainScores).toMatchObject([
      {
        answeredCount: 1,
        correctCount: 0,
        domainId: 'compute',
        examId: pack.exam.id,
        packId: pack.pack.id,
        packTitle: 'Cloud foundations',
        packVersion: '1.0',
        percent: 0,
      },
      {
        answeredCount: 1,
        correctCount: 1,
        domainId: 'compute',
        examId: pack.exam.id,
        packId: pack.pack.id,
        packTitle: 'Cloud foundations 2',
        packVersion: '2.0',
        percent: 100,
      },
    ]);
    expect(progress.missedQuestions).toMatchObject([
      {
        domainId: 'compute',
        missCount: 1,
        packId: pack.pack.id,
        packTitle: 'Cloud foundations',
        packVersion: '1.0',
        prompt: 'Compute?',
        questionId: 'q-compute',
      },
    ]);
  });

  it('keeps historical scores and missed questions tied to the attempt snapshot after feedback changes', async () => {
    const session = await createPracticeSession(practiceOptions);

    await createCorrection({
      correction: { answerIds: ['no'], prompt: 'Corrected compute?' },
      examId: pack.exam.id,
      packId: pack.pack.id,
      packVersion: pack.pack.version,
      questionId: 'q-compute',
    });
    await retireQuestion(
      {
        examId: pack.exam.id,
        packId: pack.pack.id,
        packVersion: pack.pack.version,
        questionId: 'q-storage',
      },
      true,
    );

    await answerQuestion(session.id, 'q-storage', ['yes']);
    await answerQuestion(session.id, 'q-compute', ['no']);

    const progress = await getProgress();

    expect(progress.recentAttempts[0]).toMatchObject({ answeredCount: 2, correctCount: 1 });
    expect(progress.missedQuestions).toContainEqual(
      expect.objectContaining({
        missCount: 1,
        prompt: 'Compute?',
        questionId: 'q-compute',
      }),
    );
    expect(progress.missedQuestions).not.toContainEqual(
      expect.objectContaining({ questionId: 'q-storage' }),
    );
  });

  it('aggregates historical missed-question details in answer chronology across attempt snapshots', async ({
    onTestFinished,
  }) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    onTestFinished(() => {
      vi.useRealTimers();
    });

    const earlierSession = await createPracticeSession(practiceOptions);

    await answerQuestion(earlierSession.id, 'q-compute', ['no']);
    vi.advanceTimersByTime(1000);

    await createCorrection({
      correction: { answerIds: ['no'], prompt: 'Corrected compute?' },
      examId: pack.exam.id,
      packId: pack.pack.id,
      packVersion: pack.pack.version,
      questionId: 'q-compute',
    });

    const laterSession = await createPracticeSession(practiceOptions);

    await answerQuestion(laterSession.id, 'q-compute', ['yes']);

    const progress = await getProgress();

    expect(progress.missedQuestions).toContainEqual(
      expect.objectContaining({
        missCount: 2,
        prompt: 'Compute?',
        questionId: 'q-compute',
      }),
    );
  });

  it('includes submitted mock exams in recent attempt summaries', async () => {
    const now = Date.now();
    const attempt = await createMockAttempt({ ...mockOptions, now });

    await saveMockAnswer(attempt.id, 'q-storage', ['yes'], now + 1000);
    await saveMockAnswer(attempt.id, 'q-compute', ['no'], now + 2000);
    await submitMockAttempt(attempt.id, now + 3000);

    const progress = await getProgress();

    expect(progress.recentAttempts).toContainEqual(
      expect.objectContaining({
        answeredCount: 2,
        correctCount: 1,
        examTitle: 'Cloud exam',
        id: attempt.id,
        kind: 'mock',
        packTitle: 'Cloud foundations',
        packVersion: '1.0',
        questionCount: 2,
        status: 'submitted',
      }),
    );
  });
});
