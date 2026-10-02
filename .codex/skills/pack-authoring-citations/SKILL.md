---
name: pack-authoring-citations
description: Plan, author, and verify exam packs in this repository, especially when converting source material or deciding how question citations should work.
---

# Pack authoring and citations

Use this skill when creating or converting exam question packs in this repository. Before bulk conversion, establish which source types each question needs, what learners should open, and whether sources must work offline. Inspect the current pack schema, CLI, importer, and practice UI; do not rely on an old audit or assume a proposed migration has shipped.

The current implementation uses `sources: [{ path, label }]`. The CLI resolves source paths relative to the authoring file and copies them into the output pack. Import requires each path to resolve to a file inside the pack folder, and practice opens the stored local text through the app. A web URL in `path` is not current URL citation support. If the requested mix includes academy notes and clickable Databricks documentation URLs, surface this contract gap before bulk work and agree whether to keep archived/local copies, change the product contract, or defer URL citations. Do not silently discard either source type or imply URL support exists.

Use this workflow:

1. Read `packs/README.md`, `packs/exam-pack.schema.json`, the CLI authoring schema/build and verify implementation, importer, and practice source display/handler. Confirm exact behavior in the current checkout.
2. Record the citation contract and content constraints: source kinds, per-question attribution, offline needs, source naming/labels, and any desired external links. Keep evidence and citations attached to each question; do not invent provenance.
3. Author one representative question end to end before scaling. Use the compact example in [references/one-question.md](references/one-question.md) as a pattern, updating commands and fields if repository behavior changes.
4. Build and run the CLI verifier for the representative pack, then inspect its generated JSON and source assets. Verify one imported question in the practice/review UI or through the relevant app flow so the learner-facing citation matches the agreed contract.
5. Only after that path works, proceed with the agreed bulk conversion. Keep IDs stable, domain weights totaling 100, answer IDs aligned with options, and each explanation supported by its question's sources.
