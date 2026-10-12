import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { saveImportedPack } from '#lib/server/db/packs.js';
import { getProgress } from '#lib/server/progress/queries.js';
import {
  createMockAttempt,
  saveMockAnswer,
  submitMockAttempt,
} from '#lib/server/quiz/mock-service.js';
import { answerQuestion, createPracticeSession } from '#lib/server/quiz/service.js';
import type { ExamPack } from '#lib/types/exam-pack.js';

const directories: string[] = [];

const fixture = () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'orde-progress-'));
  directories.push(directory);
  const databasePath = path.join(directory, 'progress.sqlite');
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
  saveImportedPack(databasePath, pack);
  return { databasePath, pack };
};

describe('progress queries', () => {
  afterEach(() => {
    for (const directory of directories.splice(0)) {
      rmSync(directory, { force: true, recursive: true });
    }
  });

  it('aggregates answer scores by domain and preserves the attempt pack version for missed questions', () => {
    const { databasePath, pack } = fixture();
    const session = createPracticeSession({
      databasePath,
      examId: pack.exam.id,
      packId: pack.pack.id,
      packVersion: pack.pack.version,
      questionCount: 2,
      random: () => 0,
    });
    answerQuestion(databasePath, session.id, 'q-storage', ['yes']);
    answerQuestion(databasePath, session.id, 'q-compute', ['no']);

    const progress = getProgress(databasePath);

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

  it('includes submitted mock exams in recent attempt summaries', () => {
    const { databasePath, pack } = fixture();
    const attempt = createMockAttempt({
      databasePath,
      durationMinutes: 30,
      examId: pack.exam.id,
      now: 10_000,
      packId: pack.pack.id,
      packVersion: pack.pack.version,
      questionCount: 2,
      random: () => 0,
    });
    saveMockAnswer(databasePath, attempt.id, 'q-storage', ['yes'], 11_000);
    saveMockAnswer(databasePath, attempt.id, 'q-compute', ['no'], 12_000);
    submitMockAttempt(databasePath, attempt.id, 13_000);

    const progress = getProgress(databasePath);

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
