import { Data, Effect, FileSystem, Path, Result, Schema } from 'effect';
import { BuiltExamPackSchema, type PackForVerification } from '../core/built-pack-schema.js';
import { CONCURRENCY_LIMIT } from '../core/concurrency.js';
import { AuthoringFile, QuestionFile } from './authoring-schema.js';
import { safeRelativePath, validateAuthoring } from './authoring-validation.js';
import { shuffleQuestions } from './question-transformation.js';

export class BuildError extends Data.TaggedError('BuildError')<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

const toBuildError = (cause: unknown): BuildError =>
  cause instanceof BuildError
    ? cause
    : new BuildError({ message: cause instanceof Error ? cause.message : String(cause), cause });

const hasNodeErrorCode = (error: unknown, code: string): boolean =>
  error instanceof Error && 'code' in error && error.code === code;

const isNotSymbolicLink = (error: unknown): boolean =>
  error instanceof Error &&
  'reason' in error &&
  typeof error.reason === 'object' &&
  error.reason !== null &&
  '_tag' in error.reason &&
  error.reason._tag === 'Unknown' &&
  'cause' in error.reason &&
  hasNodeErrorCode(error.reason.cause, 'EINVAL');

const rejectSymlinks = Effect.fn(function* (destination: string) {
  const path = yield* Path.Path;
  const fs = yield* FileSystem.FileSystem;
  const filesystemRoot = path.parse(destination).root;
  const parts = path.relative(filesystemRoot, destination).split(path.sep);
  let current = filesystemRoot;
  for (const part of parts) {
    current = path.join(current, part);
    const link = yield* fs.readLink(current).pipe(
      Effect.catchIf(isNotSymbolicLink, () => Effect.succeed(undefined)),
      Effect.catchIf(
        (error) => error._tag === 'PlatformError' && error.reason._tag === 'NotFound',
        () => Effect.succeed(null),
      ),
      Effect.mapError(toBuildError),
    );
    if (link === null) break;
    if (link !== undefined)
      return yield* Effect.fail(
        new BuildError({ message: `Path contains a symbolic link: ${current}` }),
      );
  }
});

const requireInputFile = Effect.fn(function* (filename: string) {
  yield* rejectSymlinks(filename);
  const fs = yield* FileSystem.FileSystem;
  const info = yield* fs.stat(filename).pipe(Effect.mapError(toBuildError));
  if (info.type !== 'File')
    return yield* Effect.fail(new BuildError({ message: `Not a regular file: ${filename}` }));
  return yield* (yield* FileSystem.FileSystem).realPath(filename);
});

export const buildPack = Effect.fn('buildPack')(
  (authoringPath: string, outputDirectory: string, localNoteRoot?: string) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const authoringFile = yield* requireInputFile(path.resolve(authoringPath));
      const content = yield* fs.readFileString(authoringFile);
      const input = yield* Schema.decodeEffect(Schema.fromJsonString(AuthoringFile), {
        onExcessProperty: 'error',
      })(content).pipe(
        Effect.mapError(
          (cause) => new BuildError({ message: `Invalid authoring file: ${cause}`, cause }),
        ),
      );
      const sourceRoot = path.dirname(authoringFile);
      const questions = [...(input.questions ?? [])];
      for (const reference of input.questionFiles ?? []) {
        const relativePath = yield* Effect.fromResult(
          safeRelativePath(reference, 'questionFiles path'),
        ).pipe(Effect.mapError(toBuildError));
        const questionPath = yield* requireInputFile(path.resolve(sourceRoot, relativePath));
        const drafts = yield* Schema.decodeEffect(Schema.fromJsonString(QuestionFile), {
          onExcessProperty: 'error',
        })(yield* fs.readFileString(questionPath)).pipe(
          Effect.mapError(
            (cause) =>
              new BuildError({ message: `Invalid question file ${reference}: ${cause}`, cause }),
          ),
        );
        questions.push(...drafts);
      }
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
              (cause) => new BuildError({ message: 'Invalid local-note root', cause }),
            ),
          );
        const rootInfo = yield* fs.stat(localRoot).pipe(Effect.mapError(toBuildError));
        if (rootInfo.type !== 'Directory')
          return yield* new BuildError({
            message: `Local-note root is not a directory: ${localRoot}`,
          });
        for (const notePath of localNotePaths) {
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
          localNoteUrls.set(notePath, fileUrl.href);
        }
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
          Effect.gen(function* () {
            const source = yield* requireInputFile(path.resolve(sourceRoot, asset));
            return { source, destination: path.resolve(assetsRoot, asset) };
          }),
        { concurrency: CONCURRENCY_LIMIT },
      );
      const { passingThreshold, ...metadata } = input.metadata;
      const pack: PackForVerification = {
        ...metadata,
        ...(passingThreshold === undefined ? {} : { passingThreshold }),
        questions: yield* shuffleQuestions(assembled, localNoteUrls),
      };
      const encodedPack = yield* Effect.fromResult(
        Schema.encodeResult(BuiltExamPackSchema)(pack),
      ).pipe(
        Effect.mapError(
          (cause) => new BuildError({ message: `Invalid built pack: ${cause}`, cause }),
        ),
      );
      const packJsonResult = Result.try({
        try: () => JSON.stringify(encodedPack, null, 2),
        catch: toBuildError,
      }).pipe(
        Result.flatMap((json) =>
          json === undefined
            ? Result.fail(new BuildError({ message: 'Could not serialize built pack' }))
            : Result.succeed(json),
        ),
      );
      const packJson = yield* Effect.fromResult(packJsonResult);
      const packPath = path.join(outputRoot, input.outputFile);
      yield* rejectSymlinks(packPath);
      for (const artifact of artifacts) yield* rejectSymlinks(artifact.destination);
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
    }).pipe(Effect.mapError(toBuildError)),
);
