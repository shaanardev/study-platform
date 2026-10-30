#!/usr/bin/env bash
set -euo pipefail

for argument in "$@"; do
  if [[ $argument == -* ]]; then
    printf 'wt:remove: pass only branch names or worktree paths; branch-deleting options are not accepted\n' >&2
    exit 2
  fi
done

exec wt remove --no-delete-branch "$@"
