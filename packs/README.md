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
