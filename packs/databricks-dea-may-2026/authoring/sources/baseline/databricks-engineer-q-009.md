# Archived baseline question 9

This is an unmodified input record for provenance. Its answer or explanation may be superseded. Use the reviewed pack explanation and primary documentation to study.

## Reviewed answer

Standard access mode

Standard access mode supports shared compute with user isolation and Unity Catalog access controls. Dedicated compute is assigned to a user or group. Access mode and node count are different settings.

## Original input

```json
{
  "id": "databricks-engineer-q-009",
  "question": "On Unity Catalog-enabled compute, which access mode lets multiple users securely share a cluster with table access control and data isolation between users?",
  "options": [
    "Dedicated (single-user) access mode",
    "Standard access mode (formerly High Concurrency / Shared)",
    "No-isolation shared access mode",
    "Single Node compute"
  ],
  "correctAnswer": 1,
  "explanation": "Standard access mode (formerly called Shared / High Concurrency) supports multiple concurrent users on the same cluster with user isolation and Unity Catalog table access control. Dedicated (formerly single-user) access mode assigns compute to one user or group; no-isolation mode provides no user isolation.",
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
