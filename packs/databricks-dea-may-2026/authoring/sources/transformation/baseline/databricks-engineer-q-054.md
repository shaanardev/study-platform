# Archived baseline question 54

This is an unmodified input record for provenance. Its answer or explanation may be superseded. Use the reviewed pack explanation and primary documentation to study.

## Reviewed answer

Redistributes the data into 100 partitions with full shuffle

repartition(n) triggers a full shuffle to redistribute data into exactly n partitions. Use it when you need to change the number of partitions (e.g., before writing to maximize parallelism). coalesce() is preferred when reducing partitions without a full shuffle. repartition() can improve or hurt performance depending on usage.

## Original input

```json
{
  "id": "databricks-engineer-q-054",
  "question": "What does the df.repartition(100) operation do in PySpark?",
  "options": [
    "Sorts the DataFrame by 100 columns",
    "Redistributes the data into 100 partitions with full shuffle",
    "Limits the DataFrame to 100 rows",
    "Creates 100 copies of the DataFrame"
  ],
  "correctAnswer": 1,
  "explanation": "repartition(n) triggers a full shuffle to redistribute data into exactly n partitions. Use it when you need to change the number of partitions (e.g., before writing to maximize parallelism). coalesce() is preferred when reducing partitions without a full shuffle. repartition() can improve or hurt performance depending on usage.",
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
