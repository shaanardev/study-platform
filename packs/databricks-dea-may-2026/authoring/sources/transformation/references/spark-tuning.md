# Spark performance and configuration

Primary documentation checked on 2026-10-01. This is a short study digest; consult the linked documentation for supported runtime and platform details.

SQL shuffle partitions and automatic broadcast thresholds target specific execution concerns. Default RDD parallelism differs from SQL shuffle configuration. Driver and executor memory affect their respective processes; measure after tuning.

- [sql-performance-tuning.html](https://spark.apache.org/docs/3.5.7/sql-performance-tuning.html)
- [configuration.html](https://spark.apache.org/docs/3.5.7/configuration.html)
