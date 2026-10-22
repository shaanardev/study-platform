---
name: worktrunk
description: Use for managing git worktrees, worktree targeting, the .worktrees layout, .config/wt.toml hooks, commit conventions, or Worktrunk troubleshooting.
---

# Worktrunk

Worktrunk manages Git worktrees. For this repository, use the checked-in project hooks and the user-level path setting described below. The linked Worktrunk documentation is the source of truth for command behavior; check the wt command help if the local notes do not cover an option.

## Repository setup

- The repository's .worktrees/ directory holds one worktree directory per sanitized branch. The path template is in `~/.config/worktrunk/config.toml`; `.worktrees/` is ignored by Git.
- .config/wt.toml runs pnpm install --frozen-lockfile in pre-start, pnpm lint in pre-commit, and pnpm coverage:check in pre-merge. Use these declared commands; do not make up substitutes.
- pnpm 12.6 is configured with virtualStoreType: global. The shared store contains package content; each worktree still gets its own install links. Keep the pre-start install and do not add a copy-ignored hook for node_modules by default. See reference/tips-patterns.md and the [pnpm docs](https://pnpm.io/global-virtual-store).
- Ordewell owns its task worktrees and setup. Do not manage .ordewell/worktrees with Worktrunk. For Ordewell recovery, follow .codex/skills/ordewell-worktree-handoff/SKILL.md.

## Choose the worktree correctly

wt discovers the repository from the current directory. A branch argument selects that branch's worktree; `-C PATH` changes repository lookup and is not a second way to select the worktree. Avoid combining them unless a command genuinely needs both.

~~~bash
wt list
wt switch <branch>
wt switch --create <branch>
wt -C <repo-path> list
~~~

The new branch defaults to the detected default branch. Use `--base=@` only when the branch should start from the current worktree's HEAD. See reference/switch.md.

## Hooks and approvals

`pre-start` completes before worktree creation returns. Here it installs dependencies. `pre-commit` runs lint before Worktrunk commits, including commit and squash steps used by `wt merge`. `pre-merge` runs the coverage gate after rebase and before merge. Neither hook runs for an ordinary `git commit`.

Worktrunk prompts the user before running project hook commands. If a non-interactive Codex session cannot proceed because approval is missing, ask the user to review and approve the commands with Worktrunk. Do not bypass the prompt with `--yes` or approve commands on the user's behalf.

See reference/hook.md for hook timing and reference/merge.md for merge order.

## Sessions

Worktrunk creates and removes worktrees; it is not the session manager. When the user asks to manage Codex sessions, follow the installed Herdr skill and its `HERDR_ENV=1` requirement. Do not introduce terminal multiplexer workflows.

## Commit messages

The project config supplies shared Conventional Commit guidance through [commit.generation].template-append. It does not choose a per-user model or Codex command. Keep personal Codex generation settings in user config and only configure them when asked. See reference/llm-commits.md.

## References

- reference/config.md: this repo's user and project settings
- reference/hook.md: hook lifecycle, approvals, and the configured checks
- reference/switch.md: worktree selection and creation
- reference/merge.md: merge and commit flow
- reference/remove.md: safe worktree cleanup
- reference/list.md: status and worktree discovery
- reference/step.md: common Worktrunk steps and copy-ignored behavior
- reference/tips-patterns.md: repo-specific workflow decisions
- reference/troubleshooting.md: WSL, hooks, and setup diagnosis
- reference/llm-commits.md: shared commit guidance versus personal Codex setup

For less common configuration, aliases, or command options, use the official [Worktrunk documentation](https://worktrunk.dev).
