# Archived baseline question 14

This is an unmodified input record for provenance. Its answer or explanation may be superseded. Use the reviewed pack explanation and primary documentation to study.

## Reviewed answer

Delta

In Databricks, the default table format is Delta Lake. When you run CREATE TABLE without specifying a format (like USING PARQUET or USING CSV), Databricks automatically creates a Delta table. This default can be changed but Delta is the recommended and default format for its ACID guarantees and performance features.

## Original input

```json
{
  "id": "databricks-engineer-q-014",
  "question": "What is the default format when creating a table in Databricks without specifying USING?",
  "options": [
    "Parquet",
    "Delta",
    "CSV",
    "JSON"
  ],
  "correctAnswer": 1,
  "explanation": "In Databricks, the default table format is Delta Lake. When you run CREATE TABLE without specifying a format (like USING PARQUET or USING CSV), Databricks automatically creates a Delta table. This default can be changed but Delta is the recommended and default format for its ACID guarantees and performance features.",
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
