import path from 'node:path';

interface ProtectedPaths {
  active: string;
  archived: string;
  archivedBackup: string;
}

export interface DatabasePathPolicy {
  databasePath: string;
  assertSafeDatabasePath: (input: string) => string;
}

const pathsFor = (workspaceRoot: string): ProtectedPaths => ({
  active: path.resolve(workspaceRoot, '.local/app.sqlite'),
  archived: path.resolve(workspaceRoot, '.local/exam-packs.sqlite'),
  archivedBackup: path.resolve(workspaceRoot, '.local/backups/exam-packs-before-rewrite.sqlite'),
});

const assertNotProtected = (
  selectedPath: string,
  protectedPaths: ProtectedPaths,
  source: string,
): string => {
  const resolvedPath = path.resolve(selectedPath);

  if (Object.values(protectedPaths).includes(resolvedPath)) {
    throw new Error(`${source} must not point to a protected workspace database.`);
  }

  return resolvedPath;
};

/** Guard custom paths from accidentally selecting a known workspace database. */
export const assertPathNotProtected = (input: string, workspaceRoot: string): string =>
  assertNotProtected(input, pathsFor(workspaceRoot), 'createDatabase(path)');

/** Pure path policy used by the SvelteKit env adapter and its unit tests. */
export const createDatabasePathPolicy = (
  configuredPath: string | undefined,
  workspaceRoot: string,
  variableName = 'DB_PATH',
): DatabasePathPolicy => {
  const protectedPaths = pathsFor(workspaceRoot);

  const databasePath =
    configuredPath === undefined ? protectedPaths.active : path.resolve(configuredPath);

  if (configuredPath !== undefined) {
    if (configuredPath.length === 0 || !path.isAbsolute(configuredPath)) {
      throw new Error(`${variableName} must be a non-empty absolute SQLite path.`);
    }

    assertNotProtected(configuredPath, protectedPaths, variableName);
  }

  return {
    assertSafeDatabasePath: (input) => {
      const resolvedPath = path.resolve(input);

      const isDefaultDatabase =
        configuredPath === undefined && resolvedPath === protectedPaths.active;

      return isDefaultDatabase
        ? resolvedPath
        : assertNotProtected(resolvedPath, protectedPaths, 'createDatabase(path)');
    },
    databasePath,
  };
};
