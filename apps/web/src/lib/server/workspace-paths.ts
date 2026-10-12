import { accessSync, constants } from 'node:fs';
import { dirname, join, parse } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Find the repository root from a path inside the workspace or its build output. */
export function findWorkspaceRoot(
  startDirectory = dirname(fileURLToPath(import.meta.url)),
): string {
  for (const start of new Set([startDirectory, process.cwd()])) {
    let directory = start;
    const root = parse(directory).root;

    while (true) {
      try {
        accessSync(join(directory, 'pnpm-workspace.yaml'), constants.R_OK);
        return directory;
      } catch {
        if (directory === root) break;
        directory = dirname(directory);
      }
    }
  }

  throw new Error(
    `Could not find pnpm-workspace.yaml above ${startDirectory} or ${process.cwd()}.`,
  );
}

const workspaceRoot = findWorkspaceRoot();

/** Resolve repository-owned files without depending on the process working directory. */
export function workspacePath(...segments: string[]): string {
  return join(workspaceRoot, ...segments);
}
