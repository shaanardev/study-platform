# Archived baseline question 26

This is an unmodified input record for provenance. Its answer or explanation may be superseded. Use the reviewed pack explanation and primary documentation to study.

## Reviewed answer

distinct() and dropDuplicates() both remove duplicate rows

Both distinct() and dropDuplicates() remove duplicate rows from a DataFrame. dropDuplicates() can also take a list of columns to consider when identifying duplicates (df.dropDuplicates(["col1", "col2"])). distinct() considers all columns. Both return a new DataFrame with duplicates removed.

## Original input

```json
{
  "id": "databricks-engineer-q-026",
  "question": "An engineer needs to handle duplicate rows in a DataFrame. Which PySpark function removes duplicates?",
  "options": [
    "distinct() and dropDuplicates() both remove duplicate rows",
    "Only distinct() works; dropDuplicates() is not a valid function",
    "Only dropDuplicates() works; distinct() only works on SQL",
    "Neither function exists in PySpark"
  ],
  "correctAnswer": 0,
  "explanation": "Both distinct() and dropDuplicates() remove duplicate rows from a DataFrame. dropDuplicates() can also take a list of columns to consider when identifying duplicates (df.dropDuplicates([\"col1\", \"col2\"])). distinct() considers all columns. Both return a new DataFrame with duplicates removed.",
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
