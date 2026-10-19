# Common Worktrunk steps

The official [step documentation](https://worktrunk.dev/step/) is the source of truth for options.

~~~bash
wt step diff
wt step rebase
wt step commit
wt step squash
wt step push
~~~

These commands operate on the current worktree unless their options select another branch. wt step commit, wt step squash, and the commit flow in wt merge run the project's pre-commit hook, which uses pnpm verify.

## Copying ignored files

wt step copy-ignored copies gitignored files between worktrees. It is not configured here. In particular, do not add it for node_modules by default: pnpm's global virtual store shares package content across worktrees, while the existing pre-start install creates each worktree's links and install state. See the [pnpm global virtual store docs](https://pnpm.io/global-virtual-store).

If a measured cold start justifies sharing a particular ignored cache, review the official [copy-ignored docs](https://worktrunk.dev/step/#wt-step-copy-ignored), limit the selection with .worktreeinclude, and verify that sharing the files is safe across branches.
