# Local exam packs

Put each versioned pack JSON file directly in `packs/incoming/`. Source files referenced by a pack
must be relative paths beside that JSON file (for example, `assets/notes.md`). The app checks each
reference exists inside the pack folder before storing the pack.

Use [the exam pack schema](./exam-pack.schema.json) as the format reference. The included
Databricks Data Engineer Associate pack is a clearly labelled synthetic example. It is not an exam
dump and is safe to import as a starter sample.

The pack contains a stable exam ID and exam version, a stable pack ID and pack version, weighted
domains, an optional passing threshold, and single-choice or multiple-choice questions. Each
question carries its answer IDs, explanation, and one or more source references. Domain weights
must total 100; question, domain, and option IDs must be unique in their scope. Source paths must
resolve to files under the same local pack folder.

Importing is explicit: open the local app and select **Import packs from local folder**. Valid
versions are stored in `.local/exam-packs.sqlite`; personal pack files and local database files are
excluded from Git. Reimporting an already stored exam, pack, and pack version is reported as a
duplicate instead of overwriting it.

## Build and verify

The Effect CLI builds packs from a JSON authoring file. Its format includes `metadata`, an
`outputFile`, an `assetsDirectory`, deterministic `shuffle` seeds, and `questions` with option IDs,
correct option IDs, and local source paths. See
[`cli/test/fixtures/multi-domain/authoring.json`](../cli/test/fixtures/multi-domain/authoring.json)
and the [single-domain example](../cli/test/fixtures/single-domain/authoring.json).
Source paths in the authoring file are relative to that file. The builder copies them under the
output directory's asset folder. Run from the repository root:

```bash
pnpm pack:build cli/test/fixtures/multi-domain/authoring.json /tmp/example-pack
pnpm pack:verify /tmp/example-pack/sample-pack.json
```

Verification checks pack structure and local sources, then imports the pack into an isolated
temporary database and exercises the app's question allocator. A failed check exits nonzero.
The generated JSON follows [the pack schema](./exam-pack.schema.json).

## Databricks May 2026 practice pack

The [Databricks pack](./databricks-dea-may-2026/README.md) is an authored, synthetic 200-question
pack built from seven domain question files. Its data-driven profile checks the exact guide counts,
all objective mappings, question format, and baseline audit in addition to the generic schema and
app import checks.
