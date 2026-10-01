# Pipeline data quality expectations

Primary documentation checked on 2026-10-01. This is a short study digest; consult the linked documentation for supported runtime and platform details.

Basic expectations retain invalid rows and record metrics; drop and fail behaviors must be selected explicitly. Enforced CHECK and NOT NULL constraints concern writes, while row filters concern visibility.

- [expectations](https://docs.databricks.com/aws/en/ldp/expectations)
- [constraints](https://docs.databricks.com/aws/en/tables/constraints)
