import { Data, Effect, FileSystem, Path, Random, Schema } from 'effect';
import { type AuthoringFile as Authoring, AuthoringFile, QuestionFile } from './authoring.js';

type AssembledAuthoring = Authoring & {
  readonly questions: Schema.Schema.Type<typeof QuestionFile>;
};

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

function itemAt<T>(items: ArrayLike<T>, index: number): T {
  const value = items[index];
  if (value === undefined) throw new Error(`Missing item at index ${index}`);
  return value;
}

function safeRelativePath(path: string, label: string): string {
  if (
    !path ||
    path.startsWith('/') ||
    /^[a-zA-Z]:/.test(path) ||
    path.includes('\\') ||
    path.includes('\0')
  ) {
    throw new Error(`${label} must be a safe relative path`);
  }
  const segments = path.split('/');
  if (segments.some((segment) => segment === '..' || segment === '.' || segment === '')) {
    throw new Error(`${label} must be a safe relative path`);
  }
  return path;
}

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

function validateAuthoring(input: AssembledAuthoring): void {
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
    if (!ids.has(question.domainId))
      throw new Error(`Question ${question.id} references unknown domain ${question.domainId}`);
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

function shuffleQuestions(input: AssembledAuthoring): Record<string, unknown>[] {
  const groups = new Map<
    string,
    { question: AssembledAuthoring['questions'][number]; position: number }[]
  >();
  for (const question of input.questions) {
    const key = `${question.options.length}:${question.correctOptionIds.length}`;
    const group = groups.get(key) ?? [];
    group.push({
      question,
      position: group.length % (question.options.length - question.correctOptionIds.length + 1),
    });
    groups.set(key, group);
  }
  Effect.runSync(
    Effect.gen(function* () {
      for (const group of groups.values()) {
        const first = itemAt(group, 0).question;
        const slots = first.options.length - first.correctOptionIds.length + 1;
        const positions = yield* Random.shuffle(group.map((_, index) => index % slots));
        for (const [index, item] of group.entries()) item.position = itemAt(positions, index);
      }
    }).pipe(Random.withSeed(input.shuffle.answerSeed)),
  );
  const result = input.questions.map((question) => {
    const correct = question.correctOptionIds.map((id) =>
      itemAt(
        question.options.filter((option) => option.id === id),
        0,
      ),
    );
    const correctIds = new Set(question.correctOptionIds);
    const wrong = question.options.filter((option) => !correctIds.has(option.id));
    const shuffledWrong = Effect.runSync(Random.shuffle(wrong).pipe(Random.withSeed(question.id)));
    const group = groups.get(`${question.options.length}:${correct.length}`);
    const position = group?.find((entry) => entry.question === question)?.position;
    if (position === undefined) throw new Error(`No answer position assigned for ${question.id}`);
    const options = [...shuffledWrong];
    options.splice(position, 0, ...correct);
    const letters = options.map((option, index) => ({
      id: String.fromCharCode(97 + index),
      text: option.text,
    }));
    return {
      id: question.id,
      type: question.type,
      domainId: question.domainId,
      prompt: question.prompt,
      options: letters,
      answerIds: letters.slice(position, position + correct.length).map((option) => option.id),
      explanation: question.explanation,
      sources: question.sources.map((source) =>
        'kind' in source
          ? source
          : { ...source, path: `${input.assetsDirectory}/${source.path}` },
      ),
    };
  });
  return Effect.runSync(Random.shuffle(result).pipe(Random.withSeed(input.shuffle.orderSeed)));
}

export const buildPack = (authoringPath: string, outputDirectory: string) =>
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
      const relativePath = yield* Effect.try({
        try: () => safeRelativePath(reference, 'questionFiles path'),
        catch: toBuildError,
      });
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
    yield* Effect.try({ try: () => validateAuthoring(assembled), catch: toBuildError });

    const outputRoot = path.resolve(outputDirectory);
    const assetsRoot = path.resolve(outputRoot, input.assetsDirectory);
    const assetPaths = new Set([
      ...questions.flatMap((question) =>
        question.sources.flatMap((source) => ('kind' in source ? [] : [source.path])),
      ),
      ...(input.assetFiles ?? []),
    ]);
    const artifacts = yield* Effect.forEach(assetPaths, (asset) =>
      Effect.gen(function* () {
        const source = yield* requireInputFile(path.resolve(sourceRoot, asset));
        return { source, destination: path.resolve(assetsRoot, asset) };
      }),
    );
    const pack = { ...input.metadata, questions: shuffleQuestions(assembled) };
    const packJson = yield* Schema.encodeEffect(
      Schema.fromJsonString(Schema.Unknown, { space: 2 }),
    )(pack);
    const packPath = path.join(outputRoot, input.outputFile);
    yield* rejectSymlinks(packPath);
    for (const artifact of artifacts) yield* rejectSymlinks(artifact.destination);
    yield* fs.makeDirectory(outputRoot, { recursive: true });
    yield* fs.writeFileString(packPath, `${packJson}\n`);
    for (const artifact of artifacts) {
      yield* fs.makeDirectory(path.dirname(artifact.destination), { recursive: true });
      yield* fs.copyFile(artifact.source, artifact.destination);
    }
  }).pipe(Effect.mapError(toBuildError));
