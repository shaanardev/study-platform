import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { findWorkspaceRoot, workspacePath } from '#lib/server/workspace-paths.js';

describe('workspace paths', () => {
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      temporaryDirectories.splice(0).map(async (directory) => {
        await rm(directory, { force: true, recursive: true });
      }),
    );
  });

  it('finds a workspace marker above a nested app or build directory', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'workspace-paths-'));
    temporaryDirectories.push(root);
    const nestedBuildDirectory = path.join(root, 'apps', 'web', '.svelte-kit', 'output', 'server');
    await mkdir(nestedBuildDirectory, { recursive: true });
    await writeFile(path.join(root, 'pnpm-workspace.yaml'), 'packages: []\n');

    expect(findWorkspaceRoot(nestedBuildDirectory)).toBe(root);
  });

  it('anchors repository resources at the workspace root', () => {
    expect(workspacePath('packs', 'incoming')).toBe(
      path.join(findWorkspaceRoot(), 'packs', 'incoming'),
    );
  });
});
