# Databricks Data Engineer Associate practice pack

This pack prepares for the exam guide effective May 4, 2026. It contains 200 independent practice
questions with four choices, one correct answer, explanations, original academy-note citations,
and Databricks documentation links. The question bank matches all seven domain weights exactly.
Academy notes are referenced as local metadata and are read on demand; their contents are not copied
into the repository, generated pack, or database.

The importable file is
[`../incoming/databricks-dea-may-2026-v1.2.0.json`](../incoming/databricks-dea-may-2026-v1.2.0.json).
Its non-source metadata assets and verification report are beside it in
[`../incoming/assets/databricks-dea-may-2026-v1.2.0/`](../incoming/assets/databricks-dea-may-2026-v1.2.0/).
Keep that directory with the JSON when moving the pack. The authored input is
[`authoring/authoring.json`](authoring/authoring.json), with one question file per domain and a
data-driven verification profile. The generated versioned JSON and required assets are tracked in
Git; unrelated personal packs remain ignored.

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
3. Select **May 2026 reviewed baseline and original practice**, version **1.2.0**.
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

Academy-note citations store only the original relative note path, a label, optional section
metadata, and related Databricks documentation URLs. The app reads an original note on demand from
`ACADEMY_SOURCE_ROOT`; importing the pack stores the citation metadata without storing note text or
documentation digests. The generated asset directory contains only the compact baseline audit,
objective map, provenance record, and verification report.

The asset directory contains:

- `baseline-review.json`: metadata dispositions for all 194 baseline questions, without copied
  answers or explanations.
- `objective-coverage.json`: question assignments to all 33 objective groups from the guide.
- `provenance.json`: guide/date context, baseline dispositions, synthetic-content note, and source
  precedence.
- `verification-report.json`: actual proportions, objective coverage, answer positions, and app checks.

The local Ordewell and spawned Codex session records informed the import contract, versioning,
local sources, and weighted mock behavior. They are application design context, not authorities
for Databricks technical answers.

## Verify and archived source

Build and verify the pack from the repository root:

```bash
pnpm pack:build packs/databricks-dea-may-2026/authoring/authoring.json packs/incoming
ACADEMY_SOURCE_ROOT=/path/to/academy-learning-plan pnpm pack:verify packs/incoming/databricks-dea-may-2026-v1.2.0.json --profile packs/databricks-dea-may-2026/authoring/profile.json
```

The CLI checks the exam-pack schema, academy-note path containment, exact domain counts and weights,
objective coverage, question rules, and baseline dispositions. The root application suite covers
pack import, on-demand note loading, practice, and review citation rendering. The generic authoring
input and verification profile are the maintained source for this pack.

The verification report records the pack SHA-256, so its results apply to that precise JSON.
For future content changes, increment the pack version, output filename, and asset directory
together before building and importing a new version.
