import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { saveImportedPack } from '../db/packs';
import type { ExamPack } from '../packs/validate';
import { createMockAttempt, saveMockAnswer, submitMockAttempt } from '../quiz/mock-service';
import { answerQuestion, createPracticeSession } from '../quiz/service';
import { getProgress } from './queries';

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'orde-progress-'));
  directories.push(directory);
  const databasePath = join(directory, 'progress.sqlite');
  const pack: ExamPack = {
    schemaVersion: 1,
    exam: { id: 'exam-a', title: 'Cloud exam', version: '2026' },
    pack: { id: 'pack-a', title: 'Cloud foundations', version: '1.0', synthetic: false },
    domains: [
      { id: 'storage', title: 'Storage', weight: 60 },
      { id: 'compute', title: 'Compute', weight: 40 },
    ],
    questions: [
      {
        id: 'q-storage',
        type: 'single_choice',
        domainId: 'storage',
        prompt: 'Storage?',
        options: [
          { id: 'yes', text: 'Yes' },
          { id: 'no', text: 'No' },
        ],
        answerIds: ['yes'],
        explanation: 'Yes.',
        sources: [{ path: 'notes.md', label: 'Notes' }],
      },
      {
        id: 'q-compute',
        type: 'single_choice',
        domainId: 'compute',
        prompt: 'Compute?',
        options: [
          { id: 'yes', text: 'Yes' },
          { id: 'no', text: 'No' },
        ],
        answerIds: ['yes'],
        explanation: 'Yes.',
        sources: [{ path: 'notes.md', label: 'Notes' }],
      },
    ],
  };
  saveImportedPack(databasePath, pack);
  return { databasePath, pack };
}

describe('progress queries', () => {
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
      kind: 'practice',
      examTitle: 'Cloud exam',
      packTitle: 'Cloud foundations',
      packVersion: '1.0',
      correctCount: 1,
      answeredCount: 2,
      questionCount: 2,
    });
    expect(progress.domainScores).toEqual([
      {
        examId: 'exam-a',
        examTitle: 'Cloud exam',
        packId: 'pack-a',
        packTitle: 'Cloud foundations',
        packVersion: '1.0',
        domainId: 'compute',
        domainTitle: 'Compute',
        correctCount: 0,
        answeredCount: 1,
        percent: 0,
      },
      {
        examId: 'exam-a',
        examTitle: 'Cloud exam',
        packId: 'pack-a',
        packTitle: 'Cloud foundations',
        packVersion: '1.0',
        domainId: 'storage',
        domainTitle: 'Storage',
        correctCount: 1,
        answeredCount: 1,
        percent: 100,
      },
    ]);
    expect(progress.missedQuestions).toEqual([
      {
        examId: 'exam-a',
        packId: 'pack-a',
        packVersion: '1.0',
        examTitle: 'Cloud exam',
        packTitle: 'Cloud foundations',
        questionId: 'q-compute',
        prompt: 'Compute?',
        domainId: 'compute',
        domainTitle: 'Compute',
        missCount: 1,
      },
    ]);
  });

  it('includes submitted mock exams in recent attempt summaries', () => {
    const { databasePath, pack } = fixture();
    const attempt = createMockAttempt({
      databasePath,
      examId: pack.exam.id,
      packId: pack.pack.id,
      packVersion: pack.pack.version,
      questionCount: 2,
      durationMinutes: 30,
      random: () => 0,
      now: 10_000,
    });
    saveMockAnswer(databasePath, attempt.id, 'q-storage', ['yes'], 11_000);
    saveMockAnswer(databasePath, attempt.id, 'q-compute', ['no'], 12_000);
    submitMockAttempt(databasePath, attempt.id, 13_000);

    const progress = getProgress(databasePath);

    expect(progress.recentAttempts).toContainEqual(
      expect.objectContaining({
        id: attempt.id,
        kind: 'mock',
        examTitle: 'Cloud exam',
        packTitle: 'Cloud foundations',
        packVersion: '1.0',
        status: 'submitted',
        correctCount: 1,
        answeredCount: 2,
        questionCount: 2,
      }),
    );
  });
});
