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
    src/core/         Build and verification helpers
    src/verify/       Validate packs and quality profiles
packages/
  exam-pack/         Shared Effect schema, validation, types, and JSON Schema generation
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

The `@learning-platform/exam-pack` workspace package owns the canonical built-pack schema, shared types, and structural and semantic validation used by the web app and CLI. Generate `packs/exam-pack.schema.json` with `pnpm pack:schema:generate`; check that it stays current with `pnpm pack:schema:check`.

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
| Generate the pack JSON Schema | `pnpm pack:schema:generate` | `pnpm --dir app/pack-cli packs schema generate` |
| Check the generated pack JSON Schema | `pnpm pack:schema:check` | `pnpm --dir app/pack-cli packs schema check` |
| Build a pack | `pnpm pack:build <authoring-file> <output-dir>` | `pnpm --dir app/pack-cli packs build <authoring-file> <output-dir>` |
| Verify a pack | `pnpm pack:verify <pack-file>` | `pnpm --dir app/pack-cli packs verify <pack-file>` |

`pnpm test` runs all Vitest projects and writes `coverage/index.html`. The run fails if repository-wide line coverage falls below 70%.

## Local UI feedback

Press **Ctrl+Shift+F** to open the feedback overlay in page selection mode. Click an element or drag across an area directly, then add a note and queue it. The overlay returns to selection mode after each note so you can keep reporting feedback without another button click. Use **Change** to save another shortcut in this browser. Shortcuts leave typing controls alone; Escape cancels the current draft or closes selection mode.

Queued notes can be edited or removed before **Send** captures the visible app viewport, excluding the feedback controls. Feedback includes the route, viewport, scroll position, selection bounds in CSS pixels, DOM details, and available Svelte development source metadata. Rectangle selections use the element at their center for DOM and source details when available.

Run `pnpm dev` from a HerdR-managed terminal in the checkout that should receive feedback. A validated SvelteKit remote command uses the installed `herdr` CLI to find Codex agents in that exact worktree. It offers a choice when several match, or opens the worktree and starts one Codex agent when none match. The tool also works in local build/preview mode. Remote submission bodies are bounded before parsing. Svelte source locations are available when the development compiler exposes them; other builds retain DOM details and report source unavailable.

Submitted PNGs and feedback JSON are stored under the ignored `.ui-feedback/` directory in that worktree. The installed text prompt handoff receives the absolute image path and coordinates. Delivery is confirmed only when the target agent writes the feedback receipt. A timeout without a receipt is shown as a failure with uncertain delivery; retry checks for the receipt and does not blindly send the prompt again. Resolve a blocked agent in HerdR before retrying. Browser storage retains notes and retry images across reloads; if an image is unavailable, the overlay asks for a new selection.

Cancellation before submission prevents the send. Once a remote submission begins, stopping the wait cannot withdraw a prompt already received by HerdR; the queue retains the item for receipt checking. The installed SvelteKit command API does not expose transport cancellation. Server work observes request aborts and bounded timeouts; aborting the CLI does not terminate an agent session it may already have started.

The viewport image is a DOM rendering, so browser surfaces such as cross-origin frames and protected media may not reproduce. Capture errors keep the note available. Source resolution follows the Svelte metadata approach described in [Reactive-Axi](https://github.com/adeeshsharma/reactive-axi/tree/main/packages/reactive-axi); queue editing and durable feedback were also informed by [Plannotator](https://github.com/backnotprop/plannotator).
