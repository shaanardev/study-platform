# Archived baseline question 18

This is an unmodified input record for provenance. Its answer or explanation may be superseded. Use the reviewed pack explanation and primary documentation to study.

## Reviewed answer

To perform an upsert operation - updating existing rows and inserting new ones based on a condition

MERGE INTO (also called UPSERT) atomically updates existing rows and inserts new rows based on a match condition. It's commonly used for slowly changing dimensions (SCD Type 1/2) and incrementally updating tables. The statement uses WHEN MATCHED for updates/deletes and WHEN NOT MATCHED for inserts.

## Original input

```json
{
  "id": "databricks-engineer-q-018",
  "question": "What is the purpose of the MERGE INTO statement in Delta Lake?",
  "options": [
    "To combine two tables into a single permanent table",
    "To perform an upsert operation - updating existing rows and inserting new ones based on a condition",
    "To create a backup copy of a table",
    "To optimize table storage"
  ],
  "correctAnswer": 1,
  "explanation": "MERGE INTO (also called UPSERT) atomically updates existing rows and inserts new rows based on a match condition. It's commonly used for slowly changing dimensions (SCD Type 1/2) and incrementally updating tables. The statement uses WHEN MATCHED for updates/deletes and WHEN NOT MATCHED for inserts.",
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
