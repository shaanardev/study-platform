---
name: pack-authoring-citations
description: Plan, author, and verify exam packs in this repository, especially when converting source material or deciding how question citations should work.
---

# Pack authoring and citations

Use this skill when creating or converting exam question packs in this repository. Before bulk conversion, establish which source types each question needs, what learners should open, and whether sources must work offline. Inspect the current pack schema, CLI, importer, and practice UI; do not rely on an old audit or assume a proposed migration has shipped.

The built pack uses `sources: [{ path, label }]` and supports two local citation forms:

- A bundled source has a safe pack-relative `path`. The CLI resolves its authoring path relative to the authoring file, copies the file under `assetsDirectory`, and writes that relative asset path to the built pack. Import checks that the file is inside the pack folder and saves its text with the imported pack, so it remains available from that imported snapshot.
- A local note is authored as `{ kind: "local_note", path, label }`. Its path must be safe and relative to the directory passed with `--local-note-root`. The builder resolves it beneath that root, requires a regular file, rejects symbolic links and paths that escape the root, then writes an absolute `file:///...` URL to the built pack. During import, the user must enter and explicitly approve a local source root. The importer checks that every cited file resolves inside the approved root and saves the excerpt in the local database. The app serves the saved excerpt; it never opens the absolute file URL when a learner clicks a citation.

Absolute file citations are machine-specific and are not portable when shared. Importing requires explicit approval of the root and snapshots cited excerpts into the local database, so later reads do not depend on the original paths remaining available. Reimporting the exact same pack with an approved root refreshes its excerpts without overwriting content or learner progress. Other URL schemes, including `https:`, are not citation paths; use bundled source files for portable material and reserve file citations for local notes intentionally available to the app.

Use this workflow:

1. Read `packs/README.md`, `packs/exam-pack.schema.json`, the CLI authoring schema/build and verify implementation, importer, and practice source display/handler. Confirm exact behavior in the current checkout.
2. Record the citation contract and content constraints: which sources should be bundled, which local notes should remain on disk, portability and offline needs, source labels, and per-question attribution. Keep evidence and citations attached to each question; do not invent provenance.
3. Author one representative question end to end before scaling. Use the compact example in [references/one-question.md](references/one-question.md) as a pattern, updating commands and fields if repository behavior changes.
4. Build and run the CLI verifier for the representative pack, passing `--local-note-root` when authoring local notes. Inspect the generated JSON: bundled paths should point to copied assets and local notes should be absolute file URLs. Check that the bundled assets exist and the local note remains at its intended path. Verify one imported question in the practice/review UI or through the relevant app flow so the learner-facing citation matches the agreed contract.
5. Only after that path works, proceed with the agreed bulk conversion. Keep IDs stable, domain weights totaling 100, answer IDs aligned with options, and each explanation supported by its question's sources.
