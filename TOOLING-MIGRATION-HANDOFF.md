# Agent Handoff: Monorepo and Linting Migration

## Implementation Update — 2026-10-12

The migration is implemented in the current checkout. The sections below this update retain the original research snapshot; their old paths and proposed next actions describe the pre-migration state. Use [README.md](README.md) and [AGENTS.md](AGENTS.md) for current commands and conventions.

- Web app: `apps/web/`; pack CLI: `apps/pack-cli/`. Root `package.json` orchestrates the workspace.
- Biome dependency/configuration/commands are removed. Root `oxlint.config.ts` and `oxfmt.config.ts` extend Ultracite's Oxlint and Oxfmt presets and retain the repository's custom rules and formatting settings. Root Ultracite performs one monorepo pass with CLI-scoped Effect TS-Go rules and type-aware Oxlint.
- The web app retains TypeScript 6. ESLint and the official Svelte plugin cover components, rune modules, framework rules, and Tailwind checks. Root Oxfmt formats Svelte through its Prettier-backed implementation; the web Prettier provider ignores those files to avoid duplicate formatting. `svelte-check` remains required and fails on warnings.
- The web workspace uses Ultracite's ESLint provider for Svelte-aware checks. Root Ultracite owns the global Oxlint/Oxfmt pass; `lint` includes both passes, `verify` scopes the global pass to web files, and `verify:all` runs the global pass once across the repository before web and CLI checks.
- General CSS semantic lint checks remain omitted. Tailwind linting is enforced through the web ESLint configuration using `eslint-plugin-better-tailwindcss`: shorthand and canonical utilities, duplicate/conflicting/unknown/deprecated classes, and restrictions approximating Biome's arbitrary values/properties and raw palette color policies. Exact existing styles use named theme tokens and utilities. Some Biome-only style/type checks and dedicated JSON duplicate-key linting have no replacement; these omissions are documented.
- Packs remain repository content. The web app resolves packs and `.local/exam-packs.sqlite` from the workspace root independent of its launch directory. Existing user data was not relocated.
- Fixture paths, nested output ignores, editor settings, pack instructions, and Svelte agent check commands are updated. No worktrees or commits were created.
- Pack-contract consolidation is still a separate required follow-up; no contract package was added.

Verification evidence: `pnpm verify:all` passed (48 web tests, 34 CLI tests). Root and CLI Ultracite doctors report no warnings or failures; the web doctor reports only the two optional Stylelint notices because the project relies on Tailwind-specific ESLint checks and has no Stylelint setup. Both app TypeScript checks and standalone TypeScript checks for the root Oxlint and Oxfmt configs pass. The CLI still reports Effect unstable API warnings, which remain warnings.

## Handoff State

- Snapshot date: 2026-10-12
- Repository: `/home/sarora/projects/learning-platform`
- Git branch at inspection: `main`
- Migration status: implemented; see the current implementation update at the top of this file.
- The following sections retain research from before the app relocation and migration. Treat their paths and proposed next actions as historical context, not current instructions.

## Objective

