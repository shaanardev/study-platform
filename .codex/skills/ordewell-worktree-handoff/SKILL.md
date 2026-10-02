---
name: ordewell-worktree-handoff
description: Diagnose Ordewell worktree readiness and recover or hand off a stalled task, conflict, missing integration worktree, or stale dependencies.
---

# Ordewell worktree readiness and handoff

Use this skill when an Ordewell task appears stuck, a task worktree is missing or unprepared, dependencies seem stale, tasks conflict, or a run needs review and handoff. Establish what state Ordewell and Git are actually in before proposing recovery.

## Diagnose before changing state

1. Identify the workspace, active session ID, installed Ordewell version, and relevant session records. Read `.ordewell/last-session.json`, the matching `.ordewell/sessions/*.json`, and Ordewell's installed CLI README or version-matched docs. Treat records as evidence that can be stale; compare with live Git and Ordewell status when available. When querying or acting on a session, pass its explicit ID rather than relying on the implicit last session.
2. Inspect the task state and its dependencies, task output/verdict, worktree path and branch, `git status`, `git worktree list`, and the run's integration branch. Check whether the expected task files exist and whether dependency changes reached the task's base. Avoid commands whose side effects are unclear. In this CLI, `ordewell run --help` can start the run instead of showing help; use the documented top-level help or installed documentation.
3. Classify the failure before acting:
   - **Setup/readiness:** worktree creation, install/setup command, runner startup, missing local tools, or dependency resolution failed before useful task work. Check the actual worktree and its install state. This project sets `ORDEWELL_WORKTREE_SETUP='pnpm install --frozen-lockfile'` in `ordewell.env`, loaded by `./ordewell-start`; an ignored `.ordewell/env` can override it. Confirm the launcher started the Ordewell server with that setting. `AGENTS.md` instructs the coding agent and does not configure the Ordewell server. A task-local environment file also does not set server configuration by itself.
   - **Task execution:** runner output shows a usage limit, cancellation, startup error, or task code failure. Use that evidence to decide whether a retry is appropriate.
   - **Integration/merge:** task work exists, but merging it into the run's integration branch conflicted or failed. Inspect the named paths and both sides before resolving; do not label this as dependency setup.
   - **Scheduler/dependency state:** a task is pending, blocked, or awaiting user action. Check dependency statuses and whether their changes landed on the integration branch before restarting or forcing the task.
4. Report the evidence, likely category, and a minimal recovery option. A completion marker only satisfies Ordewell's completion-marker check; it does not prove tests, correctness, or product quality. Verify the requested behavior from the task output and repository state independently.

## Recover and hand off

- Preserve the approved goal, plan, task prompts, dependencies, and content unless the user asks to change them. Prefer repairing readiness or restoring missing prerequisite changes over rewriting the plan.
- Retry only after identifying a fixable cause and confirming the retry will use the intended workspace and dependencies. Stop after a repeated failure or when the next step would rewrite history, skip dependencies, discard work, or alter a shared/global setting; explain the evidence and ask before that step unless the user already authorized it.
- For a conflict, retain the task worktree and branch while reviewing the diff. Resolve only with enough context to preserve both intended changes; then verify the result and confirm how Ordewell expects that task to re-enter the integration flow. Do not force-start, manually mark complete, or delete branches/worktrees as a shortcut.
- For handoff, distinguish task branches landing on the run's integration branch from that integration branch landing on the user's checked-out branch. Inspect the run diff against its recorded base and confirm what is on each branch. Ordewell's `handoff review` is for review; `merge`, `discard`, and `cleanup` mutate branch/worktree state. Run them only when requested or already authorized, and report which branch and changes they affect.
- Do not change global Ordewell configuration as a default fix. If a server environment setting must change, identify the actual launcher/server startup path and show a concrete scoped change first. `ordewell.env` and `.ordewell/env` only help when the process that starts Ordewell sources them.

## Evidence from this project

This workspace's `.ordewell` records illustrate why state sources must be separated: a recovery session can show manually completed tasks while the original session remains pending at those task numbers; task outputs also include install failures (`EROFS`, unavailable registry), passing completion-marker verdicts with incomplete checks, and later merge-conflict tasks. Use current session and Git state rather than assuming any one record tells the whole story.
