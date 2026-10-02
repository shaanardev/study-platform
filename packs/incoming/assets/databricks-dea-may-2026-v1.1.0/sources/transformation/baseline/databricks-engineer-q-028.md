# Archived baseline question 28

This is an unmodified input record for provenance. Its answer or explanation may be superseded. Use the reviewed pack explanation and primary documentation to study.

## Reviewed answer

RANK()

RANK gives tied rows the same rank and skips subsequent positions. ROW_NUMBER gives each row a unique number; DENSE_RANK leaves no gaps. Specify the intended window ordering.

## Original input

```json
{
  "id": "databricks-engineer-q-028",
  "question": "Which SQL window function assigns a unique sequential rank to rows within a partition, with gaps in rank for ties?",
  "options": [
    "ROW_NUMBER()",
    "RANK()",
    "DENSE_RANK()",
    "NTILE()"
  ],
  "correctAnswer": 1,
  "explanation": "RANK() assigns the same rank to tied values but leaves gaps in the sequence (1, 1, 3, 4...). ROW_NUMBER() assigns unique numbers regardless of ties (1, 2, 3, 4...). DENSE_RANK() assigns the same rank to ties with no gaps (1, 1, 2, 3...). NTILE() distributes rows into a specified number of buckets.",
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
