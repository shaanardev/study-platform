import { accessSync, constants } from 'node:fs';
import path from 'node:path';

/** Find the repository root from a path inside the workspace or its build output. */
export const findWorkspaceRoot = (startDirectory = import.meta.dirname): string => {
  for (const start of new Set([startDirectory, process.cwd()])) {
    let directory = start;
    const { root } = path.parse(directory);

    while (true) {
      try {
        accessSync(path.join(directory, 'pnpm-workspace.yaml'), constants.R_OK);
        return directory;
      } catch {
        if (directory === root) {
          break;
        }
        directory = path.dirname(directory);
      }
    }
  }

  throw new Error(
    `Could not find pnpm-workspace.yaml above ${startDirectory} or ${process.cwd()}.`,
  );
};

const workspaceRoot = findWorkspaceRoot();

/** Resolve repository-owned files without depending on the process working directory. */
export const workspacePath = (...segments: string[]): string =>
  path.join(workspaceRoot, ...segments);
