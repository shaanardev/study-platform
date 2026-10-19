import { Data, Effect, FileSystem, Path, PlatformError, Result, Schema } from 'effect';
import type { PackForVerification } from '@learning-platform/exam-pack';
import { BuiltExamPackSchema } from '@learning-platform/exam-pack';
import { JSON_INDENT_SPACES } from '../core/constants.js';
import { CONCURRENCY_LIMIT } from '../core/concurrency.js';
import { AuthoringFile, QuestionFile } from './authoring-schema.js';
import { safeRelativePath, validateAuthoring } from './authoring-validation.js';
import { shuffleQuestions } from './question-transformation.js';

export class BuildError extends Data.TaggedError('BuildError')<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

interface OptionalPackProperties {
  passingThreshold?: number;
}

const toBuildError = (cause: Error): BuildError =>
  cause instanceof BuildError
    ? cause
    : new BuildError({ cause, message: cause.message });

const hasNodeErrorCode = (error: Error, code: string): boolean =>
  'code' in error && error.code === code;

const isNotSymbolicLink = (error: Error): boolean =>
  PlatformError.isPlatformError(error) &&
  error.reason._tag === 'Unknown' &&
  error.reason.cause instanceof Error &&
  hasNodeErrorCode(error.reason.cause, 'EINVAL');

const rejectSymlinks = Effect.fn('rejectSymlinks')(function* rejectSymlinksEffect(
  destination: string,
) {
  const path = yield* Path.Path;
  const fs = yield* FileSystem.FileSystem;
  const filesystemRoot = path.parse(destination).root;
  const parts = path.relative(filesystemRoot, destination).split(path.sep);
  let current = filesystemRoot;
  let ancestorMissing = false;

  yield* Effect.forEach(
    // oxlint-disable-next-line unicorn/no-array-method-this-argument -- Effect.forEach's iterable is not a thisArg.
    parts,
    (part) =>
      Effect.gen(function* verifyPathPart() {
        if (ancestorMissing) {
          return yield* Effect.void;
        }

        current = path.join(current, part);

        const link = yield* fs.readLink(current).pipe(
          Effect.catchIf(isNotSymbolicLink, () => Effect.succeed(false)),
          Effect.catchIf(
            (error) => error.reason._tag === 'NotFound',
            () => Effect.succeed(null),
          ),
          Effect.mapError(toBuildError),
        );

        if (link === null) {
          ancestorMissing = true;

          return yield* Effect.void;
        }

        if (link !== false) {
          return yield* new BuildError({ message: `Path contains a symbolic link: ${current}` });
        }

        return yield* Effect.void;
      }));

  return yield* Effect.void;
});

const requireInputFile = Effect.fn('requireInputFile')(function* requireInputFile(filename: string) {
  yield* rejectSymlinks(filename);
  const fs = yield* FileSystem.FileSystem;
  const info = yield* fs.stat(filename).pipe(Effect.mapError(toBuildError));

  if (info.type !== 'File') {
    return yield* new BuildError({ message: `Not a regular file: ${filename}` });
  }

  return yield* fs.realPath(filename);
});

