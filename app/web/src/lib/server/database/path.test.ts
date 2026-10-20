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

const workspace = vi.hoisted(() => ({ root: '' }));

vi.mock(import('#lib/server/workspace-paths.js'), () => ({
  workspacePath: (...segments: string[]) => path.join(workspace.root, ...segments),
}));
vi.mock(import('$app/env/private'), () => ({
  get DB_PATH(): string | undefined {
    return process.env.DB_PATH;
  },
}));

describe('database path isolation', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('DB_PATH');
    workspace.root = mkdtempSync(path.join(tmpdir(), 'database-path-'));
    mkdirSync(path.join(workspace.root, '.local'));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(workspace.root, { force: true, recursive: true });
  });

  it('selects the fresh default without creating a database', async () => {
    const { databasePath } = await import('#lib/server/database/path.js');

    expect(databasePath).toBe(path.join(workspace.root, '.local/app.sqlite'));
    expect(existsSync(databasePath)).toBeFalsy();
  });

  it.each(['', 'relative.sqlite'])('rejects an invalid explicit path: %j', async (value) => {
    vi.stubEnv('DB_PATH', value);

    await expect(import('#lib/server/database/path.js')).rejects.toThrow(
      'DB_PATH must be a non-empty absolute SQLite path.',
    );
  });

  it.each(['app.sqlite', 'exam-packs.sqlite'])(
    'rejects hard-link aliases of protected %s',
    async (filename) => {
      const protectedPath = path.join(workspace.root, '.local', filename);
      const alias = path.join(workspace.root, 'hard-link.sqlite');
      writeFileSync(protectedPath, 'protected fixture');
      linkSync(protectedPath, alias);
      vi.stubEnv('DB_PATH', alias);

      await expect(import('#lib/server/database/path.js')).rejects.toThrow(
        'DB_PATH must not point to a protected workspace database.',
      );
    },
  );

  it('rejects a new database through a symlinked parent directory', async () => {
    const alias = path.join(workspace.root, 'alias');
    symlinkSync(path.join(workspace.root, '.local'), alias);
    vi.stubEnv('DB_PATH', path.join(alias, 'app.sqlite'));

    await expect(import('#lib/server/database/path.js')).rejects.toThrow(
      'DB_PATH must not point to a protected workspace database.',
    );
  });

  it('rejects a dangling symlink targeting the future personal database', async () => {
    const alias = path.join(workspace.root, 'dangling.sqlite');
    symlinkSync(path.join(workspace.root, '.local/app.sqlite'), alias);
    vi.stubEnv('DB_PATH', alias);

    await expect(import('#lib/server/database/path.js')).rejects.toThrow(
      'DB_PATH must not point to a protected workspace database.',
    );
  });
});
