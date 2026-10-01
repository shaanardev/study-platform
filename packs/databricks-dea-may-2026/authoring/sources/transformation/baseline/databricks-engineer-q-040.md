# Archived baseline question 40

This is an unmodified input record for provenance. Its answer or explanation may be superseded. Use the reviewed pack explanation and primary documentation to study.

## Reviewed answer

CREATE VIEW main.gold.orders_v AS SELECT * FROM main.silver.orders

CREATE VIEW stores a permanent query definition. A temporary view is session scoped, a table stores rows, and a materialized view maintains stored results through refresh processing.

## Original input

```json
{
  "id": "databricks-engineer-q-040",
  "question": "Which SQL statement correctly creates a view that persists metadata but not data?",
  "options": [
    "CREATE TEMP VIEW",
    "CREATE VIEW (permanent view) or CREATE TEMPORARY VIEW (session-scoped)",
    "CREATE TABLE",
    "CREATE MATERIALIZED VIEW"
  ],
  "correctAnswer": 1,
  "explanation": "CREATE VIEW creates a persisted view definition that references underlying tables. It stores only the query, not data (virtual view). CREATE TEMPORARY VIEW is session-scoped. CREATE TABLE stores actual data. CREATE MATERIALIZED VIEW (in some systems) caches query results, but standard Spark views are virtual.",
  "exams": [
    "databricks-engineer"
  ],
  "category": "databricks-elt-spark-sql",
  "topics": [
    "databricks-elt-spark-sql"
  ],
  "difficulty": "medium",
  "lastUpdated": "2026-03-02"
}
```
