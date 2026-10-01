# Archived baseline question 41

This is an unmodified input record for provenance. Its answer or explanation may be superseded. Use the reviewed pack explanation and primary documentation to study.

## Reviewed answer

Validity start and end fields, optionally with an is_current flag

SCD Type 2 retains version rows with validity intervals. A current flag can simplify access but is not mandatory. Apply a correct staged MERGE or supported declarative CDC design; one matched source row cannot simply both update and insert through ordinary MERGE clauses.

## Original input

```json
{
  "id": "databricks-engineer-q-041",
  "question": "An engineer needs to implement SCD Type 2 to maintain historical changes. Which columns should be added to track record versions?",
  "options": [
    "Only a timestamp column",
    "Start date, end date (or NULL for current), and a current flag column",
    "Only a boolean flag",
    "No additional columns are needed"
  ],
  "correctAnswer": 1,
  "explanation": "SCD Type 2 requires tracking when each record version was valid. Standard practice: start_date (when record became valid), end_date (when expired, NULL for current), and optionally is_current flag. MERGE INTO handles the logic: close existing records (set end_date) and insert new versions. This preserves full history.",
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
