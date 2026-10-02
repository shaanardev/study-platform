# Archived baseline question 33

This is an unmodified input record for provenance. Its answer or explanation may be superseded. Use the reviewed pack explanation and primary documentation to study.

## Reviewed answer

It rotates data from rows into columns, aggregating values

PIVOT rotates row values into column headers, typically with aggregation. For example, converting month rows (Jan, Feb, Mar) into columns with SUM(sales) as values. UNPIVOT does the reverse (columns to rows). PIVOT is useful for cross-tab reports and transforming data for analysis.

## Original input

```json
{
  "id": "databricks-engineer-q-033",
  "question": "What does the PIVOT operation do in SQL?",
  "options": [
    "It sorts the data in descending order",
    "It rotates data from rows into columns, aggregating values",
    "It creates a backup of the table",
    "It removes duplicate rows"
  ],
  "correctAnswer": 1,
  "explanation": "PIVOT rotates row values into column headers, typically with aggregation. For example, converting month rows (Jan, Feb, Mar) into columns with SUM(sales) as values. UNPIVOT does the reverse (columns to rows). PIVOT is useful for cross-tab reports and transforming data for analysis.",
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
