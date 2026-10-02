import { Config, Data, Effect, FileSystem, Option, Path, Schema } from 'effect';
import { verifyProfile } from './profile.js';
import { BuiltExamPackSchema, type PackForVerification } from './schema.js';

export class VerifyError extends Data.TaggedError('VerifyError')<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export type VerifyResult = {
  pack: PackForVerification;
  profileReportPath?: string;
};

const toVerifyError =
  (stage: string) =>
  (cause: unknown): VerifyError =>
    new VerifyError({
      message: `${stage}: ${cause instanceof Error ? cause.message : String(cause)}`,
      cause,
    });

const normalized = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_]+/gu, ' ')
    .trim();

const normalizedOption = (value: string): string => value.toLowerCase().replace(/\s+/g, ' ').trim();

const readPackFile = Effect.fn(function* (packPath: string) {
  const path = yield* Path.Path;
  const fs = yield* FileSystem.FileSystem;
  const absolutePath = path.resolve(packPath);
  const contents = yield* fs
    .readFileString(absolutePath)
    .pipe(Effect.mapError(toVerifyError('Unable to read exam pack')));
  return { absolutePath, contents };
});

const parsePackJson = (contents: string) =>
  Schema.decodeEffect(Schema.fromJsonString(Schema.Unknown))(contents).pipe(
    Effect.mapError(toVerifyError('Unable to parse exam pack JSON')),
  );

const validateBuiltPack = (input: unknown) =>
  Schema.decodeUnknownEffect(BuiltExamPackSchema, { onExcessProperty: 'error' })(input).pipe(
    Effect.mapError(
      (error) =>
        new VerifyError({
          message: `Exam pack schema validation failed: ${String(error)}`,
          cause: error,
        }),
    ),
  );

const verifyGenericStructure = Effect.fn(function* (pack: PackForVerification) {
  const domainIds = new Set(pack.domains.map(({ id }) => id));
  if (domainIds.size !== pack.domains.length)
    return yield* new VerifyError({ message: 'Domain IDs must be unique' });
  if (Math.abs(pack.domains.reduce((sum, domain) => sum + domain.weight, 0) - 100) > 0.01)
    return yield* new VerifyError({ message: 'Domain weights must total 100' });

  const questionIds = new Set<string>();
  const prompts = new Set<string>();
  for (const question of pack.questions) {
    if (questionIds.has(question.id))
      return yield* new VerifyError({ message: `Duplicate question ID: ${question.id}` });
    questionIds.add(question.id);
    const prompt = normalized(question.prompt);
    if (!prompt.length)
      return yield* new VerifyError({ message: `${question.id}: prompt is empty` });
    if (prompts.has(prompt))
      return yield* new VerifyError({ message: `${question.id}: duplicate prompt` });
    prompts.add(prompt);
    if (!domainIds.has(question.domainId))
      return yield* new VerifyError({
        message: `${question.id}: unknown domain ${question.domainId}`,
      });
    if (question.options.length < 2)
      return yield* new VerifyError({ message: `${question.id}: fewer than two options` });
    if (new Set(question.options.map(({ id }) => id)).size !== question.options.length)
      return yield* new VerifyError({ message: `${question.id}: duplicate option IDs` });
    if (
      new Set(question.options.map(({ text }) => normalizedOption(text))).size !==
      question.options.length
    )
      return yield* new VerifyError({ message: `${question.id}: duplicate option text` });
    const optionIds = new Set(question.options.map(({ id }) => id));
    if (
      new Set(question.answerIds).size !== question.answerIds.length ||
      !question.answerIds.every((id) => optionIds.has(id))
    )
      return yield* new VerifyError({
        message: `${question.id}: answer IDs must refer to unique options`,
      });
  }
});

const sourceFileExists = Effect.fn(function* (
  packPath: string,
  questionId: string,
  sourcePath: string,
) {
  const path = yield* Path.Path;
  const fs = yield* FileSystem.FileSystem;
  const candidate = path.resolve(path.dirname(packPath), sourcePath);
  const actual = yield* fs
    .realPath(candidate)
    .pipe(
      Effect.mapError(
        (cause) =>
          new VerifyError({
            message: `${questionId}: missing source ${sourcePath}`,
            cause,
          }),
      ),
    );
  const info = yield* fs
    .stat(actual)
    .pipe(Effect.mapError(toVerifyError(`Unable to inspect source ${sourcePath}`)));
  if (info.type !== 'File')
    return yield* new VerifyError({
      message: `${questionId}: source is not a file (${sourcePath})`,
    });
  return actual;
});

