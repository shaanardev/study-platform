# Keep large results distributed

Spark `DataFrame.collect()` returns all records as a list to the driver process. Collect only bounded results that fit the driver's memory. For large datasets, keep transformations and writes distributed, or retrieve a limited sample for application logic.

Primary references:
- https://spark.apache.org/docs/latest/api/python/reference/pyspark.sql/dataframe.html
- https://docs.databricks.com/aws/en/structured-streaming/multiple-streams
