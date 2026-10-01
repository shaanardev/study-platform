# Archived baseline question 21

This is an unmodified input record for provenance. Its answer or explanation may be superseded. Use the reviewed pack explanation and primary documentation to study.

## Reviewed answer

HAVING

HAVING filters rows after GROUP BY aggregation, while WHERE filters rows before aggregation. HAVING can reference aggregate functions (COUNT, SUM, AVG) in its condition, which WHERE cannot do. This is standard SQL behavior: WHERE filters input rows, HAVING filters grouped results.

## Original input

```json
{
  "id": "databricks-engineer-q-021",
  "question": "Which SQL clause is used to filter rows after aggregation has been performed?",
  "options": [
    "WHERE",
    "HAVING",
    "FILTER",
    "AGGREGATE"
  ],
  "correctAnswer": 1,
  "explanation": "HAVING filters rows after GROUP BY aggregation, while WHERE filters rows before aggregation. HAVING can reference aggregate functions (COUNT, SUM, AVG) in its condition, which WHERE cannot do. This is standard SQL behavior: WHERE filters input rows, HAVING filters grouped results.",
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
