import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { validateExamPack } from '@learning-platform/exam-pack';
import * as Schema from 'effect/Schema';
import { afterEach, describe, expect, it } from 'vitest';

import { createDatabase } from '#lib/server/database/connection.js';
import type { AppDatabase } from '#lib/server/database/connection.js';
import {
  createCorrection,
  exportFeedback,
  FeedbackValidationError,
  flagQuestion,
  listFeedback,
  retireQuestion,
} from '#lib/server/feedback/service.js';
import { getImportedPack, saveImportedPack } from '#lib/server/packs/repository.js';
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
import { workspacePath } from '#lib/server/workspace-paths.js';

const databases: AppDatabase[] = [];
const directories: string[] = [];

const setup = async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'exam-feedback-'));
  directories.push(directory);
  const database = await createDatabase(path.join(directory, 'feedback.sqlite'));
  databases.push(database);

  const validation = validateExamPack(
    JSON.parse(await readFile(workspacePath('packs/incoming/sample-learning-pack.json'), 'utf-8')),
  );

  if (!validation.valid) {
    throw new Error(validation.errors.join(' '));
  }

  await saveImportedPack(database, validation.pack);

  return { database, pack: validation.pack };
};

const questionAt = (pack: Awaited<ReturnType<typeof setup>>['pack'], index: number) => {
  const question = pack.questions[index];

  if (!question) {
    throw new Error(`Test pack is missing question ${index}.`);
  }

  return question;
};

const findQuestion = (pack: Awaited<ReturnType<typeof setup>>['pack'], id: string) => {
  const question = pack.questions.find((item) => item.id === id);

  if (!question) {
    throw new Error(`Test pack is missing question "${id}".`);
  }

  return question;
};

