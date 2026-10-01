# Archived baseline question 183

This is an unmodified input record for provenance. Its answer or explanation may be superseded. Use the reviewed pack explanation and primary documentation to study.

## Reviewed answer

A serverless SQL warehouse

A serverless SQL warehouse provides managed SQL compute with fast startup and scaling. It still uses Unity Catalog access controls. Total cost depends on workload and usage; serverless is not a guarantee of a lower bill.

## Original input

```json
{
  "id": "databricks-engineer-q-183",
  "question": "What is the benefit of a serverless SQL warehouse compared with a classic SQL warehouse?",
  "options": [
    "It stores data in the control plane",
    "Compute starts in seconds and is fully managed by Databricks, reducing idle cost and startup latency",
    "It removes the need for Unity Catalog",
    "It only supports Python"
  ],
  "correctAnswer": 1,
  "explanation": "Serverless SQL warehouses run in Databricks-managed compute that starts in seconds and auto-scales, eliminating the minutes-long startup of classic warehouses and reducing idle cost. They are recommended for BI and ad hoc SQL workloads.",
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
