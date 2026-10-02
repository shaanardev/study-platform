import { describe, expect, it } from 'vitest';
import { validateExamPack } from '#lib/server/packs/validate.js';

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

  it('accepts academy-note metadata and HTTPS documentation links without treating its path as a pack asset', () => {
    const pack = structuredClone(validPack);
    const question = pack.questions[0];
    if (!question) throw new Error('Expected the valid pack to contain a question.');
    Object.assign(question, {
      sources: [
        {
          kind: 'academy_note',
          path: 'streaming/checkpoints.md',
          label: 'Streaming notes',
          section: 'Checkpointing',
          documentationUrls: ['https://docs.databricks.com/streams/checkpoints.html'],
        },
      ],
    });

    const result = validateExamPack(pack);

    expect(result.valid).toBe(true);
    if (result.valid) expect(result.pack.questions[0]?.sources).toEqual(question.sources);
  });

  it('requires academy documentation links to use HTTPS', () => {
    const pack = structuredClone(validPack);
    const question = pack.questions[0];
    if (!question) throw new Error('Expected the valid pack to contain a question.');
    Object.assign(question, {
      sources: [
        {
          kind: 'academy_note',
          path: 'streaming/checkpoints.md',
          label: 'Streaming notes',
          documentationUrls: ['http://docs.databricks.com/streams/checkpoints.html'],
        },
      ],
    });

    const result = validateExamPack(pack);

    expect(result.valid).toBe(false);
    if (!result.valid)
      expect(result.errors).toContain(
        'questions[0].sources[0].documentationUrls must contain HTTPS URLs.',
      );
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

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toContain('Domain weights must total 100.');
      expect(result.errors).toContain(
        'questions[0] source path "../private/notes.md" must be a safe relative path.',
      );
    }
  });

  it('rejects repeated question IDs', () => {
    const invalidPack = structuredClone(validPack);
    const firstQuestion = invalidPack.questions[0];
    if (!firstQuestion) throw new Error('Expected the valid pack to contain a question.');
    invalidPack.questions.push({ ...firstQuestion });

    const result = validateExamPack(invalidPack);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toContain('Question IDs must be unique within a pack.');
    }
  });

  it('rejects unknown question fields', () => {
    const invalidPack = structuredClone(validPack);
    const question = invalidPack.questions[0];
    if (!question) throw new Error('Expected the valid pack to contain a question.');
    Object.assign(question, { internalNote: 'not part of the pack schema' });

    const result = validateExamPack(invalidPack);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toContain('questions[0] contains unknown field "internalNote".');
    }
  });
});
