import { lstatSync, readlinkSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';

import { DB_PATH } from '$app/env/private';

import { workspacePath } from '#lib/server/workspace-paths.js';

import { databasePathVariable } from '../../../env.js';

const activeDatabasePath = workspacePath('.local/app.sqlite');
const archivedDatabasePath = workspacePath('.local/exam-packs.sqlite');
const archivedBackupPath = workspacePath('.local/backups/exam-packs-before-rewrite.sqlite');

/** Resolve paths through existing symlinked ancestors, including when the file is new. */
const canonicalPath = (input: string, depth = 0): string => {
  const resolved = path.resolve(input);
  if (depth > 32) {
    return resolved;
  }
  try {
    return realpathSync.native(resolved);
  } catch {
    try {
      if (lstatSync(resolved).isSymbolicLink()) {
        const linkTarget = readlinkSync(resolved, 'utf-8');
        return canonicalPath(
          path.isAbsolute(linkTarget)
            ? linkTarget
            : path.resolve(path.dirname(resolved), linkTarget),
          depth + 1,
        );
      }
    } catch {
      // The path is absent or cannot be inspected; resolve its existing ancestors below.
    }
    const parent = path.dirname(resolved);
    if (parent === resolved) {
      return resolved;
    }
    return path.join(canonicalPath(parent, depth + 1), path.basename(resolved));
  }
};

const sameFile = (left: string, right: string): boolean => {
  try {
    const leftStat = statSync(left);
    const rightStat = statSync(right);
    return leftStat.dev === rightStat.dev && leftStat.ino === rightStat.ino;
  } catch {
    return false;
  }
};

const isSameDatabase = (left: string, right: string): boolean =>
  canonicalPath(left) === canonicalPath(right) || sameFile(left, right);

const assertNotProtectedDatabase = (selectedPath: string, source: string): void => {
  if (
    isSameDatabase(selectedPath, activeDatabasePath) ||
    isSameDatabase(selectedPath, archivedDatabasePath) ||
    isSameDatabase(selectedPath, archivedBackupPath)
  ) {
    throw new Error(`${source} must not point to a protected workspace database.`);
  }
};

/** Selected once by the server; resolving it never opens SQLite. */
export const databasePath = (() => {
  if (DB_PATH === undefined) {
    return activeDatabasePath;
  }
  if (DB_PATH.length === 0 || !path.isAbsolute(DB_PATH)) {
    throw new Error(`${databasePathVariable} must be a non-empty absolute SQLite path.`);
  }
  const selectedPath = path.resolve(DB_PATH);
  assertNotProtectedDatabase(selectedPath, databasePathVariable);
  return selectedPath;
})();

/** Reject accidental factory paths into either the app DB or its archived predecessor. */
export const assertSafeDatabasePath = (input: string): string => {
  const resolvedPath = path.resolve(input);
  const isDefaultDatabase =
    DB_PATH === undefined && resolvedPath === path.resolve(activeDatabasePath);
  if (!isDefaultDatabase) {
    assertNotProtectedDatabase(resolvedPath, 'createDatabase(path)');
  }
  return resolvedPath;
};
