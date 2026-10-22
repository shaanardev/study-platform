## Project Configuration

- **Language**: TypeScript
- **Package Manager**: pnpm

## Domain design & rules

See `requirements.md`

## Subagent Delegation

- Use `gpt-6-luna` at high reasoning as the model for all subagents
- For independent research or file discovery, use `explorer` agents in parallel. Reuse an explorer for related follow-ups and ask for concise findings with file references.
- For small isolated code changes, use `worker` agents with explicit file ownership and acceptance criteria. Tell workers that others share the checkout and not to revert their changes.
- Keep quick or dependent steps with the parent agent, which integrates the results.

## Code Verification

- For any code changes, run `pnpm verify` from the repository root before completing the task. It fixes lint issues, checks both apps, runs every Vitest project with coverage, and enforces at least 70% line coverage.
- Run `pnpm test` to run all Vitest projects without coverage. Use `pnpm coverage:check` to collect coverage and enforce the 70% line threshold.
- `pnpm verify` may rewrite files through `lint:fix`. Review the resulting diff and include only changes that belong to the task. Report any failed or blocked verification in the task handoff.
- Do not repeat Ultracite's optional Stylelint-missing notice in final reports unless the task changes CSS or the notice materially limits verification.

## Plannotator

- Run Plannotator through `pnpm run plannotator <command> ...` from the repository root, for example `pnpm run plannotator review --git --diff-type uncommitted .`. The script stores Plannotator data in the repository-local `.plannotator/` directory, which is gitignored.

## Svelte Work

- Use the `$svelte-best-practices` skill when writing, editing, or reviewing Svelte components or modules.
- Use the `$svelte-error-handling` skill when designing, adding or updating error boundaries.
