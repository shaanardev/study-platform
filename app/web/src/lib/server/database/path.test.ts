import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  databasePath: undefined as string | undefined,
  workspaceRoot: '',
}));

vi.mock(import('#lib/server/workspace-paths.js'), () => ({
  workspacePath: (...segments: string[]) => path.join(state.workspaceRoot, ...segments),
}));
vi.mock(import('$app/env/private'), () => ({
  get DB_PATH(): string | undefined {
    return state.databasePath;
  },
}));

describe('database path isolation', () => {
  beforeEach(() => {
    vi.resetModules();
    state.databasePath = undefined;
    state.workspaceRoot = mkdtempSync(path.join(tmpdir(), 'database-path-'));
    mkdirSync(path.join(state.workspaceRoot, '.local'));
  });

  afterEach(() => {
    state.databasePath = undefined;
    rmSync(state.workspaceRoot, { force: true, recursive: true });
  });

  it('selects the fresh default without creating a database', async () => {
    const { databasePath } = await import('#lib/server/database/path.js');

    expect(databasePath).toBe(path.join(state.workspaceRoot, '.local/app.sqlite'));
    expect(existsSync(databasePath)).toBeFalsy();
  });

  it.each(['', 'relative.sqlite'])('rejects an invalid explicit path: %j', async (value) => {
    state.databasePath = value;

    await expect(import('#lib/server/database/path.js')).rejects.toThrow(
      'DB_PATH must be a non-empty absolute SQLite path.',
    );
  });

  it.each(['app.sqlite', 'exam-packs.sqlite', 'backups/exam-packs-before-rewrite.sqlite'])(
    'rejects hard-link aliases of protected %s',
    async (filename) => {
      const protectedPath = path.join(state.workspaceRoot, '.local', filename);
      const alias = path.join(state.workspaceRoot, 'hard-link.sqlite');
      mkdirSync(path.dirname(protectedPath), { recursive: true });
      writeFileSync(protectedPath, 'protected fixture');
      linkSync(protectedPath, alias);
      state.databasePath = alias;

      await expect(import('#lib/server/database/path.js')).rejects.toThrow(
        'DB_PATH must not point to a protected workspace database.',
      );
    },
  );

  it('rejects a new database through a symlinked parent directory', async () => {
    const alias = path.join(state.workspaceRoot, 'alias');
    symlinkSync(path.join(state.workspaceRoot, '.local'), alias);
    state.databasePath = path.join(alias, 'app.sqlite');

    await expect(import('#lib/server/database/path.js')).rejects.toThrow(
      'DB_PATH must not point to a protected workspace database.',
    );
  });

  it('rejects a dangling symlink targeting the future personal database', async () => {
    const alias = path.join(state.workspaceRoot, 'dangling.sqlite');
    symlinkSync(path.join(state.workspaceRoot, '.local/app.sqlite'), alias);
    state.databasePath = alias;

    await expect(import('#lib/server/database/path.js')).rejects.toThrow(
      'DB_PATH must not point to a protected workspace database.',
    );
  });
});
