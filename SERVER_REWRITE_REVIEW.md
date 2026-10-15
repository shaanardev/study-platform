# Server data-layer rewrite: backlog contract

Status: revised after Plannotator feedback, 14 October 2026. This document supersedes the database design and scope in `AGENT_HANDOFF.md`. That handoff remains useful for the inventory of current behavior. This is a plan for a fresh database and data layer; no database file has been changed by this review.

## Goal and scope

Build a clean Kysely data layer for this one-person localhost study app. Kysely is an intentional engineering experiment. Use its built-in SQLite dialect over `better-sqlite3`. Preserve the existing app's study behavior, including pack import, practice, mock exams, feedback, citations, and progress. There is no requirement for multi-user scale, storage portability, generic repository frameworks, or compatibility with historical database layouts. [Kysely SQLite setup](https://kysely.dev/docs/getting-started?dialect=sqlite)

The existing `.local/exam-packs.sqlite` has little data. Treat it as an old database to archive, not a source to migrate. Create a fresh database at `.local/app.sqlite`. The old file and its contents remain available as a one-time backup; no code reads or writes it after cutover. Do not add a snapshot command, legacy-schema migrator, data-copy pipeline, or dual-read path. Before the first normal launch on the new file, stop the app and make one consistent SQLite backup of the old file to `.local/backups/exam-packs-before-rewrite.sqlite` using the pinned Node runtime's [`node:sqlite.backup` API](https://nodejs.org/download/release/v24.16.0/docs/api/sqlite.html) in a one-off script. Refuse to overwrite an existing backup. Do not use a plain file copy while SQLite is open. The backup is a one-time cutover step, not a maintained CLI feature.

## Architecture decisions

| Concern | Decision |
| --- | --- |
| Database types | Handwrite Kysely TypeScript interfaces for every table in the **new** schema. The new schema has seven tables listed below; the old write-only `app_state` table is dropped. Use `ColumnType`, `Generated`, and `JSONColumnType` as appropriate. No type generator. |
| Schema design | Create the seven tables listed below with the current primary/foreign-key relationships and fields needed by the operation inventory. Keep question and source snapshots, but remove redundant pack title/count columns and the unused `app_state` table. No migration of old rows or support for old schema variants. |
| Pack JSON | Store each complete pack as one SQLite JSON `TEXT` value and declare its Kysely column as `JSONColumnType<ExamPack>`. Validate the imported pack once, serialize at the write boundary, and use a targeted Kysely `ParseJSONResultsPlugin` for known JSON column aliases on read. Cover the runtime conversion with a database integration test. |
| Repository boundaries | One repository per data domain: packs/sources, quiz, and feedback. Progress is a cross-domain read model. Practice and mock may have separate services for their different rules while sharing the quiz repository. No repository per route, base repository, storage interface, or dependency injection container. |
| Store lifecycle | SvelteKit's server `init` hook creates one Kysely instance for the selected DB before requests. A `createDatabase(path)` factory gives tests an isolated instance with `close()`. Module imports do not open SQLite. [SvelteKit init](https://svelte.dev/docs/kit/hooks#init) |
| Path selection | Use private `DB_PATH`, defaulting to `.local/app.sqlite`. Routes and feature services do not accept paths. Tests use temporary paths. Agent runs require an explicit absolute disposable `DB_PATH`; retain the canonical-path and same-file guard against aliases of the active personal DB. |
| Setup command | Rename the root database command to `pnpm db:up`. It initializes the selected **new** database with the current schema and exits; rerunning it applies only pending migrations. It does not seed sample packs or touch the archived old database. Test fixture creation remains internal to tests. |
| Schema changes | Use Kysely's `Migrator` with a static imported migration registry. The first migration creates the new schema from empty; later migrations evolve only this new schema. Run pending migrations in server `init` before requests. No per-read schema introspection or DDL. [Kysely migrations](https://kysely.dev/docs/migrations) |
| Legacy cleanup | Delete the old `node:sqlite` opener, per-open `ALTER TABLE` checks, old path plumbing, and runtime adapters for historical stored data after the new path works. Keep behavior rules and tests that still describe desired study behavior. |
| Backup tooling | No permanent backup or snapshot CLI. The one-time archive step above is enough for this reset. Kysely does not provide a backup API, but that does not create a reason to maintain one here. |

### Fresh schema inventory

The first Kysely migration creates these seven tables directly; it does not inspect or alter the old database. Handwrite one Kysely table type for each. JSON-bearing fields use `JSONColumnType<T>` and the explicit conversion boundary described below.

| Table | Required data |
| --- | --- |
| `imported_packs` | Composite exam/pack/version key, validated `ExamPack` content, approved local source root, import time. Derive display titles and counts from the pack rather than storing duplicate columns. |
| `saved_source_assets` | Pack key, question ID, source path, label, stored excerpt. |
| `practice_sessions` | Session ID, pack key, selected domains and question IDs, question snapshot, status, timestamps. |
| `practice_answers` | Session/question key, submitted answer IDs, correctness, answer time. |
| `mock_attempts` | Attempt ID, pack key, question IDs and snapshot, deadline, duration, status, creation time. |
| `mock_answers` | Attempt/question key, submitted answer IDs and answer time. |
| `question_feedback` | Pack/question key, flags, correction, retired state, update time. |

