# Archived baseline question 181

Original v1.0.0 prompt:

What does the DESCRIBE HISTORY command return for a Delta table?

Original choices:

1. The table's column definitions
2. A log of operations (writes, merges, optimizes, etc.) with version numbers, timestamps, and operation metrics
3. The physical file paths only
4. The Unity Catalog permissions

Original keyed answer: A log of operations (writes, merges, optimizes, etc.) with version numbers, timestamps, and operation metrics

Reviewed answer: Compare its run history and task durations with earlier comparable runs

Reviewed explanation: Job run history provides previous durations, statuses, and task details. Compare runs with similar inputs and configurations before attributing a slowdown. Delta DESCRIBE HISTORY describes table transactions and is not a replacement for job execution history.

This archived record documents the supplied baseline wording. The pack uses the reviewed answer and explanation above; see the linked current primary references for runtime and product details.
