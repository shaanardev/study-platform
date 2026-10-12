import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { saveImportedPack } from '#lib/server/db/packs.js';
import { validateExamPack } from '#lib/server/packs/validate.js';
import {
  createMockAttempt,
  getMockAttempt,
  getMockCoverage,
  saveMockAnswer,
  submitMockAttempt,
} from '#lib/server/quiz/mock-service.js';
import { workspacePath } from '#lib/server/workspace-paths.js';

const errorBodyMessage = (value: unknown): string | undefined => {
  if (typeof value !== 'object' || value === null || !('body' in value)) {
    return undefined;
  }
  const { body } = value;
  if (typeof body !== 'object' || body === null || !('message' in body)) {
    return undefined;
  }
  return typeof body.message === 'string' ? body.message : undefined;
};

describe('timed mock attempts', () => {
  const dirs: string[] = [];
  afterEach(async () => {
    await Promise.all(
      dirs.splice(0).map(async (dir) => {
        await rm(dir, { force: true, recursive: true });
      }),
    );
  });
  const setup = async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'mock-exam-'));
    dirs.push(directory);
    const databasePath = path.join(directory, 'packs.sqlite');
    const validated = validateExamPack(
      JSON.parse(
        await readFile(workspacePath('packs/incoming/sample-learning-pack.json'), 'utf-8'),
      ),
    );
    if (!validated.valid) {
      throw new Error(validated.errors.join(' '));
    }
    const { pack } = validated;
    saveImportedPack(databasePath, pack);
    return { databasePath, pack };
  };

  it('blocks an attempt when weighted domain coverage is insufficient', async () => {
    const { databasePath, pack } = await setup();
    expect(
      getMockCoverage(databasePath, pack.exam.id, pack.pack.id, pack.pack.version, 5).gaps,
    ).toStrictEqual([
      { available: 1, id: 'delta-lake', missing: 2, required: 3, title: 'Delta Lake foundations' },
      {
        available: 1,
        id: 'pipelines',
        missing: 1,
        required: 2,
        title: 'Data pipeline foundations',
      },
    ]);
    let thrown: unknown;
    try {
      createMockAttempt({
        databasePath,
        durationMinutes: 30,
        examId: pack.exam.id,
        packId: pack.pack.id,
        packVersion: pack.pack.version,
        questionCount: 5,
      });
    } catch (error) {
      thrown = error;
    }
    expect(errorBodyMessage(thrown)).toContain('Insufficient weighted mock coverage');
  });

  it('persists answers and deadline across resume, then reveals scoring only after submit', async () => {
    const { databasePath, pack } = await setup();
    const attempt = createMockAttempt({
      databasePath,
      durationMinutes: 2,
      examId: pack.exam.id,
      now: 10_000,
      packId: pack.pack.id,
      packVersion: pack.pack.version,
      questionCount: 2,
      random: () => 0,
    });
    const [first] = attempt.questions;
    if (!first) {
      throw new Error('The mock attempt should include a question.');
    }
    const saved = saveMockAnswer(
      databasePath,
      attempt.id,
      first.id,
      first.id === 'delta-transaction-basics' ? ['a'] : ['a', 'b'],
      20_000,
    );
    expect({
      answerCorrect: Object.hasOwn(saved.answers[0] ?? {}, 'correct'),
      answerExplanation: Object.hasOwn(saved.answers[0] ?? {}, 'explanation'),
      questionAnswerIds: Object.hasOwn(saved.questions[0] ?? {}, 'answerIds'),
      questionExplanation: Object.hasOwn(saved.questions[0] ?? {}, 'explanation'),
    }).toStrictEqual({
      answerCorrect: false,
      answerExplanation: false,
      questionAnswerIds: false,
      questionExplanation: false,
    });
    const resumed = getMockAttempt(databasePath, attempt.id, 40_000);
    if (!resumed) {
      throw new Error('The mock attempt should remain available.');
    }
    expect({
      answerCount: resumed.answers.length,
      hasScore: Object.hasOwn(resumed, 'score'),
      remainingMilliseconds: resumed.remainingMilliseconds,
    }).toStrictEqual({ answerCount: 1, hasScore: false, remainingMilliseconds: 90_000 });
    const completed = submitMockAttempt(databasePath, attempt.id, 50_000);
    expect({
      domains: completed.score?.domains.map(({ id, correct, total }) => ({ correct, id, total })),
      hasExplanations: completed.questions.every((question) => 'explanation' in question),
      score: completed.score,
      status: completed.status,
    }).toStrictEqual({
      domains: [
        { correct: 1, id: 'delta-lake', total: 1 },
        { correct: 0, id: 'pipelines', total: 1 },
      ],
      hasExplanations: true,
      score: {
        correct: 1,
        domains: [
          { correct: 1, id: 'delta-lake', percent: 100, title: 'Delta Lake foundations', total: 1 },
          { correct: 0, id: 'pipelines', percent: 0, title: 'Data pipeline foundations', total: 1 },
        ],
        passed: false,
        passingThreshold: 70,
        percent: 50,
        total: 2,
      },
      status: 'submitted',
    });
  });

  it('expires at the persisted deadline and reveals the saved answers', async () => {
    const { databasePath, pack } = await setup();
    const attempt = createMockAttempt({
      databasePath,
      durationMinutes: 1,
      examId: pack.exam.id,
      now: 5000,
      packId: pack.pack.id,
      packVersion: pack.pack.version,
      questionCount: 2,
      random: () => 0,
    });
    saveMockAnswer(databasePath, attempt.id, 'delta-transaction-basics', ['a'], 6000);
    const expired = getMockAttempt(databasePath, attempt.id, 65_000);
    if (!expired) {
      throw new Error('The expired mock attempt should remain available.');
    }
    expect(expired.status).toBe('expired');
    expect(expired.score?.correct).toBe(1);
    expect(expired.questions[0]).toHaveProperty('explanation');
  });

  it('does not report pass or fail when the blueprint has no threshold', async () => {
    const { databasePath, pack } = await setup();
    const packWithoutThreshold = structuredClone(pack);
    packWithoutThreshold.pack.version = '1.0.1';
    delete packWithoutThreshold.passingThreshold;
    saveImportedPack(databasePath, packWithoutThreshold);
    const attempt = createMockAttempt({
      databasePath,
      durationMinutes: 1,
      examId: pack.exam.id,
      now: 1000,
      packId: pack.pack.id,
      packVersion: '1.0.1',
      questionCount: 2,
      random: () => 0,
    });

    const completed = submitMockAttempt(databasePath, attempt.id, 2000);
    expect(completed.score).not.toHaveProperty('passingThreshold');
    expect(completed.score).not.toHaveProperty('passed');
  });
});
