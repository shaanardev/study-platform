# Removing Worktrunk worktrees

Use the official [Worktrunk remove docs](https://worktrunk.dev/remove/) for all options.

~~~bash
wt remove <branch>
wt remove --no-delete-branch <branch>
~~~

Before removal, inspect the worktree and branch state with wt list and Git status. Worktrunk normally protects unmerged work and reports whether the branch can be deleted safely.

Do not use force-removal or force-delete options unless the user explicitly requests that action after seeing the affected branch and worktree state. Ordewell task worktrees are managed separately; use .codex/skills/ordewell-worktree-handoff/SKILL.md for them.
