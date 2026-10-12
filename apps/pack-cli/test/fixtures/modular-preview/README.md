This synthetic preview contains two questions in one domain weighted at 100 percent.
From `apps/pack-cli/`, build and verify it with:

```sh
pnpm packs build test/fixtures/modular-preview/authoring.json /tmp/modular-preview-pack
pnpm packs verify /tmp/modular-preview-pack/preview-pack.json
```

The authoring contract supports optional `questions` (inline drafts), `questionFiles`
(an ordered array of relative paths to JSON arrays of drafts), and `assetFiles`
(relative paths to additional files such as audit reports and provenance manifests).
Inline drafts are assembled first, followed by each question file in declaration order,
before the existing seeded shuffling runs. The assembled bank must contain at least
one question and have unique IDs and valid domain/answer references.

Every path is relative to the directory containing `authoring.json`, including source
paths in question files located in subdirectories. Absolute paths, traversal, and
symbolic links are rejected. Referenced sources and declared assets are copied once
under `assetsDirectory`, preserving their relative paths and bytes. Additional assets
do not become question sources or new fields in the generated pack. Question drafts
are copied only if also declared as assets.
