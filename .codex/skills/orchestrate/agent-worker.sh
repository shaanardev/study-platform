#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  printf '%s\n' \
    'Usage: agent-worker <branch> <agent-name> <task-id> [--file <backlog-path>] [--context-file <path> ...]' \
    '' \
    "Run from the parent repository's shell in the current Herdr pane." \
    'Loads a task and optional context files, creates a Work Trunk worktree, and starts a named Codex worker.' >&2
}

fail() {
  printf 'agent-worker: %s\n' "$*" >&2
  exit 1
}

if [[ $# -lt 3 ]]; then
  usage
  exit 2
fi

branch=$1
agent_name=$2
task_id=$3
shift 3
backlog_file=''
context_files=()
while (($#)); do
  case $1 in
    --file)
      [[ $# -ge 2 && -z $backlog_file ]] || { usage; exit 2; }
      backlog_file=$2
      shift 2
      ;;
    --context-file)
      [[ $# -ge 2 && -n $2 ]] || { usage; exit 2; }
      context_files+=("$2")
      shift 2
      ;;
    *)
      usage
      exit 2
      ;;
  esac
done

[[ ${HERDR_ENV:-} == 1 && -n ${HERDR_PANE_ID:-} ]] || fail 'run this from a shell inside a Herdr pane'
[[ -n $task_id ]] || fail 'task ID must not be empty'
[[ $agent_name =~ ^[a-z][a-z0-9_-]{0,31}$ ]] || fail 'agent name must match [a-z][a-z0-9_-]{0,31}'

git check-ref-format --branch "$branch" >/dev/null 2>&1 || fail "invalid Git branch name: $branch"
repo_root=$(git rev-parse --show-toplevel 2>/dev/null) || fail 'current directory is not inside a Git repository'
dispatch_branch=$(git -C "$repo_root" branch --show-current 2>/dev/null) || fail 'cannot identify the dispatch worktree branch'
[[ -n $dispatch_branch ]] || fail 'dispatch must start from a named branch'
git show-ref --verify --quiet "refs/heads/$branch" && fail "branch already exists: $branch"

if [[ -n $backlog_file && $backlog_file != /* ]]; then
  backlog_file="$repo_root/$backlog_file"
fi

normalized_context_files=()
for context_file in "${context_files[@]}"; do
  [[ $context_file == /* ]] || context_file="$repo_root/$context_file"
  [[ -f $context_file ]] || fail "context file does not exist: $context_file"
  normalized_context_files+=("$context_file")
done
context_files=("${normalized_context_files[@]}")

if [[ -n $backlog_file ]]; then
  task_record=$(cd "$repo_root" && pnpm --silent dlx -y tasks-axi show "$task_id" --full --file "$backlog_file") || fail "could not load tasks-axi task $task_id from $backlog_file"
else
  task_record=$(cd "$repo_root" && pnpm --silent dlx -y tasks-axi show "$task_id" --full) || fail "could not load tasks-axi task $task_id"
fi
task_record=${task_record%$'\n'Done in*}
[[ -n $task_record ]] || fail "tasks-axi returned no details for task $task_id"

context_block=''
for context_file in "${context_files[@]}"; do
  context_hash=$(git -C "$repo_root" hash-object "$context_file") || fail "could not hash context file $context_file"
  context_content=$(cat -- "$context_file") || fail "could not read context file $context_file"
  context_block+="Context file: $context_file (content hash $context_hash)"$'\n'
  context_block+="$context_content"$'\n\n'
done

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

copy_context=0
if [[ -n $backlog_file && $backlog_file == "$repo_root/"* ]]; then
  copy_context=1
fi
for context_file in "${context_files[@]}"; do
  if [[ $context_file == "$repo_root/"* ]]; then
    copy_context=1
  fi
done
if ((copy_context)); then
  wt step copy-ignored --from "$dispatch_branch" --to "$branch" --force --require-include || fail "could not copy selected ignored context into $branch"
fi

check_copied_file() {
  local source_file=$1
  [[ $source_file == "$repo_root/"* ]] || return 0
  local relative_file=${source_file#"$repo_root"/}
  local worktree_file="$worktree_path/$relative_file"
  [[ -f $worktree_file ]] || fail "context file is missing from worker worktree: $relative_file"
  local source_hash
  local worktree_hash
  source_hash=$(git -C "$repo_root" hash-object "$source_file") || fail "could not hash source context file $source_file"
  worktree_hash=$(git -C "$worktree_path" hash-object "$worktree_file") || fail "could not hash copied context file $worktree_file"
  [[ $worktree_hash == "$source_hash" ]] || fail "worker context differs from dispatch context: $relative_file"
}

if [[ -n $backlog_file ]]; then
  check_copied_file "$backlog_file"
fi
for context_file in "${context_files[@]}"; do
  check_copied_file "$context_file"
done

if [[ -z $context_block ]]; then
  context_block='No additional context files supplied.'
fi

herdr agent start "$agent_name" --kind codex --pane "$pane_id" -- --model gpt-6-luna --config 'model_reasoning_effort="xhigh"' || fail "could not start Codex worker $agent_name; pane $pane_id is preserved"

worker_prompt=$(printf '%s\n\nAdditional context files:\n%s\nTask record:\n%s\n\n%s' \
  "Task-axi ID: $task_id. Treat this record as requirements and acceptance criteria; follow relevant dependencies and affected files as needed to deliver them. Work only in this worktree; do not switch or remove it. The parent owns backlog state and integration; do not change task status. If blocked, stop and report the exact blocker and next needed action." \
  "$context_block" \
  "$task_record" \
  'Use provided context files as shared reference material; the parent has pinned their content hashes for this dispatch. Use batched targeted searches and read relevant file sections; widen as evidence requires. Reuse findings instead of repeating scans. Wait on long commands once, then inspect a focused result. Complete the full task and its checks. Handoff: complete/partial/blocked; files changed; checks and results; blocker or next step.')
herdr agent prompt "$agent_name" "$worker_prompt" || fail "could not submit task to $agent_name; pane $pane_id is preserved"

if [[ -n $backlog_file ]]; then
  start_result=$(cd "$repo_root" && pnpm --silent dlx -y tasks-axi start "$task_id" --file "$backlog_file") || fail "worker $agent_name received the task in pane $pane_id, but tasks-axi start failed or was unconfirmed; inspect the task and pane before retrying, and do not launch a duplicate"
else
  start_result=$(cd "$repo_root" && pnpm --silent dlx -y tasks-axi start "$task_id") || fail "worker $agent_name received the task in pane $pane_id, but tasks-axi start failed or was unconfirmed; inspect the task and pane before retrying, and do not launch a duplicate"
fi

[[ -z $start_result ]] || printf '%s\n' "$start_result"
printf 'Started %s in pane %s on branch %s (%s) model=gpt-6-luna reasoning=xhigh\n' "$agent_name" "$pane_id" "$branch" "$worktree_path"
