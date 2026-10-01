import { copyFile, lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { Data, Effect, Random, Schema } from 'effect';
import { type AuthoringFile as Authoring, AuthoringFile } from './authoring.js';

export class BuildError extends Data.TaggedError('BuildError')<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

function itemAt<T>(items: ArrayLike<T>, index: number): T {
  const value = items[index];
  if (value === undefined) throw new Error(`Missing item at index ${index}`);
  return value;
}

function safeRelativePath(path: string, label: string): string {
  if (
    !path ||
    isAbsolute(path) ||
    /^[a-zA-Z]:[\\/]/.test(path) ||
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

async function rejectOutputSymlinks(root: string, destination: string): Promise<void> {
  const parts = relative(root, destination).split(sep);
  let current = root;
  for (const part of parts) {
    current = join(current, part);
    try {
      if ((await lstat(current)).isSymbolicLink()) {
        throw new Error(`Output path contains a symbolic link: ${current}`);
      }
    } catch (cause) {
      if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') break;
      throw cause;
    }
  }
}

function validateAuthoring(input: Authoring): void {
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
      safeRelativePath(source.path, `Question ${question.id} source path`);
  }
}

function shuffleQuestions(input: Authoring): Record<string, unknown>[] {
  const groups = new Map<
    string,
    { question: Authoring['questions'][number]; position: number }[]
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
    const shuffledWrong = Effect.runSync(
      Random.shuffle(wrong).pipe(Random.withSeed(question.id)),
    );
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
      sources: question.sources.map((source) => ({
        ...source,
        path: `${input.assetsDirectory}/${source.path}`,
      })),
    };
  });
  return Effect.runSync(Random.shuffle(result).pipe(Random.withSeed(input.shuffle.orderSeed)));
}

async function build(authoringPath: string, outputDirectory: string): Promise<void> {
  const authoringFile = resolve(authoringPath);
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(authoringFile, 'utf8'));
  } catch (cause) {
    throw new Error(`Unable to read JSON authoring file: ${String(cause)}`);
  }
  let input: Authoring;
  try {
    input = Schema.decodeUnknownSync(AuthoringFile, { onExcessProperty: 'error' })(raw);
  } catch (cause) {
    throw new Error(`Invalid authoring file: ${String(cause)}`);
  }
  validateAuthoring(input);
  const sourceRoot = await realpath(dirname(authoringFile));
  const outputRoot = resolve(outputDirectory);
  const assetsRoot = resolve(outputRoot, input.assetsDirectory);
  if (!assetsRoot.startsWith(`${outputRoot}${sep}`))
    throw new Error('assetsDirectory escapes output directory');
  const artifacts: { source: string; destination: string }[] = [];
  for (const question of input.questions) {
    for (const source of question.sources) {
      const relativePath = safeRelativePath(source.path, 'source path');
      const sourcePath = resolve(sourceRoot, relativePath);
      const actualSource = await realpath(sourcePath);
      if (!actualSource.startsWith(`${sourceRoot}${sep}`))
        throw new Error(`Source asset escapes authoring directory: ${source.path}`);
      artifacts.push({ source: actualSource, destination: resolve(assetsRoot, relativePath) });
    }
  }
  const pack = { ...input.metadata, questions: shuffleQuestions(input) };
  await mkdir(outputRoot, { recursive: true });
  await rejectOutputSymlinks(outputRoot, join(outputRoot, input.outputFile));
  for (const artifact of artifacts) {
    await rejectOutputSymlinks(outputRoot, artifact.destination);
  }
  await writeFile(join(outputRoot, input.outputFile), `${JSON.stringify(pack, null, 2)}\n`, 'utf8');
  for (const artifact of new Map(artifacts.map((item) => [item.destination, item])).values()) {
    await mkdir(dirname(artifact.destination), { recursive: true });
    await copyFile(artifact.source, artifact.destination);
  }
}

export const buildPack = (authoringPath: string, outputDirectory: string) =>
  Effect.tryPromise({
    try: () => build(authoringPath, outputDirectory),
    catch: (cause) =>
      new BuildError({ message: cause instanceof Error ? cause.message : String(cause), cause }),
  });
