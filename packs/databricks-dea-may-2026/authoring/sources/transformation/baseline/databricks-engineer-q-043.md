# Archived baseline question 43

This is an unmodified input record for provenance. Its answer or explanation may be superseded. Use the reviewed pack explanation and primary documentation to study.

## Reviewed answer

AND condition allows additional filtering on when to update matched rows

WHEN MATCHED AND condition adds an extra predicate to determine whether matched rows should be updated. For example: WHEN MATCHED AND source.update_flag = true THEN UPDATE SET... This allows conditional updates - only updating when certain criteria are met, even if the join condition matches.

## Original input

```json
{
  "id": "databricks-engineer-q-043",
  "question": "In a MERGE INTO operation, what is the difference between WHEN MATCHED AND condition versus just WHEN MATCHED?",
  "options": [
    "There is no difference",
    "AND condition allows additional filtering on when to update matched rows",
    "AND condition makes the operation faster",
    "AND condition only works with INSERT"
  ],
  "correctAnswer": 1,
  "explanation": "WHEN MATCHED AND condition adds an extra predicate to determine whether matched rows should be updated. For example: WHEN MATCHED AND source.update_flag = true THEN UPDATE SET... This allows conditional updates - only updating when certain criteria are met, even if the join condition matches.",
  "exams": [
    "databricks-engineer"
  ],
  "category": "databricks-elt-spark-sql",
  "topics": [
    "databricks-elt-spark-sql"
  ],
  "difficulty": "hard",
  "lastUpdated": "2026-03-02"
}
```
