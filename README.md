# Learning Platform

A local learning app for authoring, importing, and practising versioned exam packs. Domain rules and content requirements are in [requirements.md](requirements.md); pack authoring guidance is in [packs/README.md](packs/README.md).

## Layout

```text
apps/
  web/
    src/routes/       Home, practice, mock, progress, review, and pack endpoints
    src/lib/server/   Database, pack import, quiz, feedback, and progress logic
    src/lib/types/    App and pack types
  pack-cli/
    src/build/        Build packs from authoring files
    src/core/         Built-pack schema and shared CLI types
    src/verify/       Validate packs and quality profiles
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
