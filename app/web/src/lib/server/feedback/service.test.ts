import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { validateExamPack } from '@learning-platform/exam-pack';
import * as Schema from 'effect/Schema';
import { afterEach, describe, expect, it } from 'vitest';

import { getImportedPack, saveImportedPack } from '#lib/server/packs/repository.js';
import {
  createCorrection,
  exportFeedback,
  FeedbackValidationError,
  flagQuestion,
  listFeedback,
  retireQuestion,
} from '#lib/server/feedback/service.js';
import { decodeJsonText } from '#lib/server/json.js';
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
import { sampleLearningPackFixture } from '#lib/test-fixtures.js';

const directories: string[] = [];

const setup = async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'exam-feedback-'));
  directories.push(directory);
  const databasePath = path.join(directory, 'feedback.sqlite');

  const validation = validateExamPack(sampleLearningPackFixture());

  expect.assert(validation.valid, validation.errors.join(' '));
  saveImportedPack(databasePath, validation.pack);

  return { databasePath, pack: validation.pack };
};

const questionAt = (pack: Awaited<ReturnType<typeof setup>>['pack'], index: number) => {
  const question = pack.questions[index];
  expect.assert(question, `Test pack is missing question ${index}.`);

  return question;
};

const findQuestion = (pack: Awaited<ReturnType<typeof setup>>['pack'], id: string) => {
  const question = pack.questions.find((item) => item.id === id);
  expect.assert(question, `Test pack is missing question "${id}".`);

  return question;
};

const FeedbackExportSchema = Schema.Struct({
  format: Schema.Literal('question-feedback'),
  items: Schema.Array(Schema.Unknown),
  version: Schema.Literal(1),
});

const exportedItemsFrom = (json: string) =>
  Schema.decodeUnknownSync(FeedbackExportSchema)(decodeJsonText(json)).items;

