## Project Configuration

- **Language**: TypeScript
- **Package Manager**: pnpm
- **Add-ons**: vitest, ai-tools, experimental

## Subagent Delegation

- Use `gpt-6-luna` at high reasoning as the model for all subagents
- For independent research or file discovery, use `explorer` agents in parallel. Reuse an explorer for related follow-ups and ask for concise findings with file references.
- For small isolated code changes, use `worker` agents with explicit file ownership and acceptance criteria. Tell workers that others share the checkout and not to revert their changes.
- Keep quick or dependent steps with the parent agent, which integrates the results.

## Code Verification

- For changes to the frontend app (`src/` and its root configuration), run `pnpm verify` from the repository root before completing the task.
- For changes confined to `cli/`, run `pnpm --dir cli verify` before completing the task.
- For changes affecting both apps or shared tooling, run `pnpm verify:all` from the repository root.
- Each verify command may rewrite files through `lint:fix`. Review the resulting diff and include only changes that belong to the task. Report any failed or blocked verification in the task handoff.

## Svelte Work

- Use the `$svelte-best-practices` skill when writing, editing, or reviewing Svelte components or modules.
- Consult the Svelte MCP for relevant Svelte or SvelteKit APIs. Call `list-sections` before `get-documentation`, and fetch only the sections needed for the task.
- After changing Svelte code, run `svelte-autofixer` on the affected components or modules and address its issues and suggestions.
