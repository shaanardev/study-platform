# One question from authoring to learner citation

This example follows the repository's current local-file source contract. It demonstrates the shape and round trip; use current paths and commands if the implementation changes.

Create `/tmp/pack-one/authoring.json` and `/tmp/pack-one/references/academy-notes.md`:

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
      "explanation": "Object-level grants control access to selected securables.",
      "sources": [{ "path": "references/academy-notes.md", "label": "Academy notes: object privileges" }]
    }
  ]
}
```

Put the supporting source text in `references/academy-notes.md`, with enough context to substantiate the answer and explanation. Source paths in authoring JSON are relative to that JSON file. The CLI copies each referenced file beneath `assetsDirectory` in the built pack and writes its generated relative path into `sources[].path`.

From the repository root, build and verify:

```bash
pnpm pack:build /tmp/pack-one/authoring.json /tmp/pack-one/out
pnpm pack:verify /tmp/pack-one/out/sample-pack.json
```

Check `/tmp/pack-one/out/sample-pack.json` against `packs/exam-pack.schema.json`. The generated question has `answerIds` (the CLI transforms `correctOptionIds` and shuffles option IDs), and its source path points into the copied assets directory. Verify the copied asset exists and the label remains useful without seeing the authoring file.

The app importer reads that local source file into the local pack database. In practice, a learner sees the source label as a link; the app's `/practice/source` route retrieves the stored text for that question and path. The current source item contains a path and label, not an external URL field. Therefore this example cannot produce a direct Databricks docs link. If direct external links are required alongside local academy notes, decide and implement a compatible schema/import/display contract first, then update this example and re-run the one-question round trip before bulk conversion.
