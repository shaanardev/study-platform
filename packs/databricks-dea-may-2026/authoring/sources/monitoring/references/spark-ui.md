# Spark UI metrics for performance diagnosis

Use the Spark UI's jobs, stages, and task details to locate the slow stage and compare task duration, shuffle read/write, and spill. A long outlier task with much larger shuffle input than its peers is evidence consistent with data skew; validate it against the execution plan and key distribution. It is not by itself proof of a single cause.

Spill records intermediate data that could not stay in execution memory and was written to disk. Review task and stage distributions, memory pressure, partition sizes, and join or aggregation strategy before changing cluster resources. Memory spill and disk spill report sizes at different stages of serialization, so their values need not match.

AQE can adapt shuffle partitioning and handle skewed shuffle partitions when supported and enabled. Inspect the final adaptive plan and runtime metrics. Adding workers alone does not guarantee a single oversized partition will be split.

Primary references:
- https://docs.databricks.com/aws/en/compute/troubleshooting/debugging-spark-ui
- https://docs.databricks.com/gcp/en/optimizations/spark-ui-guide/
- https://spark.apache.org/docs/latest/sql-performance-tuning.html
