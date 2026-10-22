---
name: orchestrate
description: Delegate independent coding tasks to fresh Codex agents in named Herdr panes, using Work Trunk for isolated worktrees.
metadata:
  short-description: Orchestrate Codex workers with Herdr
---

# Agent Orchestration

Use Herdr CLI commands to launch and coordinate fresh Codex sessions in panes of the current Herdr window. Keep the calling session responsible for task selection, context handoff, decisions, review, and integration — not as a substitute implementation worker. The skill may be invoked with an optional tasks-axi backlog filename or path, for example `$orchestrate db-rewrite-backlog.md`.

## Procedure

1. The parent is a coordinator, not a worker. Delegate substantive repository work—investigation, implementation, tests, builds, and verification—even when it must run sequentially; give coupled work to one worker. Limit parent work to selecting and dispatching tasks, decisions only the parent can make, steering, brief handoff/diff review, integration, and task state. Work in the parent only when trivial or to resolve a specific integration gap.
2. Invoke `$worktrunk` when repository-specific Work Trunk guidance is needed. Reading its SKILL.md is not a substitute for invoking the skill.
3. Invoke the `$tasks-axi` skill. If the user supplied a backlog filename or path as the skill argument, resolve a relative path from the repository root and pass it to every tasks-axi command as `--file <path>` (after the command name). Otherwise use tasks-axi's default backlog. Run `pnpm dlx -y tasks-axi ready [--file <path>]` once, inspect the ready group, and load full details only for tasks selected for dispatch with `pnpm dlx -y tasks-axi show <task-id> --full [--file <path>]`. Identify independent tasks and dispatch each selected task to its own worker:

   ```sh
   bash <path-to-this-skill>/agent-worker.sh <unique-branch> <agent-name> <task-id> [--file <backlog-path>] [--context-file <path> ...]
   ```

   Invoke the helper once per selected task ID, passing the selected backlog with `--file` when one was supplied. Pass concise shared references with repeatable `--context-file` options; the helper includes their contents and hashes in the prompt and verifies that repository-local files are present and identical in the worker worktree. For a batch of workers, pass the same context-file list to each and keep those files unchanged until the batch settles. The helper operates on exactly one task ID per invocation. Do not run `tasks-axi start` separately; the helper loads the task and starts it in that backlog after submitting the prompt. Use a unique lowercase agent name for each worker. If the helper reports that the prompt was submitted but the task update failed, inspect the worker and task before retrying; do not relaunch.

   Use this helper for backlog tasks that edit files. For read-only work, start an agent directly in a Herdr pane. New worktrees start from the current commit; tracked code changes must be integrated before a dependent task starts. The helper copies allowlisted ignored context and checks supplied context-file hashes. Worktrunk isolates worker file edits; remaining coordination is about dependencies, shared contracts, and integration, not concurrent writes to the same checkout.
4. Start all selected independent workers before waiting. Then call `herdr agent wait <agent-name>` once per worker and let it return at a settled state. Do not use sleep loops, repeated status checks, or pane rereads while a worker is active. If a wait times out or returns `blocked`, inspect its state once and decide whether to steer or recover before waiting again.
5. Review each summary and actual diff in its worktree. Check requirements, conflicts, and requested checks. Use worker and configured-hook results; do not repeat expensive checks in the parent unless integration exposes a specific gap. After accepting the integrated change, run `pnpm dlx -y tasks-axi done <task-id> [--file <path>]`, using the selected backlog path when one was supplied. Workers report outcomes but do not change task status.
6. After integration, use `wt list` to inspect worker worktrees. Remove only clean, integrated worker worktrees with `wt remove <branch>`. Never use `--force` or `--force-delete` to clear worker state. Preserve dirty or unintegrated worktrees and report them.

## Keep work moving

- Reduce context churn without narrowing the task: batch related `rg --files`/`rg -n` searches, open matching file sections, and widen reads when the evidence or integration requires it. Reuse findings already gathered; avoid repeated repository scans and whole-file dumps when a focused excerpt answers the question. For reviews, inspect a diff summary, then the relevant changed hunks and expand as needed.
- Apply the same event-driven approach to commands: wait on each long-running command once with an adequate timeout, then inspect its result. Keep tool output focused so the next decision uses the evidence needed, not a repeated transcript.
- These are retrieval defaults, not task boundaries. Complete the full user objective and its required checks, following relevant evidence across files and modules as needed.
- Make the best supported decision from the user's request, repository conventions, installed skills, and available evidence. Prefer clear, reversible decisions over asking the user about routine implementation details.
- When a worker is blocked, inspect the exact prompt or error. If context supports a safe decision, send a direct answer or concrete next action that preserves the full task outcome. Do not leave a worker waiting for a question the parent can resolve.
- Escalate only when the missing input is user-owned or consequential, or when an action requires user authorization or a tool approval. Do not approve tool-call approval prompts on the user's behalf. State the exact decision or approval needed.
- While one worker awaits necessary input or approval, continue independent work that does not depend on it.
- Treat `idle`, `done`, and `unknown` as lifecycle states, not proof of successful work. Read the completion summary and inspect the changes before accepting them.

## Task Recovery

1. Do not relaunch immediately. Compare the backlog, live agent, and worktree:

   ```sh
   pnpm dlx -y tasks-axi show <task-id> --full [--file <path>]
   herdr agent get <agent-name>
   herdr agent read <agent-name> --source recent-unwrapped --lines 120
   wt list
   ```

2. If the prompt was submitted but the task is still queued, confirm the same worker is present, then run `pnpm dlx -y tasks-axi start <task-id> [--file <path>]`, using the selected backlog path when one was supplied; do not relaunch it. For a timeout, stalled prompt, or blocked state, inspect the agent output before steering or retrying. If the worker is absent, inspect and preserve its worktree before deciding whether to resume or retry. Do not resend a prompt whose delivery is uncertain.
3. Inspect the worktree diff and required checks before marking the task done. Keep dirty or unintegrated worktrees; do not infer success from an agent lifecycle state, completion marker, or stale Ordewell session record.


