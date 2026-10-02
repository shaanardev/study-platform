import { Data, Result, type Schema } from 'effect';
import type { AuthoringFile, QuestionFile } from './authoring-schema.js';

export type AssembledAuthoring = AuthoringFile & {
  readonly questions: Schema.Schema.Type<typeof QuestionFile>;
};

export class AuthoringValidationError extends Data.TaggedError('AuthoringValidationError')<{
  readonly message: string;
}> {}

export function safeRelativePath(
  path: string,
  label: string,
): Result.Result<string, AuthoringValidationError> {
  const message = `${label} must be a safe relative path`;
  if (
    !path ||
    path.startsWith('/') ||
    /^[a-zA-Z]:/.test(path) ||
    path.includes('\\') ||
    path.includes('\0')
  ) {
    return Result.fail(new AuthoringValidationError({ message }));
  }
  const segments = path.split('/');
  if (segments.some((segment) => segment === '..' || segment === '.' || segment === '')) {
    return Result.fail(new AuthoringValidationError({ message }));
  }
  return Result.succeed(path);
}

export function validateAuthoring(
  input: AssembledAuthoring,
): Result.Result<void, AuthoringValidationError> {
  return Result.gen(function* () {
    if (input.questions.length === 0) {
      return yield* Result.fail(
        new AuthoringValidationError({ message: 'Authoring must contain at least one question' }),
      );
    }
    const domainIds = new Set<string>();
    for (const domain of input.metadata.domains) {
      if (domainIds.has(domain.id)) {
        return yield* Result.fail(
          new AuthoringValidationError({ message: `Duplicate domain ID: ${domain.id}` }),
        );
      }
      domainIds.add(domain.id);
    }
    if (
      Math.abs(input.metadata.domains.reduce((sum, domain) => sum + domain.weight, 0) - 100) > 0.01
    ) {
      return yield* Result.fail(
        new AuthoringValidationError({ message: 'Domain weights must total 100' }),
      );
    }
    if (
      input.outputFile === '.' ||
      input.outputFile === '..' ||
      input.outputFile.includes('/') ||
      input.outputFile.includes('\\') ||
      input.outputFile.includes('\0')
    ) {
      return yield* Result.fail(
        new AuthoringValidationError({ message: 'outputFile must be a filename, not a path' }),
      );
    }

    yield* safeRelativePath(input.assetsDirectory, 'assetsDirectory');
    for (const asset of input.assetFiles ?? []) {
      yield* safeRelativePath(asset, 'assetFiles path');
    }

    const questionIds = new Set<string>();
    for (const question of input.questions) {
      if (questionIds.has(question.id)) {
        return yield* Result.fail(
          new AuthoringValidationError({ message: `Duplicate question ID: ${question.id}` }),
        );
      }
      questionIds.add(question.id);
      if (!domainIds.has(question.domainId)) {
        return yield* Result.fail(
          new AuthoringValidationError({
            message: `Question ${question.id} references unknown domain ${question.domainId}`,
          }),
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
        return yield* Result.fail(
          new AuthoringValidationError({
            message: `Question ${question.id} has invalid options or correct answer IDs`,
          }),
        );
      }
      for (const source of question.sources) {
        if (!('kind' in source)) {
          yield* safeRelativePath(source.path, `Question ${question.id} source path`);
        }
      }
    }

    return undefined;
  });
}
