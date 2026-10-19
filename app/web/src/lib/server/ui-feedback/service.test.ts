import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import * as Schema from 'effect/Schema';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { submitUiFeedback } from '#lib/server/ui-feedback/service.js';
import { mockUiFeedback } from '#lib/test-fixtures.js';
import { DeliveryStatus, FeedbackSchema, RetryAction } from '#lib/ui-feedback/schema.js';
import type { Submission } from '#lib/ui-feedback/schema.js';

const directories: string[] = [];

const pngDataUrl =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7PsAAAAASUVORK5CYII=';

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
  async (submission: Submission, signal: AbortSignal = new AbortController().signal) =>
    await submitUiFeedback(submission, {
      herdrEnvironment,
      receiptTimeoutMs: 500,
      runCommand: async (args) => await runCommand(args),
      signal,
      workspaceRoot: root,
    });

const fixtureDirectory = async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ui-feedback-'));
  directories.push(directory);

  return directory;
};

const mockAgentListResponse = (...agents: HerdrAgent[]) =>
  mockHerdrResponse('cli:agent:list', { agents });

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
  afterEach(async () => {
    await Promise.all(
      directories.splice(0).map(async (directory) => {
        await rm(directory, { force: true, recursive: true });
      }),
    );
  });

  it('saves feedback without routing when the server is outside Herdr', async () => {
    const feedback = mockUiFeedback();
    const root = await fixtureDirectory();
    const runCommand = vi.fn<(args: readonly string[]) => Promise<string>>();
    const result = await mockService(root, runCommand, '')({ feedback, screenshot: pngDataUrl });

    expect(result.message).toContain('not running inside Herdr');
    expect(result.status).toBe(DeliveryStatus.Failed);

    expect(result).toHaveProperty('retry', RetryAction.Send);
    expect(runCommand).not.toHaveBeenCalled();
  });

  it('offers only Codex agents attached to this worktree when a choice is needed', async () => {
    const feedback = mockUiFeedback();
    const root = await fixtureDirectory();
    await mkdir(path.join(root, 'apps', 'web'), { recursive: true });
    const calls: string[][] = [];

    const service = mockService(root, (args) => {
      calls.push([...args]);

      return mockAgentListResponse(
        { agent: 'codex', agent_status: 'idle', cwd: root, name: 'feature-a', pane_id: 'w1:p1' },
        {
          agent: 'codex',
          agent_status: 'idle',
          foreground_cwd: path.join(root, 'apps/web'),
          name: 'feature-b',
          pane_id: 'w1:p2',
        },
        {
          agent: 'codex',
          agent_status: 'idle',
          cwd: path.dirname(root),
          name: 'main-agent',
          pane_id: 'w2:p1',
        },
        {
          agent: 'codex',
          agent_status: 'idle',
          cwd: path.join(root, '.worktrees', 'other'),
          name: 'nested-worktree',
          pane_id: 'w3:p1',
        },
        { agent: 'pi', agent_status: 'idle', cwd: root, name: 'pi-agent', pane_id: 'w4:p1' },
      );
    });

    const result = await service({ feedback, screenshot: pngDataUrl });

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
    const feedback = mockUiFeedback();
    const root = await fixtureDirectory();
    const calls: string[][] = [];

    const routes = mockCommandRouter({
      'agent list': () =>
        mockAgentListResponse({
          agent: 'codex',
          agent_status: 'idle',
          foreground_cwd: root,
          interactive_ready: true,
          pane_id: 'w1:p9',
        }),
      'agent prompt': async (args) => {
        expect(args[2]).toBe('w1:p9');
        await writeFile(receiptPathFrom(commandArgument(args, 3)), feedback.id, { flag: 'wx' });

        return mockHerdrResponse('cli:agent:prompt', { submitted: true });
      },
    });

    const service = mockService(root, async (args) => {
      calls.push([...args]);

      return await routes(args);
    });

    const result = await service({ feedback, screenshot: pngDataUrl });

    expect(result.status).toBe(DeliveryStatus.Delivered);
    expect(calls.map((call) => call.slice(0, 2))).toStrictEqual([
      ['agent', 'list'],
      ['agent', 'prompt'],
    ]);
  });

  it('saves before dispatch and requires a matching receipt; retries do not resend', async () => {
    const feedback = mockUiFeedback();
    const root = await fixtureDirectory();
    let promptCount = 0;
    let receiptPath = '';

    const routes = mockCommandRouter({
      'agent list': () =>
        mockAgentListResponse({
          agent: 'codex',
          agent_status: 'idle',
          cwd: root,
          interactive_ready: true,
          name: 'feature-agent',
          pane_id: 'w1:p1',
        }),
      'agent prompt': async (args) => {
        promptCount += 1;
        receiptPath = receiptPathFrom(commandArgument(args, 3));

        const saved = Schema.decodeUnknownSync(FeedbackSchema)(
          JSON.parse(await readFile(path.join(root, '.ui-feedback', 'feedback-1.json'), 'utf-8')),
        );

        expect(saved.id).toBe(feedback.id);
        await writeFile(receiptPath, feedback.id, { flag: 'wx' });

        return mockHerdrResponse('cli:agent:prompt', { submitted: true });
      },
    });

    const service = mockService(root, routes);

    const first = await service({ feedback, screenshot: pngDataUrl });
    const second = await service({ feedback, screenshot: pngDataUrl });

    expect(first.status).toBe(DeliveryStatus.Delivered);
    expect(second.status).toBe(DeliveryStatus.Delivered);
    expect(promptCount).toBe(1);
    await expect(readFile(receiptPath, 'utf-8')).resolves.toBe(feedback.id);
    await expect(readFile(requirePath(first.files?.screenshotPath), 'utf-8')).resolves.toContain(
      'PNG',
    );
  });

  it('starts a Codex agent in the exact worktree when none is attached', async () => {
    const feedback = mockUiFeedback();
    const root = await fixtureDirectory();
    const calls: string[][] = [];
    let prompt = '';
    let startedName = '';

    let agentListingIndex = 0;

    const agentListings = [
      () => mockAgentListResponse(),
      () =>
        mockAgentListResponse({
          agent: 'codex',
          agent_status: 'idle',
          foreground_cwd: root,
          interactive_ready: true,
          name: startedName,
          pane_id: 'w1:p1',
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
        mockHerdrResponse('cli:pane:list', { panes: [{ cwd: root, pane_id: 'w1:p1' }] }),
      'worktree list': () =>
        mockHerdrResponse('cli:worktree:list', {
          source: { repo_root: root },
          worktrees: [{ open_workspace_id: 'w1', path: root }],
        }),
    });

    const service = mockService(root, async (args) => {
      calls.push([...args]);

      return await routes(args);
    });

    const result = await service({ feedback, screenshot: pngDataUrl });

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
      `Feedback JSON: ${path.join(root, '.ui-feedback', `${feedback.id}.json`)}`,
    );
    expect(prompt).toContain(
      'Relative Svelte source paths are relative to apps/web in this worktree',
    );
  });

  it('prevents concurrent duplicate IDs from prompting more than once', async () => {
    const feedback = mockUiFeedback();
    const root = await fixtureDirectory();
    let promptCount = 0;

    const service = mockService(
      root,
      mockCommandRouter({
        'agent list': () =>
          mockAgentListResponse({
            agent: 'codex',
            agent_status: 'idle',
            cwd: root,
            interactive_ready: true,
            name: 'feature-agent',
            pane_id: 'w1:p1',
          }),
        'agent prompt': async (args) => {
          promptCount += 1;
          await delay(20);
          await writeFile(receiptPathFrom(commandArgument(args, 3)), feedback.id, { flag: 'wx' });

          return mockHerdrResponse('cli:agent:prompt', { submitted: true });
        },
      }),
    );

    const [first, second] = await Promise.all([
      service({ feedback, screenshot: pngDataUrl }),
      service({ feedback, screenshot: pngDataUrl }),
    ]);

    expect([first.status, second.status]).toContain(DeliveryStatus.Delivered);
    expect([first.status, second.status]).not.toContain(DeliveryStatus.Choose);
    expect(promptCount).toBe(1);
  });

  it('does not retry an ambiguous delivery without a receipt', async () => {
    const feedback = mockUiFeedback();
    const root = await fixtureDirectory();
    let promptCount = 0;

    const service = mockService(
      root,
      mockCommandRouter({
        'agent list': () =>
          mockAgentListResponse({
            agent: 'codex',
            agent_status: 'idle',
            cwd: root,
            interactive_ready: true,
            name: 'feature-agent',
            pane_id: 'w1:p1',
          }),
        'agent prompt': () => {
          promptCount += 1;
          throw new Error('prompt timed out after submission');
        },
      }),
    );

    const first = await service({ feedback, screenshot: pngDataUrl });
    const second = await service({ feedback, screenshot: pngDataUrl });

    expect(first.status).toBe(DeliveryStatus.Failed);
    expect(first.message).toContain('verifiable receipt');
    expect(second.status).toBe(DeliveryStatus.Failed);
    expect(second.message).toContain('was not sent again');
    expect(promptCount).toBe(1);
  }, 10_000);

  it('accepts a receipt that arrives shortly after the prompt command returns', async () => {
    const feedback = mockUiFeedback();
    const root = await fixtureDirectory();

    const service = mockService(
      root,
      mockCommandRouter({
        'agent list': () =>
          mockAgentListResponse({
            agent: 'codex',
            agent_status: 'idle',
            cwd: root,
            interactive_ready: true,
            name: 'feature-agent',
            pane_id: 'w1:p1',
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

    const result = await service({ feedback, screenshot: pngDataUrl });

    expect(result.status).toBe(DeliveryStatus.Delivered);
  }, 10_000);

  it('does no work when already aborted', async () => {
    const feedback = mockUiFeedback();
    const root = await fixtureDirectory();
    const controller = new AbortController();
    controller.abort();
    const runCommand = vi.fn<(args: readonly string[]) => Promise<string>>();

    const result = await submitUiFeedback(
      { feedback, screenshot: pngDataUrl },
      { runCommand, signal: controller.signal, workspaceRoot: root },
    );

    expect(result).toMatchObject({ retry: RetryAction.Send, status: DeliveryStatus.Failed });
    expect(runCommand).not.toHaveBeenCalled();
    await expect(readFile(path.join(root, '.ui-feedback', `${feedback.id}.json`))).rejects.toThrow(
      'ENOENT',
    );
  });

  it('cancels receipt polling after dispatch without making a retry send', async () => {
    const feedback = mockUiFeedback();
    const root = await fixtureDirectory();
    const controller = new AbortController();
    let promptCount = 0;

    const service = mockService(
      root,
      mockCommandRouter({
        'agent list': () =>
          mockAgentListResponse({
            agent: 'codex',
            agent_status: 'idle',
            cwd: root,
            interactive_ready: true,
            name: 'feature-agent',
            pane_id: 'w1:p1',
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

    const result = await service({ feedback, screenshot: pngDataUrl }, controller.signal);
    const retry = await service({ feedback, screenshot: pngDataUrl });

    expect(result).toMatchObject({ retry: RetryAction.Check, status: DeliveryStatus.Failed });
    expect(retry.message).toContain('was not sent again');
    expect(promptCount).toBe(1);
  });

  it('lets a cancelled request finish without blocking an in-flight delivery', async () => {
    const feedback = mockUiFeedback();
    const root = await fixtureDirectory();
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
          agent: 'codex',
          agent_status: 'idle',
          cwd: root,
          interactive_ready: true,
          name: 'feature-agent',
          pane_id: 'w1:p1',
        });
      },
      'agent prompt': async (args) => {
        await writeFile(receiptPathFrom(commandArgument(args, 3)), feedback.id, { flag: 'wx' });

        return mockHerdrResponse('cli:agent:prompt', { submitted: true });
      },
    });

    const service = mockService(root, async (args) => {
      calls.push([...args]);

      return await routes(args);
    });

    const first = service({ feedback, screenshot: pngDataUrl });
    await started.promise;
    const second = service({ feedback, screenshot: pngDataUrl }, controller.signal);
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
    const feedback = mockUiFeedback();
    const root = await fixtureDirectory();
    const runCommand = vi.fn<(args: readonly string[]) => Promise<string>>();

    const result = await submitUiFeedback(
      {
        feedback: { ...feedback, viewport: { ...feedback.viewport, width: 2 } },
        screenshot: pngDataUrl,
      },
      { runCommand, workspaceRoot: root },
    );

    expect(result.status).toBe(DeliveryStatus.Failed);
    expect(result.message).toContain('viewport geometry');
    expect(result.files).toBeNull();
    expect(runCommand).not.toHaveBeenCalled();
  });
});
