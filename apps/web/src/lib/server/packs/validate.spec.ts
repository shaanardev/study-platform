import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { normalizeLegacyCitations } from '#lib/server/packs/legacy.js';
import { validateExamPack } from '#lib/server/packs/validate.js';
import { workspacePath } from '#lib/server/workspace-paths.js';

const validPack = {
  schemaVersion: 1,
  exam: { id: 'demo-exam', title: 'Demo exam', version: '1.0.0' },
  pack: { id: 'demo-pack', title: 'Demo pack', version: '1.0.0', synthetic: true },
  domains: [{ id: 'fundamentals', title: 'Fundamentals', weight: 100 }],
  passingThreshold: 70,
  questions: [
    {
      id: 'question-1',
      type: 'single_choice',
      domainId: 'fundamentals',
      prompt: 'Which option is correct?',
      options: [
        { id: 'a', text: 'First option' },
        { id: 'b', text: 'Second option' },
      ],
      answerIds: ['b'],
      explanation: 'The second option is correct.',
      sources: [{ path: 'assets/notes.md', label: 'Study notes' }],
    },
  ],
};

describe('validateExamPack', () => {
  it('accepts a valid versioned pack and returns its normalized value', () => {
    expect(validateExamPack(validPack)).toEqual({
      valid: true,
      pack: validPack,
      errors: [],
    });
  });

  it('accepts and preserves supported citation metadata', () => {
    const pack = structuredClone(validPack);
    const question = pack.questions[0];
    if (!question) throw new Error('Expected the valid pack to contain a question.');
    const source = {
      kind: 'academy_note',
      path: 'streaming/checkpoints.md',
      label: 'Streaming notes',
      section: 'Checkpointing',
      documentationUrls: ['https://example.com/streaming/checkpoints'],
    };
    question.sources = [source];

    const result = validateExamPack(pack);

    expect(result).toEqual({
      valid: true,
      pack: { ...pack, questions: [{ ...question, sources: [source] }] },
      errors: [],
    });
  });

  it('accepts migrated v1.2.1 and legacy v1.2.0 pack citations', async () => {
    const current = JSON.parse(
      await readFile(workspacePath('packs/incoming/databricks-dea-may-2026-v1.2.1.json'), 'utf8'),
    ) as unknown;
    const legacy = JSON.parse(
      await readFile(workspacePath('packs/incoming/databricks-dea-may-2026-v1.2.0.json'), 'utf8'),
    ) as unknown;

    const currentResult = validateExamPack(current);
    const legacyResult = validateExamPack(normalizeLegacyCitations(legacy));
    const currentSource = currentResult.valid
      ? currentResult.pack.questions[0]?.sources[0]
      : undefined;
    const legacySource = legacyResult.valid
      ? legacyResult.pack.questions[0]?.sources[0]
      : undefined;

    expect(currentResult.valid).toBe(true);
    expect(currentSource).toMatchObject({
      kind: 'academy_note',
      section: expect.any(String),
      documentationUrls: expect.any(Array),
    });
    expect(legacyResult.valid).toBe(true);
    expect(legacySource).toMatchObject({
      kind: 'academy_note',
      section: expect.any(String),
      documentationUrls: expect.any(Array),
    });
  });

  it('accepts an absolute local file URL as a generic citation', () => {
    const pack = structuredClone(validPack);
    const question = pack.questions[0];
    if (!question) throw new Error('Expected the valid pack to contain a question.');
    question.sources = [{ path: 'file:///tmp/reference%20notes.md', label: 'Local reference' }];

    expect(validateExamPack(pack)).toEqual({ valid: true, pack, errors: [] });
  });

  it('rejects unsupported URL schemes as citation paths', () => {
    const pack = structuredClone(validPack);
    const source = pack.questions[0]?.sources[0];
    if (!source) throw new Error('Expected the valid pack to contain a source.');
    source.path = 'https://example.com/notes.md';

    const result = validateExamPack(pack);

    expect(result).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        'questions[0] source path "https://example.com/notes.md" must be a safe relative path or absolute file URL.',
      ]),
    });
  });

  it('reports unsafe source paths and domain weights that do not total 100', () => {
    const invalidPack = structuredClone(validPack);
    const domain = invalidPack.domains[0];
    const source = invalidPack.questions[0]?.sources[0];
    if (!domain || !source)
      throw new Error('Expected the valid pack to contain domain and source data.');
    domain.weight = 90;
    source.path = '../private/notes.md';

    const result = validateExamPack(invalidPack);

    expect(result).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        'Domain weights must total 100.',
        'questions[0] source path "../private/notes.md" must be a safe relative path or absolute file URL.',
      ]),
    });
  });

  it('rejects repeated question IDs', () => {
    const invalidPack = structuredClone(validPack);
    const firstQuestion = invalidPack.questions[0];
    if (!firstQuestion) throw new Error('Expected the valid pack to contain a question.');
    invalidPack.questions.push({ ...firstQuestion });

    const result = validateExamPack(invalidPack);

    expect(result).toMatchObject({
      valid: false,
      errors: expect.arrayContaining(['Question IDs must be unique within a pack.']),
    });
  });

  it('rejects unknown question fields', () => {
    const invalidPack = structuredClone(validPack);
    const question = invalidPack.questions[0];
    if (!question) throw new Error('Expected the valid pack to contain a question.');
    Object.assign(question, { internalNote: 'not part of the pack schema' });

    const result = validateExamPack(invalidPack);

    expect(result).toMatchObject({
      valid: false,
      errors: expect.arrayContaining(['questions[0] contains unknown field "internalNote".']),
    });
  });
});
