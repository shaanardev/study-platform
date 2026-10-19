import { Data, Result } from 'effect';
import type { Schema } from 'effect';
import type { AuthoringFileInput, QuestionFile } from './authoring-schema.js';
import { DOMAIN_WEIGHT_TOLERANCE, MAX_PERCENTAGE, MIN_ANSWER_OPTIONS } from '../core/constants.js';

export type AssembledAuthoring = AuthoringFileInput & {
  readonly questions: Schema.Schema.Type<typeof QuestionFile>;
};

export class AuthoringValidationError extends Data.TaggedError('AuthoringValidationError')<{
  readonly message: string;
}> {}

export const safeRelativePath = (
  path: string,
  label: string,
): Result.Result<string, AuthoringValidationError> => {
  const message = `${label} must be a safe relative path`;

  if (
    !path ||
    path.startsWith('/') ||
    /^[a-zA-Z]:/u.test(path) ||
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
};

const hasValidAnswers = (question: AssembledAuthoring['questions'][number]): boolean => {
  const optionIds = question.options.map((option) => option.id);
  const correctIds = question.correctOptionIds;

  return (
    new Set(optionIds).size === optionIds.length &&
    new Set(correctIds).size === correctIds.length &&
    correctIds.every((id) => optionIds.includes(id)) &&
    (question.type === 'single_choice' ? correctIds.length === 1 : correctIds.length >= MIN_ANSWER_OPTIONS) &&
    correctIds.length < optionIds.length
  );
};

const validateQuestions = (
  questions: AssembledAuthoring['questions'],
  domainIds: ReadonlySet<string>,
): Result.Result<void, AuthoringValidationError> =>
  Result.gen(function* validateQuestionsProgram() {
    const questionIds = new Set<string>();

    const questionValidations = questions.map((question) =>
      Result.gen(function* validateQuestionProgram() {
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

        if (!hasValidAnswers(question)) {
          return yield* Result.fail(
            new AuthoringValidationError({
              message: `Question ${question.id} has invalid options or correct answer IDs`,
            }),
          );
        }

        const sourcePathResults = question.sources.map((source) =>
          safeRelativePath(source.path, `Question ${question.id} source path`),
        );

        const invalidSourcePath = sourcePathResults.find(Result.isFailure);

        if (invalidSourcePath !== undefined) {
          return yield* invalidSourcePath;
        }

        return yield* Result.void;
      }),
    );

    yield* Result.all(questionValidations);

    return yield* Result.void;
  });

export const validateAuthoring = (
  input: AssembledAuthoring,
): Result.Result<void, AuthoringValidationError> =>
  Result.gen(function* validateAuthoringProgram() {
    if (input.questions.length === 0) {
      return yield* Result.fail(
        new AuthoringValidationError({ message: 'Authoring must contain at least one question' }),
      );
    }

    const domainIds = new Set<string>();

    const domainValidations = input.metadata.domains.map((domain) => {
      if (domainIds.has(domain.id)) {
        return Result.fail(
          new AuthoringValidationError({ message: `Duplicate domain ID: ${domain.id}` }),
        );
      }

      domainIds.add(domain.id);

      return Result.void;
    });

    yield* Result.all(domainValidations);

    if (
      Math.abs(input.metadata.domains.reduce((sum, domain) => sum + domain.weight, 0) - MAX_PERCENTAGE) > DOMAIN_WEIGHT_TOLERANCE
    ) {
      return yield* Result.fail(
        new AuthoringValidationError({ message: `Domain weights must total ${MAX_PERCENTAGE}` }),
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
    yield* Result.all(
      (input.assetFiles ?? []).map((asset) => safeRelativePath(asset, 'assetFiles path')),
    );
    yield* validateQuestions(input.questions, domainIds);

    return yield* Result.void;
  });
