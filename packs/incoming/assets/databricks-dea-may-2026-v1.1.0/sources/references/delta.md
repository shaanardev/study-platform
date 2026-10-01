# Delta Lake table foundations

Primary documentation checked on 2026-10-01. This is a short study digest; consult the linked documentation for supported runtime and platform details.

Delta tables combine data files and transaction metadata. Historical reads require retained files and logs; MERGE is not a uniqueness constraint. Change Data Feed represents row-level table changes when configured.

- [Delta Lake table foundations](https://docs.databricks.com/aws/en/delta/)
- [history](https://docs.databricks.com/aws/en/delta/history)
- [merge](https://docs.databricks.com/aws/en/delta/merge)
- [delta-change-data-feed](https://docs.databricks.com/aws/en/delta/delta-change-data-feed)
