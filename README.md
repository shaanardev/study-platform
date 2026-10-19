# Learning Platform

A local learning app for authoring, importing, and practising versioned exam packs. Domain rules and content requirements are in [requirements.md](requirements.md); pack authoring guidance is in [packs/README.md](packs/README.md).

## Layout

```text
app/
  web/
    src/routes/       Home, practice, mock, progress, review, and pack endpoints
    src/lib/server/   Database, pack import, quiz, feedback, and progress logic
    src/lib/types/    App and pack types
  pack-cli/
    src/build/        Build packs from authoring files
    src/core/         Built-pack schema and shared CLI types
    src/verify/       Validate packs and quality profiles
scripts/
  ultracite-hook.ts  Local lint hook for changed files
tooling/
  oxlint-plugin/     Project-specific Oxlint rules
packs/
  exam-pack.schema.json
  incoming/                  Versioned importable packs and assets
  databricks-dea-may-2026/    Synthetic pack authoring project
.local/                       Ignored, machine-local app data
```

The workspace includes `packages/*` as a future shared-module location. Built-pack validation remains in the app and CLI; extracting a shared pack contract is deferred.

## Setup

Use the Node version in `.node-version` and pnpm. From the repository root, install the workspace:

```bash
pnpm install
pnpm dev
```

The development server binds to `127.0.0.1`. Root commands run the web app or verify the full workspace. Pack CLI commands run from the repository root so their input and output paths are interpreted relative to the repository:

```bash
pnpm pack:build app/pack-cli/test/fixtures/multi-domain/authoring.json /tmp/example-pack
pnpm pack:verify /tmp/example-pack/sample-pack.json
```

## Workspace commands

| Work | Root command | App-scoped command |
| --- | --- | --- |
| Run web app | `pnpm dev` | `pnpm --dir app/web dev` |
| Build web app | `pnpm build` | `pnpm --dir app/web build` |
| Check the workspace | `pnpm check` | — |
| Verify the workspace | `pnpm verify` | — |
| Run all tests and coverage | `pnpm test` | — |
| Build a pack | `pnpm pack:build <authoring-file> <output-dir>` | `pnpm --dir app/pack-cli packs build <authoring-file> <output-dir>` |
| Verify a pack | `pnpm pack:verify <pack-file>` | `pnpm --dir app/pack-cli packs verify <pack-file>` |

`pnpm test` runs all Vitest projects and writes `coverage/index.html`. The run fails if repository-wide line coverage falls below 70%.
