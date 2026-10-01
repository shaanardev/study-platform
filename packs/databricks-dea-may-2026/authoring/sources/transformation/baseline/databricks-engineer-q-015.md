# Archived baseline question 15

This is an unmodified input record for provenance. Its answer or explanation may be superseded. Use the reviewed pack explanation and primary documentation to study.

## Reviewed answer

show()

The show() method displays the contents of a DataFrame in a tabular format (df.show()). write() and save() are for writing DataFrames to storage. collect() retrieves all data to the driver as a Python list, which can cause out-of-memory errors on large datasets. show() is the safe way to view sample data.

## Original input

```json
{
  "id": "databricks-engineer-q-015",
  "question": "Which PySpark method is used to display the contents of a DataFrame?",
  "options": [
    "write()",
    "show()",
    "save()",
    "collect()"
  ],
  "correctAnswer": 1,
  "explanation": "The show() method displays the contents of a DataFrame in a tabular format (df.show()). write() and save() are for writing DataFrames to storage. collect() retrieves all data to the driver as a Python list, which can cause out-of-memory errors on large datasets. show() is the safe way to view sample data.",
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
