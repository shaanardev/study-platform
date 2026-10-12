# Tooling migration regression audit

**Audited:** 2026-10-12

**Baseline:** `1ecce927209e522ac0442a6d317964c4740ed647`

**Scope:** migration of the web app and pack CLI into `apps/`, source/config changes, and effective lint/check behavior. This is a bounded audit, not proof that every possible behavior is unchanged.

## Summary

The migration preserves the application and CLI structure across 86 explicit old-to-new file pairs: 29 pairs are byte-identical, and no mapped file is missing. Comparing temporary Oxfmt-normalized copies isolates formatter churn from behavioral edits. The pack CLI implementation is substantively unchanged; its package paths and `rootDir` were adjusted for its new location. The reviewed Svelte and stylesheet edits are equivalent by inspection and generated utility declarations, with two intentional Skeleton utility corrections that may alter rendering.

Two low-severity path defects were confirmed in the web server changes. A separate medium-severity accessibility enforcement gap was reproduced: the current gate accepts a static `div` click handler that the baseline Biome gate rejected. These findings are follow-ups; this audit did not modify implementation.

## Findings

| Priority | Finding | Evidence and impact |
| --- | --- | --- |
| Medium | Accessibility warnings do not fail the web check gate. | An identical Svelte probe with a static `div` click handler produces two Biome errors and exits 1 under the baseline `--error-on-warnings` gate. The actual current ESLint config reports no messages for it; `svelte-check` reports two a11y warnings but exits 0. The web `typecheck` script omits `--fail-on-warnings`. Add that flag (or an equivalent error policy) so compiler a11y warnings block verification. See [web package scripts](apps/web/package.json). |
| Low | `findWorkspaceRoot('.')` can loop indefinitely. | A bounded run from `apps/web` timed out after 2 seconds; the absolute-path control completed in 0.22 seconds and found the workspace root. Parsing `.` yields an empty root and `dirname('.')` remains `.`, preventing traversal to the cwd fallback. Resolve the starting path before walking. The common default uses an absolute module path, so this is latent unless a relative start is supplied. See [workspace-paths.ts](apps/web/src/lib/server/workspace-paths.ts). |
| Low | Relative approved source roots now resolve from a different directory. | Before migration, root `pnpm dev` started Vite from the repository root; it now delegates to `apps/web`. The importer resolves a supplied relative root against cwd, so `notes` changes from `/repo/notes` to `/repo/apps/web/notes`. The input is accepted, and the documentation does not require an absolute path. Resolve against the workspace root to preserve prior behavior, or define and validate an absolute-only contract. Absolute paths remain unaffected. See [importer.ts](apps/web/src/lib/server/packs/importer.ts) and [root dev script](package.json). |
| Low | The current check gate accepts a new Biome `noUnnecessaryConditions` warning. | With Tailwind v4 directives enabled identically in temporary baseline and current snapshots, the baseline scan reported zero diagnostics and current reported one warning at the workspace-root walk (`while (true)`). The baseline `biome check ./src --error-on-warnings` gate would reject that warning; current lint-only scans do not use this rule/gate. This is a concrete diagnostic comparison, separate from the historical rule-domain inventory. |

No other confirmed application or CLI regressions were found in the reviewed scope. Runtime path anchoring for pack files, SQLite, schema, and fixtures is an intentional relocation adjustment in [workspace-paths.ts](apps/web/src/lib/server/workspace-paths.ts). The source route's `Response` replacement preserves content type and private cache headers. Feedback object spread and CLI schema assertions retain their behavior. The two Skeleton utility changes replace unavailable/invalid old utilities with current presets; treat any visual difference as an intentional correction, though pixel equivalence was not established. See [migration notes for styling](apps/web/src/routes/layout.css).

## Lint and check migration

The current web gate runs Oxlint, ESLint, Oxfmt, `svelte-check`, and Vitest. ESLint actively provides four type-aware TypeScript checks; web Oxlint does not enable type-aware mode. The CLI enables type-aware Oxlint and its Effect preset. Web ESLint also activates nine Tailwind rules. This is meaningful coverage, but the sampled Tailwind policies do not establish exact parity with the old Biome policy.

The historical [`TOOLING-COVERAGE-AUDIT.md`](TOOLING-COVERAGE-AUDIT.md) inventories declared Biome rule domains; it is not evidence that every listed rule blocked the previous gate. Activation probes against the original config returned no diagnostics for sampled arbitrary-value/raw-color Tailwind, strict-boolean, base-to-string, and exhaustive-switch examples. Even `--only` probes reported informational diagnostics and exited 0 with `--error-on-warnings`. Accordingly, absent typed rules are candidate policy gaps, not confirmed migration regressions. The current Tailwind setup enforces some related policies, but no exact parity claim is made.

Candidate policies to decide explicitly include strict boolean expressions, exhaustive switches, unsafe addition operands, and unnecessary conditions. The four active typed web ESLint rules are `await-thenable`, `no-deprecated`, `no-floating-promises`, and `no-misused-promises`; TypeScript strictness does not replace the other lint checks. A rule appearing in Oxlint's printed config is insufficient evidence that it runs: typed rules also require type-aware execution. Svelte's `app.html` has formatting but no HTML lint, and the CLI explicitly allows four Vitest policies (`valid-title`, `no-conditional-expect`, `expect-expect`, `no-standalone-expect`). These are configuration decisions to review, rather than proven former gate failures.

CSS and JSON semantic lint are absent in the current setup; Oxfmt formats these files but does not lint them. Their individual diagnostics were not exhaustively compared against the old gate, so this audit records the missing lint as an accepted scope omission rather than claiming regression parity. In the original unadjusted Biome scan, baseline had zero diagnostics while current had 13 CSS parse errors and one warning. Enabling `tailwindDirectives` in both temporary snapshots removed the parse errors (baseline: zero diagnostics across 74 files; current: one `noUnnecessaryConditions` warning across 76 files, on `while (true)` in the workspace helper). That warning is a concrete gate difference: the old `--error-on-warnings` command rejects it.

## Verification and limits

Post-migration verification passed:

| Command | Result |
| --- | --- |
| `pnpm --dir apps/web check` | Passed; 14 test files, 48 tests; `svelte-check` reported zero errors and warnings. |
| `pnpm --dir apps/pack-cli lint && pnpm --dir apps/pack-cli typecheck && pnpm --dir apps/pack-cli test` | Passed; 8 test files, 34 tests; existing Effect unstable warnings. |
| `pnpm build` | Passed. |

Total: 82 tests. These runs validate the current tree, not migration equivalence against a rebuilt baseline. A repeat audit can use the recorded baseline SHA, map the 86 old/new paths, normalize temporary copies with Oxfmt to isolate formatting, inspect effective current lint configs, and run small targeted probes for changed semantics. Then use one Luna pass over only the semantically changed hunks and finish with the repository checks above. No permanent audit script is required.

The audit did not perform baseline dependency reconstruction, browser screenshots, or pixel-by-pixel comparison. Source mapping, normalized comparisons, probes, and scan outputs were kept as transient evidence under `/tmp/migration-audit*`; the baseline commit and method are recorded above for repeatability. Principal evidence includes `/tmp/migration-audit/move-map.json`, `/tmp/migration-audit-biome-{baseline,current}.json`, and `/tmp/migration-audit-{web-check,cli-check,build}.log`. The comparison covers the current working tree against HEAD, so findings are not all attributable solely to moving files. No implementation fix was made as part of this report.
