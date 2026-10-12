import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { normalizeLegacyCitations } from '#lib/server/packs/legacy.js';
import { validateExamPack } from '#lib/server/packs/validate.js';
import { workspacePath } from '#lib/server/workspace-paths.js';
import type { PackSource } from '#lib/types/exam-pack.js';

const validPack = {
  domains: [{ id: 'fundamentals', title: 'Fundamentals', weight: 100 }],
  exam: { id: 'demo-exam', title: 'Demo exam', version: '1.0.0' },
  pack: { id: 'demo-pack', synthetic: true, title: 'Demo pack', version: '1.0.0' },
  passingThreshold: 70,
  questions: [
    {
      answerIds: ['b'],
      domainId: 'fundamentals',
      explanation: 'The second option is correct.',
      id: 'question-1',
      options: [
        { id: 'a', text: 'First option' },
        { id: 'b', text: 'Second option' },
      ],
      prompt: 'Which option is correct?',
      sources: [{ label: 'Study notes', path: 'assets/notes.md' }],
      type: 'single_choice',
    },
  ],
  schemaVersion: 1,
};
const hasCitationMetadata = (source: PackSource | undefined) =>
  source !== undefined &&
  Array.isArray(source.documentationUrls) &&
  source.kind === 'academy_note' &&
  typeof source.section === 'string';

describe(validateExamPack, () => {
  it('accepts a valid versioned pack and returns its normalized value', () => {
    expect(validateExamPack(validPack)).toStrictEqual({
      errors: [],
      pack: validPack,
      valid: true,
    });
  });

  it('accepts and preserves supported citation metadata', () => {
    const pack = structuredClone(validPack);
    const [question] = pack.questions;
    if (!question) {
      throw new Error('Expected the valid pack to contain a question.');
    }
    const source = {
      documentationUrls: ['https://example.com/streaming/checkpoints'],
      kind: 'academy_note',
      label: 'Streaming notes',
      path: 'streaming/checkpoints.md',
      section: 'Checkpointing',
    };
    question.sources = [source];

    const result = validateExamPack(pack);

    expect(result).toStrictEqual({
      errors: [],
      pack: { ...pack, questions: [{ ...question, sources: [source] }] },
      valid: true,
    });
  });

  it('accepts migrated v1.2.1 and legacy v1.2.0 pack citations', async () => {
    const current = JSON.parse(
      await readFile(workspacePath('packs/incoming/databricks-dea-may-2026-v1.2.1.json'), 'utf-8'),
    ) as unknown;
    const legacy = JSON.parse(
      await readFile(workspacePath('packs/incoming/databricks-dea-may-2026-v1.2.0.json'), 'utf-8'),
    ) as unknown;

    const currentResult = validateExamPack(current);
    const legacyResult = validateExamPack(normalizeLegacyCitations(legacy));
    const currentSource = currentResult.valid
      ? currentResult.pack.questions[0]?.sources[0]
      : undefined;
    const legacySource = legacyResult.valid
      ? legacyResult.pack.questions[0]?.sources[0]
      : undefined;

    expect(currentResult.valid && hasCitationMetadata(currentSource)).toBeTruthy();
    expect(legacyResult.valid && hasCitationMetadata(legacySource)).toBeTruthy();
  });

  it('accepts an absolute local file URL as a generic citation', () => {
    const pack = structuredClone(validPack);
    const [question] = pack.questions;
    if (!question) {
      throw new Error('Expected the valid pack to contain a question.');
    }
    question.sources = [{ label: 'Local reference', path: 'file:///tmp/reference%20notes.md' }];

    expect(validateExamPack(pack)).toStrictEqual({ errors: [], pack, valid: true });
  });

  it('rejects unsupported URL schemes as citation paths', () => {
    const pack = structuredClone(validPack);
    const [question] = pack.questions;
    const [source] = question?.sources ?? [];
    if (!source) {
      throw new Error('Expected the valid pack to contain a source.');
    }
    source.path = 'https://example.com/notes.md';

    const result = validateExamPack(pack);

    expect(result.valid).toBeFalsy();
    expect(result.errors).toContain(
      'questions[0] source path "https://example.com/notes.md" must be a safe relative path or absolute file URL.',
    );
  });

  it('reports unsafe source paths and domain weights that do not total 100', () => {
    const invalidPack = structuredClone(validPack);
    const [domain] = invalidPack.domains;
    const [question] = invalidPack.questions;
    const [source] = question?.sources ?? [];
    if (!domain || !source) {
      throw new Error('Expected the valid pack to contain domain and source data.');
    }
    domain.weight = 90;
    source.path = '../private/notes.md';

    const result = validateExamPack(invalidPack);

    expect(result.valid).toBeFalsy();
    expect(result.errors).toContain('Domain weights must total 100.');
    expect(result.errors).toContain(
      'questions[0] source path "../private/notes.md" must be a safe relative path or absolute file URL.',
    );
  });

  it('rejects repeated question IDs', () => {
    const invalidPack = structuredClone(validPack);
    const [firstQuestion] = invalidPack.questions;
    if (!firstQuestion) {
      throw new Error('Expected the valid pack to contain a question.');
    }
    invalidPack.questions.push({ ...firstQuestion });

    const result = validateExamPack(invalidPack);

    expect(result.valid).toBeFalsy();
    expect(result.errors).toContain('Question IDs must be unique within a pack.');
  });

  it('rejects unknown question fields', () => {
    const invalidPack = structuredClone(validPack);
    const [question] = invalidPack.questions;
    if (!question) {
      throw new Error('Expected the valid pack to contain a question.');
    }
    Object.assign(question, { internalNote: 'not part of the pack schema' });

    const result = validateExamPack(invalidPack);

    expect(result.valid).toBeFalsy();
    expect(result.errors).toContain('questions[0] contains unknown field "internalNote".');
  });
});
