# Unity Catalog managed table lifecycle

Primary documentation checked on 2026-10-01. This is a short study digest; consult the linked documentation for supported runtime and platform details.

Managed tables use managed storage and lifecycle handling. A dropped managed table has a recovery period before asynchronous data deletion; a DROP does not mean immediate physical erasure.

- [managed](https://docs.databricks.com/aws/en/tables/managed)
