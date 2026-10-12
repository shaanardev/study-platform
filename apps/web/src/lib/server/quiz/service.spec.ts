import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import {
  getImportedPack,
  getImportedSourceAsset,
  openPackDatabase,
  saveImportedPack,
} from '#lib/server/db/packs.js';
import { importPacksFromFolder } from '#lib/server/packs/importer.js';
import { createSamplePackFolder } from '#lib/server/packs/test-fixtures.js';
import { validateExamPack } from '#lib/server/packs/validate.js';
import {
  answerQuestion,
  createPracticeSession,
  getPracticeSession,
  readQuestionSource,
} from '#lib/server/quiz/service.js';
import { workspacePath } from '#lib/server/workspace-paths.js';

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
    JSON.parse(await readFile(workspacePath('packs/incoming/sample-learning-pack.json'), 'utf8')),
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
    const pack = validateExamPack(
      JSON.parse(await readFile(workspacePath('packs/incoming/sample-learning-pack.json'), 'utf8')),
    );
    if (!pack.valid) throw new Error(pack.errors.join(' '));
    const result = await importPacksFromFolder({ folder: incoming, databasePath });
    await rm(incoming, { recursive: true, force: true });

    const source = await readQuestionSource(
      databasePath,
      pack.pack.exam.id,
      'synthetic-foundations',
      '1.0.0',
      'delta-transaction-basics',
      'assets/synthetic-notes.md',
    );

    expect(result.errors).toEqual([]);
    expect(source.label).toBe('Synthetic study notes, section 1');
    expect(source.text).toContain('transaction log');
  });

  it('opens an absolute file citation selected from the imported pack', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'practice-file-source-'));
    directories.push(directory);
    const incoming = join(directory, 'incoming');
    const notePath = join(directory, 'outside.md');
    const databasePath = join(directory, 'practice.sqlite');
    await createSamplePackFolder(incoming);
    await writeFile(notePath, 'Local citation content.\n');
    const packPath = join(incoming, 'sample-learning-pack.json');
    const authored = JSON.parse(await readFile(packPath, 'utf8')) as {
      exam: { id: string };
      questions: { id: string; sources: { path: string; label: string }[] }[];
    };
    const firstQuestion = authored.questions[0];
    const bundledCitation = firstQuestion?.sources[0];
    if (!firstQuestion || !bundledCitation)
      throw new Error('Missing representative question source.');
    const noteCitation = { path: pathToFileURL(notePath).href, label: 'Local notes' };
    firstQuestion.sources.push(noteCitation);
    await writeFile(packPath, JSON.stringify(authored));

    const imported = await importPacksFromFolder({
      folder: incoming,
      databasePath,
      approvedSourceRoot: directory,
    });
    await rm(incoming, { recursive: true, force: true });
    const bundled = await readQuestionSource(
      databasePath,
      authored.exam.id,
      'synthetic-foundations',
      '1.0.0',
      firstQuestion.id,
      bundledCitation.path,
    );
    const note = await readQuestionSource(
      databasePath,
      authored.exam.id,
      'synthetic-foundations',
      '1.0.0',
      firstQuestion.id,
      noteCitation.path,
    );

    expect(imported.errors).toEqual([]);
    expect(bundled.text).toContain('transaction log');
    expect(note).toEqual({ label: 'Local notes', text: 'Local citation content.\n' });
    const legacyDatabase = openPackDatabase(databasePath);
    try {
      legacyDatabase
        .prepare(
          'UPDATE imported_packs SET approved_source_root = NULL WHERE exam_id = ? AND pack_id = ? AND pack_version = ?',
        )
        .run(authored.exam.id, 'synthetic-foundations', '1.0.0');
    } finally {
      legacyDatabase.close();
    }
    await expect(
      readQuestionSource(
        databasePath,
        authored.exam.id,
        'synthetic-foundations',
        '1.0.0',
        firstQuestion.id,
        noteCitation.path,
      ),
    ).rejects.toMatchObject({
      status: 404,
      body: {
        message: 'Local citation is unavailable because no approved source root was recorded.',
      },
    });
    await expect(
      readQuestionSource(
        databasePath,
        authored.exam.id,
        'synthetic-foundations',
        '1.0.0',
        firstQuestion.id,
        pathToFileURL(join(directory, 'not-cited.md')).href,
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      readQuestionSource(
        databasePath,
        authored.exam.id,
        'synthetic-foundations',
        '1.0.0',
        firstQuestion.id,
        'https://example.com/not-a-local-citation.md',
      ),
    ).rejects.toMatchObject({
      status: 400,
      body: { message: 'Citation URL scheme is unsupported.' },
    });
    expect(
      getImportedSourceAsset(
        databasePath,
        authored.exam.id,
        'synthetic-foundations',
        '1.0.0',
        firstQuestion.id,
        noteCitation.path,
      ),
    ).toEqual({ label: 'Local notes', excerpt: 'Local citation content.\n' });
  });

  it('reauthorizes unchanged legacy citations without replacing the pack or progress', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'practice-file-reauthorize-'));
    directories.push(directory);
    const incoming = join(directory, 'incoming');
    const notes = join(directory, 'notes');
    const notePath = join(notes, 'reference.md');
    const databasePath = join(directory, 'practice.sqlite');
    await createSamplePackFolder(incoming);
    await mkdir(notes, { recursive: true });
    await writeFile(notePath, 'Reapproved local notes.\n');
    const packPath = join(incoming, 'sample-learning-pack.json');
    const authored = JSON.parse(await readFile(packPath, 'utf8')) as {
      exam: { id: string };
      pack: { id: string; version: string; title: string };
      questions: { id: string; sources: { path: string; label: string }[] }[];
    };
    const question = authored.questions[0];
    const citation = question?.sources[0];
    if (!question || !citation) throw new Error('Missing representative question citation.');
    citation.path = pathToFileURL(notePath).href;
    await writeFile(packPath, JSON.stringify(authored));
    const validated = validateExamPack(authored);
    if (!validated.valid) throw new Error(validated.errors.join(' '));
    saveImportedPack(databasePath, validated.pack);
    const session = createPracticeSession({
      databasePath,
      examId: authored.exam.id,
      packId: authored.pack.id,
      packVersion: authored.pack.version,
      questionCount: 1,
      questionIds: [question.id],
    });

    const changedPack = { ...authored, pack: { ...authored.pack, title: 'Changed title' } };
    await writeFile(packPath, JSON.stringify(changedPack));
    const changedImport = await importPacksFromFolder({
      folder: incoming,
      databasePath,
      approvedSourceRoot: notes,
    });
    await writeFile(packPath, JSON.stringify(authored));
    const reauthorized = await importPacksFromFolder({
      folder: incoming,
      databasePath,
      approvedSourceRoot: notes,
    });

    expect(changedImport.imported).toEqual([]);
    expect(changedImport.refreshed).toEqual([]);
    expect(changedImport.errors[0]).toContain('already imported');
    expect(
      getImportedPack(authored.exam.id, authored.pack.id, authored.pack.version, databasePath)?.pack
        .title,
    ).toBe(authored.pack.title);
    expect(reauthorized).toEqual({
      imported: [],
      refreshed: [`${authored.exam.id}/${authored.pack.id}@${authored.pack.version}`],
      errors: [],
    });
    expect(getPracticeSession(databasePath, session.id)?.questionIds).toEqual([question.id]);
    await expect(
      readQuestionSource(
        databasePath,
        authored.exam.id,
        authored.pack.id,
        authored.pack.version,
        question.id,
        citation.path,
      ),
    ).resolves.toEqual({ label: citation.label, text: 'Reapproved local notes.\n' });
  });
});
