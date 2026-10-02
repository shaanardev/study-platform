# Local exam packs

Put each versioned pack JSON file directly in `packs/incoming/`. Bundled source files referenced by
a pack must be relative paths beside that JSON file (for example, `assets/notes.md`). Academy-note
paths resolve under the local source root described below.

Use [the exam pack schema](./exam-pack.schema.json) as the format reference. The included
Databricks Data Engineer Associate pack is a clearly labelled synthetic example. It is not an exam
dump and is safe to import as a starter sample.

The pack contains a stable exam ID and exam version, a stable pack ID and pack version, weighted
domains, an optional passing threshold, and single-choice or multiple-choice questions. Each
question carries its answer IDs, explanation, and one or more source references. Domain weights
must total 100; question, domain, and option IDs must be unique in their scope. Bundled citations
use `{ "path", "label" }` and resolve under the pack folder. Academy-note citations use
`{ "kind": "academy_note", "path", "label", "section?", "documentationUrls" }`. Their `path`
is relative to `ACADEMY_SOURCE_ROOT`, configured locally for the app and CLI. Note text is read
only when opened; neither note text nor documentation pages are copied into generated assets or the
database. Documentation URLs are stored as HTTPS link metadata.

Importing is explicit: open the local app and select **Import packs from local folder**. Valid
versions are stored in `.local/exam-packs.sqlite`; personal pack files and local database files are
excluded from Git. Reimporting an already stored exam, pack, and pack version is reported as a
duplicate instead of overwriting it.

## Build and verify

The Effect CLI builds packs from a JSON authoring file. Its format includes `metadata`, an
`outputFile`, an `assetsDirectory`, deterministic `shuffle` seeds, and `questions` with option IDs,
correct option IDs, bundled source paths, or academy-note citations. See
[`cli/test/fixtures/multi-domain/authoring.json`](../cli/test/fixtures/multi-domain/authoring.json)
and the [single-domain example](../cli/test/fixtures/single-domain/authoring.json).
Bundled source paths in the authoring file are relative to that file. The builder copies those
under the output directory's asset folder. Set `ACADEMY_SOURCE_ROOT` to the local
academy-learning-plan directory to verify note paths. The builder preserves academy-note citations
as metadata and copies only explicitly listed bundled files and metadata assets. Run from the
repository root:

```bash
pnpm pack:build cli/test/fixtures/multi-domain/authoring.json /tmp/example-pack
ACADEMY_SOURCE_ROOT=/path/to/academy-learning-plan pnpm pack:verify /tmp/example-pack/sample-pack.json
```

Pack verification checks structure, citation paths, and any supplied data-driven profile. The root
application suite separately covers importing packs, resolving academy notes on demand, and
rendering practice and review citations. A failed check exits nonzero. The generated JSON follows
[the pack schema](./exam-pack.schema.json).

## Databricks May 2026 practice pack

The [Databricks pack](./databricks-dea-may-2026/README.md) is an authored, synthetic 200-question
pack built from seven domain question files. Its data-driven profile checks the exact guide counts,
all objective mappings, question format, and baseline audit in addition to the generic schema and
app import checks.
