// oxlint-disable-next-line effecttsgo/node-builtin-import
import { spawnSync } from 'node:child_process';
// oxlint-disable-next-line effecttsgo/node-builtin-import
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
// oxlint-disable-next-line effecttsgo/node-builtin-import
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { createSamplePackFolder } from '../../src/lib/server/packs/test-fixtures.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const temporaryDirectories: string[] = [];

// oxlint-disable-next-line effecttsgo/async-function
async function temporaryPack(): Promise<{ directory: string; path: string }> {
  const directory = await mkdtemp(join(tmpdir(), 'pack-cli-verify-test-'));
  temporaryDirectories.push(directory);
  await createSamplePackFolder(directory);
  const path = join(directory, 'sample-databricks-associate.json');
  return { directory, path };
}

function runVerify(packPath: string) {
  return spawnSync(
    'pnpm',
    ['--dir', join(root, 'cli'), 'exec', 'tsx', 'src/index.ts', 'verify', packPath],
    {
      cwd: root,
      encoding: 'utf8',
    },
  );
}

// oxlint-disable-next-line effecttsgo/async-function
afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('pack verify command', () => {
  // oxlint-disable-next-line effecttsgo/async-function
  it('verifies the incoming Databricks sample through the app importer', async () => {
    const { path } = await temporaryPack();
    const result = runVerify(path);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('PASS:');
    expect(result.stdout).toContain('app import passed');
  });

  // oxlint-disable-next-line effecttsgo/async-function
  it('verifies a valid pack with one domain', async () => {
    const { path } = await temporaryPack();
    const pack = JSON.parse(await readFile(path, 'utf8')) as {
      domains: { id: string; weight: number }[];
      questions: { domainId: string }[];
    };
    const firstDomain = pack.domains[0];
    if (!firstDomain) throw new Error('Sample pack has no domain');
    pack.domains = [{ ...firstDomain, weight: 100 }];
    for (const question of pack.questions) question.domainId = firstDomain.id;
    await writeFile(path, JSON.stringify(pack));

    const result = runVerify(path);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('PASS:');
  });

  // oxlint-disable-next-line effecttsgo/async-function
  it('returns a useful failure for a missing source', async () => {
    const { path } = await temporaryPack();
    const pack = JSON.parse(await readFile(path, 'utf8')) as {
      questions: { sources: { path: string }[] }[];
    };
    const firstSource = pack.questions[0]?.sources[0];
    if (!firstSource) throw new Error('Sample pack has no question source');
    firstSource.path = 'assets/missing.md';
    await writeFile(path, JSON.stringify(pack));

    const result = runVerify(path);
    expect(result.status).not.toBe(0);
    expect(`${result.stderr}${result.stdout}`).toContain('missing source assets/missing.md');
  });

  // oxlint-disable-next-line effecttsgo/async-function
  it('returns a useful failure for a source path outside the pack folder', async () => {
    const { path } = await temporaryPack();
    const pack = JSON.parse(await readFile(path, 'utf8')) as {
      questions: { sources: { path: string }[] }[];
    };
    const firstSource = pack.questions[0]?.sources[0];
    if (!firstSource) throw new Error('Sample pack has no question source');
    const outsideDirectory = await mkdtemp(join(tmpdir(), 'pack-cli-verify-outside-'));
    temporaryDirectories.push(outsideDirectory);
    const sourcePath = `../${basename(outsideDirectory)}/outside.md`;
    firstSource.path = sourcePath;
    await writeFile(path, JSON.stringify(pack));
    await writeFile(join(outsideDirectory, 'outside.md'), 'outside');

    const result = runVerify(path);
    expect(result.status).not.toBe(0);
    expect(`${result.stderr}${result.stdout}`).toContain(
      `source escapes pack folder (${sourcePath})`,
    );
  });
});
