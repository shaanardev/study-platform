import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { saveImportedPack } from '#lib/server/db/packs.js';
import { importPacksFromFolder } from '#lib/server/packs/importer.js';
import { createSamplePackFolder } from '#lib/server/packs/test-fixtures.js';
import { validateExamPack } from '#lib/server/packs/validate.js';
import {
  answerQuestion,
  createPracticeSession,
  getPracticeSession,
  readQuestionSource,
} from '#lib/server/quiz/service.js';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 'practice-quiz-'));
  directories.push(directory);
  const databasePath = join(directory, 'practice.sqlite');
  const pack = validateExamPack(
    JSON.parse(await readFile(resolve('packs/incoming/sample-databricks-associate.json'), 'utf8')),
  );
  if (!pack.valid) throw new Error(pack.errors.join(' '));
  saveImportedPack(databasePath, pack.pack);
  return { databasePath, pack: pack.pack };
}

describe('practice sessions', () => {
  it('grades multiple choice by exact answer set and persists the answer for resume', async () => {
    const { databasePath, pack } = await setup();
    const session = createPracticeSession({
      databasePath,
      examId: pack.exam.id,
      packId: pack.pack.id,
      packVersion: pack.pack.version,
      questionCount: 1,
      domainIds: ['pipelines'],
      random: () => 0,
    });
    expect(session.questions[0]).not.toHaveProperty('answerIds');
    const result = answerQuestion(databasePath, session.id, 'pipeline-validation-basics', ['a']);

    expect(result.correct).toBe(false);
    expect(result.answerIds).toEqual(['a']);
    expect(result.answerIdsCorrect).toEqual(['a', 'b']);
    expect(result.explanation).toContain('Quality checks');
    expect(getPracticeSession(databasePath, session.id)?.answers).toHaveLength(1);
    expect(getPracticeSession(databasePath, session.id)?.answers[0]?.answerIds).toEqual(['a']);
  });

  it('favours unseen questions first and offers missed questions again within the chosen domain', async () => {
    const { databasePath, pack } = await setup();
    const first = createPracticeSession({
      databasePath,
      examId: pack.exam.id,
      packId: pack.pack.id,
      packVersion: pack.pack.version,
      questionCount: 1,
      domainIds: ['pipelines'],
      random: () => 0,
    });
    answerQuestion(databasePath, first.id, 'pipeline-validation-basics', ['c']);

    const broad = createPracticeSession({
      databasePath,
      examId: pack.exam.id,
      packId: pack.pack.id,
      packVersion: pack.pack.version,
      questionCount: 1,
      random: () => 0,
    });
    const retry = createPracticeSession({
      databasePath,
      examId: pack.exam.id,
      packId: pack.pack.id,
      packVersion: pack.pack.version,
      questionCount: 1,
      domainIds: ['pipelines'],
      random: () => 0,
    });

    expect(broad.questionIds).toEqual(['delta-transaction-basics']);
    expect(retry.questionIds).toEqual(['pipeline-validation-basics']);
  });

  it('starts a practice session with the exact missed questions selected from progress', async () => {
    const { databasePath, pack } = await setup();
    const selected = createPracticeSession({
      databasePath,
      examId: pack.exam.id,
      packId: pack.pack.id,
      packVersion: pack.pack.version,
      questionCount: 1,
      questionIds: ['pipeline-validation-basics'],
    });

    expect(selected.questionIds).toEqual(['pipeline-validation-basics']);
  });

  it('keeps a citation excerpt available from the imported snapshot', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'practice-quiz-source-'));
    directories.push(directory);
    const incoming = join(directory, 'incoming');
    const databasePath = join(directory, 'practice.sqlite');
    await createSamplePackFolder(incoming);
    const result = await importPacksFromFolder({ folder: incoming, databasePath });
    await rm(incoming, { recursive: true, force: true });

    const source = await readQuestionSource(
      databasePath,
      'databricks-data-engineer-associate',
      'synthetic-foundations',
      '1.0.0',
      'delta-transaction-basics',
      'assets/synthetic-notes.md',
    );

    expect(result.errors).toEqual([]);
    expect(source.label).toBe('Synthetic study notes, section 1');
    expect(source.text).toContain('transaction log');
  });
});
