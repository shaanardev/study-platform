# LLM commit messages for Codex

Worktrunk can use Codex CLI to generate messages for `wt merge`, `wt step commit`, and `wt step squash`.

## Codex CLI setup

Create `~/.codex/worktrunk-commit-instructions.txt` containing only `.` with no trailing newline. Accepting Worktrunk's first-run Codex setup creates this file.

Add the generator command to the user-level `~/.config/worktrunk/config.toml`:

```toml
[commit.generation]
command = "codex exec -m gpt-6-luna -c model_reasoning_effort='none' -c project_doc_max_bytes=0 -c skills.max_context_tokens=1 -c agents.enabled=false -c features.goals=false -c web_search=disabled -c 'model_instructions_file=\"~/.codex/worktrunk-commit-instructions.txt\"' -c features.shell_tool=false -c features.unified_exec=false -c features.apps=false -c features.plugins=false --ephemeral --sandbox=read-only --json - | jq -sr '[.[] | select(.item.type? == \"agent_message\")] | last.item.text'"
```

This command requires `jq`. See the [Codex CLI documentation](https://developers.openai.com/codex/cli/) and [Worktrunk's LLM commit message guide](https://worktrunk.dev/llm-commits/) for setup details.

## This repository

Keep the generator command and model in user config. The project's `.config/wt.toml` sets `commit.generation.template-append` for shared commit conventions, without prescribing a user's model or CLI command.
