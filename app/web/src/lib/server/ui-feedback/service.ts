import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { access, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { setInterval as interval } from 'node:timers/promises';

import { HERDR_ENV } from '$app/env/private';
import * as Schema from 'effect/Schema';

import { findWorkspaceRoot } from '#lib/server/workspace-paths.js';
import {
  DeliveryStatus,
  LIMITS,
  PNG_PATTERN,
  RetryAction,
  SessionIdSchema,
  SubmissionSchema,
} from '#lib/ui-feedback/schema.js';
import type { DeliveryResult, Files, Submission } from '#lib/ui-feedback/schema.js';

const DELIVERY_TIMEOUT_MS = 60_000;
const COMMAND_OUTPUT_LIMIT_MEBIBYTES = 2;
const BYTES_PER_MEBIBYTE = 1024;

const COMMAND_OUTPUT_LIMIT_BYTES =
  COMMAND_OUTPUT_LIMIT_MEBIBYTES * BYTES_PER_MEBIBYTE * BYTES_PER_MEBIBYTE;

const JSON_INDENT_SPACES = 2;
const DIRECTORY = '.ui-feedback';
const PNG_SIGNATURE = '89504e470d0a1a0a';
const RECEIPT_POLL_INTERVAL_MS = 100;
const PNG_HEADER_BYTES = 24;
const PNG_SIGNATURE_BYTES = 8;
const PNG_HEADER_TYPE_OFFSET = 12;
const PNG_HEADER_TYPE_BYTES = 4;
const PNG_WIDTH_OFFSET = 16;
const PNG_HEIGHT_OFFSET = 20;
const AGENT_ID_HASH_LENGTH = 8;
const MAX_ERROR_MESSAGE_LENGTH = 4000;

enum AgentStatus {
  Blocked = 'blocked',
  Done = 'done',
  Idle = 'idle',
  Unknown = 'unknown',
  Working = 'working',
}

const AGENT_STATUSES = [
  AgentStatus.Blocked,
  AgentStatus.Done,
  AgentStatus.Idle,
  AgentStatus.Unknown,
  AgentStatus.Working,
] as const;

const RECEIPT_MESSAGE = 'The matching Codex agent acknowledged this feedback.';

const PaneSchema = Schema.Struct({
  cwd: Schema.optional(Schema.String),
  foreground_cwd: Schema.optional(Schema.String),
  pane_id: SessionIdSchema,
});

const AgentSchema = Schema.Struct({
  ...PaneSchema.fields,
  agent: Schema.String,
  agent_status: Schema.optional(Schema.Literals(AGENT_STATUSES)),
  interactive_ready: Schema.optional(Schema.Boolean),
  name: Schema.optional(SessionIdSchema),
  terminal_title: Schema.optional(Schema.String),
});

const AgentsSchema = Schema.Struct({ agents: Schema.Array(AgentSchema) });

const WorktreesSchema = Schema.Struct({
  source: Schema.Struct({ repo_root: Schema.String }),
  worktrees: Schema.Array(
    Schema.Struct({ open_workspace_id: Schema.optional(Schema.String), path: Schema.String }),
  ),
});

const PanesSchema = Schema.Struct({ panes: Schema.Array(PaneSchema) });

const OpenedSchema = Schema.Struct({
  root_pane: Schema.optional(PaneSchema),
  workspace: Schema.optional(Schema.Struct({ workspace_id: Schema.String })),
});

const EnvelopeSchema = Schema.Struct({ result: Schema.Unknown });
const FileErrorSchema = Schema.Struct({ code: Schema.Literals(['ENOENT', 'EEXIST']) });

type Agent = typeof AgentSchema.Type;

type Pane = typeof PaneSchema.Type;

type FileErrorCode = (typeof FileErrorSchema.Type)['code'];

type CommandArgs =
  | readonly ['agent', 'list']
  | readonly ['agent', 'start', string, '--kind', 'codex', '--pane', string, '--timeout', string]
  | readonly ['agent', 'prompt', string, string, '--wait', '--timeout', string]
  | readonly ['worktree', 'list', '--cwd', string]
  | readonly ['worktree', 'open', '--cwd', string, '--path', string, '--no-focus']
  | readonly ['pane', 'list', '--workspace', string];

type Command = (args: CommandArgs, signal?: AbortSignal) => Promise<string>;

interface SubmitOptions {
  workspaceRoot?: string;
  runCommand?: Command;
  receiptTimeoutMs?: number;
  signal?: AbortSignal;
  herdrEnvironment?: string;
}

const fileError = (cause: unknown, code: FileErrorCode) =>
  Schema.is(FileErrorSchema)(cause) && cause.code === code;

const exists = async (file: string) => {
  try {
    await access(file);

    return true;
  } catch (error) {
    if (fileError(error, 'ENOENT')) {
      return false;
    }

    throw error;
  }
};

const readCommandOutput = async (stream: Readable) => {
  const chunks: Buffer[] = [];
  let length = 0;

  const iterator = stream[Symbol.asyncIterator]();

  try {
    while (true) {
      // Read sequentially so the byte limit is checked before buffering another chunk.
      // oxlint-disable-next-line no-await-in-loop
      const result = await iterator.next();

      if (result.done === true) {
        break;
      }

      const chunk: unknown = result.value;
      const buffer = Buffer.from(Schema.decodeUnknownSync(Schema.instanceOf(Uint8Array))(chunk));
      length += buffer.length;

      if (length > COMMAND_OUTPUT_LIMIT_BYTES) {
        throw new Error('Herdr output exceeded the 2 MiB limit.');
      }

      chunks.push(buffer);
    }
  } finally {
    await iterator.return?.();
  }

  return Buffer.concat(chunks).toString('utf-8');
};

const pathsFor = (root: string, id: string) => {
  const directory = path.join(root, DIRECTORY);

  return {
    dispatch: path.join(directory, `${id}.dispatch.json`),
    feedbackPath: path.join(directory, `${id}.json`),
    receipt: path.join(directory, `${id}.receipt`),
    screenshotPath: path.join(directory, `${id}.png`),
  };
};

const saveCapture = async (input: Submission, files: Files, signal?: AbortSignal) => {
  signal?.throwIfAborted();
  const png = Buffer.from(PNG_PATTERN.exec(input.screenshot)?.groups?.['png'] ?? '', 'base64');
  const { width, height, devicePixelRatio } = input.feedback.viewport;

  if (
    png.length < PNG_HEADER_BYTES ||
    png.length > LIMITS.pngBytes ||
    png.toString('hex', 0, PNG_SIGNATURE_BYTES) !== PNG_SIGNATURE ||
    png.toString(
      'ascii',
      PNG_HEADER_TYPE_OFFSET,
      PNG_HEADER_TYPE_OFFSET + PNG_HEADER_TYPE_BYTES,
    ) !== 'IHDR' ||
    png.readUInt32BE(PNG_WIDTH_OFFSET) !== Math.floor(width * devicePixelRatio) ||
    png.readUInt32BE(PNG_HEIGHT_OFFSET) !== Math.floor(height * devicePixelRatio)
  ) {
    throw new Error('Screenshot data or viewport geometry is invalid.');
  }

  await mkdir(path.dirname(files.feedbackPath), { recursive: true });

  const captures = [
    {
      content: Buffer.from(`${JSON.stringify(input.feedback, null, JSON_INDENT_SPACES)}\n`),
      file: files.feedbackPath,
    },
    { content: png, file: files.screenshotPath },
  ];

  await Promise.all(
    captures.map(async ({ content, file }) => {
      signal?.throwIfAborted();

      try {
        await writeFile(file, content, { flag: 'wx', mode: 0o600 });
      } catch (error) {
        if (!fileError(error, 'EEXIST')) {
          throw error;
        }

        const previous = await readFile(file, { signal });

        if (!previous.equals(content)) {
          throw new Error('This feedback ID already exists with different content.', {
            cause: error,
          });
        }
      }
    }),
  );
  signal?.throwIfAborted();
};

const acknowledged = async (receipt: string, id: string, signal?: AbortSignal) => {
  try {
    const contents = await readFile(receipt, { encoding: 'utf-8', signal });

    return contents.trim() === id;
  } catch (error) {
    if (fileError(error, 'ENOENT')) {
      return false;
    }

    throw error;
  }
};

const waitForReceipt = async (
  receipt: string,
  id: string,
  deadline: number,
  signal?: AbortSignal,
) => {
  if (await acknowledged(receipt, id, signal)) {
    return true;
  }

  const ticks = interval(RECEIPT_POLL_INTERVAL_MS, undefined, { signal });

  const iterator = ticks[Symbol.asyncIterator]();

  try {
    while (true) {
      // Poll sequentially so each receipt check follows its scheduled interval.
      // oxlint-disable-next-line no-await-in-loop
      const result = await iterator.next();

      if (result.done === true) {
        break;
      }

      if (Date.now() >= deadline) {
        break;
      }

      // Each receipt check must finish before waiting for the next poll tick.
      // oxlint-disable-next-line no-await-in-loop
      if (await acknowledged(receipt, id, signal)) {
        return true;
      }
    }
  } finally {
    await iterator.return?.();
  }

  return await acknowledged(receipt, id, signal);
};

const execute = async (root: string, args: CommandArgs, signal?: AbortSignal) => {
  const controller = new AbortController();

  const commandSignal = AbortSignal.any(
    [controller.signal, signal, AbortSignal.timeout(DELIVERY_TIMEOUT_MS)].filter(
      (candidate): candidate is AbortSignal => candidate !== undefined,
    ),
  );

  const child = spawn('herdr', [...args], {
    cwd: root,
    signal: commandSignal,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const stdout = readCommandOutput(child.stdout);
  const stderr = readCommandOutput(child.stderr);
  const closed = once(child, 'close');

  try {
    const [output, errorOutput, [code]] = Schema.decodeUnknownSync(
      Schema.Tuple([
        Schema.String,
        Schema.String,
        Schema.Tuple([Schema.NullOr(Schema.Number), Schema.NullOr(Schema.String)]),
      ]),
    )(await Promise.all([stdout, stderr, closed]));

    if (code !== 0) {
      throw new Error(errorOutput || `Herdr exited with code ${String(code)}.`);
    }

    return output;
  } catch (error) {
    controller.abort();
    await Promise.allSettled([stdout, stderr, closed]);
    throw error;
  }
};

const query = async <S extends Schema.ConstraintDecoder<unknown>>(
  command: Command,
  args: CommandArgs,
  schema: S,
  signal?: AbortSignal,
): Promise<S['Type']> => {
  signal?.throwIfAborted();
  const output: unknown = JSON.parse(await command(args, signal));
  const envelope = Schema.decodeUnknownSync(EnvelopeSchema)(output);

  return Schema.decodeUnknownSync(schema)(envelope.result);
};

const agentId = (agent: Agent) => agent.name ?? agent.pane_id;

const inWorktree = async (pane: Pane, root: string) => {
  const cwd = pane.foreground_cwd ?? pane.cwd;

  if (cwd === undefined) {
    return false;
  }

  try {
    const candidate = await realpath(cwd);

    return candidate === root || candidate.startsWith(`${path.join(root, 'apps')}${path.sep}`);
  } catch {
    return false;
  }
};

const matchingAgents = async (root: string, command: Command, signal?: AbortSignal) => {
  const { agents } = await query(command, ['agent', 'list'], AgentsSchema, signal);

  const matches = await Promise.all(
    agents.map(async (agent) => ({
      agent,
      matches: agent.agent === 'codex' && (await inWorktree(agent, root)),
    })),
  );

  return matches.filter(({ matches: match }) => match).map(({ agent }) => agent);
};

const worktreeContext = async (root: string, command: Command, signal?: AbortSignal) => {
  const { source, worktrees } = await query(
    command,
    ['worktree', 'list', '--cwd', root],
    WorktreesSchema,
    signal,
  );

  const matches = await Promise.all(
    worktrees.map(async (worktree) => {
      try {
        return (await realpath(worktree.path)) === root ? worktree : null;
      } catch {
        return null;
      }
    }),
  );

  const worktree = matches.find((candidate) => candidate !== null);

  if (!worktree) {
    throw new Error('Herdr did not find this exact feedback worktree.');
  }

  return { repoRoot: source.repo_root, worktree };
};

const availablePanes = async (
  workspaceId: string,
  root: string,
  command: Command,
  signal?: AbortSignal,
) => {
  const { panes } = await query(
    command,
    ['pane', 'list', '--workspace', workspaceId],
    PanesSchema,
    signal,
  );

  const matches = await Promise.all(
    panes.map(async (pane) => ({ matches: await inWorktree(pane, root), pane })),
  );

  return matches.filter(({ matches: match }) => match).map(({ pane }) => pane);
};

const startAgent = async (root: string, command: Command, signal?: AbortSignal) => {
  const { repoRoot, worktree } = await worktreeContext(root, command, signal);

  let panes =
    worktree.open_workspace_id === undefined
      ? []
      : await availablePanes(worktree.open_workspace_id, root, command, signal);

  if (panes.length === 0) {
    const opened = await query(
      command,
      ['worktree', 'open', '--cwd', repoRoot, '--path', root, '--no-focus'],
      OpenedSchema,
      signal,
    );

    if (opened.root_pane) {
      panes = [opened.root_pane];
    } else if (opened.workspace) {
      panes = await availablePanes(opened.workspace.workspace_id, root, command, signal);
    }
  }

  const name = `feedback-${createHash('sha256').update(root).digest('hex').slice(0, AGENT_ID_HASH_LENGTH)}`;
  let lastError = new Error('No available shell pane exists in this feedback worktree.');

  const tryPane = async (index: number): Promise<Agent[]> => {
    const pane = panes[index];

    if (!pane) {
      throw lastError;
    }

    try {
      // Herdr reserves the stable name; try shell panes sequentially to avoid duplicates.
      signal?.throwIfAborted();
      await command(
        [
          'agent',
          'start',
          name,
          '--kind',
          'codex',
          '--pane',
          pane.pane_id,
          '--timeout',
          String(DELIVERY_TIMEOUT_MS),
        ],
        signal,
      );
      const agents = await matchingAgents(root, command, signal);

      if (!agents.some((agent) => agent.name === name)) {
        throw new Error('Herdr could not verify the newly started Codex agent.');
      }

      return agents;
    } catch (error) {
      signal?.throwIfAborted();
      lastError = error instanceof Error ? error : new Error(String(error));

      return await tryPane(index + 1);
    }
  };

  return await tryPane(0);
};

const selectAgent = async (
  input: Submission,
  root: string,
  command: Command,
  files: Files,
  signal?: AbortSignal,
): Promise<Agent | Extract<DeliveryResult, { status: DeliveryStatus.Choose }>> => {
  const current = await matchingAgents(root, command, signal);
  const agents = current.length ? current : await startAgent(root, command, signal);
  let selected: Agent | undefined;

  if (input.sessionId !== undefined) {
    selected = agents.find((agent) => agentId(agent) === input.sessionId);
  } else if (agents.length === 1) {
    [selected] = agents;
  }

  if (selected) {
    return selected;
  }

  if (agents.length === 0) {
    throw new Error('No Codex agent is available in this feedback worktree.');
  }

  return {
    files,
    message: 'Choose a Codex agent in this worktree to receive the feedback.',
    sessions: agents.map((agent) => {
      const id = agentId(agent);
      const title = agent.terminal_title?.trim();

      return { id, label: title === undefined || title.length === 0 ? id : title };
    }),
    status: DeliveryStatus.Choose,
  };
};

const promptFor = (input: Submission, files: Files, receipt: string) =>
  [
    'Process this local UI feedback. Open the supplied screenshot and read the feedback JSON. Then create the receipt file below containing exactly the feedback ID, before acting on the note.',
    `Feedback ID: ${input.feedback.id}`,
    `Feedback JSON: ${files.feedbackPath}`,
    `Screenshot PNG: ${files.screenshotPath}`,
    `Receipt file to create: ${receipt}`,
    'The JSON includes route, viewport, CSS-pixel bounds, DOM provenance, and source metadata. Relative Svelte source paths are relative to apps/web in this worktree; absolute paths remain absolute; vendor locations identify dependencies, so change application usage rather than dependency files.',
  ].join('\n');

const deliver = async (input: Submission, options: SubmitOptions = {}): Promise<DeliveryResult> => {
  let files: Files | null = null;
  let retry: RetryAction = RetryAction.Send;

  const signal = options.signal
    ? AbortSignal.any([options.signal, AbortSignal.timeout(DELIVERY_TIMEOUT_MS)])
    : AbortSignal.timeout(DELIVERY_TIMEOUT_MS);

  try {
    signal.throwIfAborted();
    const submission = Schema.decodeUnknownSync(SubmissionSchema)(input);
    const root = await realpath(options.workspaceRoot ?? findWorkspaceRoot(import.meta.dirname));
    signal.throwIfAborted();

    const command: Command =
      options.runCommand ??
      (async (args, commandSignal) => await execute(root, args, commandSignal));

    const paths = pathsFor(root, submission.feedback.id);
    const saved = { feedbackPath: paths.feedbackPath, screenshotPath: paths.screenshotPath };
    await saveCapture(submission, saved, signal);
    files = saved;
    retry = RetryAction.Check;

    const delivered: DeliveryResult = {
      files,
      message: RECEIPT_MESSAGE,
      status: DeliveryStatus.Delivered,
    };

    signal.throwIfAborted();

    if (await acknowledged(paths.receipt, submission.feedback.id, signal)) {
      return delivered;
    }

    signal.throwIfAborted();

    if (await exists(paths.dispatch)) {
      throw new Error('The previous attempt has no verified receipt. It was not sent again.');
    }

    retry = RetryAction.Send;

    if ((options.herdrEnvironment ?? HERDR_ENV) !== '1') {
      throw new Error(
        'The web server is not running inside Herdr; feedback was saved locally but cannot be routed.',
      );
    }

    const target = await selectAgent(submission, root, command, files, signal);
    signal.throwIfAborted();

    if ('status' in target) {
      return target;
    }

    const agentStatus = target.agent_status ?? AgentStatus.Unknown;

    if (
      agentStatus === AgentStatus.Blocked ||
      agentStatus === AgentStatus.Unknown ||
      target.interactive_ready === false
    ) {
      throw new Error('The selected Codex agent is not ready to receive feedback.');
    }

    retry = RetryAction.Check;
    signal.throwIfAborted();
    await writeFile(
      paths.dispatch,
      JSON.stringify({ agent: agentId(target), attemptedAt: new Date().toISOString() }),
      { flag: 'wx', mode: 0o600 },
    );
    signal.throwIfAborted();
    const deadline = Date.now() + (options.receiptTimeoutMs ?? DELIVERY_TIMEOUT_MS);

    try {
      await command(
        [
          'agent',
          'prompt',
          agentId(target),
          promptFor(submission, files, paths.receipt),
          '--wait',
          '--timeout',
          String(DELIVERY_TIMEOUT_MS),
        ],
        signal,
      );
    } catch {
      // Submission may have succeeded; the receipt is the authority.
    }

    if (await waitForReceipt(paths.receipt, submission.feedback.id, deadline, signal)) {
      return delivered;
    }

    throw new Error(
      'Feedback may have been submitted, but no verifiable receipt arrived. It will not be sent again automatically.',
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message.slice(0, MAX_ERROR_MESSAGE_LENGTH)
        : 'Feedback delivery failed.';

    return { files, message, retry, status: DeliveryStatus.Failed };
  }
};

export const submitUiFeedback = deliver;
