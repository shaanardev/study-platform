import type { ExamPack } from '@learning-platform/exam-pack';
import { describe, expect, it } from 'vitest';

import { useTestDatabase } from '#lib/server/database/test-fixtures.js';
import {
  createCorrection,
  exportFeedback,
  FeedbackValidationError,
  flagQuestion,
  listFeedback,
  retireQuestion,
} from '#lib/server/feedback/service.js';
import type { FeedbackKey } from '#lib/server/feedback/service.js';
import { getImportedPack, saveImportedPack } from '#lib/server/packs/repository.js';
import { seedSamplePack } from '#lib/server/packs/test-fixtures.js';
import {
  createMockAttempt,
  saveMockAnswer,
  submitMockAttempt,
} from '#lib/server/quiz/mock-service.js';
import {
  answerQuestion,
  createPracticeSession,
  getPracticeSession,
} from '#lib/server/quiz/service.js';

let pack: ExamPack;
let feedbackKey: FeedbackKey;

const questionAt = (examPack: ExamPack, index: number) => {
  const question = examPack.questions[index];

  if (!question) {
    throw new Error(`Test pack is missing question ${index}.`);
  }

  return question;
};

describe('question feedback', () => {
  useTestDatabase(async () => {
    pack = await seedSamplePack();
    feedbackKey = {
      examId: pack.exam.id,
      packId: pack.pack.id,
      packVersion: pack.pack.version,
      questionId: questionAt(pack, 0).id,
    };
  });

  it('exports flags and schema-validated corrections in a stable JSON format', async () => {
    const question = questionAt(pack, 0);
    const reason = 'The source does not support this answer.';
    const correction = { explanation: question.explanation, prompt: `${question.prompt} Revised` };

    await flagQuestion({ ...feedbackKey, reason });
    await flagQuestion({ ...feedbackKey, reason });
    await createCorrection({ ...feedbackKey, correction });

    const first = await exportFeedback();
    await createCorrection({ ...feedbackKey, correction });
    const second = await exportFeedback();
    expect(first).toBe(second);
    expect(JSON.parse(first)).toStrictEqual({
      format: 'question-feedback',
      items: [
        {
          correction,
          examId: pack.exam.id,
          flags: [{ reason }],
          packId: pack.pack.id,
          packVersion: pack.pack.version,
          questionId: question.id,
          retired: false,
        },
      ],
      version: 1,
    });
  });

  it.each([
    { correction: { sources: [] }, error: FeedbackValidationError, name: 'missing citations' },
    {
      correction: { answerIds: ['missing-option'] },
      error: FeedbackValidationError,
      name: 'an answer that is not an option',
    },
    {
      correction: { id: 'different-question' },
      error: 'Correction contains unsupported field "id".',
      name: 'question identity changes',
    },
    {
      correction: { sources: [{ label: 'Unknown notes', path: 'missing.md' }] },
      error: 'Correction sources must refer to citation files in this imported pack version.',
      name: 'citations outside the imported version',
    },
    { correction: { prompt: '' }, error: FeedbackValidationError, name: 'an empty prompt' },
  ])('rejects $name', async ({ correction, error }) => {
    await expect(createCorrection({ ...feedbackKey, correction })).rejects.toThrow(error);
  });

  it('keeps prior results and the imported pack unchanged when corrections apply to new sessions', async () => {
    const original = questionAt(pack, 0);

    const priorSession = await createPracticeSession({
      ...feedbackKey,
      questionCount: 1,
      questionIds: [original.id],
    });

    const priorAnswer = await answerQuestion(priorSession.id, original.id, ['a']);
    await createCorrection({
      ...feedbackKey,
      correction: { answerIds: ['b'], explanation: 'Locally corrected answer.' },
    });

    const nextSession = await createPracticeSession({
      ...feedbackKey,
      questionCount: 1,
      questionIds: [original.id],
    });

    const nextAnswer = await answerQuestion(nextSession.id, original.id, ['b']);
    const nextSessionResult = await getPracticeSession(nextSession.id);
    const priorSessionResult = await getPracticeSession(priorSession.id);
    expect(priorAnswer.correct).toBeTruthy();
    expect(priorSessionResult?.answers[0]).toMatchObject({
      correct: true,
      explanation: original.explanation,
    });
    expect(nextAnswer.correct).toBeTruthy();
    expect(nextSessionResult?.questions[0]?.prompt).toBe(original.prompt);

    const importedPack = await getImportedPack(pack.exam.id, pack.pack.id, pack.pack.version);
    expect(importedPack?.questions[0]).toStrictEqual(original);
  });

  it('keeps corrections isolated to the imported pack version', async () => {
    const original = questionAt(pack, 0);
    await createCorrection({ ...feedbackKey, correction: { answerIds: ['b'] } });
    await saveImportedPack({ ...pack, pack: { ...pack.pack, version: '2.0.0' } });

    await expect(listFeedback(pack.exam.id, pack.pack.id, '2.0.0')).resolves.toStrictEqual([]);
    await expect(
      listFeedback(pack.exam.id, pack.pack.id, pack.pack.version),
    ).resolves.toMatchObject([{ correction: { answerIds: ['b'] }, questionId: original.id }]);
  });

  it('omits retired questions from new sessions while retaining their imported version', async () => {
    const question = questionAt(pack, 0);
    await retireQuestion(feedbackKey, true);

    const session = await createPracticeSession({
      examId: pack.exam.id,
      packId: pack.pack.id,
      packVersion: pack.pack.version,
      questionCount: 1,
      random: () => 0.99,
    });

    expect(session.questionIds).toStrictEqual([questionAt(pack, 1).id]);
    await expect(
      listFeedback(pack.exam.id, pack.pack.id, pack.pack.version),
    ).resolves.toMatchObject([{ questionId: question.id, retired: true }]);
  });

  it('snapshots corrections into new timed attempts', async () => {
    const question = questionAt(pack, 0);

    await createCorrection({
      ...feedbackKey,
      correction: { answerIds: ['b'], prompt: 'Corrected transaction question' },
      questionId: question.id,
    });

    const startedAt = Date.now();

    const attempt = await createMockAttempt({
      durationMinutes: 2,
      examId: pack.exam.id,
      now: startedAt,
      packId: pack.pack.id,
      packVersion: pack.pack.version,
      questionCount: 2,
      random: () => 0,
    });

    expect(attempt.questions.find((item) => item.id === question.id)?.prompt).toBe(
      'Corrected transaction question',
    );

    await createCorrection({
      ...feedbackKey,
      correction: { answerIds: ['c'] },
      questionId: question.id,
    });
    await saveMockAnswer(attempt.id, question.id, ['b'], startedAt + 1000);
    const submittedAttempt = await submitMockAttempt(attempt.id, startedAt + 2000);
    expect(
      submittedAttempt.answers.find((answer) => answer.questionId === question.id)?.correct,
    ).toBeTruthy();
  });
});
