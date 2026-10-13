import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { text } from 'node:stream/consumers';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const webRoot = path.resolve(repoRoot, 'apps/web');
const packCliRoot = path.resolve(repoRoot, 'apps/pack-cli');

const patchPathPattern = /^(?<prefix>\*\*\* (?:Add File|Update File|Move to): )(?<filePath>.+)$/u;
const appRoots = [{ root: webRoot }, { root: packCliRoot }] as const;

interface HookPayload extends Record<string, unknown> {
  cwd?: unknown;
  hook_event_name?: unknown;
  tool_input?: unknown;
  tool_name?: unknown;
}

interface FixCommand {
  args: string[];
  cwd: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const getRepoRelativePath = (filePath: string, basePath: string): string | null => {
  const absolutePath = path.resolve(basePath, filePath.replaceAll('\\', path.sep));
  const repoRelativePath = path.relative(repoRoot, absolutePath);

  if (
    repoRelativePath === '' ||
    repoRelativePath === '..' ||
    repoRelativePath.startsWith(`..${path.sep}`)
  ) {
    return null;
  }

  return repoRelativePath;
};

const getPatchInput = (
  payload: HookPayload,
): { command: string; toolInput: Record<string, unknown> } | null => {
  if (payload.hook_event_name !== 'PostToolUse') {
    return null;
  }
  if (payload.tool_name !== 'apply_patch') {
    return null;
  }

  const toolInput = payload.tool_input;
  if (!isRecord(toolInput)) {
    return null;
  }

  const { command } = toolInput;
  return typeof command === 'string' ? { command, toolInput } : null;
};

const extractPatchPaths = (patchCommand: string): string[] => {
  const lines = patchCommand.split('\n');

  return lines.flatMap((rawLine, index) => {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    const filePath = patchPathPattern.exec(line)?.groups?.['filePath']?.trim();

    if (filePath === undefined || filePath.length === 0) {
      return [];
    }

    const isMoveSource =
      line.startsWith('*** Update File: ') &&
      lines[index + 1]?.startsWith('*** Move to: ') === true;

    return isMoveSource ? [] : [filePath];
  });
};

const normalizePatchPaths = (patchCommand: string, basePath: string): string =>
  patchCommand
    .split('\n')
    .map((line) => {
      const hasCarriageReturn = line.endsWith('\r');
      const content = hasCarriageReturn ? line.slice(0, -1) : line;
      const match = patchPathPattern.exec(content);
      const prefix = match?.groups?.['prefix'];
      const filePath = match?.groups?.['filePath']?.trim();
      if (prefix === undefined || filePath === undefined) {
        return line;
      }

      const repoRelativePath = getRepoRelativePath(filePath, basePath);
      if (repoRelativePath === null) {
        return line;
      }

      const lineEnding = hasCarriageReturn ? '\r' : '';
      return `${prefix}${path.resolve(repoRoot, repoRelativePath)}${lineEnding}`;
    })
    .join('\n');

const makeFixCommands = (repoRelativePaths: string[]): FixCommand[] => {
  const targetsByRoot = repoRelativePaths.map((repoRelativePath) => {
    const absolutePath = path.resolve(repoRoot, repoRelativePath);

    const app = appRoots.find(({ root }) => {
      const pathFromRoot = path.relative(root, absolutePath);
      return (
        pathFromRoot !== '' && pathFromRoot !== '..' && !pathFromRoot.startsWith(`..${path.sep}`)
      );
    });

    return {
      cwd: app?.root ?? repoRoot,
      target: absolutePath,
    };
  });

  const roots = [...new Set(targetsByRoot.map(({ cwd }) => cwd))];
  return roots.map((cwd) => ({
    args: [
      'exec',
      'ultracite',
      'fix',
      '--hook',
      ...targetsByRoot.filter((entry) => entry.cwd === cwd).map(({ target }) => target),
    ],
    cwd,
  }));
};

const getHookWorkingDirectory = (payload: HookPayload): string => {
  const { cwd } = payload;
  return typeof cwd === 'string' && path.isAbsolute(cwd) ? cwd : repoRoot;
};

const main = async (): Promise<void> => {
  const input = await text(process.stdin);
  if (input.trim() === '') {
    return;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(input) as unknown;
  } catch {
    process.stderr.write('Ultracite hook received invalid JSON; skipping fixes.\n');
    process.exitCode = 1;
    return;
  }

  if (!isRecord(payload)) {
    return;
  }

  const patchInput = getPatchInput(payload);
  if (patchInput === null) {
    return;
  }

  const { command: patchCommand, toolInput } = patchInput;
  const sessionCwd = getHookWorkingDirectory(payload);
  const targets = [
    ...new Set(
      extractPatchPaths(patchCommand)
        .map((target) => getRepoRelativePath(target, sessionCwd))
        .filter((target): target is string => target !== null),
    ),
  ];
  const commands = makeFixCommands(targets);
  if (commands.length === 0) {
    return;
  }

  const hookInput = JSON.stringify({
    ...payload,
    tool_input: {
      ...toolInput,
      command: normalizePatchPaths(patchCommand, sessionCwd),
    },
  });
  for (const command of commands) {
    const result = spawnSync('pnpm', command.args, {
      cwd: command.cwd,
      input: hookInput,
      // Keep Ultracite's output visible while piping the hook JSON to its stdin.
      stdio: ['pipe', 'inherit', 'inherit'],
    });

    if (result.error) {
      process.stderr.write(`Failed to start Ultracite: ${result.error.message}\n`);
      process.exitCode = 1;
      return;
    }

    if (result.status !== 0) {
      process.exitCode = result.status ?? 1;
      return;
    }
  }
};

await main();
