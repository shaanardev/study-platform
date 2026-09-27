import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { saveImportedPack } from '../db/packs';
import { validateExamPack } from '../packs/validate';
import { createMockAttempt, getMockAttempt, getMockCoverage, saveMockAnswer, submitMockAttempt } from './mock-service';

const dirs: string[] = [];
afterEach(async () => Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))));
async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 'ordewell-mock-')); dirs.push(directory);
  const databasePath = join(directory, 'packs.sqlite');
  const validated = validateExamPack(JSON.parse(await readFile(resolve('packs/incoming/sample-databricks-associate.json'), 'utf8')));
  if (!validated.valid) throw new Error(validated.errors.join(' '));
  const pack = validated.pack; saveImportedPack(databasePath, pack);
  return { databasePath, pack };
}

describe('timed mock attempts', () => {
  it('blocks an attempt when weighted domain coverage is insufficient', async () => {
    const { databasePath, pack } = await setup();
    expect(getMockCoverage(databasePath, pack.exam.id, pack.pack.id, pack.pack.version, 5).gaps).toEqual([
      { id: 'delta-lake', title: 'Delta Lake foundations', required: 3, available: 1, missing: 2 },
      { id: 'pipelines', title: 'Data pipeline foundations', required: 2, available: 1, missing: 1 },
    ]);
    expect(() => createMockAttempt({ databasePath, examId: pack.exam.id, packId: pack.pack.id, packVersion: pack.pack.version, questionCount: 5, durationMinutes: 30 })).toThrow('Insufficient weighted mock coverage');
  });

  it('persists answers and deadline across resume, then reveals scoring only after submit', async () => {
    const { databasePath, pack } = await setup();
    const attempt = createMockAttempt({ databasePath, examId: pack.exam.id, packId: pack.pack.id, packVersion: pack.pack.version, questionCount: 2, durationMinutes: 2, random: () => 0, now: 10_000 });
    const first = attempt.questions[0]!;
    const saved = saveMockAnswer(databasePath, attempt.id, first.id, first.id === 'delta-transaction-basics' ? ['a'] : ['a', 'b'], 20_000);
    expect(saved.questions[0]).not.toHaveProperty('answerIds');
    expect(saved.questions[0]).not.toHaveProperty('explanation');
    expect(saved.answers[0]).not.toHaveProperty('correct');
    expect(saved.answers[0]).not.toHaveProperty('explanation');
    const resumed = getMockAttempt(databasePath, attempt.id, 40_000)!;
    expect(resumed.remainingMilliseconds).toBe(90_000);
    expect(resumed.answers).toHaveLength(1);
    expect(resumed).not.toHaveProperty('score');
    const completed = submitMockAttempt(databasePath, attempt.id, 50_000);
    expect(completed.status).toBe('submitted');
    expect(completed.score).toMatchObject({ correct: 1, total: 2, percent: 50, passingThreshold: 70, passed: false });
    expect(completed.score?.domains.map(({ id, correct, total }) => ({ id, correct, total }))).toEqual([
      { id: 'delta-lake', correct: 1, total: 1 }, { id: 'pipelines', correct: 0, total: 1 },
    ]);
    expect(completed.questions.every((question) => 'explanation' in question)).toBe(true);
  });

  it('expires at the persisted deadline and reveals the saved answers', async () => {
    const { databasePath, pack } = await setup();
    const attempt = createMockAttempt({ databasePath, examId: pack.exam.id, packId: pack.pack.id, packVersion: pack.pack.version, questionCount: 2, durationMinutes: 1, random: () => 0, now: 5_000 });
    saveMockAnswer(databasePath, attempt.id, 'delta-transaction-basics', ['a'], 6_000);
    const expired = getMockAttempt(databasePath, attempt.id, 65_000)!;
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
      examId: pack.exam.id,
      packId: pack.pack.id,
      packVersion: '1.0.1',
      questionCount: 2,
      durationMinutes: 1,
      random: () => 0,
      now: 1_000,
    });

    const completed = submitMockAttempt(databasePath, attempt.id, 2_000);
    expect(completed.score).not.toHaveProperty('passingThreshold');
    expect(completed.score).not.toHaveProperty('passed');
  });
});
