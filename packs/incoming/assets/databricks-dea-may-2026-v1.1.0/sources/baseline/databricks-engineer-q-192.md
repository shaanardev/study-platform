# Archived baseline question 192

This is an unmodified input record for provenance. Its answer or explanation may be superseded. Use the reviewed pack explanation and primary documentation to study.

## Reviewed answer

An architecture that combines the low-cost, open storage of a data lake with the management, ACID transactions, and performance of a data warehouse

The lakehouse stores data in open formats (Delta Lake) on cheap cloud object storage while adding warehouse-grade features: ACID transactions, schema enforcement, governance, and BI/ML performance. This removes the need for separate lake and warehouse systems.

## Original input

```json
{
  "id": "databricks-engineer-q-192",
  "question": "Which best describes the lakehouse architecture?",
  "options": [
    "A data warehouse that cannot store unstructured data",
    "An architecture that combines the low-cost, open storage of a data lake with the management, ACID transactions, and performance of a data warehouse",
    "A purely in-memory analytics engine",
    "A replacement for cloud object storage"
  ],
  "correctAnswer": 1,
  "explanation": "The lakehouse stores data in open formats (Delta Lake) on cheap cloud object storage while adding warehouse-grade features: ACID transactions, schema enforcement, governance, and BI/ML performance. This removes the need for separate lake and warehouse systems.",
  "exams": [
    "databricks-engineer"
  ],
  "category": "databricks-lakehouse-platform",
  "topics": [
    "databricks-lakehouse-platform"
  ],
  "difficulty": "easy",
  "lastUpdated": "2026-06-22"
}
```
