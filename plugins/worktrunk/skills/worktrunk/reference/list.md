# Listing Worktrunk worktrees

Use the official [Worktrunk list docs](https://worktrunk.dev/list/) for filters, columns, and JSON schema.

~~~bash
wt list
wt list --full --branches
wt list --format=json
~~~

- wt list is the quick view of linked worktrees and their state.
- --full includes richer branch and forge status; --branches includes branches without a worktree.
- JSON is for scripts and tools; inspect the current schema in the official docs before depending on fields.

The local Worktrunk plugin updates the current branch's activity marker during Codex prompt, permission, stop, and session-end events. The marker is status context only; it does not create or manage a session.
