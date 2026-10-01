# Archived baseline question 76

This is an unmodified input record for provenance. Its answer or explanation may be superseded. Use the reviewed pack explanation and primary documentation to study.

## Reviewed answer

Deduplicate the source deterministically, then MERGE on the business key with retry-safe logic

Deduplicate source keys before MERGE, using a defined ordering if the latest change must win. Multiple matching source rows can make MERGE ambiguous; unmatched duplicates can also be inserted. ACID does not imply key uniqueness.

## Original input

```json
{
  "id": "databricks-engineer-q-076",
  "question": "What is the recommended approach for handling duplicate records in an incremental pipeline?",
  "options": [
    "Ignore them",
    "Use Delta Lake MERGE with match conditions to deduplicate or idempotent writes",
    "Delete the entire table",
    "Use CSV format"
  ],
  "correctAnswer": 1,
  "explanation": "MERGE INTO with appropriate match conditions is the standard approach for deduplication in Delta Lake. Match on business keys and either skip duplicates (WHEN NOT MATCHED INSERT) or update existing records. For simple append scenarios, idempotent writes with overwrite partitions may also work. Delta Lake's ACID guarantees ensure exactly-once processing.",
  "exams": [
    "databricks-engineer"
  ],
  "category": "databricks-incremental-processing",
  "topics": [
    "databricks-incremental-processing"
  ],
  "difficulty": "medium",
  "lastUpdated": "2026-03-02"
}
```
