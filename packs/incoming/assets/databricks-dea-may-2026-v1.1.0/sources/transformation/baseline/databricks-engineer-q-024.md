# Archived baseline question 24

This is an unmodified input record for provenance. Its answer or explanation may be superseded. Use the reviewed pack explanation and primary documentation to study.

## Reviewed answer

df.select(col("col_name").cast("int")) or df.select(expr("CAST(col_name AS INT)"))

In PySpark, use the cast() method: col("column_name").cast("int") or cast("integer"). You can also use SQL-style casting with expr("CAST(col AS INT)"). The cast() function is the standard way to convert data types in DataFrame operations.

## Original input

```json
{
  "id": "databricks-engineer-q-024",
  "question": "A data engineer needs to cast a column from string to integer type in PySpark. Which approach is correct?",
  "options": [
    "df.select(\"col_name\".toInt())",
    "df.select(col(\"col_name\").cast(\"int\")) or df.select(expr(\"CAST(col_name AS INT)\"))",
    "df.select(\"col_name\".asInteger())",
    "df.convert(\"col_name\", \"int\")"
  ],
  "correctAnswer": 1,
  "explanation": "In PySpark, use the cast() method: col(\"column_name\").cast(\"int\") or cast(\"integer\"). You can also use SQL-style casting with expr(\"CAST(col AS INT)\"). The cast() function is the standard way to convert data types in DataFrame operations.",
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
