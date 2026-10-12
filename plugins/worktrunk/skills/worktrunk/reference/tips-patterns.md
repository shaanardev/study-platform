# Worktrunk patterns for this repository

Keep Worktrunk focused on Git worktree lifecycle. Use the repository's existing hooks, pnpm setup, and Herdr preference.

## Worktree location

The project-scoped user config places each worktree under the repo's `.worktrees/` directory. `.worktrees/` is already ignored. Inspect the effective setting with `wt config show`.

This is a regular Git checkout. Do not recommend or create a bare-repository layout.

## Dependencies and cold starts

New worktrees run `pnpm install --frozen-lockfile` in `pre-start`, as declared in `.config/wt.toml`. This repo pins pnpm 12.6 and sets `virtualStoreType: global`. The global virtual store keeps package content shared across worktrees; each worktree still needs its own `node_modules` links and install state. See the [pnpm docs](https://pnpm.io/global-virtual-store).

Worktrunk's `wt step copy-ignored` copies ignored files from one worktree into another. It is not needed for `node_modules` by default: the shared virtual store already avoids recreating package content, while the install hook creates the current worktree's links. Keep the install hook; consider copying only if measured install time remains a problem and there is a specific cache or generated file worth sharing. See the official [copy-ignored documentation](https://worktrunk.dev/step/#wt-step-copy-ignored).

## Verification before Worktrunk commits

`.config/wt.toml` uses `pre-commit = "pnpm verify:all"`. Keep this exact project verification entry. Worktrunk runs it for Worktrunk commit operations; a plain `git commit` does not invoke the hook.

## Ordewell worktrees

Ordewell uses its own task worktrees and setup. Use `./ordewell-start` for its launcher and follow `.codex/skills/ordewell-worktree-handoff/SKILL.md` for recovery. Do not create, move, or remove Ordewell worktrees with `wt`.

The Ordewell records have seen registry/DNS failures and filesystem write errors such as EROFS. These have different causes; inspect the actual error before changing setup. Recovery should preserve branch data and inspect merge/worktree state before cleanup.

## Codex sessions

Worktrunk creates the filesystem worktree. When asked to inspect or manage a Codex session, follow the installed Herdr skill and its `HERDR_ENV=1` requirement. Do not configure session creation in Worktrunk hooks or add a terminal-multiplexer recipe.

Use the current Codex session's repository path as the source of truth. This plugin is configured for the WSL checkout at `/home/sarora/projects/learning-platform`; do not translate that path or assume a Windows-native checkout exists.

## Useful commands

~~~bash
wt list
wt switch <branch>
wt switch --create <branch>
wt list --full --branches
wt config show
~~~

For command semantics, use [switch](https://worktrunk.dev/switch/), [list](https://worktrunk.dev/list/), and [config](https://worktrunk.dev/config/).
