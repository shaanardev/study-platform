# Archived baseline question 13

This is an unmodified input record for provenance. Its answer or explanation may be superseded. Use the reviewed pack explanation and primary documentation to study.

## Reviewed answer

CREATE TABLE AS SELECT (CTAS)

CREATE TABLE AS SELECT (CTAS) creates a new table and populates it with the results of a SELECT query. INSERT INTO adds data to an existing table. MERGE INTO performs upserts (update/insert). CTAS is the standard way to create a table from query results in Spark SQL.

## Original input

```json
{
  "id": "databricks-engineer-q-013",
  "question": "Which SQL command is used to create a new Delta table from a query result?",
  "options": [
    "INSERT INTO",
    "CREATE TABLE AS SELECT (CTAS)",
    "UPDATE TABLE",
    "MERGE INTO"
  ],
  "correctAnswer": 1,
  "explanation": "CREATE TABLE AS SELECT (CTAS) creates a new table and populates it with the results of a SELECT query. INSERT INTO adds data to an existing table. MERGE INTO performs upserts (update/insert). CTAS is the standard way to create a table from query results in Spark SQL.",
  "exams": [
    "databricks-engineer"
  ],
  "category": "databricks-elt-spark-sql",
  "topics": [
    "databricks-elt-spark-sql"
  ],
  "difficulty": "easy",
  "lastUpdated": "2026-03-02"
}
```
