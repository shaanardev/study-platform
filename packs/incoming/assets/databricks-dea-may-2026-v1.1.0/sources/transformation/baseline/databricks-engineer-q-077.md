# Archived baseline question 77

This is an unmodified input record for provenance. Its answer or explanation may be superseded. Use the reviewed pack explanation and primary documentation to study.

## Reviewed answer

Complete emits the whole result table; append emits only newly finalized result rows when the query supports it

Complete emits the full aggregation result each trigger. Append emits rows that will no longer change, such as windows finalized by a watermark. Update emits changed results. Mode support depends on the query and sink.

## Original input

```json
{
  "id": "databricks-engineer-q-077",
  "question": "What is the difference between append and complete output modes for streaming aggregations?",
  "options": [
    "They are identical",
    "Append only outputs new rows; Complete outputs the entire updated result table",
    "Append is faster",
    "Complete mode only works with batch"
  ],
  "correctAnswer": 1,
  "explanation": "Append mode only outputs newly added rows to the result table since the last trigger. It works for stateless operations and stateful operations where the final result is known (e.g., watermarked window aggregations after watermark passes). Complete mode outputs the entire updated result table each trigger, useful for aggregations writing to sinks that can be overwritten.",
  "exams": [
    "databricks-engineer"
  ],
  "category": "databricks-incremental-processing",
  "topics": [
    "databricks-incremental-processing"
  ],
  "difficulty": "medium",
  "lastUpdated": "2026-03-02"
}
```
