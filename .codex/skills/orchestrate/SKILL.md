---
name: orchestrate
description: Delegate independent coding tasks to fresh Codex agents in named Herdr panes, using Work Trunk for isolated worktrees.
metadata:
  short-description: Orchestrate Codex workers with Herdr
---

# Agent Orchestration

Use Herdr CLI commands to launch and coordinate fresh Codex sessions in panes of the current Herdr window. Keep the calling session responsible for decisions, review, and integration.

## Procedure

1. Delegate only independent tasks where parallel work saves time. Keep dependent or tightly coupled work in this parent session.
2. Invoke `$worktrunk` when repository-specific Work Trunk guidance is needed. Reading its SKILL.md is not a substitute for invoking the skill.
3. Invoke the `$tasks-axi` skill. Run `pnpm dlx -y tasks-axi ready`, choose an ID in the `ready` group, then run:

   ```sh
   bash <path-to-this-skill>/agent-worker.sh <unique-branch> <agent-name> <task-id>
   ```

   Do not run `tasks-axi start` separately; the helper does that after submitting the prompt. Use a unique lowercase agent name. If the helper reports that the prompt was submitted but the task update failed, inspect the worker and task before retrying; do not relaunch.

   Use this helper for backlog tasks that edit files. For read-only work, start an agent directly in a Herdr pane. New worktrees start from the current commit, so keep work that depends on uncommitted changes in the parent session.
4. Start all independent workers before waiting. Then wait once per worker with `herdr agent wait <agent-name>`. Do not poll or repeatedly reread panes.
5. Review each summary and actual diff in its worktree. Check scope, conflicts, and requested checks. After accepting the integrated change, run `pnpm dlx -y tasks-axi done <task-id>`. Workers report outcomes but do not change task status.
6. After integration, use `wt list` to inspect worker worktrees. Remove only clean, integrated worker worktrees with `wt remove <branch>`. Never use `--force` or `--force-delete` to clear worker state. Preserve dirty or unintegrated worktrees and report them.

## Keep work moving

- Make the best supported decision from the user's request, repository conventions, installed skills, and available evidence. Prefer clear, reversible decisions over asking the user about routine implementation details.
- When a worker is blocked, inspect the exact prompt or error. If context supports a safe decision, send the worker a direct answer or narrower task and continue. Do not leave a worker waiting for a question the parent can resolve.
- Escalate only when the missing input is user-owned or consequential, or when an action requires user authorization or a tool approval. Do not approve tool-call approval prompts on the user's behalf. State the exact decision or approval needed.
- While one worker awaits necessary input or approval, continue independent work that does not depend on it.
- Treat `idle`, `done`, and `unknown` as lifecycle states, not proof of successful work. Read the completion summary and inspect the changes before accepting them.

## Task Recovery

1. Do not relaunch immediately. Compare the backlog, live agent, and worktree:

   ```sh
   pnpm dlx -y tasks-axi show <task-id> --full
   herdr agent get <agent-name>
   herdr agent read <agent-name> --source recent-unwrapped --lines 120
   wt list
   ```

2. If the prompt was submitted but the task is still queued, confirm the same worker is present, then run `pnpm dlx -y tasks-axi start <task-id>`; do not relaunch it. For a timeout, stalled prompt, or blocked state, inspect the agent output before steering or retrying. If the worker is absent, inspect and preserve its worktree before deciding whether to resume or retry. Do not resend a prompt whose delivery is uncertain.
3. Inspect the worktree diff and required checks before marking the task done. Keep dirty or unintegrated worktrees; do not infer success from an agent lifecycle state, completion marker, or stale Ordewell session record.


