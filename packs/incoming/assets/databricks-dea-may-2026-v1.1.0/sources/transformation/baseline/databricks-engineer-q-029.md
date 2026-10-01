# Archived baseline question 29

This is an unmodified input record for provenance. Its answer or explanation may be superseded. Use the reviewed pack explanation and primary documentation to study.

## Reviewed answer

Replaces NULL values in specific columns with specified default values

na.fill() replaces NULL values with specified values. The dictionary format allows different fill values for different columns - age NULLs become 0, name NULLs become "Unknown". To drop NULLs, use na.drop(). To replace specific values (not just NULLs), use na.replace().

## Original input

```json
{
  "id": "databricks-engineer-q-029",
  "question": "What does the following PySpark code do: df.na.fill({\"age\": 0, \"name\": \"Unknown\"})?",
  "options": [
    "Deletes rows with NULL values",
    "Replaces NULL values in specific columns with specified default values",
    "Creates a new DataFrame with only NULL values",
    "Counts the number of NULL values in each column"
  ],
  "correctAnswer": 1,
  "explanation": "na.fill() replaces NULL values with specified values. The dictionary format allows different fill values for different columns - age NULLs become 0, name NULLs become \"Unknown\". To drop NULLs, use na.drop(). To replace specific values (not just NULLs), use na.replace().",
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
