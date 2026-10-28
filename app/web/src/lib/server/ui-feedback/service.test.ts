import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import * as Schema from 'effect/Schema';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { submitUiFeedback } from '#lib/server/ui-feedback/service.js';
import { mockUiFeedback } from '#lib/test-fixtures.js';
import { DeliveryStatus, FeedbackSchema, RetryAction } from '#lib/ui-feedback/schema.js';
import type { Submission } from '#lib/ui-feedback/schema.js';

const pngDataUrl =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7PsAAAAASUVORK5CYII=';

let workspaceRoot: string;
let feedback: ReturnType<typeof mockUiFeedback>;
let submission: Submission;

interface HerdrAgent {
  agent: string;
  agent_status: string;
  cwd?: string;
  foreground_cwd?: string;
  interactive_ready?: boolean;
  name?: string;
  pane_id: string;
}

type HerdrResponseResult =
  | { agents: HerdrAgent[] }
  | { panes: { cwd?: string; pane_id: string }[] }
  | { source: { repo_root: string }; worktrees: { open_workspace_id?: string; path: string }[] }
  | { started: boolean }
  | { submitted: boolean };

const mockHerdrResponse = (id: string, result: HerdrResponseResult) =>
  JSON.stringify({ id, result });

const mockService =
  (
    root: string,
    runCommand: (args: readonly string[]) => string | Promise<string>,
    herdrEnvironment = '1',
  ) =>
  async (input: Submission, signal: AbortSignal = new AbortController().signal) =>
    await submitUiFeedback(input, {
      herdrEnvironment,
      receiptTimeoutMs: 500,
      runCommand: async (args) => await runCommand(args),
      signal,
      workspaceRoot: root,
    });

const mockAgentListResponse = (...agents: HerdrAgent[]) =>
  mockHerdrResponse('cli:agent:list', { agents });

const readyAgent = (root: string, name = 'feature-agent'): HerdrAgent => ({
  agent: 'codex',
  agent_status: 'idle',
  cwd: root,
  interactive_ready: true,
  name,
  pane_id: 'w1:p1',
});

const commandArgument = (args: readonly string[], index: number): string =>
  Schema.decodeUnknownSync(Schema.String)(args[index]);

const requirePath = (value: string | undefined | null): string =>
  Schema.decodeUnknownSync(Schema.String)(value);

const receiptPathFrom = (prompt: string): string => {
  const receipt = /Receipt file to create: (?<receipt>[^\n]+)/u.exec(prompt)?.groups?.['receipt'];

  return Schema.decodeUnknownSync(Schema.String)(receipt);
};

type CommandHandler = (args: readonly string[]) => string | Promise<string>;

const mockCommandRouter =
  (routes: Readonly<Record<string, CommandHandler>>) => async (args: readonly string[]) => {
    const route = routes[args.slice(0, 2).join(' ')];

    const unexpectedCommand = () => {
      throw new Error(`Unexpected command: ${args.join(' ')}`);
    };

    return await (route ?? unexpectedCommand)(args);
  };

