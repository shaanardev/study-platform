# Archived baseline question 178

This is an unmodified input record for provenance. Its answer or explanation may be superseded. Use the reviewed pack explanation and primary documentation to study.

## Reviewed answer

Business-level aggregates and curated tables ready for analytics and reporting

Gold tables hold curated, business-level aggregates and project-specific datasets optimized for BI, dashboards, and ML features. Bronze holds raw data and Silver holds cleaned, conformed data at a finer grain.

## Original input

```json
{
  "id": "databricks-engineer-q-178",
  "question": "In the medallion architecture, what typically lives in the Gold layer?",
  "options": [
    "Raw files exactly as ingested",
    "Cleaned and deduplicated records still at row grain",
    "Business-level aggregates and curated tables ready for analytics and reporting",
    "Streaming checkpoints"
  ],
  "correctAnswer": 2,
  "explanation": "Gold tables hold curated, business-level aggregates and project-specific datasets optimized for BI, dashboards, and ML features. Bronze holds raw data and Silver holds cleaned, conformed data at a finer grain.",
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
