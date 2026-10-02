import type { Schema } from 'effect';
import type { AuthoringFile, QuestionFile } from './authoring.js';

export type AssembledAuthoring = AuthoringFile & {
  readonly questions: Schema.Schema.Type<typeof QuestionFile>;
};

export function safeRelativePath(
  path: string,
  label: string,
): string {
  const message = `${label} must be a safe relative path`;
  if (
    !path ||
    path.startsWith('/') ||
    /^[a-zA-Z]:/.test(path) ||
    path.includes('\\') ||
    path.includes('\0')
  ) {
    throw new Error(message);
  }
  const segments = path.split('/');
  if (segments.some((segment) => segment === '..' || segment === '.' || segment === '')) {
    throw new Error(message);
  }
  return path;
}

export function validateAuthoring(input: AssembledAuthoring): void {
  if (input.questions.length === 0) throw new Error('Authoring must contain at least one question');
  const ids = new Set<string>();
  for (const domain of input.metadata.domains) {
    if (ids.has(domain.id)) throw new Error(`Duplicate domain ID: ${domain.id}`);
    ids.add(domain.id);
  }
  if (
    Math.abs(input.metadata.domains.reduce((sum, domain) => sum + domain.weight, 0) - 100) > 0.01
  ) {
    throw new Error('Domain weights must total 100');
  }
  if (
    input.outputFile === '.' ||
    input.outputFile === '..' ||
    input.outputFile.includes('/') ||
    input.outputFile.includes('\\') ||
    input.outputFile.includes('\0')
  ) {
    throw new Error('outputFile must be a filename, not a path');
  }
  safeRelativePath(input.assetsDirectory, 'assetsDirectory');
  for (const asset of input.assetFiles ?? []) safeRelativePath(asset, 'assetFiles path');
  const questionIds = new Set<string>();
  for (const question of input.questions) {
    if (questionIds.has(question.id)) throw new Error(`Duplicate question ID: ${question.id}`);
    questionIds.add(question.id);
    if (!ids.has(question.domainId)) {
      throw new Error(
        `Question ${question.id} references unknown domain ${question.domainId}`,
      );
    }
    const optionIds = question.options.map((option) => option.id);
    const correctIds = question.correctOptionIds;
    if (
      new Set(optionIds).size !== optionIds.length ||
      new Set(correctIds).size !== correctIds.length ||
      !correctIds.every((id) => optionIds.includes(id)) ||
      (question.type === 'single_choice' ? correctIds.length !== 1 : correctIds.length < 2) ||
      correctIds.length >= optionIds.length
    ) {
      throw new Error(`Question ${question.id} has invalid options or correct answer IDs`);
    }
    for (const source of question.sources)
      if (!('kind' in source)) safeRelativePath(source.path, `Question ${question.id} source path`);
  }
}
