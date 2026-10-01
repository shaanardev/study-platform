# Archived baseline question 48

This is an unmodified input record for provenance. Its answer or explanation may be superseded. Use the reviewed pack explanation and primary documentation to study.

## Reviewed answer

LEFT SEMI JOIN returns rows from the left table where there is a match in the right; LEFT ANTI JOIN returns rows where there is NO match

LEFT SEMI JOIN returns only rows from the left table where the join key exists in the right table (like EXISTS). LEFT ANTI JOIN returns only rows from the left table where the join key does NOT exist in the right table (like NOT EXISTS). Neither returns columns from the right table. They're efficient for filtering based on existence.

## Original input

```json
{
  "id": "databricks-engineer-q-048",
  "question": "What is the difference between a LEFT SEMI JOIN and a LEFT ANTI JOIN?",
  "options": [
    "They are the same",
    "LEFT SEMI JOIN returns rows from the left table where there is a match in the right; LEFT ANTI JOIN returns rows where there is NO match",
    "LEFT SEMI JOIN is faster",
    "LEFT ANTI JOIN returns all rows from both tables"
  ],
  "correctAnswer": 1,
  "explanation": "LEFT SEMI JOIN returns only rows from the left table where the join key exists in the right table (like EXISTS). LEFT ANTI JOIN returns only rows from the left table where the join key does NOT exist in the right table (like NOT EXISTS). Neither returns columns from the right table. They're efficient for filtering based on existence.",
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
