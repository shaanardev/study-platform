# Archived baseline question 23

This is an unmodified input record for provenance. Its answer or explanation may be superseded. Use the reviewed pack explanation and primary documentation to study.

## Reviewed answer

df.write.format("delta").saveAsTable("main.silver.orders")

saveAsTable writes a named table and registers it in the catalog. save requires a filesystem path; load is a reader operation. The writer needs the appropriate catalog and schema privileges.

## Original input

```json
{
  "id": "databricks-engineer-q-023",
  "question": "In PySpark, which method is used to write a DataFrame to a Delta table?",
  "options": [
    "df.read()",
    "df.write.format(\"delta\").save()",
    "df.load()",
    "df.export()"
  ],
  "correctAnswer": 1,
  "explanation": "To write a DataFrame to Delta format, use df.write.format(\"delta\").save(\"/path/to/table\") or df.write.format(\"delta\").mode(\"overwrite\").saveAsTable(\"table_name\"). The format(\"delta\") specifies the output format. read() and load() are for reading data, not writing.",
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
