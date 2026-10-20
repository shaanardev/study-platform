import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createDatabase } from '#lib/server/database/connection.js';
import type { AppDatabase } from '#lib/server/database/connection.js';
import { saveImportedPack } from '#lib/server/packs/repository.js';
import { createCorrection, retireQuestion } from '#lib/server/feedback/service.js';
import { getProgress } from '#lib/server/progress/queries.js';
import {
  createMockAttempt,
  saveMockAnswer,
  submitMockAttempt,
} from '#lib/server/quiz/mock-service.js';
import { answerQuestion, createPracticeSession } from '#lib/server/quiz/service.js';
import type { ExamPack } from '@learning-platform/exam-pack';

const directories: string[] = [];
const databases: AppDatabase[] = [];

const fixture = async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'orde-progress-'));
  directories.push(directory);
  const databasePath = path.join(directory, 'progress.sqlite');
  const database = await createDatabase(databasePath);
  databases.push(database);
  const pack: ExamPack = {
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
  await saveImportedPack(database, pack);
  return { database, pack };
};

describe('progress queries', () => {
  afterEach(async () => {
    await Promise.all(
      databases.splice(0).map(async (database) => {
        await database.close();
      }),
    );
    for (const directory of directories.splice(0)) {
      rmSync(directory, { force: true, recursive: true });
    }
  });

  it('aggregates answer scores by domain and preserves the attempt pack version for missed questions', async () => {
    const { database, pack } = await fixture();
    const session = await createPracticeSession({
      database,
      examId: pack.exam.id,
      packId: pack.pack.id,
      packVersion: pack.pack.version,
      questionCount: 2,
      random: () => 0,
    });
    await answerQuestion(session.id, 'q-storage', ['yes'], database);
    await answerQuestion(session.id, 'q-compute', ['no'], database);

    const progress = await getProgress(database);

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
    expect(progress.domainScores).toStrictEqual([
      {
        answeredCount: 1,
        correctCount: 0,
        domainId: 'compute',
        domainTitle: 'Compute',
        examId: 'exam-a',
        examTitle: 'Cloud exam',
        packId: 'pack-a',
        packTitle: 'Cloud foundations',
        packVersion: '1.0',
        percent: 0,
      },
      {
        answeredCount: 1,
        correctCount: 1,
        domainId: 'storage',
        domainTitle: 'Storage',
        examId: 'exam-a',
        examTitle: 'Cloud exam',
        packId: 'pack-a',
        packTitle: 'Cloud foundations',
        packVersion: '1.0',
        percent: 100,
      },
    ]);
    expect(progress.missedQuestions).toStrictEqual([
      {
        domainId: 'compute',
        domainTitle: 'Compute',
        examId: 'exam-a',
        examTitle: 'Cloud exam',
        missCount: 1,
        packId: 'pack-a',
        packTitle: 'Cloud foundations',
        packVersion: '1.0',
        prompt: 'Compute?',
        questionId: 'q-compute',
      },
    ]);
  });


  it('keeps historical scores and missed questions tied to the attempt snapshot after feedback changes', async () => {
    const { database, pack } = await fixture();
    const session = await createPracticeSession({
      database,
      examId: pack.exam.id,
      packId: pack.pack.id,
      packVersion: pack.pack.version,
      questionCount: 2,
      random: () => 0,
    });

    await createCorrection(
      {
        correction: { answerIds: ['no'], prompt: 'Corrected compute?' },
        examId: pack.exam.id,
        packId: pack.pack.id,
        packVersion: pack.pack.version,
        questionId: 'q-compute',
      },
      database,
    );
    await retireQuestion(
      { examId: pack.exam.id, packId: pack.pack.id, packVersion: pack.pack.version, questionId: 'q-storage' },
      true,
      database,
    );

    await answerQuestion(session.id, 'q-storage', ['yes'], database);
    await answerQuestion(session.id, 'q-compute', ['no'], database);

    const progress = await getProgress(database);

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

  it('includes submitted mock exams in recent attempt summaries', async () => {
    const { database, pack } = await fixture();
    const attempt = await createMockAttempt({
      database,
      durationMinutes: 30,
      examId: pack.exam.id,
      now: 10_000,
      packId: pack.pack.id,
      packVersion: pack.pack.version,
      questionCount: 2,
      random: () => 0,
    });
    await saveMockAnswer(attempt.id, 'q-storage', ['yes'], database, 11_000);
    await saveMockAnswer(attempt.id, 'q-compute', ['no'], database, 12_000);
    await submitMockAttempt(attempt.id, database, 13_000);

    const progress = await getProgress(database);

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
