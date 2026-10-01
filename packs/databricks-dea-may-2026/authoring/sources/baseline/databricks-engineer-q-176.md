# Archived baseline question 176

This is an unmodified input record for provenance. Its answer or explanation may be superseded. Use the reviewed pack explanation and primary documentation to study.

## Reviewed answer

Workspace UI, APIs, and job scheduling and compute management services

The control plane provides workspace and orchestration services. Processing runs in a compute plane: classic compute uses customer cloud resources, whereas serverless compute uses Databricks-managed resources. Do not generalize the classic deployment location to serverless.

## Original input

```json
{
  "id": "databricks-engineer-q-176",
  "question": "What does the Databricks Control Plane host?",
  "options": [
    "Customer data files in the customer's cloud account",
    "Backend services such as the web UI, notebooks, job scheduling, and cluster management",
    "Only the Unity Catalog data files",
    "The customer's external Hive metastore"
  ],
  "correctAnswer": 1,
  "explanation": "The Control Plane, managed in the Databricks account, hosts the web application, REST APIs, job scheduler, and cluster manager. The Data Plane (compute and storage) runs in the customer's own cloud account where the actual data is processed.",
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
