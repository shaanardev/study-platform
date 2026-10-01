# Archived baseline question 194

This is an unmodified input record for provenance. Its answer or explanation may be superseded. Use the reviewed pack explanation and primary documentation to study.

## Reviewed answer

Delta Lake's unified batch-and-streaming support with ACID transactions

Because Delta Lake provides ACID transactions and supports streaming writes and batch reads on the same table, a streaming job can append while analysts run consistent SQL queries against it concurrently, with no separate copies required.

## Original input

```json
{
  "id": "databricks-engineer-q-194",
  "question": "A team wants a single table that BI analysts query and that a streaming job continuously appends to. Which lakehouse capability makes this possible on one table?",
  "options": [
    "Hive-style external partitioning",
    "Delta Lake's unified batch-and-streaming support with ACID transactions",
    "Storing the table as raw JSON",
    "Disabling the transaction log"
  ],
  "correctAnswer": 1,
  "explanation": "Because Delta Lake provides ACID transactions and supports streaming writes and batch reads on the same table, a streaming job can append while analysts run consistent SQL queries against it concurrently, with no separate copies required.",
  "exams": [
    "databricks-engineer"
  ],
  "category": "databricks-lakehouse-platform",
  "topics": [
    "databricks-lakehouse-platform"
  ],
  "difficulty": "medium",
  "lastUpdated": "2026-06-22"
}
```
