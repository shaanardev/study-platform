# Archived baseline question 37

This is an unmodified input record for provenance. Its answer or explanation may be superseded. Use the reviewed pack explanation and primary documentation to study.

## Reviewed answer

5,000 rows (Cartesian product of all combinations)

CROSS JOIN produces the Cartesian product - every row from the first table paired with every row from the second table (100 × 50 = 5,000). Use with caution on large tables as it can produce massive results. CROSS JOIN is used when you need all possible combinations.

## Original input

```json
{
  "id": "databricks-engineer-q-037",
  "question": "What is the result of a CROSS JOIN between two tables with 100 and 50 rows respectively?",
  "options": [
    "50 rows",
    "100 rows",
    "5,000 rows (Cartesian product of all combinations)",
    "150 rows"
  ],
  "correctAnswer": 2,
  "explanation": "CROSS JOIN produces the Cartesian product - every row from the first table paired with every row from the second table (100 × 50 = 5,000). Use with caution on large tables as it can produce massive results. CROSS JOIN is used when you need all possible combinations.",
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
