# Worktrunk hooks in this repository

Worktrunk hooks attach commands to worktree and commit events. The official [hook documentation](https://worktrunk.dev/hook/) is the source of truth for all hook types, variables, and pipeline forms.

## Configured hooks

.config/wt.toml currently declares:

~~~toml
pre-start = "pnpm install --frozen-lockfile"
pre-commit = "pnpm verify:all"
~~~

- pre-start blocks worktree creation until dependency installation finishes.
- pre-commit runs before Worktrunk commits and squashes, including the commit flow used by wt merge.
- pre-commit does not intercept plain git commit.

The full repository verification command is pnpm verify:all. Do not replace it with guessed or narrower checks when editing the hook.

## Approval

Project hooks are arbitrary shell commands. Worktrunk asks the user to approve them before execution and asks again if a command changes. If an agent session cannot answer the prompt, have the user review the commands through Worktrunk. Do not use --yes to bypass approval or record approvals for the user.

## Inspect and troubleshoot

~~~bash
wt config show
wt hook show
~~~

Use wt hook show --expanded to inspect rendered templates. For command syntax and lifecycle ordering, see the [Worktrunk hook reference](https://worktrunk.dev/hook/).
