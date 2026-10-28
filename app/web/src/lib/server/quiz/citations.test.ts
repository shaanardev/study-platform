import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { validateExamPack } from '@learning-platform/exam-pack';
import type { ExamPack, PackQuestion, PackSource } from '@learning-platform/exam-pack';
import { describe, expect, it } from 'vitest';

import { getAppDatabase } from '#lib/server/database/app-database.js';
import { useTestDatabase } from '#lib/server/database/test-fixtures.js';
import { importPacksFromFolder } from '#lib/server/packs/importer.js';
import { getImportedPack, saveImportedPack } from '#lib/server/packs/repository.js';
import { mockSamplePackFolder } from '#lib/server/packs/test-fixtures.js';
import {
  createPracticeSession,
  getPracticeSession,
  readQuestionSource,
} from '#lib/server/quiz/service.js';
import { sampleLearningPackFixture } from '#lib/test-fixtures.js';

const sampleCitationFixture = (questionIndex = 0) => {
  const validation = validateExamPack(sampleLearningPackFixture());

  if (!validation.valid) {
    throw new Error(validation.errors.join(' '));
  }

  const { pack } = validation;
  const question = pack.questions.at(questionIndex);

  if (!question) {
    throw new Error(`Expected the sample pack to contain question ${questionIndex}.`);
  }

  const citation = question.sources.at(0);

  if (!citation) {
    throw new Error('Expected the sample question to contain a citation.');
  }

  return { citation, pack, question };
};

interface CitationLookup {
  citation: PackSource;
  pack: ExamPack;
  question: PackQuestion;
}

describe('citation source lookup', () => {
  let lookup: CitationLookup;

  useTestDatabase(async () => {
    const { citation, pack, question } = sampleCitationFixture();
    citation.path = 'file:///approved/notes.md';
    await saveImportedPack(
      pack,
      [{ excerpt: 'Saved local excerpt.', questionId: question.id, source: citation }],
      '/approved',
    );
    lookup = { citation, pack, question };
  });

  it('returns the saved excerpt for an approved file citation', async () => {
    const { citation, pack, question } = lookup;
    await expect(
      readQuestionSource(pack.exam.id, pack.pack.id, pack.pack.version, question.id, citation.path),
    ).resolves.toStrictEqual({ label: citation.label, text: 'Saved local excerpt.' });
  });

  it('keeps saved excerpts isolated between pack versions sharing a citation path', async () => {
    const { citation, pack, question } = lookup;
    const secondVersion = structuredClone(pack);
    secondVersion.pack.version = '2.0.0';
    await saveImportedPack(
      secondVersion,
      [{ excerpt: 'Version two excerpt.', questionId: question.id, source: citation }],
      '/approved',
    );

    await expect(
      readQuestionSource(pack.exam.id, pack.pack.id, pack.pack.version, question.id, citation.path),
    ).resolves.toMatchObject({ text: 'Saved local excerpt.' });
    await expect(
      readQuestionSource(
        pack.exam.id,
        pack.pack.id,
        secondVersion.pack.version,
        question.id,
        citation.path,
      ),
    ).resolves.toMatchObject({ text: 'Version two excerpt.' });
  });

  it('rejects file citations when their approved root is missing', async () => {
    const { citation, pack, question } = lookup;
    await getAppDatabase()
      .updateTable('imported_packs')
      .set({ approved_source_root: null })
      .where('exam_id', '=', pack.exam.id)
      .where('pack_id', '=', pack.pack.id)
      .where('pack_version', '=', pack.pack.version)
      .execute();

    await expect(
      readQuestionSource(pack.exam.id, pack.pack.id, pack.pack.version, question.id, citation.path),
    ).rejects.toMatchObject({
      body: {
        message: 'Local citation is unavailable because no approved source root was recorded.',
      },
      status: 404,
    });
  });

  it('rejects a path absent from the question', async () => {
    const { pack, question } = lookup;
    await expect(
      readQuestionSource(
        pack.exam.id,
        pack.pack.id,
        pack.pack.version,
        question.id,
        'file:///approved/not-cited.md',
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('rejects unsupported URL schemes', async () => {
    const { pack, question } = lookup;
    await expect(
      readQuestionSource(
        pack.exam.id,
        pack.pack.id,
        pack.pack.version,
        question.id,
        'https://example.com/not-a-local-citation.md',
      ),
    ).rejects.toMatchObject({
      body: { message: 'Citation URL scheme is unsupported.' },
      status: 400,
    });
  });
});

describe('citation import workflow', () => {
  const fixture = useTestDatabase();

  it('reads a bundled citation snapshot after the imported files are removed', async () => {
    const incoming = path.join(fixture.directory, 'incoming');
    const { citation, pack, question } = sampleCitationFixture(1);
    await mockSamplePackFolder(incoming);

    const imported = await importPacksFromFolder({ folder: incoming });
    await rm(incoming, { force: true, recursive: true });

    expect(imported.errors).toStrictEqual([]);

    const source = await readQuestionSource(
      pack.exam.id,
      pack.pack.id,
      pack.pack.version,
      question.id,
      citation.path,
    );

    expect(source.label).toBe(citation.label);
    expect(source.text).toContain('transaction log');
  });

  it('reauthorizes unchanged legacy citations, rejects changed content, and retains progress', async () => {
    const incoming = path.join(fixture.directory, 'incoming');
    const notes = path.join(fixture.directory, 'notes');
    const notePath = path.join(notes, 'reference.md');
    const { citation, pack, question } = sampleCitationFixture();
    citation.path = pathToFileURL(notePath).href;
    await mkdir(notes, { recursive: true });
    await mockSamplePackFolder(incoming);
    await writeFile(notePath, 'Reapproved local notes.');
    const packPath = path.join(incoming, 'sample-learning-pack.json');
    await writeFile(packPath, JSON.stringify(pack));
    await saveImportedPack(pack);

    const session = await createPracticeSession({
      examId: pack.exam.id,
      packId: pack.pack.id,
      packVersion: pack.pack.version,
      questionCount: 1,
      questionIds: [question.id],
    });

    await writeFile(
      packPath,
      JSON.stringify({ ...pack, pack: { ...pack.pack, title: 'Changed title' } }),
    );
    const changed = await importPacksFromFolder({ approvedSourceRoot: notes, folder: incoming });
    await writeFile(packPath, JSON.stringify(pack));

    const reauthorized = await importPacksFromFolder({
      approvedSourceRoot: notes,
      folder: incoming,
    });

    expect(changed).toMatchObject({ imported: [], refreshed: [] });
    expect(reauthorized).toMatchObject({
      errors: [],
      imported: [],
      refreshed: [`${pack.exam.id}/${pack.pack.id}@${pack.pack.version}`],
    });
    await expect(
      getImportedPack(pack.exam.id, pack.pack.id, pack.pack.version),
    ).resolves.toStrictEqual(pack);
    const retainedSession = await getPracticeSession(session.id);
    expect(retainedSession?.questionIds).toStrictEqual([question.id]);
    await expect(
      readQuestionSource(pack.exam.id, pack.pack.id, pack.pack.version, question.id, citation.path),
    ).resolves.toStrictEqual({ label: citation.label, text: 'Reapproved local notes.' });
  });
});