### What the `ExamPack` type means for SQLite

Kysely's `JSONColumnType<ExamPack>` can make a selected column appear as an `ExamPack` in TypeScript while insert and update values are strings. SQLite and `better-sqlite3` still store and return `TEXT`, so the type alone does **not** convert a string to an object. Put JSON serialization and parsing in one explicit boundary for the known JSON columns. Use `ParseJSONResultsPlugin` with `shouldParse` limited to those exact selected column aliases; do not scatter `JSON.parse` through feature services or enable the plugin's broad default heuristic. Because the database starts empty and pack imports are validated, reads need no historical-shape normalization. Test a write/read round trip through Kysely to prove the returned runtime value and TypeScript type agree. [Kysely column types](https://kysely.dev/docs/getting-started?dialect=sqlite), [Kysely JSON parsing plugin](https://github.com/kysely-org/kysely/blob/master/src/plugin/parse-json-results/parse-json-results-plugin.ts), and [better-sqlite3 value types](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md#binding-parameters).

This conversion is unavoidable if the app stores a nested `ExamPack` in one SQLite column. Fully normalizing the pack into rows would remove that JSON column but require more tables and object assembly; this rewrite does not assume that extra complexity is worthwhile.

## Operation inventory

Every operation below must use the selected Kysely database. Preserve its user-visible behavior unless a task explicitly says otherwise.

| Domain | Operations |
| --- | --- |
| Packs and sources | Import and refresh packs; list and get pack versions; store and read source excerpts; approve local source roots; serve cited local sources. |
| Quiz | Create, resume, and read practice sessions and mock attempts; select questions; answer and score; save mock answers; submit or expire; retain question snapshots and deadlines. |
| Feedback | Flag, correct, retire, list, and export; apply corrections without changing historical answers. |
| Progress | Read scores, weak domains, missed questions, and selected-pack progress. |
| HTTP routes | Adapt requests to services without DB paths or SQL in route modules. |

AI grilling, model choice, new question generation, new scoring rules, further changes to the existing shared pack contract, remote functions, UI redesign, accounts, and cloud deployment are outside this database rewrite.

## Verification and cutover

Run `pnpm verify`, build and preview the web app with the native addon, and smoke-test the existing study flows on a fresh disposable database. Tests should cover one typed pack JSON round trip, the main write transactions, and route use of the selected store. No old-schema fixture matrix or row-by-row comparison report is needed.

After the rewrite passes, perform the one-time backup of `.local/exam-packs.sqlite`, run `pnpm db:up` to create `.local/app.sqlite`, and confirm the normal app starts and the main study flows work. Do not delete the old database or its backup as part of the rewrite. Starting fresh means old progress is not carried into the new database; it remains in the archive.

## Tasks-axi backlog blueprint

Create these tasks with the stated dependencies. The descriptions are acceptance criteria for one-shot agentic engineering, not instructions to preserve the old storage implementation.

| ID | Blocked by | Deliverable and acceptance |
| --- | --- | --- |
| `db-rewrite-design` | none | Inventory all current data operations and specify columns, keys, and Kysely types for the seven tables above. Confirm every operation has a destination. No old-schema migration plan. |
| `db-rewrite-foundation` | `db-rewrite-design` | Add Kysely, `better-sqlite3`, the seven handwritten table types, migration registry, `createDatabase(path)`, SvelteKit `init`, private `DB_PATH`, and `pnpm db:up`. A fresh DB initializes; build/preview loads the native addon; tests use isolated paths. |
| `db-rewrite-packs` | `db-rewrite-foundation` | Move packs/sources to one repository. Preserve import and citation behavior. Store pack JSON using `JSONColumnType<ExamPack>` with one tested runtime conversion boundary. |
| `db-rewrite-quiz` | `db-rewrite-packs` | Move practice/mock data access into one quiz repository; preserve selection, answers, timing, expiry, resume, and question snapshots. |
| `db-rewrite-feedback` | `db-rewrite-packs` | Move feedback data access into its repository; preserve corrections, flags, retirement, effective pack behavior, and export. |
| `db-rewrite-progress` | `db-rewrite-quiz` | Move progress queries into a cross-domain read model; preserve scores, missed questions, and selected-pack results. |
| `db-rewrite-cleanup` | `db-rewrite-packs`, `db-rewrite-quiz`, `db-rewrite-feedback`, `db-rewrite-progress` | Remove old driver, path plumbing, and legacy storage adapters. Check the operation inventory; run `pnpm verify`, build/preview, and fresh-DB smoke tests. |
| `db-rewrite-cutover` | `db-rewrite-cleanup` | With the app stopped, make one consistent backup of the old DB, initialize the new DB via `pnpm db:up`, and smoke-test normal launch. Leave the old DB and backup untouched afterwards. |

This backlog does not include data migration from the old file. Read `AGENT_HANDOFF.md` for existing behavior and this document for the current implementation scope.
