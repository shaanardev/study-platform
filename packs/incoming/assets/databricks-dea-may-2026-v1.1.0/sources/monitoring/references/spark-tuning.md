# Shuffle partition sizing and AQE

`spark.sql.shuffle.partitions` sets the initial number of partitions for joins and aggregations. Too few large partitions can increase task memory pressure and spill; too many small partitions add scheduling overhead. Tune from measured data and task metrics.

Adaptive Query Execution (AQE) uses runtime statistics to coalesce small post-shuffle partitions and, when applicable, split skewed partitions. AQE behavior and defaults vary by Spark or Databricks Runtime version and configuration. Treat the configured partition count as an input to the plan, not necessarily the final number of tasks.

Primary references:
- https://spark.apache.org/docs/latest/sql-performance-tuning.html
- https://docs.databricks.com/aws/en/optimizations/spark-ui-guide/
