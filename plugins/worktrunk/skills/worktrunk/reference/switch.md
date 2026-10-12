# Switching and creating worktrees

Use the official [Worktrunk switch docs](https://worktrunk.dev/switch/) for the full option list.

## Worktree selection

Worktrunk finds the repository from the current directory. A branch argument selects that branch's worktree regardless of which worktree you are currently in. -C <path> changes repository lookup; it does not select a worktree.

~~~bash
wt switch <branch>
wt switch --create <branch>
wt switch --create <branch> --base=@
~~~

New branches default to the repository's default branch. Use --base=@ only when the new branch should start at the current worktree's HEAD.

## This repository

The user config places worktrees under <repo>/.worktrees/<sanitized-branch>. Creating a worktree runs the checked-in pre-start hook, pnpm install --frozen-lockfile, before the command returns.

Worktrunk handles the filesystem worktree. When the user asks to launch or manage a Codex session, use the installed Herdr skill rather than adding session startup to a hook.

## Uncommitted changes

Before moving changes, inspect git status and follow the user's requested destination. Worktrunk does not implicitly move untracked or modified files just because a new worktree is created. See the official [switch docs](https://worktrunk.dev/switch/) for the supported move-changes flow.
