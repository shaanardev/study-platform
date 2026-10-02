# Archived baseline question 012

Original v1.0.0 prompt:

An engineer notices that queries on a Delta table are reading more files than expected. After investigating, they find many small files in the table directory. What is the BEST approach to optimize this table?

Original choices:

1. Run VACUUM to remove old files
2. Run OPTIMIZE to compact small files into larger ones
3. Increase the cluster size
4. Recreate the table with a different partitioning strategy

Original keyed answer: Run OPTIMIZE to compact small files into larger ones

Reviewed answer: OPTIMIZE to compact files

Reviewed explanation: OPTIMIZE compacts small files to reduce scan and metadata overhead. VACUUM removes eligible unreferenced old files; it does not compact the current table. Target file sizes depend on table and runtime settings, not a universal 128 MB default.

This archived record documents the supplied baseline wording. The pack uses the reviewed answer and explanation above; see the linked current primary references for runtime and product details.
