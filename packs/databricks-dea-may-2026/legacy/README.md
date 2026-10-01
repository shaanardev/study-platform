# Archived DEA pack scripts

These TypeScript files are the former recipe-based builder and verifier. They are kept as source
context for a future conversion of the DEA pack to the generic JSON authoring contract. The
active `pnpm pack:build` command accepts a JSON authoring file, and `pnpm pack:verify` uses only
generic checks and the app importer. Neither command executes the files here.

The four DEA-specific files are under `recipes/databricks-dea-may-2026/`. `build.ts`, `verify.ts`,
`verify-app.ts`, and `types.ts` preserve the old runner and its type contract so the editorial
logic can be understood without reconstructing deleted code.
