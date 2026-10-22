# Worktrunk configuration in this repository

Worktrunk reads personal settings from `~/.config/worktrunk/config.toml` and shared hooks from `.config/wt.toml`. Run `wt config show` to inspect effective settings and their sources.

## User worktree path

The project-scoped user setting places each branch in the repository:

~~~toml
[projects."/home/sarora/projects/learning-platform"]
worktree-path = "{{ repo_path }}/.worktrees/{{ branch | sanitize }}"
~~~

The repository ignores `.worktrees/`. Keep this setting in user config; it is a personal path preference. The project uses a normal Git checkout, not a bare repository.

## Shared project hooks

The checked-in .config/wt.toml contains:

~~~toml
pre-start = "pnpm install --frozen-lockfile"
pre-commit = "pnpm lint"
pre-merge = "pnpm coverage:check"

[commit.generation]
template-append = """
...shared Conventional Commit guidance...
"""
~~~

`pre-start` prepares dependencies before a new worktree is ready. `pre-commit` runs lint before Worktrunk commit operations; `pre-merge` runs the coverage threshold after rebase and before merge.

pnpm 12.6 reads `virtualStoreType: global` from `pnpm-workspace.yaml`. Its global virtual store holds shared package content, while each worktree still needs its own `node_modules` links and install state. Keep the `pre-start` install hook. Do not add `wt step copy-ignored` for `node_modules` by default. See the [pnpm global virtual store docs](https://pnpm.io/global-virtual-store), [Worktrunk configuration docs](https://worktrunk.dev/config/), [hook docs](https://worktrunk.dev/hook/), and [copy-ignored docs](https://worktrunk.dev/step/#wt-step-copy-ignored).

## Scope

- Keep personal path and Codex command settings in `~/.config/worktrunk/config.toml`.
- Keep team hooks and shared commit style in `.config/wt.toml`.
- Inspect effective values with `wt config show`.
- Worktrunk project hooks require approval before execution. See reference/hook.md.
