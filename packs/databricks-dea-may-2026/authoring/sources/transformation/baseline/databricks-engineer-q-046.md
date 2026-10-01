# Archived baseline question 46

This is an unmodified input record for provenance. Its answer or explanation may be superseded. Use the reviewed pack explanation and primary documentation to study.

## Reviewed answer

It accesses data from a previous row in the same result set without self-join

LAG(column, offset, default_value) retrieves the value from a previous row at the specified offset (default 1) within the window partition. LEAD() looks ahead. This is useful for calculating differences between consecutive rows, like period-over-period changes. Unlike self-joins, LAG is efficient and concise.

## Original input

```json
{
  "id": "databricks-engineer-q-046",
  "question": "What is the behavior of the LAG() window function in Spark SQL?",
  "options": [
    "It looks ahead to the next row",
    "It accesses data from a previous row in the same result set without self-join",
    "It calculates the sum of all previous rows",
    "It sorts the data in descending order"
  ],
  "correctAnswer": 1,
  "explanation": "LAG(column, offset, default_value) retrieves the value from a previous row at the specified offset (default 1) within the window partition. LEAD() looks ahead. This is useful for calculating differences between consecutive rows, like period-over-period changes. Unlike self-joins, LAG is efficient and concise.",
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
