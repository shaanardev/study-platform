# Structured Streaming state and watermarks

Stateful streaming operators retain intermediate state across micro-batches. Aggregations, joins, `distinct`, and `dropDuplicates` can accumulate state and increase latency or resource pressure. Use operator progress metrics to inspect state size, processing time, and state commit time.

Watermarks provide a time-based rule for handling late data and evicting old state where the operator supports it. A watermark bounds state according to the chosen lateness semantics; it does not promise duplicate detection forever. Choose the threshold to balance state growth against the business requirement to accept late records.

Primary references:
- https://docs.databricks.com/aws/en/structured-streaming/stateful-streaming
- https://docs.databricks.com/aws/en/structured-streaming/watermarks
- https://docs.databricks.com/aws/en/structured-streaming/stream-monitoring
