import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createDatabasePathPolicy } from './path-policy.js';

let workspaceRoot = '';

describe('database path policy', () => {
  beforeEach(() => {
    workspaceRoot = mkdtempSync(path.join(tmpdir(), 'database-path-'));
    mkdirSync(path.join(workspaceRoot, '.local'));
  });

  afterEach(() => {
    rmSync(workspaceRoot, { force: true, recursive: true });
  });

  it('selects the workspace database by default without creating a file', () => {
    const { databasePath } = createDatabasePathPolicy(undefined, workspaceRoot);

    expect(databasePath).toBe(path.join(workspaceRoot, '.local/app.sqlite'));
    expect(existsSync(databasePath)).toBeFalsy();
  });

  it.each(['', 'relative.sqlite'])('rejects an invalid configured path: %j', (value) => {
    expect(() => createDatabasePathPolicy(value, workspaceRoot)).toThrow(
      'DB_PATH must be a non-empty absolute SQLite path.',
    );
  });

  it.each(['app.sqlite', 'exam-packs.sqlite', 'backups/exam-packs-before-rewrite.sqlite'])(
    'rejects the protected workspace database %s',
    (filename) => {
      const databasePath = path.join(workspaceRoot, '.local', filename);

      expect(() => createDatabasePathPolicy(databasePath, workspaceRoot)).toThrow(
        'DB_PATH must not point to a protected workspace database.',
      );
    },
  );

  it('allows the default path for app initialization and rejects it for custom paths', () => {
    const defaultPath = path.join(workspaceRoot, '.local/app.sqlite');
    const defaultPolicy = createDatabasePathPolicy(undefined, workspaceRoot);

    const configuredPolicy = createDatabasePathPolicy(
      path.join(workspaceRoot, 'custom.sqlite'),
      workspaceRoot,
    );

    expect(defaultPolicy.assertSafeDatabasePath(defaultPath)).toBe(defaultPath);
    expect(() => configuredPolicy.assertSafeDatabasePath(defaultPath)).toThrow(
      'createDatabase(path) must not point to a protected workspace database.',
    );
  });
});
