# Archived baseline question 3

This is an unmodified input record for provenance. Its answer or explanation may be superseded. Use the reviewed pack explanation and primary documentation to study.

## Reviewed answer

Jobs compute

Jobs compute is scoped to a job run and terminates when that run completes. Shared jobs compute can serve several tasks within that run. Interactive compute suits exploration; a SQL warehouse runs SQL. Cost depends on workload and configuration.

## Original input

```json
{
  "id": "databricks-engineer-q-003",
  "question": "Which Databricks compute type is created for a single job run and is automatically terminated when that run completes?",
  "options": [
    "An all-purpose cluster",
    "A jobs compute cluster (job cluster)",
    "A SQL warehouse",
    "A dedicated SQL endpoint"
  ],
  "correctAnswer": 1,
  "explanation": "A jobs compute cluster (job cluster) is spun up for a specific job run and terminated automatically when the run finishes, making it cheaper than an always-on all-purpose cluster. All-purpose clusters are shared for interactive work and stay running until manually stopped or until their idle auto-termination timeout.",
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
