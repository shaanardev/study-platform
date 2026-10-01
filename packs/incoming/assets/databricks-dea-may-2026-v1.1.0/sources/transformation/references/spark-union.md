# PySpark union alignment

Primary documentation checked on 2026-10-01. This is a short study digest; consult the linked documentation for supported runtime and platform details.

DataFrame union aligns by position; unionByName aligns by names. Both preserve duplicates. SQL UNION and UNION ALL have distinct duplicate semantics.

- [pyspark.sql.DataFrame.unionByName.html](https://spark.apache.org/docs/3.5.7/api/python/reference/pyspark.sql/api/pyspark.sql.DataFrame.unionByName.html)
- [pyspark.sql.DataFrame.union.html](https://spark.apache.org/docs/3.5.7/api/python/reference/pyspark.sql/api/pyspark.sql.DataFrame.union.html)
