# Archived baseline question 167

This is an unmodified input record for provenance. Its answer or explanation may be superseded. Use the reviewed pack explanation and primary documentation to study.

## Reviewed answer

ACID transactions backed by optimistic concurrency control

Delta Lake provides ACID transactions using optimistic concurrency control on the transaction log. Commits are atomic and isolated, so a write fully succeeds or leaves the table unchanged, even when multiple jobs write concurrently.

## Original input

```json
{
  "id": "databricks-engineer-q-167",
  "question": "Which property of Delta Lake guarantees that a write either fully succeeds or has no effect, even with concurrent writers?",
  "options": [
    "Eventual consistency",
    "ACID transactions backed by optimistic concurrency control",
    "At-least-once delivery",
    "Schema-on-read"
  ],
  "correctAnswer": 1,
  "explanation": "Delta Lake provides ACID transactions using optimistic concurrency control on the transaction log. Commits are atomic and isolated, so a write fully succeeds or leaves the table unchanged, even when multiple jobs write concurrently.",
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
