# Merging a Worktrunk worktree

Use the official [Worktrunk merge docs](https://worktrunk.dev/merge/) for the full pipeline and options.

## This repository

wt merge merges the current worktree's branch into the local target branch. The default target is the detected default branch. By default, Worktrunk squashes the branch, rebases it as needed, fast-forwards the target, then removes the source worktree.

The project pre-commit hook runs `pnpm lint` before Worktrunk creates a commit or squash commit. After rebasing, the `pre-merge` hook runs `pnpm coverage:check` and blocks the merge if the 70% line coverage threshold fails. These hooks do not run for ordinary `git commit`.

~~~bash
wt list
git status
git diff
~~~

## Useful options

~~~bash
wt merge
wt merge <target-branch>
wt merge --no-remove
wt merge --no-squash
wt merge --no-rebase
~~~

Use an option only when it matches the requested history and cleanup behavior. Do not skip hooks to bypass verification or approval.

If rebase or merge stops on a conflict, resolve it in the source worktree or abort the operation. Keep the worktree available until its state is understood. For Ordewell task branches, use .codex/skills/ordewell-worktree-handoff/SKILL.md instead.
