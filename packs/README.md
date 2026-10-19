# Local exam packs

Put each versioned pack JSON file directly in `packs/incoming/`. Bundled source files referenced by
a pack must be relative paths beside that JSON file (for example, `assets/notes.md`). Local notes
are authored with safe relative paths and become absolute `file://` citations during the CLI build.

Use [the exam pack schema](./exam-pack.schema.json) as the format reference. The included
Databricks Data Engineer Associate pack is a clearly labelled synthetic example. It is not an exam
dump and is safe to import as a starter sample.

The pack contains a stable exam ID and exam version, a stable pack ID and pack version, weighted
domains, an optional passing threshold, and single-choice or multiple-choice questions. Each
question carries its answer IDs, explanation, and one or more source references. Domain weights
must total 100; question, domain, and option IDs must be unique in their scope. Bundled citations
use `{ "path", "label" }` and resolve under the pack folder. Local-note citations use absolute
`file://` URLs produced from authoring entries of the form
`{ "kind": "local_note", "path", "label" }`. They work only where the cited files exist, so they
are machine-local and are not portable when a pack is shared. During import, enter and approve the
local source root; the app checks every citation against that root and saves the cited excerpts in
the local database. The app does not read those file paths when a learner later opens a citation.
The approval is stored per imported pack version. Reimporting the exact same pack with a confirmed
root refreshes its local excerpts without replacing pack content or practice history. Documentation
URLs in preserved legacy citation metadata are metadata only; the generic UI displays pack labels.

Importing is explicit: open the local app, enter the approved root when packs use absolute file
citations, check the approval box, and select **Import packs from local folder**. Valid versions are
stored in `.local/exam-packs.sqlite`; personal pack files and local database files are excluded
from Git. A changed pack with an already stored exam, pack, and version is reported as a duplicate
instead of overwriting it.

## Build and verify

The Effect CLI in `app/pack-cli` builds packs from a JSON authoring file. Its format includes `metadata`, an
`outputFile`, an `assetsDirectory`, deterministic `shuffle` seeds, and `questions` with option IDs,
correct option IDs, bundled source paths, or local-note citations. See
[`app/pack-cli/test/fixtures/multi-domain/authoring.json`](../app/pack-cli/test/fixtures/multi-domain/authoring.json)
and the [single-domain example](../app/pack-cli/test/fixtures/single-domain/authoring.json).
Bundled source paths in the authoring file are relative to that file. The builder copies those
under the output directory's asset folder. Pass `--local-note-root` when authoring local notes; the
builder requires each note to be a regular file inside that root and writes an absolute `file://`
URL into the pack. It copies only explicitly listed bundled files and metadata assets. Run from the
repository root:

```bash
pnpm pack:build app/pack-cli/test/fixtures/multi-domain/authoring.json /tmp/example-pack --local-note-root /path/to/local-notes
pnpm pack:verify /tmp/example-pack/sample-pack.json
```

Pack verification checks structure, citation paths, and any supplied data-driven profile. The web
app suite separately covers importing packs, approving and snapshotting local citations,
and rendering practice and review citations. A failed check exits nonzero. The generated JSON follows
[the pack schema](./exam-pack.schema.json).

## Databricks May 2026 practice pack

The [Databricks pack](./databricks-dea-may-2026/README.md) is an authored, synthetic 200-question
pack built from seven domain question files. Its data-driven profile checks the exact guide counts,
all objective mappings, question format, and baseline audit in addition to the generic schema and
app import checks.
