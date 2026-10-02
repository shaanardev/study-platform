# Archived baseline question 20

This is an unmodified input record for provenance. Its answer or explanation may be superseded. Use the reviewed pack explanation and primary documentation to study.

## Reviewed answer

Hello World

concat accepts multiple string arguments. The middle argument contains a space, so the result is Hello World. Single quotes avoid ambiguity with identifier quoting settings.

## Original input

```json
{
  "id": "databricks-engineer-q-020",
  "question": "What is the result of the Spark SQL query: SELECT concat(\"Hello\", \" \", \"World\")?",
  "options": [
    "HelloWorld",
    "Hello World",
    "Error - concat only accepts two arguments",
    "NULL"
  ],
  "correctAnswer": 1,
  "explanation": "The concat() function concatenates multiple strings together. In this case, it produces \"Hello World\" with a space between. Spark SQL's concat() accepts multiple arguments. For concatenation with a separator, use concat_ws() (concat with separator).",
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
