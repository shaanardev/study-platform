import { describe, expect, it } from 'vitest';
import { validateExamPack } from './validate';

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

  it('reports unsafe source paths and domain weights that do not total 100', () => {
    const invalidPack = structuredClone(validPack);
    invalidPack.domains[0].weight = 90;
    invalidPack.questions[0].sources[0].path = '../private/notes.md';

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
});
