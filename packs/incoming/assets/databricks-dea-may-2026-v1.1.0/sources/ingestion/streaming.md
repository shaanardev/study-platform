# Structured Streaming query semantics

Reviewed source digest for the May 2026 practice pack. Use the linked documentation for platform and runtime details.

Structured Streaming treats streams as unbounded tables. Checkpoints track progress and state; trigger and output-mode semantics depend on the query. foreachBatch callbacks may be retried and need idempotent external effects.

Primary reference: [https://spark.apache.org/docs/3.5.7/structured-streaming-programming-guide.html](https://spark.apache.org/docs/3.5.7/structured-streaming-programming-guide.html)
