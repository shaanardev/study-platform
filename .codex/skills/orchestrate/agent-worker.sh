#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  printf '%s\n' \
    'Usage: agent-worker <branch> <agent-name> <task-id> [--file <backlog-path>]' \
    '' \
    "Run from the parent repository's shell in the current Herdr pane." \
    'Loads a task from tasks-axi, creates a Work Trunk worktree, and starts a named Codex worker.' >&2
}

fail() {
  printf 'agent-worker: %s\n' "$*" >&2
  exit 1
}

if [[ $# -ne 3 && $# -ne 5 ]]; then
  usage
  exit 2
fi

branch=$1
agent_name=$2
task_id=$3
backlog_file=''
if [[ $# -eq 5 ]]; then
  [[ $4 == --file && -n $5 ]] || { usage; exit 2; }
  backlog_file=$5
fi

[[ ${HERDR_ENV:-} == 1 && -n ${HERDR_PANE_ID:-} ]] || fail 'run this from a shell inside a Herdr pane'
[[ -n $task_id ]] || fail 'task ID must not be empty'
[[ $agent_name =~ ^[a-z][a-z0-9_-]{0,31}$ ]] || fail 'agent name must match [a-z][a-z0-9_-]{0,31}'

git check-ref-format --branch "$branch" >/dev/null 2>&1 || fail "invalid Git branch name: $branch"
repo_root=$(git rev-parse --show-toplevel 2>/dev/null) || fail 'current directory is not inside a Git repository'
git show-ref --verify --quiet "refs/heads/$branch" && fail "branch already exists: $branch"

if [[ -n $backlog_file ]]; then
  [[ $backlog_file == /* ]] || backlog_file="$repo_root/$backlog_file"
  task_record=$(cd "$repo_root" && pnpm --silent dlx -y tasks-axi show "$task_id" --full --file "$backlog_file") || fail "could not load tasks-axi task $task_id from $backlog_file"
else
  task_record=$(cd "$repo_root" && pnpm --silent dlx -y tasks-axi show "$task_id" --full) || fail "could not load tasks-axi task $task_id"
fi
task_record=${task_record%$'\n'Done in*}
[[ -n $task_record ]] || fail "tasks-axi returned no details for task $task_id"

split_json=$(herdr pane split --current --direction right --cwd "$repo_root" --no-focus) || fail 'could not split a worker pane'
pane_id=$(jq -er '.result.pane.pane_id | strings | select(length > 0)' <<<"$split_json") || fail 'Herdr did not return the new pane ID'

marker="AGENT_WORKER_${BASHPID}_${RANDOM}"
printf -v wt_command 'wt switch --create %q --base @; rc=$?; printf "\\n%s:%%s:%%s\\n" "$rc" "$PWD"' "$branch" "$marker"
herdr pane run "$pane_id" "$wt_command" >/dev/null || fail "could not submit Work Trunk setup in pane $pane_id"

if ! herdr pane wait-output "$pane_id" --match "$marker:" --timeout 120000 >/dev/null; then
  fail "Work Trunk setup did not finish in pane $pane_id; inspect that pane before retrying"
fi

pane_output=$(herdr pane read "$pane_id" --source recent-unwrapped --lines 100) || fail "could not read setup result from pane $pane_id"
setup_result=''
while IFS= read -r line; do
  if [[ $line == *"$marker:"* ]]; then
    setup_result=${line#*"$marker:"}
  fi
done <<<"$pane_output"
[[ -n $setup_result ]] || fail "setup completion marker missing; inspect pane $pane_id before retrying"

IFS=: read -r setup_status worktree_path <<<"$setup_result"
[[ $setup_status == 0 ]] || fail "wt switch failed in pane $pane_id with status ${setup_status:-unknown}; inspect that pane before retrying"
[[ -n ${worktree_path:-} && $worktree_path != "$repo_root" ]] || fail "pane $pane_id did not enter a separate worktree"
active_branch=$(git -C "$worktree_path" branch --show-current 2>/dev/null) || fail "cannot verify worktree at $worktree_path"
[[ $active_branch == "$branch" ]] || fail "expected branch $branch in pane $pane_id, found ${active_branch:-detached}"

herdr agent start "$agent_name" --kind codex --pane "$pane_id" -- --model gpt-6-luna --config 'model_reasoning_effort="xhigh"' || fail "could not start Codex worker $agent_name; pane $pane_id is preserved"

worker_prompt=$(printf '%s\n\nTask record:\n%s\n\n%s' \
  "Task-axi ID: $task_id. Treat this record as the scope and acceptance criteria. Work only in this worktree; do not switch or remove it. The parent owns backlog state and integration; do not change task status. If blocked, stop and report the exact blocker and next needed action." \
  "$task_record" \
  'Handoff: complete/partial/blocked; files changed; checks and results; blocker or next step.')
herdr agent prompt "$agent_name" "$worker_prompt" || fail "could not submit task to $agent_name; pane $pane_id is preserved"

if [[ -n $backlog_file ]]; then
  start_result=$(cd "$repo_root" && pnpm --silent dlx -y tasks-axi start "$task_id" --file "$backlog_file") || fail "worker $agent_name received the task in pane $pane_id, but tasks-axi start failed or was unconfirmed; inspect the task and pane before retrying, and do not launch a duplicate"
else
  start_result=$(cd "$repo_root" && pnpm --silent dlx -y tasks-axi start "$task_id") || fail "worker $agent_name received the task in pane $pane_id, but tasks-axi start failed or was unconfirmed; inspect the task and pane before retrying, and do not launch a duplicate"
fi

[[ -z $start_result ]] || printf '%s\n' "$start_result"
printf 'Started %s in pane %s on branch %s (%s) model=gpt-6-luna reasoning=xhigh\n' "$agent_name" "$pane_id" "$branch" "$worktree_path"