describe('question feedback', () => {
  afterEach(async () => {
    await Promise.all(
      databases.splice(0).map(async (database) => {
        await database.destroy();
      }),
    );
    await Promise.all(
      directories.splice(0).map(async (directory) => {
        await rm(directory, { force: true, recursive: true });
      }),
    );
  });

  it('exports flags and schema-validated corrections in a stable JSON format', async () => {
    const { database, pack } = await setup();
    const question = questionAt(pack, 0);
    await flagQuestion(
      {
        examId: pack.exam.id,
        packId: pack.pack.id,
        packVersion: pack.pack.version,
        questionId: question.id,
        reason: 'The source does not support this answer.',
      },
      database,
    );
    await createCorrection(
      {
        correction: { explanation: question.explanation, prompt: `${question.prompt} Revised` },
        examId: pack.exam.id,
        packId: pack.pack.id,
        packVersion: pack.pack.version,
        questionId: question.id,
      },
      database,
    );

    const first = await exportFeedback(database);
    await createCorrection(
      {
        correction: { explanation: question.explanation, prompt: `${question.prompt} Revised` },
        examId: pack.exam.id,
        packId: pack.pack.id,
        packVersion: pack.pack.version,
        questionId: question.id,
      },
      database,
    );
    const second = await exportFeedback(database);
    expect(first).toBe(second);
    expect(JSON.parse(first)).toStrictEqual({
      format: 'question-feedback',
      items: [
        {
          correction: { explanation: question.explanation, prompt: `${question.prompt} Revised` },
          examId: pack.exam.id,
          flags: [{ reason: 'The source does not support this answer.' }],
          packId: pack.pack.id,
          packVersion: pack.pack.version,
          questionId: question.id,
          retired: false,
        },
      ],
      version: 1,
    });
  });

  it('rejects missing citations, inconsistent answers, and identity changes deterministically', async () => {
    const { database, pack } = await setup();
    const question = questionAt(pack, 0);

    const key = {
      examId: pack.exam.id,
      packId: pack.pack.id,
      packVersion: pack.pack.version,
      questionId: question.id,
    };

    await expect(
      createCorrection({ ...key, correction: { sources: [] } }, database),
    ).rejects.toThrow(FeedbackValidationError);
    await expect(
      createCorrection({ ...key, correction: { answerIds: ['missing-option'] } }, database),
    ).rejects.toThrow(FeedbackValidationError);
    await expect(
      createCorrection({ ...key, correction: { id: 'different-question' } }, database),
    ).rejects.toThrow('Correction contains unsupported field "id".');
    await expect(
      createCorrection(
        {
          ...key,
          correction: { sources: [{ label: 'Unknown notes', path: 'missing.md' }] },
        },
        database,
      ),
    ).rejects.toThrow(
      'Correction sources must refer to citation files in this imported pack version.',
    );
    await expect(
      createCorrection({ ...key, correction: { prompt: '' } }, database),
    ).rejects.toThrow(FeedbackValidationError);
  });

  it('keeps the imported pack and prior results unchanged while corrections apply to new sessions and versions', async () => {
    const { database, pack } = await setup();
    const original = questionAt(pack, 0);

    const key = {
      examId: pack.exam.id,
      packId: pack.pack.id,
      packVersion: pack.pack.version,
      questionId: original.id,
    };

    const priorSession = await createPracticeSession({
      database,
      ...key,
      questionCount: 1,
      questionIds: [original.id],
    });

    const priorAnswer = await answerQuestion(priorSession.id, original.id, ['a'], database);
    await createCorrection(
      {
        ...key,
        correction: { answerIds: ['b'], explanation: 'Locally corrected answer.' },
      },
      database,
    );

    const nextSession = await createPracticeSession({
      database,
      ...key,
      questionCount: 1,
      questionIds: [original.id],
    });

    const nextAnswer = await answerQuestion(nextSession.id, original.id, ['b'], database);
    const nextSessionResult = await getPracticeSession(nextSession.id, database);
    const priorSessionResult = await getPracticeSession(priorSession.id, database);
    expect({
      nextAnswerCorrect: nextAnswer.correct,
      nextPrompt: nextSessionResult?.questions[0]?.prompt,
      priorAnswerCorrect: priorAnswer.correct,
      priorAnswerStillCorrect: priorSessionResult?.answers[0]?.correct,
      priorExplanation: priorSessionResult?.answers[0]?.explanation,
    }).toStrictEqual({
      nextAnswerCorrect: true,
      nextPrompt: original.prompt,
      priorAnswerCorrect: true,
      priorAnswerStillCorrect: true,
      priorExplanation: original.explanation,
    });
    const feedback = await listFeedback(pack.exam.id, pack.pack.id, pack.pack.version, database);

    const importedPack = await getImportedPack(
      pack.exam.id,
      pack.pack.id,
      pack.pack.version,
      database,
    );

    expect({
      feedbackCount: feedback.length,
      importedQuestion: importedPack?.questions[0],
    }).toStrictEqual({ feedbackCount: 1, importedQuestion: original });
    await saveImportedPack(database, { ...pack, pack: { ...pack.pack, version: '2.0.0' } });

    const exportedFeedbackSchema = Schema.fromJsonString(
      Schema.Struct({ items: Schema.Array(Schema.Unknown) }),
    );

    const exportedFeedback = Schema.decodeUnknownSync(exportedFeedbackSchema)(
      await exportFeedback(database),
    );

    const feedbackWithCorrection = await listFeedback(
      pack.exam.id,
      pack.pack.id,
      pack.pack.version,
      database,
    );

    expect({
      correctionAnswerIds: feedbackWithCorrection[0]?.correction?.answerIds,
      exportedItemCount: exportedFeedback.items.length,
    }).toStrictEqual({ correctionAnswerIds: ['b'], exportedItemCount: 1 });
  });

  it('omits retired questions from new sessions while retaining their imported version', async () => {
    const { database, pack } = await setup();
    const question = questionAt(pack, 0);
    await retireQuestion(
      {
        examId: pack.exam.id,
        packId: pack.pack.id,
        packVersion: pack.pack.version,
        questionId: question.id,
      },
      true,
      database,
    );

    const session = await createPracticeSession({
      database,
      examId: pack.exam.id,
      packId: pack.pack.id,
      packVersion: pack.pack.version,
      questionCount: 1,
      questionIds: [questionAt(pack, 1).id],
    });

    expect(session.questionIds).toStrictEqual([questionAt(pack, 1).id]);
    const feedback = await listFeedback(pack.exam.id, pack.pack.id, pack.pack.version, database);
    expect(feedback[0]?.retired).toBeTruthy();
  });

  it('snapshots corrections into new timed attempts', async () => {
    const { database, pack } = await setup();
    const question = findQuestion(pack, 'delta-transaction-basics');

    const key = {
      examId: pack.exam.id,
      packId: pack.pack.id,
      packVersion: pack.pack.version,
      questionId: question.id,
    };

    await createCorrection(
      {
        ...key,
        correction: { answerIds: ['b'], prompt: 'Corrected transaction question' },
      },
      database,
    );

    const attempt = await createMockAttempt({
      database,
      durationMinutes: 2,
      examId: pack.exam.id,
      now: 1000,
      packId: pack.pack.id,
      packVersion: pack.pack.version,
      questionCount: 2,
      random: () => 0,
    });

    expect(attempt.questions.find((item) => item.id === question.id)?.prompt).toBe(
      'Corrected transaction question',
    );

    await createCorrection({ ...key, correction: { answerIds: ['c'] } }, database);
    await saveMockAnswer(attempt.id, question.id, ['b'], database, 2000);
    const submittedAttempt = await submitMockAttempt(attempt.id, database, 3000);
    expect(
      submittedAttempt.answers.find((answer) => answer.questionId === question.id)?.correct,
    ).toBeTruthy();
  });
});
