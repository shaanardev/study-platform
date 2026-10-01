# Archived baseline question 51

This is an unmodified input record for provenance. Its answer or explanation may be superseded. Use the reviewed pack explanation and primary documentation to study.

## Reviewed answer

ALTER TABLE main.silver.orders ALTER COLUMN order_id SET NOT NULL

SET NOT NULL declares an enforced column constraint and existing data must satisfy it. A CHECK expression can enforce other data predicates. Primary keys are informational and are not an interchangeable write-time nullability enforcement mechanism.

## Original input

```json
{
  "id": "databricks-engineer-q-051",
  "question": "Which Delta Lake feature allows you to enforce that a column cannot contain NULL values?",
  "options": [
    "PRIMARY KEY constraint",
    "NOT NULL constraint added via ALTER TABLE ALTER COLUMN",
    "UNIQUE constraint",
    "CHECK constraint only"
  ],
  "correctAnswer": 1,
  "explanation": "Delta Lake supports NOT NULL constraints to enforce that columns cannot contain NULL values. You can add them using ALTER TABLE table_name ALTER COLUMN column_name SET NOT NULL. Delta Lake also supports CHECK constraints for custom validation rules. PRIMARY KEY and UNIQUE constraints were added in later Delta Lake versions for additional data integrity.",
  "exams": [
    "databricks-engineer"
  ],
  "category": "databricks-elt-spark-sql",
  "topics": [
    "databricks-elt-spark-sql"
  ],
  "difficulty": "medium",
  "lastUpdated": "2026-03-02"
}
```
