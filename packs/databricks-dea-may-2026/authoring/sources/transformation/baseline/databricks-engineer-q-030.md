# Archived baseline question 30

This is an unmodified input record for provenance. Its answer or explanation may be superseded. Use the reviewed pack explanation and primary documentation to study.

## Reviewed answer

Use MERGE INTO with WHEN MATCHED UPDATE to overwrite existing records and WHEN NOT MATCHED INSERT for new records

MERGE INTO is the standard approach for SCD Type 1 (overwrite) and Type 2 (history tracking). For SCD Type 1: WHEN MATCHED UPDATE overwrites existing records, WHEN NOT MATCHED INSERT adds new records. This is atomic, efficient, and handles both updates and inserts in a single operation.

## Original input

```json
{
  "id": "databricks-engineer-q-030",
  "question": "Which approach is recommended for handling slowly changing dimensions (SCD) Type 1 in Delta Lake?",
  "options": [
    "Use INSERT INTO for all new records",
    "Use MERGE INTO with WHEN MATCHED UPDATE to overwrite existing records and WHEN NOT MATCHED INSERT for new records",
    "Delete the entire table and recreate it",
    "Create a new table for each update"
  ],
  "correctAnswer": 1,
  "explanation": "MERGE INTO is the standard approach for SCD Type 1 (overwrite) and Type 2 (history tracking). For SCD Type 1: WHEN MATCHED UPDATE overwrites existing records, WHEN NOT MATCHED INSERT adds new records. This is atomic, efficient, and handles both updates and inserts in a single operation.",
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
