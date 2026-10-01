# Archived baseline question 044

Original v1.0.0 prompt:

What happens when you run OPTIMIZE on a partitioned Delta table with ZORDER BY?

Original choices:

1. It only optimizes the partition directories
2. It compacts files within each partition AND applies Z-order clustering to improve query filtering on specified columns
3. It removes the partitioning
4. It converts the table to unpartitioned

Original keyed answer: It compacts files within each partition AND applies Z-order clustering to improve query filtering on specified columns

Reviewed answer: It compacts files within each partition AND applies Z-order clustering to improve query filtering on specified columns

Reviewed explanation: OPTIMIZE ... ZORDER BY on a partitioned table performs two optimizations: 1) File compaction (combining small files) within each partition, and 2) Multi-dimensional clustering (Z-ordering) on the specified columns within each partition. This is especially effective for filtered queries on high-cardinality columns.

This archived record documents the supplied baseline wording. The pack uses the reviewed answer and explanation above; see the linked current primary references for runtime and product details.
