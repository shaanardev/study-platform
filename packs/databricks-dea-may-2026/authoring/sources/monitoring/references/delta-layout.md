# Delta layout maintenance

`OPTIMIZE` rewrites files to improve table layout. On partitioned tables, compaction and layout work occur within partitions. For eligible Delta tables without liquid clustering, `ZORDER BY` can colocate related values to improve data skipping. Liquid clustering replaces partitioning and Z-ordering as a layout strategy; do not combine `ZORDER BY` with liquid clustering on the same table.

Changing clustering keys changes the table's clustering definition but does not synchronously rewrite every existing file. Run supported `OPTIMIZE` operations to incrementally cluster data. Automatic key selection (`CLUSTER BY AUTO`) is a distinct configured capability, and predictive optimization is for eligible Unity Catalog managed tables; neither is universal for every table.

Primary references:
- https://docs.databricks.com/aws/en/tables/clustering
- https://docs.databricks.com/aws/en/tables/operations/optimize
- https://docs.databricks.com/aws/en/optimizations/predictive-optimization
