# Archived baseline question 162

This is an unmodified input record for provenance. Its answer or explanation may be superseded. Use the reviewed pack explanation and primary documentation to study.

## Reviewed answer

An ordered record of all commits (JSON files and periodic checkpoints) describing changes to the table

The _delta_log directory holds an ordered series of JSON commit files (and periodic Parquet checkpoints) that record every transaction. Reading the log lets Delta reconstruct the current table state and provides ACID guarantees and time travel.

## Original input

```json
{
  "id": "databricks-engineer-q-162",
  "question": "What does the Delta Lake transaction log (_delta_log) directory store?",
  "options": [
    "A copy of every data file in the table",
    "An ordered record of all commits (JSON files and periodic checkpoints) describing changes to the table",
    "Cached query results for the table",
    "User access permissions for the table"
  ],
  "correctAnswer": 1,
  "explanation": "The _delta_log directory holds an ordered series of JSON commit files (and periodic Parquet checkpoints) that record every transaction. Reading the log lets Delta reconstruct the current table state and provides ACID guarantees and time travel.",
  "exams": [
    "databricks-engineer"
  ],
  "category": "databricks-lakehouse-platform",
  "topics": [
    "databricks-lakehouse-platform"
  ],
  "difficulty": "medium",
  "lastUpdated": "2026-06-22"
}
```
