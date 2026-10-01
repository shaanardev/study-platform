# Archived baseline question 80

This is an unmodified input record for provenance. Its answer or explanation may be superseded. Use the reviewed pack explanation and primary documentation to study.

## Reviewed answer

Data cleansing, deduplication, type casting, joining with reference data

The Silver layer applies data cleansing, validation, deduplication, normalization, and enrichment. It transforms raw Bronze data into clean, conformed datasets. Typical operations: casting types, handling nulls, removing duplicates, joining reference data, and basic filtering. Business aggregations belong in the Gold layer.

## Original input

```json
{
  "id": "databricks-engineer-q-080",
  "question": "In the medallion architecture, what type of transformations typically occur in the Silver layer?",
  "options": [
    "No transformations - data is raw",
    "Data cleansing, deduplication, type casting, joining with reference data",
    "Final aggregations for reporting only",
    "Machine learning model training"
  ],
  "correctAnswer": 1,
  "explanation": "The Silver layer applies data cleansing, validation, deduplication, normalization, and enrichment. It transforms raw Bronze data into clean, conformed datasets. Typical operations: casting types, handling nulls, removing duplicates, joining reference data, and basic filtering. Business aggregations belong in the Gold layer.",
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
