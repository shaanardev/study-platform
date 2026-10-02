// oxlint-disable-next-line effecttsgo/node-builtin-import
import { spawnSync } from 'node:child_process';
// oxlint-disable-next-line effecttsgo/node-builtin-import
import { createHash } from 'node:crypto';
// oxlint-disable-next-line effecttsgo/node-builtin-import
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
  return runVerifyWithProfile(packPath);
}

function runVerifyWithProfile(packPath: string, profilePath?: string) {
  const args = ['--dir', join(root, 'cli'), 'exec', 'tsx', 'src/index.ts', 'verify', packPath];
  if (profilePath) args.push('--profile', profilePath);
  return spawnSync('pnpm', args, { cwd: root, encoding: 'utf8' });
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
  it('verifies the incoming Databricks sample with CLI checks', async () => {
    const { path } = await temporaryPack();
    const result = runVerify(path);
    expect(result.status, `${result.stderr}${result.stdout}`).toBe(0);
    expect(result.stdout).toContain('PASS:');
    expect(result.stdout).toContain('structural checks and source-file checks passed');
    expect(result.stdout).not.toContain('app import');
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
    expect(result.status, `${result.stderr}${result.stdout}`).toBe(0);
    expect(result.stdout).toContain('PASS:');
  });

  // oxlint-disable-next-line effecttsgo/async-function
  it('rejects unknown fields in built pack objects', async () => {
    const { path } = await temporaryPack();
    const pack = JSON.parse(await readFile(path, 'utf8')) as {
      exam: Record<string, unknown>;
      [key: string]: unknown;
    };
    pack['unexpected'] = true;
    pack.exam['unexpectedNested'] = true;
    await writeFile(path, JSON.stringify(pack));

    const result = runVerify(path);
    expect(result.status).not.toBe(0);
    expect(`${result.stderr}${result.stdout}`).toContain('unexpected');
  });

  // oxlint-disable-next-line effecttsgo/async-function
  it('applies an optional verification profile and writes its report', async () => {
    const { directory, path } = await temporaryPack();
    const pack = JSON.parse(await readFile(path, 'utf8')) as {
      domains: { id: string; title: string; weight: number }[];
      questions: { id: string; type: string; domainId: string; answerIds: string[] }[];
    };
    const domain = pack.domains[0];
    const first = pack.questions[0];
    const second = pack.questions[1];
    if (!domain || !first || !second) throw new Error('Sample pack is incomplete');
    second.type = 'single_choice';
    second.answerIds = ['b'];
    await writeFile(path, JSON.stringify(pack));

    const firstQuestionObjectives = { [first.id]: ['O1'], [second.id]: ['O2'] };
    await writeFile(
      join(directory, 'assets', 'objective-coverage.json'),
      JSON.stringify({ questionObjectives: firstQuestionObjectives, objectives: { O1: {}, O2: {} } }),
    );
    const material = 'snapshot material';
    const baseline = 'baseline archive';
    await mkdir(join(directory, 'assets', 'materials'));
    await writeFile(join(directory, 'assets', 'materials', 'material.txt'), material);
    await writeFile(join(directory, 'assets', 'materials', 'baseline.zip'), baseline);
    const digest = (text: string) => createHash('sha256').update(text).digest('hex');
    await writeFile(
      join(directory, 'assets', 'provenance.json'),
      JSON.stringify({
        materialInventory: [{ path: 'material.txt', sha256: digest(material) }],
        baselinePath: 'baseline.zip',
        baselineSha256: digest(baseline),
      }),
    );
    await writeFile(join(directory, 'assets', 'baseline-review.json'), '[]');
    const profilePath = join(directory, 'verify-profile.json');
    await writeFile(
      profilePath,
      JSON.stringify({
        domains: {
          [domain.id]: { count: 1, weight: 60 },
          [pack.domains[1]?.id ?? 'missing']: { count: 1, weight: 40 },
        },
        objectives: {
          path: 'assets/objective-coverage.json',
          byDomain: { [domain.id]: ['O1'], [pack.domains[1]?.id ?? 'missing']: ['O2'] },
        },
        questionRules: {
          type: 'single_choice',
          optionCount: 3,
          explanationMinWords: 1,
          requiredSourcePathFragment: 'assets/synthetic-notes.md',
        },
        answerPositions: { a: 1, b: 1 },
        baselineAudit: {
          path: 'assets/baseline-review.json',
          total: 0,
          included: 0,
          excluded: 0,
          idPrefix: 'legacy-',
        },
        sourceIntegrity: { provenancePath: 'assets/provenance.json' },
      }),
    );

    const result = runVerifyWithProfile(path, profilePath);
    expect(result.status, `${result.stderr}${result.stdout}`).toBe(0);
    expect(result.stdout).toContain('profile checks passed');
    expect(result.stdout).toContain('Verification report:');
    const report = JSON.parse(
      await readFile(join(directory, 'assets', 'verification-report.json'), 'utf8'),
    ) as { status: string; domains: { id: string; questionCount: number }[] };
    expect(report.status).toBe('passed');
    expect(report.domains).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: domain.id, questionCount: 1, guidePercent: 60 }),
      ]),
    );
    expect(report.objectivesCovered).toBe(2);
    expect(report.answerPositions).toEqual({ a: 1, b: 1 });
  });

  // oxlint-disable-next-line effecttsgo/async-function
  it('rejects a verification profile whose exact domain count does not match', async () => {
    const { directory, path } = await temporaryPack();
    const pack = JSON.parse(await readFile(path, 'utf8')) as {
      domains: { id: string; weight: number }[];
      questions: { domainId: string }[];
    };
    const domain = pack.domains[0];
    if (!domain) throw new Error('Sample pack has no domain');
    pack.domains = [{ ...domain, weight: 100 }];
    for (const question of pack.questions) question.domainId = domain.id;
    await writeFile(path, JSON.stringify(pack));
    const profilePath = join(directory, 'verify-profile.json');
    await writeFile(profilePath, JSON.stringify({ domains: { [domain.id]: { count: 3, weight: 100 } } }));

    const result = runVerifyWithProfile(path, profilePath);
    expect(result.status).not.toBe(0);
    expect(`${result.stderr}${result.stdout}`).toContain('expected 3 questions, got 2');
  });

  // oxlint-disable-next-line effecttsgo/async-function
  it('rejects malformed profile data with a profile validation error', async () => {
    const { directory, path } = await temporaryPack();
    const profilePath = join(directory, 'verify-profile.json');
    await writeFile(profilePath, JSON.stringify({ domains: { domain: { count: 'two', weight: 100 } } }));

    const result = runVerifyWithProfile(path, profilePath);
    expect(result.status).not.toBe(0);
    expect(`${result.stderr}${result.stdout}`).toContain('Profile schema validation failed');
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
      'Exam pack schema validation failed',
    );
  });
});
