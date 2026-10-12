# Learning Platform

A local learning app for authoring, importing, and practising versioned exam packs. Domain rules and content requirements are in [requirements.md](requirements.md); pack authoring guidance is in [packs/README.md](packs/README.md).

## Layout

```text
apps/web/          SvelteKit learning app
apps/pack-cli/     Effect pack builder and verifier
packs/             Authored packs and source assets
.local/            Ignored, machine-local app data
packages/*         Reserved for a future shared pack contract
```

The shared pack contract remains implemented separately in the app and CLI; extracting it into `packages/` is deferred.

## Setup

Use the Node version in `.node-version` and pnpm. From the repository root, install the workspace:

```bash
pnpm install
pnpm dev
```

The development server binds to `127.0.0.1`. The root app commands (`dev`, `serve`, `build`, and `verify`) forward to `apps/web`. Pack CLI commands run from the repository root so their input and output paths are interpreted relative to the repository:

```bash
pnpm pack:build apps/pack-cli/test/fixtures/multi-domain/authoring.json /tmp/example-pack
pnpm pack:verify /tmp/example-pack/sample-pack.json
```

## Workspace commands

| Work | Root command | App-scoped command |
| --- | --- | --- |
| Run web app | `pnpm dev` | `pnpm --dir apps/web dev` |
| Build web app | `pnpm build` | `pnpm --dir apps/web build` |
| Verify web app | `pnpm verify` | `pnpm --dir apps/web verify` |
| Verify both apps | `pnpm verify:all` | — |
| Build a pack | `pnpm pack:build <authoring-file> <output-dir>` | `pnpm --dir apps/pack-cli packs build <authoring-file> <output-dir>` |
| Verify a pack | `pnpm pack:verify <pack-file>` | `pnpm --dir apps/pack-cli packs verify <pack-file>` |
| Verify pack CLI | `pnpm --dir apps/pack-cli verify` | same |

Run `pnpm --dir apps/web check` for web typechecking, Svelte-aware lint validation, and tests without the lint-fix step. The CLI's standalone `verify` runs its lint fixes, typechecking, and tests.

## Tool ownership

- Root `oxlint.config.ts` and `oxfmt.config.ts` extend Ultracite's Oxlint and Oxfmt presets. Root Ultracite runs one Oxlint pass across the monorepo, with Effect TS-Go rules scoped to pack CLI files. Root Oxfmt formats the web app and CLI.
- `apps/web` uses Ultracite's ESLint path for Svelte components and rune modules, plus project-specific Tailwind checks. Shared JavaScript, TypeScript, and Unicorn rules are handled by root Oxlint. `svelte-check` remains responsible for Svelte and TypeScript diagnostics.
- Tailwind linting uses `eslint-plugin-better-tailwindcss` with the app's actual CSS entry point, including Skeleton utilities. It enforces named theme values and semantic colors, shorthand and canonical utilities, and checks duplicate, conflicting, deprecated, and unknown classes.
- `apps/pack-cli` has its own Oxlint config for standalone checks, including Effect TS-Go and CLI-specific Vitest settings. Root gates apply the Effect rules in the global pass and then run CLI typechecking/tests directly.
- SonarJS rules are disabled. Stylelint is not used; Tailwind class semantics are checked through ESLint.
- JSON fixtures are exercised by the pack tests; there is no dedicated JSON duplicate-key linter.
- The pack contract still has validation logic in more than one place. Consolidating it into one shared source of truth is deferred; keep app import checks and CLI pack verification aligned.

`pnpm lint` and `pnpm validate` are read-only. `pnpm lint:fix` uses Ultracite once for global Oxlint/Oxfmt fixes, then runs its web ESLint provider for Svelte checks. `pnpm verify` runs the global pass on web files, then web verification. `pnpm verify:all` runs the global pass once across the monorepo, then web and CLI typechecking/tests. Tailwind class policies are enforced by ESLint; no separate Stylelint rules are configured.

### Tailwind policy

| Former Biome rule | ESLint replacement |
| --- | --- |
| `noTailwindArbitraryValue` | `better-tailwindcss/no-restricted-classes`: disallow arbitrary values/properties; allow arbitrary variants |
| `useTailwindShorthandClasses` | `better-tailwindcss/enforce-shorthand-classes` |
| `noTailwindRawColors` | `better-tailwindcss/no-restricted-classes`: disallow stock palette colors, including variants and opacity modifiers |

Use named theme tokens or registered utilities for bespoke values. Semantic color names and `black`, `white`, `transparent`, `current`, and `inherit` remain allowed. Oxfmt sorts Tailwind classes while formatting across the monorepo. These policies approximate Biome's rules; they do not make the two analyzers identical. Tailwind rules run through the web app's ESLint provider in Ultracite.
