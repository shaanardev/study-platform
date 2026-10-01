# Archived baseline question 39

This is an unmodified input record for provenance. Its answer or explanation may be superseded. Use the reviewed pack explanation and primary documentation to study.

## Reviewed answer

To return a list of non-unique values from a group (aggregate function)

COLLECT_LIST() is an aggregate function that returns a list of values (allows duplicates) from grouped rows. COLLECT_SET() returns unique values only. Both are useful for creating arrays from grouped data. Use with caution on large groups as it can create very large arrays.

## Original input

```json
{
  "id": "databricks-engineer-q-039",
  "question": "What is the purpose of the COLLECT_LIST() function in Spark SQL?",
  "options": [
    "To sort a list of values",
    "To return a list of non-unique values from a group (aggregate function)",
    "To count the number of rows",
    "To find the maximum value"
  ],
  "correctAnswer": 1,
  "explanation": "COLLECT_LIST() is an aggregate function that returns a list of values (allows duplicates) from grouped rows. COLLECT_SET() returns unique values only. Both are useful for creating arrays from grouped data. Use with caution on large groups as it can create very large arrays.",
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
