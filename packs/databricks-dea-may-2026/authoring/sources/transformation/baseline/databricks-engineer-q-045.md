# Archived baseline question 45

This is an unmodified input record for provenance. Its answer or explanation may be superseded. Use the reviewed pack explanation and primary documentation to study.

## Reviewed answer

Broadcast Hash Join using broadcast() hint

Broadcast Hash Join is optimal when one table is small enough to fit in memory. Spark sends (broadcasts) the small table to all executor nodes, avoiding expensive shuffle of the large table. Use broadcast(smallDF) hint or Spark may auto-broadcast if configured. For large-large joins, Sort Merge Join is typically used.

## Original input

```json
{
  "id": "databricks-engineer-q-045",
  "question": "Which strategy should be used when joining a large table with a small table that fits in memory?",
  "options": [
    "Sort Merge Join",
    "Broadcast Hash Join using broadcast() hint",
    "Shuffle Hash Join",
    "Cartesian Join"
  ],
  "correctAnswer": 1,
  "explanation": "Broadcast Hash Join is optimal when one table is small enough to fit in memory. Spark sends (broadcasts) the small table to all executor nodes, avoiding expensive shuffle of the large table. Use broadcast(smallDF) hint or Spark may auto-broadcast if configured. For large-large joins, Sort Merge Join is typically used.",
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
