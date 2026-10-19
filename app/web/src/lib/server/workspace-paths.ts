import { accessSync, constants } from 'node:fs';
import path from 'node:path';

const findWorkspaceRootFrom = (startDirectory: string): string | undefined => {
  let directory = startDirectory;
  const { root } = path.parse(directory);

  while (true) {
    try {
      accessSync(path.join(directory, 'pnpm-workspace.yaml'), constants.R_OK);

      return directory;
    } catch {
      if (directory === root) {
        return undefined;
      }

      directory = path.dirname(directory);
    }
  }
};

/** Find the repository root from a path inside the workspace or its build output. */
export const findWorkspaceRoot = (startDirectory = import.meta.dirname): string => {
  const workspaceRoot = [...new Set([startDirectory, process.cwd()])]
    .map(findWorkspaceRootFrom)
    .find((directory) => directory !== undefined);

  if (workspaceRoot === undefined) {
    throw new Error(
      `Could not find pnpm-workspace.yaml above ${startDirectory} or ${process.cwd()}.`,
    );
  }

  return workspaceRoot;
};

const workspaceRoot = findWorkspaceRoot();

/** Resolve repository-owned files without depending on the process working directory. */
export const workspacePath = (...segments: string[]): string =>
  path.join(workspaceRoot, ...segments);
