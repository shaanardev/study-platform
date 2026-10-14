# Server data-layer handoff

The current design contract is [SERVER_REWRITE_REVIEW.md](SERVER_REWRITE_REVIEW.md). It supersedes the previous proposal to migrate old rows, add a snapshot CLI, or split practice and mock repositories. The existing `@learning-platform/exam-pack` package remains the canonical pack contract.

The app uses Kysely over `better-sqlite3` with seven handwritten table types and a static migration registry. SvelteKit server `init` owns the runtime store. Repositories cover packs/sources, quiz, and feedback; progress is a cross-domain read model. Services retain study rules. Pack-file validation and supported citation formats remain part of the importer.

The normal database is `.local/app.sqlite`. `pnpm db:up` initializes the selected database and applies pending migrations without seeding packs. Agent launches must set private `DB_PATH` to an absolute disposable path. Tests create and close isolated stores. Do not use a personal database as an experiment or test fixture.

The old `.local/exam-packs.sqlite` is retained as archived data. The one-time cutover creates `.local/backups/exam-packs-before-rewrite.sqlite` through Node 24 `node:sqlite.backup`, with the app stopped and overwrite refused. No old rows are migrated. Do not copy a live SQLite file or its sidecars with filesystem copy commands, and do not modify or delete the archive.

Run `pnpm verify` for web and shared workspace changes. Verify the native addon with the pinned Node runtime, a production build/preview, and study flows on a fresh disposable database. Review lint-fix changes before committing.
