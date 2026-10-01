# Archived baseline question 57

This is an unmodified input record for provenance. Its answer or explanation may be superseded. Use the reviewed pack explanation and primary documentation to study.

## Reviewed answer

coalesce(n) with a smaller partition count

coalesce can reduce partitions without a full redistribution shuffle. repartition uses a shuffle to redistribute rows and can change partition counts in either direction. Avoid routinely forcing a large output into one partition, which can create a bottleneck.

## Original input

```json
{
  "id": "databricks-engineer-q-057",
  "question": "When should you use df.coalesce(1) versus df.repartition(1)?",
  "options": [
    "They are identical",
    "Use coalesce when reducing partitions to avoid full shuffle; use repartition when you need equal-sized partitions or increasing partitions",
    "Always use repartition",
    "coalesce only works with CSV files"
  ],
  "correctAnswer": 1,
  "explanation": "coalesce() minimizes shuffling when reducing partitions by intelligently combining partitions on the same worker. repartition() always triggers a full shuffle, resulting in more evenly distributed data. Use coalesce() when writing to a single file (reducing partitions). Use repartition() when you need well-balanced partitions or are increasing partition count.",
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
