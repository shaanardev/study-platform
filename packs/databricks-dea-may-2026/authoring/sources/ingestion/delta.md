# Delta Lake streaming and change data

Reviewed source digest for the May 2026 practice pack. Use the linked documentation for platform and runtime details.

A Delta streaming source tracks committed additions; it is not a general feed of updates and deletes. Change Data Feed exposes row-level changes when enabled. Delta streaming sink transactions and stable checkpoints support recovery.

Primary reference: [https://docs.databricks.com/aws/en/delta/delta-change-data-feed](https://docs.databricks.com/aws/en/delta/delta-change-data-feed)
