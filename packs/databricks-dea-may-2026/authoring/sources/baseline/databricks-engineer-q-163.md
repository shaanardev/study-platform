# Archived baseline question 163

This is an unmodified input record for provenance. Its answer or explanation may be superseded. Use the reviewed pack explanation and primary documentation to study.

## Reviewed answer

Time travel using VERSION AS OF or TIMESTAMP AS OF

Delta Lake time travel lets you read an earlier table snapshot with SELECT ... VERSION AS OF n or TIMESTAMP AS OF '...'. It relies on the transaction log and on data files still being retained (not yet removed by VACUUM).

## Original input

```json
{
  "id": "databricks-engineer-q-163",
  "question": "Which Delta Lake feature lets you query a previous version of a table?",
  "options": [
    "VACUUM",
    "Time travel using VERSION AS OF or TIMESTAMP AS OF",
    "ZORDER BY",
    "COPY INTO"
  ],
  "correctAnswer": 1,
  "explanation": "Delta Lake time travel lets you read an earlier table snapshot with SELECT ... VERSION AS OF n or TIMESTAMP AS OF '...'. It relies on the transaction log and on data files still being retained (not yet removed by VACUUM).",
  "exams": [
    "databricks-engineer"
  ],
  "category": "databricks-lakehouse-platform",
  "topics": [
    "databricks-lakehouse-platform"
  ],
  "difficulty": "easy",
  "lastUpdated": "2026-06-22"
}
```
