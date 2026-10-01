# Archived baseline question 62

This is an unmodified input record for provenance. Its answer or explanation may be superseded. Use the reviewed pack explanation and primary documentation to study.

## Reviewed answer

A medallion architecture with Bronze (raw), Silver (cleaned), and Gold (aggregated) data layers

The medallion architecture organizes data into three layers: Bronze (raw ingestion, data as-is), Silver (cleaned, conformed, deduplicated), and Gold (aggregated, business-level, analytics-ready). This pattern provides data quality progression while maintaining raw data for reprocessing. It is the standard best practice for Lakehouse implementations.

## Original input

```json
{
  "id": "databricks-engineer-q-062",
  "question": "What is the Bronze-Silver-Gold architecture in the Lakehouse?",
  "options": [
    "A hardware specification",
    "A medallion architecture with Bronze (raw), Silver (cleaned), and Gold (aggregated) data layers",
    "A security model",
    "A clustering algorithm"
  ],
  "correctAnswer": 1,
  "explanation": "The medallion architecture organizes data into three layers: Bronze (raw ingestion, data as-is), Silver (cleaned, conformed, deduplicated), and Gold (aggregated, business-level, analytics-ready). This pattern provides data quality progression while maintaining raw data for reprocessing. It is the standard best practice for Lakehouse implementations.",
  "exams": [
    "databricks-engineer"
  ],
  "category": "databricks-incremental-processing",
  "topics": [
    "databricks-incremental-processing"
  ],
  "difficulty": "easy",
  "lastUpdated": "2026-03-02"
}
```
