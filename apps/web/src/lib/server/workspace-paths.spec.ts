import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { findWorkspaceRoot, workspacePath } from '#lib/server/workspace-paths.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('workspace paths', () => {
  it('finds a workspace marker above a nested app or build directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workspace-paths-'));
    temporaryDirectories.push(root);
    const nestedBuildDirectory = join(root, 'apps', 'web', '.svelte-kit', 'output', 'server');
    await mkdir(nestedBuildDirectory, { recursive: true });
    await writeFile(join(root, 'pnpm-workspace.yaml'), 'packages: []\n');

    expect(findWorkspaceRoot(nestedBuildDirectory)).toBe(root);
  });

  it('anchors repository resources at the workspace root', () => {
    expect(workspacePath('packs', 'incoming')).toBe(join(findWorkspaceRoot(), 'packs', 'incoming'));
  });
});
