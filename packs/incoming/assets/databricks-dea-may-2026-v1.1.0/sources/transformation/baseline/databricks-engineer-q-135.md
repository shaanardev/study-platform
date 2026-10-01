# Archived baseline question 135

This is an unmodified input record for provenance. Its answer or explanation may be superseded. Use the reviewed pack explanation and primary documentation to study.

## Reviewed answer

Raise an exception when the validation fails

Raising an exception fails a notebook task unless it is caught and suppressed. notebook.exit returns a value and is not a failure signal by itself. Declarative pipeline FAIL UPDATE expectations provide a separate mechanism for pipeline quality failures.

## Original input

```json
{
  "id": "databricks-engineer-q-135",
  "question": "How can you implement data quality checks that fail a job if quality thresholds are not met?",
  "options": [
    "Use print statements",
    "Use Delta Live Tables expectations with FAIL action or implement checks that raise exceptions in notebooks",
    "It is not possible",
    "Use comments only"
  ],
  "correctAnswer": 1,
  "explanation": "DLT expectations with EXPECT OR FAIL halt the pipeline on quality violations. In notebooks, implement checks with dbutils.notebook.exit() or raise Exception() if thresholds are not met. You can also use IF/ELSE conditional tasks to route based on quality validation task results.",
  "exams": [
    "databricks-engineer"
  ],
  "category": "databricks-production-pipelines",
  "topics": [
    "databricks-production-pipelines"
  ],
  "difficulty": "hard",
  "lastUpdated": "2026-03-02"
}
```
