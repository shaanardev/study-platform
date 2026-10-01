# Archived baseline question 17

This is an unmodified input record for provenance. Its answer or explanation may be superseded. Use the reviewed pack explanation and primary documentation to study.

## Reviewed answer

current_date()

current_date returns a DATE. current_timestamp, now, and getdate return current timestamp values in Databricks SQL. Select the function matching the required type, rather than assuming every timestamp alias is unsupported.

## Original input

```json
{
  "id": "databricks-engineer-q-017",
  "question": "Which SQL function returns the current date?",
  "options": [
    "now()",
    "current_date()",
    "today()",
    "getdate()"
  ],
  "correctAnswer": 1,
  "explanation": "current_date() returns the current date without time. now() and current_timestamp() return both date and time. today() is not a standard Spark SQL function. getdate() is SQL Server syntax, not Spark SQL. In Spark SQL, use current_date() for date-only and current_timestamp() for datetime.",
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
