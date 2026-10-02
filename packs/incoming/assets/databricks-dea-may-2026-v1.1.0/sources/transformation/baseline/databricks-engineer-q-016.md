# Archived baseline question 16

This is an unmodified input record for provenance. Its answer or explanation may be superseded. Use the reviewed pack explanation and primary documentation to study.

## Reviewed answer

Adds a new column to an existing Delta table

ALTER TABLE ... ADD COLUMN adds a new column to an existing table. Delta Lake supports schema evolution, allowing columns to be added without rewriting existing data. The new column will have NULL values for existing rows. To rename, use RENAME COLUMN; to change type, use ALTER COLUMN.

## Original input

```json
{
  "id": "databricks-engineer-q-016",
  "question": "What does the following SQL command do: ALTER TABLE table_name ADD COLUMN new_col INT?",
  "options": [
    "Deletes the existing column and creates a new one",
    "Adds a new column to an existing Delta table",
    "Renames the existing column",
    "Modifies the data type of an existing column"
  ],
  "correctAnswer": 1,
  "explanation": "ALTER TABLE ... ADD COLUMN adds a new column to an existing table. Delta Lake supports schema evolution, allowing columns to be added without rewriting existing data. The new column will have NULL values for existing rows. To rename, use RENAME COLUMN; to change type, use ALTER COLUMN.",
  "exams": [
    "databricks-engineer"
  ],
  "category": "databricks-elt-spark-sql",
  "topics": [
    "databricks-elt-spark-sql"
  ],
  "difficulty": "easy",
  "lastUpdated": "2026-03-02"
}
```
