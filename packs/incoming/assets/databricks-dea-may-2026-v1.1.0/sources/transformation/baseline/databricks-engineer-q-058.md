# Archived baseline question 58

This is an unmodified input record for provenance. Its answer or explanation may be superseded. Use the reviewed pack explanation and primary documentation to study.

## Reviewed answer

Spark can better analyze and optimize it, and it avoids the usual Python UDF execution overhead

Built-in expressions expose their semantics to Spark and typically avoid Python serialization costs. Python UDFs can run on executors but provide fewer optimization opportunities. Choose and measure an implementation that meets the required semantics.

## Original input

```json
{
  "id": "databricks-engineer-q-058",
  "question": "What is the behavior of a Spark SQL UDF with respect to catalyst optimizer?",
  "options": [
    "UDFs are fully optimized by Catalyst like built-in functions",
    "UDFs act as black boxes to Catalyst optimizer which can limit optimization opportunities",
    "UDFs are always faster than built-in functions",
    "UDFs cannot be used with Spark SQL"
  ],
  "correctAnswer": 1,
  "explanation": "User-Defined Functions (UDFs) are treated as black boxes by the Catalyst optimizer. This means Spark cannot optimize inside UDFs (predicate pushdown, constant folding, etc.), potentially hurting performance. For better performance, prefer built-in functions or Spark SQL expressions when possible. Use Pandas UDFs (vectorized UDFs) for better performance on batch operations.",
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