describe('question feedback', () => {
  afterEach(async () => {
    await Promise.all(
      directories.splice(0).map(async (directory) => {
        await rm(directory, { force: true, recursive: true });
      }),
    );
  });

  it('exports flags and schema-validated corrections in a stable JSON format', async () => {
    const { databasePath, pack } = await setup();
    const question = questionAt(pack, 0);
    flagQuestion(databasePath, {
      examId: pack.exam.id,
      packId: pack.pack.id,
      packVersion: pack.pack.version,
      questionId: question.id,
      reason: 'The source does not support this answer.',
    });
    createCorrection(databasePath, {
      correction: { explanation: question.explanation, prompt: `${question.prompt} Revised` },
      examId: pack.exam.id,
      packId: pack.pack.id,
      packVersion: pack.pack.version,
      questionId: question.id,
    });

    const first = exportFeedback(databasePath);
    createCorrection(databasePath, {
      correction: { explanation: question.explanation, prompt: `${question.prompt} Revised` },
      examId: pack.exam.id,
      packId: pack.pack.id,
      packVersion: pack.pack.version,
      questionId: question.id,
    });
    const second = exportFeedback(databasePath);
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
    const { databasePath, pack } = await setup();
    const question = questionAt(pack, 0);

    const key = {
      examId: pack.exam.id,
      packId: pack.pack.id,
      packVersion: pack.pack.version,
      questionId: question.id,
    };

    expect(() => createCorrection(databasePath, { ...key, correction: { sources: [] } })).toThrow(
      'Correction must retain at least one complete citation.',
    );
    expect(() =>
      createCorrection(databasePath, { ...key, correction: { answerIds: ['missing-option'] } }),
    ).toThrow('Correct answers must refer to available options and match the question type.');
    expect(() =>
      createCorrection(databasePath, { ...key, correction: { id: 'different-question' } }),
    ).toThrow('Correction contains unsupported field "id".');
    expect(() =>
      createCorrection(databasePath, {
        ...key,
        correction: { sources: [{ label: 'Unknown notes', path: 'missing.md' }] },
      }),
    ).toThrow('Correction sources must refer to citation files in this imported pack version.');
    expect(() => createCorrection(databasePath, { ...key, correction: { prompt: '' } })).toThrow(
      FeedbackValidationError,
    );
  });

  it('keeps the imported pack and prior results unchanged while corrections apply to new sessions and versions', async () => {
    const { databasePath, pack } = await setup();
    const original = questionAt(pack, 0);

    const key = {
      examId: pack.exam.id,
      packId: pack.pack.id,
      packVersion: pack.pack.version,
      questionId: original.id,
    };

    const priorSession = createPracticeSession({
      databasePath,
      ...key,
      questionCount: 1,
      questionIds: [original.id],
    });

    const priorAnswer = answerQuestion(databasePath, priorSession.id, original.id, ['a']);
    createCorrection(databasePath, {
      ...key,
      correction: { answerIds: ['b'], explanation: 'Locally corrected answer.' },
    });

    const nextSession = createPracticeSession({
      databasePath,
      ...key,
      questionCount: 1,
      questionIds: [original.id],
    });

    expect({
      nextAnswerCorrect: answerQuestion(databasePath, nextSession.id, original.id, ['b']).correct,
      nextPrompt: getPracticeSession(databasePath, nextSession.id)?.questions[0]?.prompt,
      priorAnswerCorrect: priorAnswer.correct,
      priorAnswerStillCorrect: getPracticeSession(databasePath, priorSession.id)?.answers[0]
        ?.correct,
      priorExplanation: getPracticeSession(databasePath, priorSession.id)?.answers[0]?.explanation,
    }).toStrictEqual({
      nextAnswerCorrect: true,
      nextPrompt: original.prompt,
      priorAnswerCorrect: true,
      priorAnswerStillCorrect: true,
      priorExplanation: original.explanation,
    });
    expect({
      feedbackCount: listFeedback(databasePath, pack.exam.id, pack.pack.id, pack.pack.version)
        .length,
      importedQuestion: getImportedPack(pack.exam.id, pack.pack.id, pack.pack.version, databasePath)
        ?.questions[0],
    }).toStrictEqual({ feedbackCount: 1, importedQuestion: original });
    saveImportedPack(databasePath, { ...pack, pack: { ...pack.pack, version: '2.0.0' } });
    const exportedItems = exportedItemsFrom(exportFeedback(databasePath));
    expect({
      correctionAnswerIds: listFeedback(
        databasePath,
        pack.exam.id,
        pack.pack.id,
        pack.pack.version,
      )[0]?.correction?.answerIds,
      exportedItemCount: exportedItems.length,
    }).toStrictEqual({ correctionAnswerIds: ['b'], exportedItemCount: 1 });
  });

  it('omits retired questions from new sessions while retaining their imported version', async () => {
    const { databasePath, pack } = await setup();
    const question = questionAt(pack, 0);
    retireQuestion(
      databasePath,
      {
        examId: pack.exam.id,
        packId: pack.pack.id,
        packVersion: pack.pack.version,
        questionId: question.id,
      },
      true,
    );

    const session = createPracticeSession({
      databasePath,
      examId: pack.exam.id,
      packId: pack.pack.id,
      packVersion: pack.pack.version,
      questionCount: 1,
      questionIds: [questionAt(pack, 1).id],
    });

    expect(session.questionIds).toStrictEqual([questionAt(pack, 1).id]);
    expect(
      listFeedback(databasePath, pack.exam.id, pack.pack.id, pack.pack.version)[0]?.retired,
    ).toBeTruthy();
  });

  it('snapshots corrections into new timed attempts', async () => {
    const { databasePath, pack } = await setup();
    const question = findQuestion(pack, 'delta-transaction-basics');

    const key = {
      examId: pack.exam.id,
      packId: pack.pack.id,
      packVersion: pack.pack.version,
      questionId: question.id,
    };

    createCorrection(databasePath, {
      ...key,
      correction: { answerIds: ['b'], prompt: 'Corrected transaction question' },
    });

    const attempt = createMockAttempt({
      databasePath,
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

    createCorrection(databasePath, { ...key, correction: { answerIds: ['c'] } });
    saveMockAnswer(databasePath, attempt.id, question.id, ['b'], 2000);
    expect(
      submitMockAttempt(databasePath, attempt.id, 3000).answers.find(
        (answer) => answer.questionId === question.id,
      )?.correct,
    ).toBeTruthy();
  });
});
