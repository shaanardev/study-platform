# Archived baseline question 55

This is an unmodified input record for provenance. Its answer or explanation may be superseded. Use the reviewed pack explanation and primary documentation to study.

## Reviewed answer

Use MERGE INTO with a subquery or join that sources from other tables in the USING clause

MERGE INTO with a complex USING clause (joining multiple tables or using subqueries) can handle multi-column updates based on complex logic in a single atomic operation. WHEN MATCHED THEN UPDATE SET can reference columns from the source tables. This is more efficient and atomic than multiple separate operations.

## Original input

```json
{
  "id": "databricks-engineer-q-055",
  "question": "An engineer needs to update multiple columns in a Delta table based on a complex business rule that references other tables. Which approach is most appropriate?",
  "options": [
    "Use separate UPDATE statements for each column",
    "Use MERGE INTO with a subquery or join that sources from other tables in the USING clause",
    "Delete and reinsert all data",
    "Create a new table each time"
  ],
  "correctAnswer": 1,
  "explanation": "MERGE INTO with a complex USING clause (joining multiple tables or using subqueries) can handle multi-column updates based on complex logic in a single atomic operation. WHEN MATCHED THEN UPDATE SET can reference columns from the source tables. This is more efficient and atomic than multiple separate operations.",
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
