# One question from authoring to learner citation

This example uses both citation forms: a bundled reference that travels with the pack and a local note that stays on the machine building and running the app.

Create `/tmp/pack-one/authoring.json`, `/tmp/pack-one/references/concept.md`, and `/tmp/pack-one/local-notes/review.md`:

```json
{
  "metadata": {
    "schemaVersion": 1,
    "exam": { "id": "sample-exam", "title": "Sample Exam", "version": "1" },
    "pack": { "id": "sample-practice", "title": "Sample Practice", "version": "1", "synthetic": true },
    "domains": [{ "id": "governance", "title": "Governance", "weight": 100 }]
  },
  "outputFile": "sample-pack.json",
  "assetsDirectory": "assets",
  "shuffle": { "answerSeed": "sample-answers-v1", "orderSeed": 7 },
  "questions": [
    {
      "id": "governance-q1",
      "type": "single_choice",
      "domainId": "governance",
      "prompt": "Which setting limits a principal to selected catalog objects?",
      "options": [
        { "id": "grant", "text": "Granting privileges on selected objects" },
        { "id": "workspace", "text": "Assigning a workspace" }
      ],
      "correctOptionIds": ["grant"],
      "explanation": "Object-level grants control access to selected resources.",
      "sources": [
        { "path": "references/concept.md", "label": "Access control reference" },
        { "kind": "local_note", "path": "review.md", "label": "Review note" }
      ]
    }
  ]
}
```

Put the portable supporting text in `references/concept.md`. Put any private or machine-local context in `local-notes/review.md`. A bundled source's path is relative to the authoring file. The CLI copies it under `assetsDirectory` and writes that relative asset path into the built pack. A local note's path is relative to the directory supplied with `--local-note-root`; it must be a safe relative path and resolve to a regular file within that root.

Build and verify from the repository root:

```bash
pnpm pack:build /tmp/pack-one/authoring.json /tmp/pack-one/out --local-note-root /tmp/pack-one/local-notes
pnpm pack:verify /tmp/pack-one/out/sample-pack.json
```

Check `/tmp/pack-one/out/sample-pack.json` against `packs/exam-pack.schema.json`. The bundled source path should be `assets/references/concept.md`, and that file should exist in the output pack. The local note's path should be an absolute `file:///...` URL. The verifier checks both source types exist as regular files, and bundled paths must remain inside the pack folder.

On import, the app saves bundled source text with the imported pack. For absolute file citations, enter and explicitly approve the intended local source root in the app. The importer checks the resolved cited files stay inside that root and saves their excerpts in the local database. When a learner opens a citation, the app serves the saved excerpt and does not read the file URL. Reimporting the exact same pack with an approved root can refresh excerpts without changing pack content or practice history. Network URLs such as `https://...` are not supported citation paths.
