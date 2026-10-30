import { validateExamPack } from '@learning-platform/exam-pack';
import type { PackForVerification } from '@learning-platform/exam-pack';
import { Data, Effect, FileSystem, Path, Schema } from 'effect';

import { CONCURRENCY_LIMIT } from '../core/concurrency.js';
import { verifyProfile } from './profile.js';

export class VerifyError extends Data.TaggedError('VerifyError')<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export interface VerifyResult {
  pack: PackForVerification;
  profileReportPath?: string;
}

const toVerifyError =
  (stage: string) =>
  (cause: unknown): VerifyError =>
    new VerifyError({
      cause,
      message: `${stage}: ${cause instanceof Error ? cause.message : String(cause)}`,
    });

const normalized = (value: string): string =>
  value
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{N}_]+/gu, ' ')
    .trim();

const normalizedOption = (value: string): string =>
  value.toLowerCase().replaceAll(/\s+/gu, ' ').trim();

const readPackFile = Effect.fn(function* readPackFile(packPath: string) {
  const path = yield* Path.Path;
  const fs = yield* FileSystem.FileSystem;
  const absolutePath = path.resolve(packPath);

  const contents = yield* fs
    .readFileString(absolutePath)
    .pipe(Effect.mapError(toVerifyError('Unable to read exam pack')));

  return { absolutePath, contents };
});

const validateBuiltPack = (contents: string) =>
  Schema.decodeEffect(Schema.fromJsonString(Schema.Unknown))(contents).pipe(
    Effect.mapError(toVerifyError('Unable to parse exam pack JSON')),
    Effect.flatMap((input) => {
      const result = validateExamPack(input);

      return result.valid
        ? Effect.succeed(result.pack)
        : Effect.fail(
            new VerifyError({
              message: `Exam pack schema validation failed: ${result.errors.join('; ')}`,
            }),
          );
    }),
  );

const verifyCliQuality = Effect.fn(function* verifyCliQuality(pack: PackForVerification) {
  const prompts = new Set<string>();
  yield* Effect.forEach(pack.questions, (question) =>
    Effect.gen(function* verifyQuestion() {
      const prompt = normalized(question.prompt);

      if (!prompt.length) {
        return yield* new VerifyError({ message: `${question.id}: prompt is empty` });
      }

      if (prompts.has(prompt)) {
        return yield* new VerifyError({ message: `${question.id}: duplicate prompt` });
      }

      prompts.add(prompt);

      if (
        new Set(question.options.map(({ text }) => normalizedOption(text))).size !==
        question.options.length
      ) {
        return yield* new VerifyError({ message: `${question.id}: duplicate option text` });
      }

      return yield* Effect.void;
    }),
  );

  return yield* Effect.void;
});

const sourceFileExists = Effect.fn('sourceFileExists')(function* sourceFileExists(
  packPath: string,
  questionId: string,
  sourcePath: string,
) {
  const path = yield* Path.Path;
  const fs = yield* FileSystem.FileSystem;
  const candidate = path.resolve(path.dirname(packPath), sourcePath);

  const actual = yield* fs.realPath(candidate).pipe(
    Effect.mapError(
      (cause) =>
        new VerifyError({
          cause,
          message: `${questionId}: missing source ${sourcePath}`,
        }),
    ),
  );

  const info = yield* fs
    .stat(actual)
    .pipe(Effect.mapError(toVerifyError(`Unable to inspect source ${sourcePath}`)));

  if (info.type !== 'File') {
    return yield* new VerifyError({
      message: `${questionId}: source is not a file (${sourcePath})`,
    });
  }

  return actual;
});

const sourceIsContained = Effect.fn(function* sourceIsContained(
  packDirectory: string,
  actualSource: string,
  questionId: string,
  sourcePath: string,
) {
  const path = yield* Path.Path;
  const fromPack = path.relative(packDirectory, actualSource);

  if (fromPack === '..' || fromPack.startsWith(`..${path.sep}`) || path.isAbsolute(fromPack)) {
    return yield* new VerifyError({
      message: `${questionId}: source escapes pack folder (${sourcePath})`,
    });
  }

  return yield* Effect.void;
});