describe('UI feedback delivery service', () => {
  beforeEach(async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'ui-feedback-'));
    workspaceRoot = root;
    feedback = mockUiFeedback();
    submission = { feedback, screenshot: pngDataUrl };

    return async () => {
      await rm(root, { force: true, recursive: true });
    };
  });

  it('saves feedback without routing when the server is outside Herdr', async () => {
    const runCommand = vi.fn<(args: readonly string[]) => Promise<string>>();

    const result = await mockService(workspaceRoot, runCommand, '')(submission);

    expect(result.message).toContain('not running inside Herdr');
    expect(result.status).toBe(DeliveryStatus.Failed);

    expect(result).toHaveProperty('retry', RetryAction.Send);
    expect(runCommand).not.toHaveBeenCalled();
  });

  it('offers only Codex agents attached to this worktree when a choice is needed', async () => {
    await mkdir(path.join(workspaceRoot, 'apps', 'web'), { recursive: true });
    const calls: string[][] = [];

    const service = mockService(workspaceRoot, (args) => {
      calls.push([...args]);

      return mockAgentListResponse(
        {
          agent: 'codex',
          agent_status: 'idle',
          cwd: workspaceRoot,
          name: 'feature-a',
          pane_id: 'w1:p1',
        },
        {
          agent: 'codex',
          agent_status: 'idle',
          foreground_cwd: path.join(workspaceRoot, 'apps/web'),
          name: 'feature-b',
          pane_id: 'w1:p2',
        },
        {
          agent: 'codex',
          agent_status: 'idle',
          cwd: path.dirname(workspaceRoot),
          name: 'main-agent',
          pane_id: 'w2:p1',
        },
        {
          agent: 'codex',
          agent_status: 'idle',
          cwd: path.join(workspaceRoot, '.worktrees', 'other'),
          name: 'nested-worktree',
          pane_id: 'w3:p1',
        },
        {
          agent: 'pi',
          agent_status: 'idle',
          cwd: workspaceRoot,
          name: 'pi-agent',
          pane_id: 'w4:p1',
        },
      );
    });

    const result = await service(submission);

    expect(result).toMatchObject({
      sessions: [{ id: 'feature-a' }, { id: 'feature-b' }],
      status: DeliveryStatus.Choose,
    });
    expect(calls).toStrictEqual([['agent', 'list']]);
    await expect(readFile(requirePath(result.files?.feedbackPath), 'utf-8')).resolves.toContain(
      feedback.note,
    );
  });

  it('reuses an unnamed Codex agent by its pane ID', async () => {
    const calls: string[][] = [];

    const routes = mockCommandRouter({
      'agent list': () =>
        mockAgentListResponse({
          agent: 'codex',
          agent_status: 'idle',
          foreground_cwd: workspaceRoot,
          interactive_ready: true,
          pane_id: 'w1:p9',
        }),
      'agent prompt': async (args) => {
        expect(args[2]).toBe('w1:p9');
        await writeFile(receiptPathFrom(commandArgument(args, 3)), feedback.id, { flag: 'wx' });

        return mockHerdrResponse('cli:agent:prompt', { submitted: true });
      },
    });

    const service = mockService(workspaceRoot, async (args) => {
      calls.push([...args]);

      return await routes(args);
    });

    const result = await service(submission);

    expect(result.status).toBe(DeliveryStatus.Delivered);
    expect(calls.map((call) => call.slice(0, 2))).toStrictEqual([
      ['agent', 'list'],
      ['agent', 'prompt'],
    ]);
  });

  it('saves before dispatch and requires a matching receipt; retries do not resend', async () => {
    let promptCount = 0;
    let receiptPath = '';

    const routes = mockCommandRouter({
      'agent list': () => mockAgentListResponse(readyAgent(workspaceRoot)),
      'agent prompt': async (args) => {
        promptCount += 1;
        receiptPath = receiptPathFrom(commandArgument(args, 3));

        const saved = Schema.decodeUnknownSync(FeedbackSchema)(
          JSON.parse(
            await readFile(path.join(workspaceRoot, '.ui-feedback', 'feedback-1.json'), 'utf-8'),
          ),
        );

        expect(saved.id).toBe(feedback.id);
        await writeFile(receiptPath, feedback.id, { flag: 'wx' });

        return mockHerdrResponse('cli:agent:prompt', { submitted: true });
      },
    });

    const service = mockService(workspaceRoot, routes);

    const first = await service(submission);
    const second = await service(submission);

    expect(first.status).toBe(DeliveryStatus.Delivered);
    expect(second.status).toBe(DeliveryStatus.Delivered);
    expect(promptCount).toBe(1);
    await expect(readFile(receiptPath, 'utf-8')).resolves.toBe(feedback.id);
    await expect(readFile(requirePath(first.files?.screenshotPath), 'utf-8')).resolves.toContain(
      'PNG',
    );
  });

  it('starts a Codex agent in the exact worktree when none is attached', async () => {
    const calls: string[][] = [];
    let prompt = '';
    let startedName = '';

    let agentListingIndex = 0;

    const agentListings = [
      () => mockAgentListResponse(),
      () =>
        mockAgentListResponse({
          ...readyAgent(workspaceRoot, startedName),
          foreground_cwd: workspaceRoot,
        }),
    ];

    const routes = mockCommandRouter({
      'agent list': () => {
        const listing = agentListings[agentListingIndex];
        expect.assert(listing, `Missing agent listing at index ${agentListingIndex}.`);

        agentListingIndex += 1;

        return listing();
      },
      'agent prompt': async (args) => {
        prompt = commandArgument(args, 3);
        await writeFile(receiptPathFrom(prompt), feedback.id, { flag: 'wx' });

        return mockHerdrResponse('cli:agent:prompt', { submitted: true });
      },
      'agent start': (args) => {
        startedName = commandArgument(args, 2);

        return mockHerdrResponse('cli:agent:start', { started: true });
      },
      'pane list': () =>
        mockHerdrResponse('cli:pane:list', { panes: [{ cwd: workspaceRoot, pane_id: 'w1:p1' }] }),
      'worktree list': () =>
        mockHerdrResponse('cli:worktree:list', {
          source: { repo_root: workspaceRoot },
          worktrees: [{ open_workspace_id: 'w1', path: workspaceRoot }],
        }),
    });

    const service = mockService(workspaceRoot, async (args) => {
      calls.push([...args]);

      return await routes(args);
    });

    const result = await service(submission);

    expect(result.status).toBe(DeliveryStatus.Delivered);
    expect(calls.map((call) => call.slice(0, 2))).toStrictEqual([
      ['agent', 'list'],
      ['worktree', 'list'],
      ['pane', 'list'],
      ['agent', 'start'],
      ['agent', 'list'],
      ['agent', 'prompt'],
    ]);
    expect(prompt).toContain(
      `Feedback JSON: ${path.join(workspaceRoot, '.ui-feedback', `${feedback.id}.json`)}`,
    );
    expect(prompt).toContain(
      'Relative Svelte source paths are relative to apps/web in this worktree',
    );
  });

  it('prevents concurrent duplicate IDs from prompting more than once', async () => {
    let promptCount = 0;

    const service = mockService(
      workspaceRoot,
      mockCommandRouter({
        'agent list': () =>
          mockAgentListResponse({
            ...readyAgent(workspaceRoot),
            name: 'feature-agent',
          }),
        'agent prompt': async (args) => {
          promptCount += 1;
          await delay(20);
          await writeFile(receiptPathFrom(commandArgument(args, 3)), feedback.id, { flag: 'wx' });

          return mockHerdrResponse('cli:agent:prompt', { submitted: true });
        },
      }),
    );

    const [first, second] = await Promise.all([service(submission), service(submission)]);

    expect([first.status, second.status]).toContain(DeliveryStatus.Delivered);
    expect([first.status, second.status]).not.toContain(DeliveryStatus.Choose);
    expect(promptCount).toBe(1);
  });

  it('does not retry an ambiguous delivery without a receipt', async () => {
    let promptCount = 0;

    const service = mockService(
      workspaceRoot,
      mockCommandRouter({
        'agent list': () =>
          mockAgentListResponse({
            ...readyAgent(workspaceRoot),
          }),
        'agent prompt': () => {
          promptCount += 1;
          throw new Error('prompt timed out after submission');
        },
      }),
    );

    const first = await service(submission);
    const second = await service(submission);

    expect(first.status).toBe(DeliveryStatus.Failed);
    expect(first.message).toContain('verifiable receipt');
    expect(second.status).toBe(DeliveryStatus.Failed);
    expect(second.message).toContain('was not sent again');
    expect(promptCount).toBe(1);
  }, 10_000);

  it('accepts a receipt that arrives shortly after the prompt command returns', async () => {
    const service = mockService(
      workspaceRoot,
      mockCommandRouter({
        'agent list': () =>
          mockAgentListResponse({
            ...readyAgent(workspaceRoot),
          }),
        'agent prompt': (args) => {
          const receipt = receiptPathFrom(commandArgument(args, 3));

          const writeReceiptSoon = async () => {
            await delay(150);
            await writeFile(receipt, feedback.id, { flag: 'wx' });
          };

          void writeReceiptSoon();

          return mockHerdrResponse('cli:agent:prompt', { submitted: true });
        },
      }),
    );

    const result = await service(submission);

    expect(result.status).toBe(DeliveryStatus.Delivered);
  }, 10_000);

  it('does no work when already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const runCommand = vi.fn<(args: readonly string[]) => Promise<string>>();

    const result = await submitUiFeedback(submission, {
      runCommand,
      signal: controller.signal,
      workspaceRoot,
    });

    expect(result).toMatchObject({ retry: RetryAction.Send, status: DeliveryStatus.Failed });
    expect(runCommand).not.toHaveBeenCalled();
    await expect(
      readFile(path.join(workspaceRoot, '.ui-feedback', `${feedback.id}.json`)),
    ).rejects.toThrow('ENOENT');
  });

  it('cancels receipt polling after dispatch without making a retry send', async () => {
    const controller = new AbortController();
    let promptCount = 0;

    const service = mockService(
      workspaceRoot,
      mockCommandRouter({
        'agent list': () =>
          mockAgentListResponse({
            ...readyAgent(workspaceRoot),
          }),
        'agent prompt': () => {
          promptCount += 1;
          setTimeout(() => {
            controller.abort();
          }, 25);

          return mockHerdrResponse('cli:agent:prompt', { submitted: true });
        },
      }),
    );

    const result = await service(submission, controller.signal);
    const retry = await service(submission);

    expect(result).toMatchObject({ retry: RetryAction.Check, status: DeliveryStatus.Failed });
    expect(retry.message).toContain('was not sent again');
    expect(promptCount).toBe(1);
  });

  it('lets a cancelled request finish without blocking an in-flight delivery', async () => {
    const started = Promise.withResolvers<null>();
    const release = Promise.withResolvers<null>();
    const controller = new AbortController();
    controller.abort();
    const calls: string[][] = [];

    const routes = mockCommandRouter({
      'agent list': async () => {
        started.resolve(null);
        await release.promise;

        return mockAgentListResponse({
          ...readyAgent(workspaceRoot),
        });
      },
      'agent prompt': async (args) => {
        await writeFile(receiptPathFrom(commandArgument(args, 3)), feedback.id, { flag: 'wx' });

        return mockHerdrResponse('cli:agent:prompt', { submitted: true });
      },
    });

    const service = mockService(workspaceRoot, async (args) => {
      calls.push([...args]);

      return await routes(args);
    });

    const first = service(submission);
    await started.promise;
    const second = service(submission, controller.signal);
    await expect(second).resolves.toMatchObject({ status: DeliveryStatus.Failed });
    expect(calls.map((call) => call.slice(0, 2))).toStrictEqual([['agent', 'list']]);
    release.resolve(null);

    await expect(first).resolves.toMatchObject({ status: DeliveryStatus.Delivered });
    expect(calls.map((call) => call.slice(0, 2))).toStrictEqual([
      ['agent', 'list'],
      ['agent', 'prompt'],
    ]);
  });

  it('rejects PNG geometry that disagrees with the viewport before writing or dispatching', async () => {
    const runCommand = vi.fn<(args: readonly string[]) => Promise<string>>();

    const result = await submitUiFeedback(
      {
        feedback: { ...feedback, viewport: { ...feedback.viewport, width: 2 } },
        screenshot: pngDataUrl,
      },
      { runCommand, workspaceRoot },
    );

    expect(result.status).toBe(DeliveryStatus.Failed);
    expect(result.message).toContain('viewport geometry');
    expect(result.files).toBeNull();
    expect(runCommand).not.toHaveBeenCalled();
  });
});
