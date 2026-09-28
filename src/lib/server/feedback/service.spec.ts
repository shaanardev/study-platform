import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getImportedPack, saveImportedPack } from '#lib/server/db/packs.js';
import {
  createCorrection,
  exportFeedback,
  FeedbackValidationError,
  flagQuestion,
  listFeedback,
  retireQuestion,
} from '#lib/server/feedback/service.js';
import { validateExamPack } from '#lib/server/packs/validate.js';
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

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 'exam-feedback-'));
  directories.push(directory);
  const databasePath = join(directory, 'feedback.sqlite');
  const validation = validateExamPack(
    JSON.parse(await readFile(resolve('packs/incoming/sample-databricks-associate.json'), 'utf8')),
  );
  if (!validation.valid) throw new Error(validation.errors.join(' '));
  saveImportedPack(databasePath, validation.pack);
  return { databasePath, pack: validation.pack };
}

function questionAt(pack: Awaited<ReturnType<typeof setup>>['pack'], index: number) {
  const question = pack.questions[index];
  if (!question) throw new Error(`Test pack is missing question ${index}.`);
  return question;
}

function findQuestion(pack: Awaited<ReturnType<typeof setup>>['pack'], id: string) {
  const question = pack.questions.find((item) => item.id === id);
  if (!question) throw new Error(`Test pack is missing question "${id}".`);
  return question;
}

describe('question feedback', () => {
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
      examId: pack.exam.id,
      packId: pack.pack.id,
      packVersion: pack.pack.version,
      questionId: question.id,
      correction: { explanation: question.explanation, prompt: `${question.prompt} Revised` },
    });

    const first = exportFeedback(databasePath);
    createCorrection(databasePath, {
      examId: pack.exam.id,
      packId: pack.pack.id,
      packVersion: pack.pack.version,
      questionId: question.id,
      correction: { prompt: `${question.prompt} Revised`, explanation: question.explanation },
    });
    const second = exportFeedback(databasePath);
    expect(first).toBe(second);
    expect(JSON.parse(first)).toEqual({
      format: 'question-feedback',
      version: 1,
      items: [
        {
          examId: pack.exam.id,
          packId: pack.pack.id,
          packVersion: pack.pack.version,
          questionId: question.id,
          flags: [{ reason: 'The source does not support this answer.' }],
          correction: { prompt: `${question.prompt} Revised`, explanation: question.explanation },
          retired: false,
        },
      ],
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
        correction: { sources: [{ path: 'missing.md', label: 'Unknown notes' }] },
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
    expect(priorAnswer.correct).toBe(true);

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
    expect(getPracticeSession(databasePath, nextSession.id)?.questions[0]?.prompt).toBe(
      original.prompt,
    );
    expect(answerQuestion(databasePath, nextSession.id, original.id, ['b']).correct).toBe(true);
    expect(getPracticeSession(databasePath, priorSession.id)?.answers[0]?.correct).toBe(true);
    expect(getPracticeSession(databasePath, priorSession.id)?.answers[0]?.explanation).toBe(
      original.explanation,
    );
    expect(
      getImportedPack(pack.exam.id, pack.pack.id, pack.pack.version, databasePath)?.questions[0],
    ).toEqual(original);

    expect(listFeedback(databasePath, pack.exam.id, pack.pack.id, pack.pack.version)).toHaveLength(
      1,
    );
    saveImportedPack(databasePath, { ...pack, pack: { ...pack.pack, version: '2.0.0' } });
    expect(
      listFeedback(databasePath, pack.exam.id, pack.pack.id, pack.pack.version)[0]?.correction
        ?.answerIds,
    ).toEqual(['b']);
    expect(JSON.parse(exportFeedback(databasePath)).items).toHaveLength(1);
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
    expect(session.questionIds).toEqual([questionAt(pack, 1).id]);
    expect(
      listFeedback(databasePath, pack.exam.id, pack.pack.id, pack.pack.version)[0]?.retired,
    ).toBe(true);
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
      examId: pack.exam.id,
      packId: pack.pack.id,
      packVersion: pack.pack.version,
      questionCount: 2,
      durationMinutes: 2,
      random: () => 0,
      now: 1000,
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
    ).toBe(true);
  });
});
