## Project Configuration

- **Language**: TypeScript
- **Package Manager**: pnpm
- **Add-ons**: vitest, ai-tools, experimental

## Subagent Delegation

- For independent research or file discovery, use `explorer` agents in parallel. Reuse an explorer for related follow-ups and ask for concise findings with file references.
- For small isolated code changes, use `worker` agents with explicit file ownership and acceptance criteria. Tell workers that others share the checkout and not to revert their changes.
- Use `gpt-6-luna` at high reasoning for general delegated agents. Keep quick or dependent steps with the parent agent, which integrates the results.

## Svelte Work

- Use the `$svelte-best-practices` skill when writing, editing, or reviewing Svelte components or modules.
- Consult the Svelte MCP for relevant Svelte or SvelteKit APIs. Call `list-sections` before `get-documentation`, and fetch only the sections needed for the task.
- After changing Svelte code, run `svelte-autofixer` on the affected components or modules and address its issues and suggestions.