export const buildPack = Effect.fn('buildPack')(
  (authoringPath: string, outputDirectory: string, localNoteRoot?: string) =>
    Effect.gen(function* buildPackProgram() {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const authoringFile = yield* requireInputFile(path.resolve(authoringPath));
      const content = yield* fs.readFileString(authoringFile);

      const input = yield* Schema.decodeEffect(Schema.fromJsonString(AuthoringFile), {
        onExcessProperty: 'error',
      })(content).pipe(
        Effect.mapError(
          (cause) => new BuildError({ cause, message: `Invalid authoring file: ${String(cause)}` }),
        ),
      );

      const sourceRoot = path.dirname(authoringFile);

      const questionFileDrafts = yield* Effect.forEach(
        // oxlint-disable-next-line unicorn/no-array-method-this-argument -- Effect.forEach's iterable is not a thisArg.
        input.questionFiles ?? [],
        (reference) =>
          Effect.gen(function* readQuestionFile() {
            const relativePath = yield* Effect.fromResult(
              safeRelativePath(reference, 'questionFiles path'),
            ).pipe(Effect.mapError(toBuildError));

            const questionPath = yield* requireInputFile(path.resolve(sourceRoot, relativePath));

            return yield* Schema.decodeEffect(Schema.fromJsonString(QuestionFile), {
              onExcessProperty: 'error',
            })(yield* fs.readFileString(questionPath)).pipe(
              Effect.mapError(
                (cause) =>
                  new BuildError({
                    cause,
                    message: `Invalid question file ${reference}: ${String(cause)}`,
                  }),
              ),
            );
          }));

      const questions = [...(input.questions ?? []), ...questionFileDrafts.flat()];
      const assembled = { ...input, questions };
      yield* Effect.fromResult(validateAuthoring(assembled)).pipe(Effect.mapError(toBuildError));

      const localNotePaths = new Set(
        questions.flatMap((question) =>
          question.sources.flatMap((source) => ('kind' in source ? [source.path] : [])),
        ),
      );

      const localNoteUrls = new Map<string, string>();

      if (localNotePaths.size > 0) {
        if (localNoteRoot === undefined) {
          return yield* new BuildError({
            message: 'A local-note root must be configured to build local-note citations',
          });
        }

        const requestedLocalRoot = path.resolve(localNoteRoot);
        yield* rejectSymlinks(requestedLocalRoot);

        const localRoot = yield* fs
          .realPath(path.resolve(localNoteRoot))
          .pipe(
            Effect.mapError(
              (cause) => new BuildError({ cause, message: 'Invalid local-note root' }),
            ),
          );

        const rootInfo = yield* fs.stat(localRoot).pipe(Effect.mapError(toBuildError));

        if (rootInfo.type !== 'Directory') {
          return yield* new BuildError({
            message: `Local-note root is not a directory: ${localRoot}`,
          });
        }

        const localNoteEntries = yield* Effect.forEach(
          [...localNotePaths],
          (notePath) =>
            Effect.gen(function* resolveLocalNote() {
              const noteFile = yield* requireInputFile(path.resolve(localRoot, notePath));
              const relativeNote = path.relative(localRoot, noteFile);

              if (
                relativeNote === '..' ||
                relativeNote.startsWith(`..${path.sep}`) ||
                path.isAbsolute(relativeNote)
              ) {
                return yield* new BuildError({
                  message: `Local-note path escapes local-note root (${notePath})`,
                });
              }

              const fileUrl = yield* path.toFileUrl(noteFile).pipe(Effect.mapError(toBuildError));

              return [notePath, fileUrl.href] as const;
            }),
          { concurrency: CONCURRENCY_LIMIT },
        );

        localNoteEntries.forEach(([notePath, fileUrl]) => {
          localNoteUrls.set(notePath, fileUrl);
        });
      }

      const outputRoot = path.resolve(outputDirectory);
      const assetsRoot = path.resolve(outputRoot, input.assetsDirectory);

      const assetPaths = new Set([
        ...questions.flatMap((question) =>
          question.sources.flatMap((source) => ('kind' in source ? [] : [source.path])),
        ),
        ...(input.assetFiles ?? []),
      ]);

      const artifacts = yield* Effect.forEach(
        assetPaths,
        (asset) =>
          Effect.gen(function* resolveAsset() {
            const source = yield* requireInputFile(path.resolve(sourceRoot, asset));

            return { destination: path.resolve(assetsRoot, asset), source };
          }),
        { concurrency: CONCURRENCY_LIMIT },
      );

      const { passingThreshold, ...metadata } = input.metadata;
      const optionalPackProperties: OptionalPackProperties = {};

      if (passingThreshold !== undefined) {
        optionalPackProperties.passingThreshold = passingThreshold;
      }

      const pack: PackForVerification = {
        ...metadata,
        ...optionalPackProperties,
        questions: yield* shuffleQuestions(assembled, localNoteUrls),
      };

      const encodedPack = yield* Effect.fromResult(
        Schema.encodeResult(BuiltExamPackSchema)(pack),
      ).pipe(
        Effect.mapError(
          (cause) => new BuildError({ cause, message: `Invalid built pack: ${String(cause)}` }),
        ),
      );

      const packJsonResult = Result.try({
        catch: (cause) =>
          toBuildError(cause instanceof Error ? cause : new Error(String(cause), { cause })),
        try: () => JSON.stringify(encodedPack, null, JSON_INDENT_SPACES),
      }).pipe(
        Result.flatMap((json) =>
          Result.fromNullishOr(json, () => new BuildError({ message: 'Could not serialize built pack' })),
        ),
      );

      const packJson = yield* Effect.fromResult(packJsonResult);
      const packPath = path.join(outputRoot, input.outputFile);
      yield* rejectSymlinks(packPath);
      yield* Effect.forEach(
        // oxlint-disable-next-line unicorn/no-array-method-this-argument -- Effect.forEach's iterable is not a thisArg.
        artifacts,
        (artifact) => rejectSymlinks(artifact.destination),
      );
      yield* fs.makeDirectory(outputRoot, { recursive: true });
      yield* fs.writeFileString(packPath, `${packJson}\n`);

      const artifactDirectories = new Set(
        artifacts.map((artifact) => path.dirname(artifact.destination)),
      );

      yield* Effect.forEach(
        artifactDirectories,
        (directory) => fs.makeDirectory(directory, { recursive: true }),
        { concurrency: CONCURRENCY_LIMIT },
      );
      yield* Effect.forEach(
        artifacts,
        (artifact) => fs.copyFile(artifact.source, artifact.destination),
        { concurrency: CONCURRENCY_LIMIT },
      );

      return yield* Effect.void;
    }).pipe(Effect.mapError(toBuildError)),
);
