# Archived baseline question 50

This is an unmodified input record for provenance. Its answer or explanation may be superseded. Use the reviewed pack explanation and primary documentation to study.

## Reviewed answer

A named intermediate query result available to that SQL statement

A common table expression names an intermediate query for use within one statement. It can clarify complex transformations; it does not persist data or guarantee materialization. Recursive forms require explicit supported syntax.

## Original input

```json
{
  "id": "databricks-engineer-q-050",
  "question": "What is the purpose of the WITH clause (Common Table Expressions) in SQL?",
  "options": [
    "To create permanent tables",
    "To define temporary result sets that can be referenced within a single query, improving readability and enabling recursion",
    "To optimize query performance automatically",
    "To grant permissions"
  ],
  "correctAnswer": 1,
  "explanation": "Common Table Expressions (CTEs) defined with WITH create temporary named result sets used within a single query. They improve readability by breaking complex queries into parts and enable recursive queries (WITH RECURSIVE). CTEs are not stored permanently and exist only for the query execution. They don't inherently improve performance but make queries more maintainable.",
  "exams": [
    "databricks-engineer"
  ],
  "category": "databricks-elt-spark-sql",
  "topics": [
    "databricks-elt-spark-sql"
  ],
  "difficulty": "hard",
  "lastUpdated": "2026-03-02"
}
```
