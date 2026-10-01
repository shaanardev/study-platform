// oxlint-disable-next-line effecttsgo/node-builtin-import
import { readFile, realpath, stat } from 'node:fs/promises';
// oxlint-disable-next-line effecttsgo/node-builtin-import
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Data, Effect } from 'effect';
import type { ExamPack } from '../../../src/lib/types/exam-pack.js';

export class VerifyError extends Data.TaggedError('VerifyError')<{
  readonly message: string;
}> {}

export type PackForVerification = ExamPack;

const normalized = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_]+/gu, ' ')
    .trim();

const normalizedOption = (value: string): string => value.toLowerCase().replace(/\s+/g, ' ').trim();

function requireThat(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// oxlint-disable-next-line effecttsgo/async-function
async function verifyStructure(packPath: string, pack: PackForVerification): Promise<void> {
  const domainIds = new Set(pack.domains.map(({ id }) => id));
  requireThat(domainIds.size === pack.domains.length, 'Domain IDs must be unique');
  requireThat(
    Math.abs(pack.domains.reduce((sum, domain) => sum + domain.weight, 0) - 100) <= 0.01,
    'Domain weights must total 100',
  );
  const questionIds = new Set<string>();
  const prompts = new Set<string>();
  const packDirectory = await realpath(dirname(packPath));
  for (const question of pack.questions) {
    requireThat(!questionIds.has(question.id), `Duplicate question ID: ${question.id}`);
    questionIds.add(question.id);
    const prompt = normalized(question.prompt);
    requireThat(prompt.length > 0, `${question.id}: prompt is empty`);
    requireThat(!prompts.has(prompt), `${question.id}: duplicate prompt`);
    prompts.add(prompt);
    requireThat(
      domainIds.has(question.domainId),
      `${question.id}: unknown domain ${question.domainId}`,
    );
    requireThat(question.options.length >= 2, `${question.id}: fewer than two options`);
    requireThat(
      new Set(question.options.map(({ id }) => id)).size === question.options.length,
      `${question.id}: duplicate option IDs`,
    );
    requireThat(
      new Set(question.options.map(({ text }) => normalizedOption(text))).size ===
        question.options.length,
      `${question.id}: duplicate option text`,
    );
    const optionIds = new Set(question.options.map(({ id }) => id));
    requireThat(
      new Set(question.answerIds).size === question.answerIds.length &&
        question.answerIds.length > 0 &&
        question.answerIds.every((id) => optionIds.has(id)),
      `${question.id}: answer IDs must refer to unique options`,
    );
    requireThat(question.sources.length > 0, `${question.id}: no source paths`);
    for (const source of question.sources) {
      const candidate = resolve(dirname(packPath), source.path);
      let actual: string;
      try {
        actual = await realpath(candidate);
      } catch {
        throw new Error(`${question.id}: missing source ${source.path}`);
      }
      const fromPack = relative(packDirectory, actual);
      requireThat(
        fromPack !== '..' && !fromPack.startsWith(`..${sep}`) && !isAbsolute(fromPack),
        `${question.id}: source escapes pack folder (${source.path})`,
      );
      requireThat(
        (await stat(actual)).isFile(),
        `${question.id}: source is not a file (${source.path})`,
      );
    }
  }
}

// oxlint-disable-next-line effecttsgo/async-function
async function verifyPackPromise(packPath: string): Promise<PackForVerification> {
  const path = resolve(packPath);
  const pack = JSON.parse(await readFile(path, 'utf8')) as PackForVerification;
  await verifyStructure(path, pack);
  const appVerifier = fileURLToPath(new URL('./verify-app.ts', import.meta.url));
  const { spawnSync } = await import('node:child_process');
  const result = spawnSync(process.execPath, [appVerifier, path], {
    cwd: resolve(dirname(fileURLToPath(import.meta.url)), '../../..'),
    encoding: 'utf8',
  });
  if (result.error) throw result.error;
  requireThat(
    result.status === 0,
    result.stderr || `App verifier exited with status ${result.status}`,
  );
  const output = result.stdout.trim().split(/\r?\n/).at(-1) ?? '';
  requireThat(output.length > 0, 'App verifier returned no report');
  JSON.parse(output);
  return pack;
}

// Promise based Node filesystem and child process boundaries are captured here as one expected CLI error.
export const verifyPack = (packPath: string): Effect.Effect<PackForVerification, VerifyError> =>
  Effect.tryPromise({
    try: () => verifyPackPromise(packPath),
    catch: (cause) =>
      new VerifyError({ message: cause instanceof Error ? cause.message : String(cause) }),
  });
