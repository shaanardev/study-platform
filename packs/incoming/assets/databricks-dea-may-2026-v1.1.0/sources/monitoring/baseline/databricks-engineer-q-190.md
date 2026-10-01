# Archived baseline question 190

Original v1.0.0 prompt:

What is liquid clustering in Delta Lake?

Original choices:

1. A way to encrypt clusters of rows
2. A flexible data layout that clusters a table on chosen keys without rigid partitioning, and can be changed without rewriting the whole table
3. A method to merge multiple SQL warehouses
4. A streaming checkpoint format

Original keyed answer: A flexible data layout that clusters a table on chosen keys without rigid partitioning, and can be changed without rewriting the whole table

Reviewed answer: It organizes data using clustering keys without fixed partition directories and supports changing keys for future clustering

Reviewed explanation: Liquid clustering provides flexible table layout for data skipping. Changing keys does not instantly recluster all old data; use the appropriate optimization operation when needed. Automatic key selection is a separate configured capability, not a property of every clustered table.

This archived record documents the supplied baseline wording. The pack uses the reviewed answer and explanation above; see the linked current primary references for runtime and product details.
