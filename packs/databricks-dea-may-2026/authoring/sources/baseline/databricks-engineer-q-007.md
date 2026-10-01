# Archived baseline question 7

This is an unmodified input record for provenance. Its answer or explanation may be superseded. Use the reviewed pack explanation and primary documentation to study.

## Reviewed answer

A transaction log supporting ACID writes, schema enforcement, and retained historical snapshots

Delta Lake adds table transaction semantics to the underlying data files. Schema enforcement is the default; schema evolution requires appropriate configuration. Historical reads require retained logs and data files.

## Original input

```json
{
  "id": "databricks-engineer-q-007",
  "question": "What is the main advantage of using Delta Lake over standard Parquet files in a data lake?",
  "options": [
    "Delta Lake files are smaller than Parquet files",
    "Delta Lake provides ACID transactions, time travel, and automatic schema evolution",
    "Delta Lake can only be used with Python",
    "Delta Lake requires less storage space"
  ],
  "correctAnswer": 1,
  "explanation": "Delta Lake builds on Parquet format but adds critical enterprise features: ACID transactions (Atomicity, Consistency, Isolation, Durability), time travel (query previous versions), automatic schema evolution/validation, and optimized performance features like Z-ordering and data skipping. The files are still Parquet-based but with transaction logs.",
  "exams": [
    "databricks-engineer"
  ],
  "category": "databricks-lakehouse-platform",
  "topics": [
    "databricks-lakehouse-platform"
  ],
  "difficulty": "medium",
  "lastUpdated": "2026-03-02"
}
```
