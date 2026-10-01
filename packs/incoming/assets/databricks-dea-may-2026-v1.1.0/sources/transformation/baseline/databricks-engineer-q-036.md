# Archived baseline question 36

This is an unmodified input record for provenance. Its answer or explanation may be superseded. Use the reviewed pack explanation and primary documentation to study.

## Reviewed answer

date_format(ts, 'yyyy-MM-dd')

date_format returns a string in the specified pattern. to_timestamp parses or converts to a timestamp; current_date supplies the current date. from_unixtime expects epoch seconds and is not the direct formatter for a timestamp column.

## Original input

```json
{
  "id": "databricks-engineer-q-036",
  "question": "Which function converts a timestamp to a date string in a specific format?",
  "options": [
    "to_timestamp()",
    "date_format()",
    "from_unixtime()",
    "current_date()"
  ],
  "correctAnswer": 1,
  "explanation": "date_format(timestamp, \"yyyy-MM-dd\") converts a timestamp to a formatted string. to_timestamp() converts strings to timestamps. from_unixtime() converts Unix epoch seconds to timestamps. current_date() returns today's date. Use date_format() when you need specific output formatting.",
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
