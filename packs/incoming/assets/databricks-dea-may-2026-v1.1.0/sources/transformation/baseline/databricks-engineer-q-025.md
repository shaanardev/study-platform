# Archived baseline question 25

This is an unmodified input record for provenance. Its answer or explanation may be superseded. Use the reviewed pack explanation and primary documentation to study.

## Reviewed answer

INNER JOIN returns only matching rows from both tables; LEFT OUTER JOIN returns all rows from the left table and matching rows from the right

INNER JOIN returns only rows that have matching values in both tables. LEFT OUTER JOIN (or LEFT JOIN) returns all rows from the left table and matched rows from the right; if no match exists, NULL values are returned for right table columns. RIGHT OUTER JOIN and FULL OUTER JOIN follow similar logic for the right table or both tables respectively.

## Original input

```json
{
  "id": "databricks-engineer-q-025",
  "question": "What is the difference between INNER JOIN and LEFT OUTER JOIN?",
  "options": [
    "There is no difference; they return the same results",
    "INNER JOIN returns only matching rows from both tables; LEFT OUTER JOIN returns all rows from the left table and matching rows from the right",
    "LEFT OUTER JOIN is faster than INNER JOIN",
    "INNER JOIN can only be used with two tables"
  ],
  "correctAnswer": 1,
  "explanation": "INNER JOIN returns only rows that have matching values in both tables. LEFT OUTER JOIN (or LEFT JOIN) returns all rows from the left table and matched rows from the right; if no match exists, NULL values are returned for right table columns. RIGHT OUTER JOIN and FULL OUTER JOIN follow similar logic for the right table or both tables respectively.",
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
