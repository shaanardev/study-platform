# Databricks Data Engineer Associate practice pack

This pack prepares for the exam guide effective May 4, 2026. It contains 200 independent practice
questions with four choices, one correct answer, explanations, and local source references. The
question bank matches all seven domain weights exactly. It uses the supplied academy notes,
screenshots, code cheatsheet, and third-party baseline; videos are excluded.

The importable file is
[`../incoming/databricks-dea-may-2026-v1.0.0.json`](../incoming/databricks-dea-may-2026-v1.0.0.json).
Its sources and reports are beside it in
[`../incoming/assets/databricks-dea-may-2026-v1.0.0/`](../incoming/assets/databricks-dea-may-2026-v1.0.0/).
Keep that directory with the JSON when moving the pack. These generated personal files follow the
repository's existing Git ignore rules. The original recipe is preserved under `legacy/` for a
future conversion to the generic JSON authoring format.

## Exam blueprint and question counts

The [official May 2026 exam guide](https://www.databricks.com/sites/default/files/2026-05/databricks-certified-data-engineer-associate-exam-guide-may-2026-000.pdf)
defines the domain weights. With 200 questions, the count for each domain is `200 × weight / 100`.
A 194-question bank cannot represent all these percentages exactly with whole questions.

| Domain | Guide weight | Questions | Actual weight |
| --- | ---: | ---: | ---: |
| Databricks Intelligence Platform | 6% | 12 | 6% |
| Data Ingestion and Loading | 21% | 42 | 21% |
| Data Transformation and Modeling | 22% | 44 | 22% |
| Working with Lakeflow Jobs | 16% | 32 | 16% |
| Implementing CI/CD | 10% | 20 | 10% |
| Troubleshooting, Monitoring, and Optimization | 10% | 20 | 10% |
| Governance and Security | 15% | 30 | 15% |
| Total | 100% | 200 | 100% |

The official guide specifies 45 scored questions and 90 minutes. For a mock in this app, request
45 questions and set the time limit to 90 minutes. The app rounds domain counts using its existing
largest-remainder allocator: 3, 9, 10, 7, 5, 4, and 7 respectively. Those rounded mock counts sum to
45; the complete practice bank has the exact percentages. Coverage also supports the app's
100-question maximum.

## Import and practice

1. Start the app with the existing `pnpm dev` command.
2. Open the pack library and select **Import packs from local folder**.
3. Select **May 2026 reviewed baseline and original practice**, version **1.0.0**.
4. Use domain practice or configure a timed mock.

The pack follows [the app schema](../exam-pack.schema.json), uses exam version `2026-05-04`, and
keeps stable question IDs. The app rejects importing an already stored pack version. No official
passing threshold is supplied by this guide, so the optional threshold is omitted. The pack is
labelled synthetic to identify independent practice content rather than official exam questions.

## Baseline review and sources

The input contains 194 questions. This pack adapts 128 of them, including 69 complete rewrites,
and adds 72 new questions. All 66 exclusions have recorded reasons, including duplication,
scope, outdated APIs, or incorrect claims. New items address managed ingestion, job triggers,
bundle targets and variables, ABAC, current layout optimization, and applied Spark operations.

Technical corrections include JSON inference versus `multiLine`, reader versus writer schema
evolution, Quartz scheduling, bundle run versus deploy, account group checks, privilege
inheritance, managed table recovery, and the scope of standalone SQL `DENY`. Official
documentation takes precedence over supplied notes when they differ. The syllabus is pinned to
May 2026; technical documentation was checked on October 1, 2026. Scenarios with runtime-dependent
behavior state their supported-compute or eligibility assumptions.

The source archive preserves 172 non-video files, including existing text subtitles. Source
references consumed by the app point to readable Markdown, so screenshots remain companion
material rather than being passed to its UTF-8 source reader. Archived baseline source cards
contain the original records and clearly identify their reviewed answers; original answer keys
can be superseded.

The asset directory contains:

- `baseline-review.json`: the disposition of every original question and reviewed answer details.
- `objective-coverage.json`: question assignments to 33 objective groups from the guide.
- `provenance.json`: source inventory, hashes, source precedence, and session context.
- `verification-report.json`: actual proportions, objective coverage, answer positions, and app checks.
- `references/`: concise study digests with primary documentation links.
- `materials/`: the supplied source archive, with video files excluded.

The local Ordewell and spawned Codex session records informed the import contract, versioning,
local sources, and weighted mock behavior. They are application design context, not authorities
for Databricks technical answers.

## Verify and archived source

Run the active generic verifier from the repository root:

```bash
pnpm pack:verify packs/incoming/databricks-dea-may-2026-v1.0.0.json
```

The previous TypeScript runner and DEA recipe are archived in [`legacy/`](./legacy/). The
[`curation.ts`](./legacy/recipes/databricks-dea-may-2026/curation.ts) file preserves editorial
choices and authored questions; [`references.ts`](./legacy/recipes/databricks-dea-may-2026/references.ts)
preserves primary documentation references. The archived
[`verify-profile.ts`](./legacy/recipes/databricks-dea-may-2026/verify-profile.ts) preserves exact
guide weights, objectives, source hashes, and baseline audit rules. These files are historical
material and are not active CLI commands. Rebuilding this DEA version requires converting its
reviewed content and local sources into the new JSON authoring format.

The verification report records the pack SHA-256, so its results apply to that precise JSON.
For future content changes, increment the pack version, output filename, and asset directory
together before building and importing a new version.
