# Archived baseline question 72

This is an unmodified input record for provenance. Its answer or explanation may be superseded. Use the reviewed pack explanation and primary documentation to study.

## Reviewed answer

A named Boolean data quality rule with configured retain, drop, or fail behavior for violations

Expectations define data quality rules. A basic expectation retains invalid rows and records metrics; DROP ROW removes them; FAIL UPDATE stops the affected update. Choose behavior according to the dataset quality contract.

## Original input

```json
{
  "id": "databricks-engineer-q-072",
  "question": "In Delta Live Tables, what is an expectation?",
  "options": [
    "A schedule for pipeline runs",
    "A data quality constraint that filters invalid records or fails the pipeline",
    "A user permission setting",
    "A cluster configuration"
  ],
  "correctAnswer": 1,
  "explanation": "Expectations in DLT are data quality constraints defined using SQL boolean expressions. They can: drop records that fail (EXPECT), keep bad records but track them (EXPECT OR DROP), or fail the pipeline (EXPECT OR FAIL). DLT tracks metrics on expectation results, providing visibility into data quality.",
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