const sourceIsContained = Effect.fn(function* (
  packDirectory: string,
  actualSource: string,
  questionId: string,
  sourcePath: string,
) {
  const path = yield* Path.Path;
  const fromPack = path.relative(packDirectory, actualSource);
  if (fromPack === '..' || fromPack.startsWith(`..${path.sep}`) || path.isAbsolute(fromPack))
    return yield* new VerifyError({
      message: `${questionId}: source escapes pack folder (${sourcePath})`,
    });
});

const verifySourceFiles = Effect.fn(function* (packPath: string, pack: PackForVerification) {
  const path = yield* Path.Path;
  const fs = yield* FileSystem.FileSystem;
  const packDirectory = yield* fs
    .realPath(path.dirname(packPath))
    .pipe(Effect.mapError(toVerifyError('Unable to resolve pack directory')));
  for (const question of pack.questions) {
    for (const source of question.sources) {
      if ('kind' in source) {
        const configuredRoot = Option.getOrUndefined(
          yield* Config.String('ACADEMY_SOURCE_ROOT').pipe(Config.option),
        );
        if (!configuredRoot)
          return yield* new VerifyError({
            message: 'ACADEMY_SOURCE_ROOT must be set to verify academy-note citations',
          });
        const root = yield* fs
          .realPath(path.resolve(configuredRoot))
          .pipe(Effect.mapError(toVerifyError('Unable to resolve academy source root')));
        const segments = source.path.split('/');
        if (
          path.isAbsolute(source.path) ||
          /^[a-zA-Z]:/.test(source.path) ||
          source.path.includes('\\') ||
          source.path.includes('\0') ||
          segments.some((segment) => segment === '' || segment === '.' || segment === '..')
        )
          return yield* new VerifyError({
            message: `${question.id}: academy note path must be relative to configured source root (${source.path})`,
          });
        const candidate = path.resolve(root, source.path);
        const actual = yield* fs
          .realPath(candidate)
          .pipe(
            Effect.mapError(
              (cause) =>
                new VerifyError({
                  message: `${question.id}: missing academy note ${source.path}`,
                  cause,
                }),
            ),
          );
        const relativePath = path.relative(root, actual);
        if (
          relativePath === '..' ||
          relativePath.startsWith(`..${path.sep}`) ||
          path.isAbsolute(relativePath)
        )
          return yield* new VerifyError({
            message: `${question.id}: academy note escapes configured source root (${source.path})`,
          });
        const info = yield* fs
          .stat(actual)
          .pipe(Effect.mapError(toVerifyError(`Unable to inspect academy note ${source.path}`)));
        if (info.type !== 'File')
          return yield* new VerifyError({
            message: `${question.id}: academy note is not a file (${source.path})`,
          });
        continue;
      }
      const actual = yield* sourceFileExists(packPath, question.id, source.path);
      yield* sourceIsContained(packDirectory, actual, question.id, source.path);
    }
  }
});

export const verifyPack = (packPath: string, profilePath?: string) =>
  Effect.gen(function* () {
    const { absolutePath, contents } = yield* readPackFile(packPath);
    const input = yield* parsePackJson(contents);
    const pack = yield* validateBuiltPack(input);
    yield* verifyGenericStructure(pack);
    yield* verifySourceFiles(absolutePath, pack);
    let profileReportPath: string | undefined;
    if (profilePath) {
      const path = yield* Path.Path;
      const result = yield* verifyProfile(absolutePath, pack, path.resolve(profilePath)).pipe(
        Effect.mapError(
          (error) =>
            new VerifyError({
              message: `Profile verification failed: ${error.message}`,
              cause: error,
            }),
        ),
      );
      profileReportPath = result.reportPath;
    }
    return profileReportPath ? { pack, profileReportPath } : { pack };
  });
