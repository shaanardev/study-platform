/** Generic validation for an exam pack, with optional recipe-specific checks. */
import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { ExamPack } from '#lib/types/exam-pack.js';

export type PackForVerification = ExamPack;

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const requireThat: (condition: unknown, message: string) => asserts condition = (
  condition,
  message,
) => {
  if (!condition) throw new Error(message);
};
const normalized = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_]+/gu, ' ')
    .trim();
const normalizedOption = (value: string): string => value.toLowerCase().replace(/\s+/g, ' ').trim();

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

async function runAppChecks(packPath: string): Promise<void> {
  const appVerifier = new URL('./verify-app.ts', import.meta.url);
  const { spawnSync } = await import('node:child_process');
  const result = spawnSync(process.execPath, [fileURLToPath(appVerifier), packPath], {
    cwd: root,
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
}

function argumentsFrom(argv: string[]): { packPath: string; profile?: string } {
  const args = argv.slice(2);
  if (args[0] === '--') args.shift();
  const packPath = args.find((arg) => !arg.startsWith('--'));
  if (!packPath) throw new Error('Usage: verify.ts <pack-file> [--profile <module>]');
  const profileIndex = args.indexOf('--profile');
  if (profileIndex < 0) return { packPath: resolve(packPath) };
  const profile = args[profileIndex + 1];
  if (!profile || profile.startsWith('--')) throw new Error('--profile requires a module path');
  return { packPath: resolve(packPath), profile: resolve(profile) };
}

export async function verifyPack(
  packPath: string,
  profilePath?: string,
): Promise<PackForVerification> {
  const path = resolve(packPath);
  const pack = JSON.parse(await readFile(path, 'utf8')) as PackForVerification;
  await runAppChecks(path); // validateExamPack supplies the app's authoritative schema validation.
  await verifyStructure(path, pack);
  if (profilePath) {
    const profile = (await import(pathToFileURL(resolve(profilePath)).href)) as {
      verify?: (inputPath: string, inputPack: PackForVerification) => void | Promise<void>;
    };
    requireThat(typeof profile.verify === 'function', 'Profile must export verify(packPath, pack)');
    await profile.verify(path, pack);
  }
  return pack;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = argumentsFrom(process.argv);
    const pack = await verifyPack(args.packPath, args.profile);
    console.log(`PASS: ${pack.questions.length} questions; generic checks and app import passed.`);
  } catch (error) {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  }
}