Evaluate and streamline repository linting with [Ultracite](https://www.ultracite.ai/), while moving toward a conventional monorepo layout. Preserve independently scoped TypeScript and app toolchains where their needs differ.

## Decisions and User Requirements

1. **Use monorepo structure 2.** The web app and pack CLI should be explicit apps rather than root `src/` and sibling `cli/src/`.
2. Expected target layout from the selected recommendation:

   ```text
   apps/
     web/                 # SvelteKit app; move current root src/app config here
     pack-cli/            # pack build/verification CLI; move current cli here
   packages/
     pack-contract/       # future canonical contract package consumed by both apps
   packs/                 # authored/importable pack content and fixtures; keep as content
   ```

   Confirm any path/name details against the original structure-2 proposal before moving files. Do not reopen the two-structure comparison unless needed to resolve a concrete ambiguity.

3. User prefers a **repo-wide Oxlint baseline**, with Effect TS-Go/Oxlint presets and Effect-specific rules scoped to the CLI only.
4. Svelte app lint choice remains a design decision: Biome experimental Svelte/HTML support or Oxlint for scripts plus another Svelte-aware route if template linting is required.
5. **The pack contract is a current design flaw and must eventually have one source of truth. That work is explicitly separate from this tooling migration.** Record it as a required follow-up; do not bundle contract consolidation into the lint/structure migration without a separate instruction.
6. The user challenged the assumption that an ESLint-format plugin necessarily requires running ESLint. Correct distinction: Oxlint can execute compatible ESLint JS plugins without the ESLint executable, but Oxlint JS plugins currently cannot use custom parsers/file formats such as Svelte templates. `eslint-plugin-svelte` therefore does not provide its full template rules through Oxlint today.

## Current Repository State

- Root `package.json` is the SvelteKit app (`name: frontend`); frontend code lives under `src/`.
- CLI lives under `cli/`, package name `pack-cli`.
- `pnpm-workspace.yaml` currently includes only `cli`.
- `packs/` contains authored and incoming pack content. Treat it as repository content, not an app/library package.
- Root uses Biome `2.5.14`; `biome.jsonc` enables the `svelte` domain and `html.experimentalFullSupportEnabled`.
- CLI uses Oxlint `1.82.0` with its own `oxlint.config.ts`, including `@effect/tsgo/oxlint-presets` and Effect TS-Go rules.
- CLI TypeScript is `7.0.2` with `@effect/tsgo`; frontend TypeScript is `6.0.3`. Do not unify versions or TypeScript configs as part of lint migration without checking compatibility.
- Root `package.json` defines `#lib` imports to `./src/lib`; move those mappings into the web package if the app moves.
- Root scripts: `check = typecheck + validate + test`; `verify = lint:fix + check`; `verify:all = verify + CLI verify`.
- CLI scripts use Oxlint and Biome, then typecheck/tests. Existing commands are documented below.
- No code/config migration edits had been made at snapshot time.

## Pack Contract: Separate Follow-up

The pack contract is represented in multiple places today:

- `packs/exam-pack.schema.json`: published/served JSON Schema.
- `src/lib/types/exam-pack.ts`: frontend TypeScript shape.
- `src/lib/server/packs/validate.ts`: frontend runtime validation.
- `cli/src/core/built-pack-schema.ts`: Effect Schema and CLI built-pack types/validation.
- CLI authoring/profile/provenance schemas exist as distinct contracts; do not conflate those with the built-pack contract without domain analysis.

These definitions can drift. Current source-path validation is one area with divergent implementations. The follow-up must decide a single canonical representation and make the other consumers derive from or import it. Keep the root pack files as content unless that separate design explicitly changes their location. Read `requirements.md` before implementing this work.

## Linting and Ultracite Findings

### Oxlint

- Oxlint JS plugins support custom ESLint-compatible rule implementations, and Oxlint has a `RuleTester` API.
- The JS plugin API is alpha and not semver-stable. It adds a JavaScript plugin pass with more runtime/compatibility burden than native Rust rules.
- Oxlint supports Svelte `<script>` analysis only; it does not expose Svelte template/style ASTs to JS plugins.
- Script-level custom checks (for example selected `addEventListener`, browser-global, or navigation-call patterns) are feasible. Template checks (`{@html}`, `target`/`rel`, button type, markup accessibility, template-used props/classes) are not robust Oxlint JS-plugin rules today.
- Effect TS-Go preset/rules must apply only to CLI files/config, even if base Oxlint becomes repo-wide.

### Biome

- Current root Biome config already enables `svelte: all` and experimental full HTML/Svelte handling.
- Biome GritQL plugins can report diagnostics and suggest rewrites, but documented GritQL target languages are JavaScript/TypeScript, CSS, and JSON. This does not expose custom rules over Svelte template ASTs. Verify embedded `<script>` behavior before relying on GritQL rules inside `.svelte` files.
- Native Biome Svelte handling remains experimental; do not equate it with full rule parity for SvelteKit.

### `eslint-plugin-svelte` and Ultracite

- Ultracite's `ESLint parity` optional preset refers to JS plugins (e.g. GitHub/SonarJS/React Doctor); it is not the Svelte parser plugin.
- The official `eslint-plugin-svelte` uses `svelte-eslint-parser` and includes Svelte-specific template, security, best-practice, and SvelteKit rules.
- Ultracite documents ESLint + Prettier + Stylelint as its broadest/mature option for Svelte because framework parsers/plugins cover template rules and Prettier has `prettier-plugin-svelte`.
- That coverage statement describes ecosystem breadth, not necessarily preferred speed or simplicity.
- Existing Svelte compiler/`svelte-check` diagnostics already cover some accessibility/structural warnings. Identify those before duplicating rules.
- Ultracite's anti-slop preset is an example of a vendored Oxlint JS/TS rule plugin; it does not solve Svelte template parsing.

### Custom Rule Scope Previously Estimated

Planning ranges only; actual agent credits depend on the model/provider and billing plan. Running local Oxlint/Biome itself consumes no model tokens.

- 3–5 straightforward JS/TS-only custom rules in Oxlint: roughly 2–4 engineering days and 25k–60k agent tokens including rule tests/configuration.
- Similar syntactic JS/TS policies as Biome GritQL: roughly 0.5–2 engineering days and 10k–30k tokens; first verify file coverage.
- A production-quality Svelte-aware analyzer for several template rules: roughly 1–3 weeks and 100k–250k tokens, including parser/compiler integration, fixtures, diagnostics, configuration, and false-positive tuning.
- For actual Svelte template parity, custom plugin authoring in current Oxlint/Biome plugin APIs is not a low-cost shortcut. Prefer existing compiler/plugin coverage or explicitly accept a separate Svelte-aware analyzer/linter path.
- Each new rule requires a written invariant, positive/negative examples, tests, severity/suppression policy, and agent-readable diagnostics. False-positive remediation can add token use per affected change.

## Svelte AI Tooling Already Configured

- `.codex/skills/svelte-best-practices/SKILL.md` guides `$state`, `$derived`/`$effect`, props, events, snippets, keyed each blocks, CSS custom properties, context/SSR, async features, and legacy migration.
- The skill is agent guidance, not an automatic repository rule set.
- `.codex/config.toml` configures the Svelte MCP server.
- `AGENTS.md` requires skill use for Svelte analysis/edits, MCP `list-sections` before `get-documentation`, and autofixer after changes.
- `.codex/agents/svelte-file-editor.toml` defines an agent workflow using the skill, MCP docs, autofixer, and project checks. Its command text has a typo: `pnpm lint: fix`; actual script is `pnpm lint:fix`.
- MCP docs are reference material; `svelte-autofixer` returns suggestions for supplied code. Neither is a repo-wide deterministic linter.
- Existing skill gaps identified: explicit security policy for `{@html}`; `target="_blank"` guidance; accessibility/semantic controls checklist; SvelteKit navigation `resolve()` and route-specific rules; general DOM/listener/subscription cleanup; stale Svelte suppressions/debug markers; unused props/classes; performance/correctness checks.
- Svelte compiler/accessibility checks may already cover some of this at validation time; the gap is that the AI skill does not systematically enumerate those checks and MCP/autofixer is not a continuous enforcement mechanism.
- Tighten the skill's blanket “use `$state` classes instead of stores” advice: Svelte docs retain stores for complex async streams and manual subscription/update control.

## Migration Hazards to Re-audit After Moving Apps

- Update `pnpm-workspace.yaml` to include intended app/package globs while preserving the root package as orchestrator.
- Move root `src/` and app-specific configs/dependencies/scripts to `apps/web`; move `cli/` to `apps/pack-cli`; update root scripts and package imports.
- `.gitignore` currently has root-anchored SvelteKit/build paths; update for nested app output paths.
- App code has cwd-relative `packs/` and `.local/` references. Make these stable from workspace root rather than depending on where a script is launched.
- Preserve existing user data at `.local/exam-packs.sqlite`; do not move, replace, or reset it without an explicit data migration.
- Update `import.meta.url` fixture paths, pack README links/build instructions, and CLI fixture README paths after moving the CLI.
- Re-audit all relative URLs/paths after relocation; in particular `cli/test` fixture paths need an extra parent segment when moved under `apps/pack-cli/test`.
- Keep content fixtures under root `packs/` discoverable from both apps.

## Required Verification / Svelte Workflow

- Frontend or root config changes: `pnpm verify` from repo root.
- CLI-only changes: `pnpm --dir cli verify` before relocation; update path after relocation.
- Changes spanning both apps/shared tooling: `pnpm verify:all` from repo root.
- Verification scripts may rewrite files. Review diffs and retain only task-related changes.
- For Svelte APIs: use MCP `list-sections` first, then request only needed documentation sections.
- After Svelte code edits: run `svelte-autofixer` on each affected component/module and address findings.
- Do not claim code verification if it was not run.

## External References

- [pnpm workspaces](https://pnpm.io/workspaces)
- [Turborepo repository structure](https://turborepo.dev/docs/crafting-your-repository/structuring-a-repository)
- [Biome large projects / nested configs](https://biomejs.dev/configuration/big-projects/)
- [Oxlint JS plugins](https://oxc.rs/docs/guide/usage/linter/js-plugins.html)
- [Oxlint custom plugin authoring](https://oxc.rs/docs/guide/usage/linter/writing-js-plugins.html)
- [Biome GritQL linter plugins](https://biomejs.dev/linter/plugins/)
- [Biome GritQL targets](https://biomejs.dev/reference/gritql/)
- [Ultracite optional presets](https://www.ultracite.ai/docs/presets)
- [Ultracite language/toolchain coverage](https://www.ultracite.ai/docs/languages#choosing-a-toolchain)
- [Official Svelte ESLint rules](https://sveltejs.github.io/eslint-plugin-svelte/rules/)
- [TypeScript project references](https://www.typescriptlang.org/docs/handbook/project-references)
- [TypeScript module resolution in monorepos](https://www.typescriptlang.org/docs/handbook/modules/reference)

## Next Agent Actions

1. Treat this handoff as context; do not repeat completed toolchain research unless current docs/version checks change a key premise.
2. Produce a concrete migration plan for structure 2 and the lint configuration. Keep the pack-contract single-source-of-truth task separate and explicitly tracked.
3. Decide how much Svelte template enforcement is required. Prefer existing Svelte-aware coverage over reimplementing a broad rule set in Oxlint/Biome plugins.
4. If proceeding to code changes, inventory and update all path/config/script/workspace references, then run the verification command required by `AGENTS.md`.
