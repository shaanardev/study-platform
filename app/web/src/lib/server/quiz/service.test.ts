import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { createDatabase } from '#lib/server/database/connection.js';
import { importPacksFromFolder } from '#lib/server/packs/importer.js';
import {
  getImportedPack,
  getImportedSourceAsset,
  saveImportedPack,
} from '#lib/server/packs/repository.js';
import { createSamplePackFolder } from '#lib/server/packs/test-fixtures.js';
import { validateExamPack } from '@learning-platform/exam-pack';
import {
  answerQuestion,
  createPracticeSession,
  getPracticeSession,
  readQuestionSource,
} from '#lib/server/quiz/service.js';
import { workspacePath } from '#lib/server/workspace-paths.js';

describe('practice sessions', () => {
  const directories: string[] = [];
  const databases: Awaited<ReturnType<typeof createDatabase>>[] = [];

  afterEach(async () => {
    await Promise.all(
      databases.splice(0).map(async (database) => {
        await database.close();
      }),
    );
    await Promise.all(
      directories.splice(0).map(async (directory) => {
        await rm(directory, { force: true, recursive: true });
      }),
    );
  });

  const setup = async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'practice-quiz-'));
    directories.push(directory);
    const databasePath = path.join(directory, 'practice.sqlite');
    const pack = validateExamPack(
      JSON.parse(
        await readFile(workspacePath('packs/incoming/sample-learning-pack.json'), 'utf-8'),
      ),
    );
    if (!pack.valid) {
      throw new Error(pack.errors.join(' '));
    }
    const database = await createDatabase(databasePath);
    databases.push(database);
    await saveImportedPack(database, pack.pack);
    return { database, pack: pack.pack };
  };

  it('grades multiple choice by exact answer set and persists the answer for resume', async () => {
    const { database, pack } = await setup();
    const session = await createPracticeSession({
      database,
      domainIds: ['pipelines'],
      examId: pack.exam.id,
      packId: pack.pack.id,
      packVersion: pack.pack.version,
      questionCount: 1,
      random: () => 0,
    });
    const result = await answerQuestion(session.id, 'pipeline-validation-basics', ['a'], database);
    const saved = await getPracticeSession(session.id, database);

    expect({
      correct: result.correct,
      correctAnswerIds: result.answerIdsCorrect,
      explanationContainsExpectedText: result.explanation.includes('Quality checks'),
      hiddenAnswerIds: Object.hasOwn(session.questions[0] ?? {}, 'answerIds'),
      persistedAnswerCount: saved?.answers.length,
      persistedAnswerIds: saved?.answers[0]?.answerIds,
      submittedAnswerIds: result.answerIds,
    }).toStrictEqual({
      correct: false,
      correctAnswerIds: ['a', 'b'],
      explanationContainsExpectedText: true,
      hiddenAnswerIds: false,
      persistedAnswerCount: 1,
      persistedAnswerIds: ['a'],
      submittedAnswerIds: ['a'],
    });
  });

  it('completes a session when concurrent answers fill the stored question set', async () => {
    const { database, pack } = await setup();
    const questionIds = ['pipeline-validation-basics', 'delta-transaction-basics'];
    const session = await createPracticeSession({
      database,
      examId: pack.exam.id,
      packId: pack.pack.id,
      packVersion: pack.pack.version,
      questionCount: questionIds.length,
      questionIds,
    });

    await Promise.all(
      questionIds.map(
        async (questionId) => await answerQuestion(session.id, questionId, ['a'], database),
      ),
    );

    const completed = await getPracticeSession(session.id, database);
    expect({
      answerIds: completed?.answers.map((answer) => answer.questionId).toSorted(),
      status: completed?.status,
    }).toStrictEqual({
      answerIds: questionIds.toSorted(),
      status: 'completed',
    });
  });

  it('favours unseen questions first and offers missed questions again within the chosen domain', async () => {
    const { database, pack } = await setup();
    const first = await createPracticeSession({
      database,
      domainIds: ['pipelines'],
      examId: pack.exam.id,
      packId: pack.pack.id,
      packVersion: pack.pack.version,
      questionCount: 1,
      random: () => 0,
    });
    await answerQuestion(first.id, 'pipeline-validation-basics', ['c'], database);

    const broad = await createPracticeSession({
      database,
      examId: pack.exam.id,
      packId: pack.pack.id,
      packVersion: pack.pack.version,
      questionCount: 1,
      random: () => 0,
    });
    const retry = await createPracticeSession({
      database,
      domainIds: ['pipelines'],
      examId: pack.exam.id,
      packId: pack.pack.id,
      packVersion: pack.pack.version,
      questionCount: 1,
      random: () => 0,
    });

    expect(broad.questionIds).toStrictEqual(['delta-transaction-basics']);
    expect(retry.questionIds).toStrictEqual(['pipeline-validation-basics']);
  });

  it('starts a practice session with the exact missed questions selected from progress', async () => {
    const { database, pack } = await setup();
    const selected = await createPracticeSession({
      database,
      examId: pack.exam.id,
      packId: pack.pack.id,
      packVersion: pack.pack.version,
      questionCount: 1,
      questionIds: ['pipeline-validation-basics'],
    });

    expect(selected.questionIds).toStrictEqual(['pipeline-validation-basics']);
  });

  it('keeps a citation excerpt available from the imported snapshot', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'practice-quiz-source-'));
    directories.push(directory);
    const incoming = path.join(directory, 'incoming');
    const databasePath = path.join(directory, 'practice.sqlite');
    const database = await createDatabase(databasePath);
    databases.push(database);
    await createSamplePackFolder(incoming);
    const pack = validateExamPack(
      JSON.parse(
        await readFile(workspacePath('packs/incoming/sample-learning-pack.json'), 'utf-8'),
      ),
    );
    if (!pack.valid) {
      throw new Error(pack.errors.join(' '));
    }
    const result = await importPacksFromFolder({ database, folder: incoming });
    await rm(incoming, { force: true, recursive: true });

    const source = await readQuestionSource(
      pack.pack.exam.id,
      'synthetic-foundations',
      '1.0.0',
      'delta-transaction-basics',
      'assets/synthetic-notes.md',
      database,
    );

    expect(result.errors).toStrictEqual([]);
    expect(source.label).toBe('Synthetic study notes, section 1');
    expect(source.text).toContain('transaction log');
  });

  it('opens an absolute file citation selected from the imported pack', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'practice-file-source-'));
    directories.push(directory);
    const incoming = path.join(directory, 'incoming');
    const notePath = path.join(directory, 'outside.md');
    const databasePath = path.join(directory, 'practice.sqlite');
    const database = await createDatabase(databasePath);
    databases.push(database);
    await createSamplePackFolder(incoming);
    await writeFile(notePath, 'Local citation content.\n');
    const packPath = path.join(incoming, 'sample-learning-pack.json');
    const parsed = validateExamPack(JSON.parse(await readFile(packPath, 'utf-8')));
    if (!parsed.valid) {
      throw new Error(parsed.errors.join(' '));
    }
    const authored = parsed.pack;
    const [firstQuestion] = authored.questions;
    const bundledCitation = firstQuestion?.sources[0];
    if (!firstQuestion || !bundledCitation) {
      throw new Error('Missing representative question source.');
    }
    const noteCitation = { label: 'Local notes', path: pathToFileURL(notePath).href };
    firstQuestion.sources.push(noteCitation);
    await writeFile(packPath, JSON.stringify(authored));

    const imported = await importPacksFromFolder({
      approvedSourceRoot: directory,
      database,
      folder: incoming,
    });
    await rm(incoming, { force: true, recursive: true });
    const bundled = await readQuestionSource(
      authored.exam.id,
      'synthetic-foundations',
      '1.0.0',
      firstQuestion.id,
      bundledCitation.path,
      database,
    );
    const note = await readQuestionSource(
      authored.exam.id,
      'synthetic-foundations',
      '1.0.0',
      firstQuestion.id,
      noteCitation.path,
      database,
    );

    expect({
      bundledContainsExpectedCitation: bundled.text.includes('transaction log'),
      importedErrors: imported.errors,
      localNote: note,
      savedAsset: await getImportedSourceAsset(
        database,
        authored.exam.id,
        'synthetic-foundations',
        '1.0.0',
        firstQuestion.id,
        noteCitation.path,
      ),
    }).toStrictEqual({
      bundledContainsExpectedCitation: true,
      importedErrors: [],
      localNote: { label: 'Local notes', text: 'Local citation content.\n' },
      savedAsset: { excerpt: 'Local citation content.\n', label: 'Local notes' },
    });
    await database
      .updateTable('imported_packs')
      .set({ approved_source_root: null })
      .where('exam_id', '=', authored.exam.id)
      .where('pack_id', '=', 'synthetic-foundations')
      .where('pack_version', '=', '1.0.0')
      .execute();
    await expect(
      readQuestionSource(
        authored.exam.id,
        'synthetic-foundations',
        '1.0.0',
        firstQuestion.id,
        noteCitation.path,
        database,
      ),
    ).rejects.toMatchObject({
      body: {
        message: 'Local citation is unavailable because no approved source root was recorded.',
      },
      status: 404,
    });
    await expect(
      readQuestionSource(
        authored.exam.id,
        'synthetic-foundations',
        '1.0.0',
        firstQuestion.id,
        pathToFileURL(path.join(directory, 'not-cited.md')).href,
        database,
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      readQuestionSource(
        authored.exam.id,
        'synthetic-foundations',
        '1.0.0',
        firstQuestion.id,
        'https://example.com/not-a-local-citation.md',
        database,
      ),
    ).rejects.toMatchObject({
      body: { message: 'Citation URL scheme is unsupported.' },
      status: 400,
    });
  });

  it('reauthorizes unchanged legacy citations without replacing the pack or progress', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'practice-file-reauthorize-'));
    directories.push(directory);
    const incoming = path.join(directory, 'incoming');
    const notes = path.join(directory, 'notes');
    const notePath = path.join(notes, 'reference.md');
    const databasePath = path.join(directory, 'practice.sqlite');
    const database = await createDatabase(databasePath);
    databases.push(database);
    await createSamplePackFolder(incoming);
    await mkdir(notes, { recursive: true });
    await writeFile(notePath, 'Reapproved local notes.\n');
    const packPath = path.join(incoming, 'sample-learning-pack.json');
    const parsed = validateExamPack(JSON.parse(await readFile(packPath, 'utf-8')));
    if (!parsed.valid) {
      throw new Error(parsed.errors.join(' '));
    }
    const authored = parsed.pack;
    const [question] = authored.questions;
    const citation = question?.sources[0];
    if (!question || !citation) {
      throw new Error('Missing representative question citation.');
    }
    citation.path = pathToFileURL(notePath).href;
    await writeFile(packPath, JSON.stringify(authored));
    const validated = validateExamPack(authored);
    if (!validated.valid) {
      throw new Error(validated.errors.join(' '));
    }
    await saveImportedPack(database, validated.pack);
    const session = await createPracticeSession({
      database,
      examId: authored.exam.id,
      packId: authored.pack.id,
      packVersion: authored.pack.version,
      questionCount: 1,
      questionIds: [question.id],
    });

    const changedPack = { ...authored, pack: { ...authored.pack, title: 'Changed title' } };
    await writeFile(packPath, JSON.stringify(changedPack));
    const changedImport = await importPacksFromFolder({
      approvedSourceRoot: notes,
      database,
      folder: incoming,
    });
    await writeFile(packPath, JSON.stringify(authored));
    const reauthorized = await importPacksFromFolder({
      approvedSourceRoot: notes,
      database,
      folder: incoming,
    });
    const retainedPack = await getImportedPack(
      authored.exam.id,
      authored.pack.id,
      authored.pack.version,
      database,
    );

    expect({
      changeErrorsMentionConflict: changedImport.errors[0]?.includes('already imported'),
      changedImported: changedImport.imported,
      changedRefreshed: changedImport.refreshed,
      retainedPackTitle: retainedPack?.pack.title,
    }).toStrictEqual({
      changeErrorsMentionConflict: true,
      changedImported: [],
      changedRefreshed: [],
      retainedPackTitle: authored.pack.title,
    });
    const retainedSession = await getPracticeSession(session.id, database);
    expect({
      reauthorized,
      retainedQuestionIds: retainedSession?.questionIds,
    }).toStrictEqual({
      reauthorized: {
        errors: [],
        imported: [],
        refreshed: [`${authored.exam.id}/${authored.pack.id}@${authored.pack.version}`],
      },
      retainedQuestionIds: [question.id],
    });
    await expect(
      readQuestionSource(
        authored.exam.id,
        authored.pack.id,
        authored.pack.version,
        question.id,
        citation.path,
        database,
      ),
    ).resolves.toStrictEqual({ label: citation.label, text: 'Reapproved local notes.\n' });
  });
});
