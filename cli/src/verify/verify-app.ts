/** Exercise the real application validator, importer, storage, and allocator for one pack. */
import assert from 'node:assert/strict';
// oxlint-disable-next-line effecttsgo/node-builtin-import
import { copyFile, mkdir, mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { tmpdir } from 'node:os';
// oxlint-disable-next-line effecttsgo/node-builtin-import
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('#lib/')) {
      const source = join(root, 'src/lib', specifier.slice(5).replace(/\.js$/, '.ts'));
      return nextResolve(pathToFileURL(source).href, context);
    }
    return nextResolve(specifier, context);
  },
});

const packPath = resolve(process.argv[2] ?? '');
assert(packPath, 'Usage: packs verify <pack-file>');
const pack = JSON.parse(await readFile(packPath, 'utf8')) as {
  exam: { id: string; version: string };
  pack: { id: string; version: string };
  domains: { id: string; title: string; weight: number }[];
  questions: { sources: { path: string }[] }[];
};
const { validateExamPack } = await import(
  pathToFileURL(join(root, 'src/lib/server/packs/validate.ts')).href
);
const { importPacksFromFolder, getPackIndex } = await import(
  pathToFileURL(join(root, 'src/lib/server/packs/importer.ts')).href
);
const { allocateWeightedQuestions, findCoverageGaps } = await import(
  pathToFileURL(join(root, 'src/lib/server/quiz/mock-selection.ts')).href
);
const validation = validateExamPack(pack);
assert.equal(validation.valid, true, JSON.stringify(validation.errors));

const scratch = await mkdtemp(join(tmpdir(), 'exam-pack-verification-'));
try {
  const folder = join(scratch, 'input');
  await mkdir(folder);
  const filename = packPath.split(/[\\/]/).at(-1);
  assert(filename);
  await copyFile(packPath, join(folder, filename));
  const packDirectory = await realpath(dirname(packPath));
  for (const question of pack.questions) {
    for (const source of question.sources) {
      const sourcePath = resolve(dirname(packPath), source.path);
      const actualSource = await realpath(sourcePath);
      const relativeSource = relative(packDirectory, actualSource);
      assert(
        relativeSource !== '..' &&
          !relativeSource.startsWith(`..${sep}`) &&
          !isAbsolute(relativeSource),
        `Source escapes pack folder: ${source.path}`,
      );
      const destination = resolve(folder, source.path);
      const relativeDestination = relative(folder, destination);
      assert(
        relativeDestination !== '..' &&
          !relativeDestination.startsWith(`..${sep}`) &&
          !isAbsolute(relativeDestination),
        `Source escapes pack folder: ${source.path}`,
      );
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(actualSource, destination);
    }
  }

  const options = { folder, databasePath: join(scratch, 'packs.sqlite') };
  const imported = await importPacksFromFolder(options);
  const identity = `${pack.exam.id}/${pack.pack.id}@${pack.pack.version}`;
  assert(imported.imported.includes(identity), JSON.stringify(imported));
  const stored = getPackIndex(options.databasePath).find(
    (item: { packId: string; packVersion: string }) =>
      item.packId === pack.pack.id && item.packVersion === pack.pack.version,
  );
  assert(stored);
  assert.equal(stored.questionCount, pack.questions.length);
  assert.equal(stored.examVersion, pack.exam.version);

  const available = Object.fromEntries(
    stored.domains.map((domain: { id: string; questionCount: number }) => [
      domain.id,
      domain.questionCount,
    ]),
  );
  const sampleSizes = [...new Set([1, Math.min(45, pack.questions.length), pack.questions.length])];
  const allocations = Object.fromEntries(
    sampleSizes.map((size) => {
      const allocation = allocateWeightedQuestions(pack.domains, size);
      assert.equal(
        (Object.values(allocation) as number[]).reduce((sum, count) => sum + count, 0),
        size,
      );
      const gaps = findCoverageGaps(pack.domains, available, size);
      for (const gap of gaps) {
        assert.equal(gap.missing, gap.required - gap.available);
        assert(gap.missing > 0);
      }
      return [size, allocation];
    }),
  );

  const duplicate = await importPacksFromFolder(options);
  assert(!duplicate.imported.includes(identity));
  assert(
    duplicate.errors.some(
      (message: string) => message.includes(filename) && message.includes('already imported'),
    ),
  );
  // oxlint-disable-next-line effecttsgo/global-console
  console.log(
    JSON.stringify({
      validator: 'passed',
      sqliteImport: 'passed',
      duplicateRejection: 'passed',
      allocatorSums: 'passed',
      allocations,
    }),
  );
} finally {
  await rm(scratch, { recursive: true, force: true });
}
