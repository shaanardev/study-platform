# Archived baseline question 19

This is an unmodified input record for provenance. Its answer or explanation may be superseded. Use the reviewed pack explanation and primary documentation to study.

## Reviewed answer

explode()

explode() takes a column containing arrays and creates a new row for each element in the array. groupBy() aggregates rows, pivot() rotates data from rows to columns, and join() combines DataFrames. explode() and explode_outer() are essential for working with nested/variant data.

## Original input

```json
{
  "id": "databricks-engineer-q-019",
  "question": "Which DataFrame operation transforms each row into multiple rows based on an array column?",
  "options": [
    "groupBy()",
    "explode()",
    "pivot()",
    "join()"
  ],
  "correctAnswer": 1,
  "explanation": "explode() takes a column containing arrays and creates a new row for each element in the array. groupBy() aggregates rows, pivot() rotates data from rows to columns, and join() combines DataFrames. explode() and explode_outer() are essential for working with nested/variant data.",
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