const verifyFileUrlSource = Effect.fn('verifyFileUrlSource')(function* verifyFileUrlSource(
  questionId: string,
  sourceUrl: string,
) {
  const path = yield* Path.Path;
  const fs = yield* FileSystem.FileSystem;

  const parsed =
    URL.parse(sourceUrl) ??
    (yield* new VerifyError({
      message: `${questionId}: invalid local file URL (${sourceUrl})`,
    }));

  if (parsed.protocol !== 'file:' || parsed.hostname || parsed.username || parsed.password) {
    return yield* new VerifyError({
      message: `${questionId}: invalid local file URL (${sourceUrl})`,
    });
  }

  const localPath = yield* path
    .fromFileUrl(parsed)
    .pipe(
      Effect.mapError(
        () => new VerifyError({ message: `${questionId}: invalid local file URL (${sourceUrl})` }),
      ),
    );

  if (!path.isAbsolute(localPath)) {
    return yield* new VerifyError({
      message: `${questionId}: local file URL must reference an absolute path (${sourceUrl})`,
    });
  }

  const actual = yield* fs.realPath(localPath).pipe(
    Effect.mapError(
      (cause) =>
        new VerifyError({
          cause,
          message: `${questionId}: missing local file ${sourceUrl}`,
        }),
    ),
  );

  const info = yield* fs
    .stat(actual)
    .pipe(Effect.mapError(toVerifyError(`Unable to inspect local file ${sourceUrl}`)));

  if (info.type !== 'File') {
    return yield* new VerifyError({
      message: `${questionId}: local source is not a file (${sourceUrl})`,
    });
  }

  return yield* Effect.void;
});

const verifySourceFiles = Effect.fn('verifySourceFiles')(function* verifySourceFiles(
  packPath: string,
  pack: PackForVerification,
) {
  const path = yield* Path.Path;
  const fs = yield* FileSystem.FileSystem;

  const packDirectory = yield* fs
    .realPath(path.dirname(packPath))
    .pipe(Effect.mapError(toVerifyError('Unable to resolve pack directory')));

  const citations = pack.questions.flatMap((question) =>
    question.sources.map((source) => ({ questionId: question.id, source })),
  );

  // The checks are independent after their shared roots are resolved. Bound
  // filesystem pressure while retaining Effect.forEach's input result order.
  yield* Effect.forEach(
    citations,
    ({ questionId, source }) => {
      if (source.path.startsWith('file:')) {
        return verifyFileUrlSource(questionId, source.path);
      }

      return Effect.gen(function* verifySourceFileCitation() {
        const actual = yield* sourceFileExists(packPath, questionId, source.path);
        yield* sourceIsContained(packDirectory, actual, questionId, source.path);
      });
    },
    { concurrency: CONCURRENCY_LIMIT },
  );
});

export const verifyPack = Effect.fn('verifyPack')((packPath: string, profilePath?: string) =>
  Effect.gen(function* verifyPackProgram() {
    const { absolutePath, contents } = yield* readPackFile(packPath);
    const pack = yield* validateBuiltPack(contents);
    yield* verifyCliQuality(pack);
    yield* verifySourceFiles(absolutePath, pack);
    let profileReportPath: string | undefined;

    if (profilePath !== undefined) {
      const path = yield* Path.Path;

      const result = yield* verifyProfile(absolutePath, pack, path.resolve(profilePath)).pipe(
        Effect.mapError(
          (error) =>
            new VerifyError({
              cause: error,
              message: `Profile verification failed: ${error instanceof Error ? error.message : String(error)}`,
            }),
        ),
      );

      profileReportPath = result.reportPath;
    }

    if (profileReportPath === undefined) {
      return { pack };
    }

    return { pack, profileReportPath };
  }),
);
