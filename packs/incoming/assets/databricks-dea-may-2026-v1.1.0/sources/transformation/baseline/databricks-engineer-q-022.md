# Archived baseline question 22

This is an unmodified input record for provenance. Its answer or explanation may be superseded. Use the reviewed pack explanation and primary documentation to study.

## Reviewed answer

To view the column names, data types, and comments of a table

DESCRIBE TABLE (or DESC TABLE) displays the schema information of a table including column names, data types, and any comments. It's useful for understanding table structure without querying data. For extended metadata including partitioning, use DESCRIBE TABLE EXTENDED or DESCRIBE DETAIL for Delta tables.

## Original input

```json
{
  "id": "databricks-engineer-q-022",
  "question": "What is the primary purpose of the DESCRIBE TABLE command?",
  "options": [
    "To modify the table schema",
    "To view the column names, data types, and comments of a table",
    "To delete the table",
    "To optimize the table"
  ],
  "correctAnswer": 1,
  "explanation": "DESCRIBE TABLE (or DESC TABLE) displays the schema information of a table including column names, data types, and any comments. It's useful for understanding table structure without querying data. For extended metadata including partitioning, use DESCRIBE TABLE EXTENDED or DESCRIBE DETAIL for Delta tables.",
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
