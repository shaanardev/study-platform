import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { validateExamPack } from '@learning-platform/exam-pack';
import { afterEach, describe, expect, it } from 'vitest';

import { createDatabase } from '#lib/server/database/connection.js';
import { saveImportedPack } from '#lib/server/packs/repository.js';
import {
  createMockAttemptRecord,
  createPracticeSessionRecord,
  getMockAttemptRecord,
  getPracticeSessionRecord,
  saveMockAnswerRecord,
  savePracticeAnswer,
} from '#lib/server/quiz/repository.js';
import { workspacePath } from '#lib/server/workspace-paths.js';

describe('quiz repository records', () => {
  const directories: string[] = [];
  const databases: Awaited<ReturnType<typeof createDatabase>>[] = [];

  afterEach(async () => {
    await databases.splice(0).reduce(async (previous, database) => {
      await previous;
      await database.destroy();
    }, Promise.resolve());
    await directories.splice(0).reduce(async (previous, directory) => {
      await previous;
      await rm(directory, { force: true, recursive: true });
    }, Promise.resolve());
  });

  const setup = async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'quiz-repository-'));
    directories.push(directory);
    const database = await createDatabase(path.join(directory, 'quiz.sqlite'));
    databases.push(database);

    const checkedPack = validateExamPack(
      JSON.parse(
        await readFile(workspacePath('packs/incoming/sample-learning-pack.json'), 'utf-8'),
      ),
    );

    expect.assert(checkedPack.valid, checkedPack.errors.join(' '));
    await saveImportedPack(database, checkedPack.pack);

    return { database, pack: checkedPack.pack };
  };

  it('loads ordered practice and mock answers with decoded answer ids', async () => {
    const { database, pack } = await setup();
    const now = '2026-10-28T00:00:00.000Z';

    await createPracticeSessionRecord(
      {
        domain_ids: ['domain-a'],
        exam_id: pack.exam.id,
        id: 'practice-a',
        pack_id: pack.pack.id,
        pack_version: pack.pack.version,
        question_ids: ['question-a', 'question-b'],
        question_snapshot: [],
        status: 'in_progress',
      },
      database,
    );
    await savePracticeAnswer(
      {
        answerIds: ['choice-a'],
        answeredAt: now,
        correct: true,
        questionId: 'question-a',
        sessionId: 'practice-a',
      },
      database,
    );
    const resumablePractice = await getPracticeSessionRecord(undefined, database);

    await savePracticeAnswer(
      {
        answerIds: ['choice-b', 'choice-c'],
        answeredAt: now,
        correct: false,
        questionId: 'question-b',
        sessionId: 'practice-a',
      },
      database,
    );

    await createMockAttemptRecord(
      {
        deadline: 120_000,
        duration_minutes: 2,
        exam_id: pack.exam.id,
        id: 'mock-a',
        pack_id: pack.pack.id,
        pack_version: pack.pack.version,
        question_ids: ['question-a', 'question-b'],
        question_snapshot: [],
        status: 'in_progress',
      },
      database,
    );
    await saveMockAnswerRecord('mock-a', 'question-b', ['choice-b'], `${now}+1`, database);
    await saveMockAnswerRecord('mock-a', 'question-a', ['choice-a'], now, database);

    const practice = await getPracticeSessionRecord('practice-a', database);
    const mock = await getMockAttemptRecord('mock-a', database);
    const resumableMock = await getMockAttemptRecord(undefined, database);

    expect({
      latestMockId: resumableMock?.attempt.id,
      latestPracticeAnswerCount: resumablePractice?.answers.length,
      latestPracticeId: resumablePractice?.session.id,
      mockAnswers: mock?.answers,
      noPracticeAfterCompletion: await getPracticeSessionRecord(undefined, database),
      practiceAnswers: practice?.answers,
      practiceStatus: practice?.session.status,
    }).toStrictEqual({
      latestMockId: 'mock-a',
      latestPracticeAnswerCount: 1,
      latestPracticeId: 'practice-a',
      mockAnswers: [
        { answer_ids: ['choice-a'], answered_at: now, question_id: 'question-a' },
        { answer_ids: ['choice-b'], answered_at: `${now}+1`, question_id: 'question-b' },
      ],
      noPracticeAfterCompletion: null,
      practiceAnswers: [
        {
          answer_ids: ['choice-a'],
          answered_at: now,
          correct: 1,
          question_id: 'question-a',
        },
        {
          answer_ids: ['choice-b', 'choice-c'],
          answered_at: now,
          correct: 0,
          question_id: 'question-b',
        },
      ],
      practiceStatus: 'completed',
    });
  });
});
