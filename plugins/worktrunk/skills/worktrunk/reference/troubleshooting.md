# Worktrunk troubleshooting for this repository

Use Worktrunk's [official troubleshooting and FAQ](https://worktrunk.dev/faq/) for general CLI behavior. These checks cover this repo's WSL setup.

## Worktree path is unexpected

Run wt config show from the repository and inspect the project-specific user config. The expected template is <repo>/.worktrees/<sanitized-branch>. Confirm .worktrees/ is ignored and that the command is running from this repository.

## Dependency setup fails

Inspect the exact pnpm install --frozen-lockfile error from the pre-start hook. The Ordewell history has seen registry/DNS failures and filesystem write errors; these have different causes. Check whether the error is about reaching the package registry or writing/linking files before changing pnpm settings.

This repository's root pnpm-workspace.yaml sets virtualStoreType: global. Do not add copy-ignored for node_modules as a generic fix. See the [pnpm docs](https://pnpm.io/global-virtual-store).

## Hook does not run or is blocked

~~~bash
wt config show
wt hook show
~~~

Check that the expected hook is in .config/wt.toml. If Worktrunk is waiting for approval and the session is non-interactive, ask the user to review the commands in Worktrunk. Do not pass --yes or approve on the user's behalf.

Remember that pre-commit applies to Worktrunk commit operations; ordinary git commit does not run it.

## wt list is slow

Use wt -v list to see Worktrunk's progress and wt -vv list for diagnostic logs. The full Worktrunk [FAQ](https://worktrunk.dev/faq/) covers filesystem-monitor and status collection issues.

## Ordewell task worktree is missing or conflicted

Use .codex/skills/ordewell-worktree-handoff/SKILL.md. That workflow knows how to inspect Ordewell's task state and preserve surviving branch data; do not try to repair it by removing worktrees with wt.
