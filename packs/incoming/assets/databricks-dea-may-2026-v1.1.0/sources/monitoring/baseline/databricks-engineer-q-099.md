# Archived baseline question 099

Original v1.0.0 prompt:

What is the impact of using dropDuplicates on a streaming DataFrame without a watermark?

Original choices:

1. It reduces shuffle and improves performance
2. Streaming state grows without bound because every unique key must be retained indefinitely to detect duplicates
3. Duplicates are still emitted because state is not used
4. Spark automatically applies a default 10-minute watermark

Original keyed answer: Streaming state grows without bound because every unique key must be retained indefinitely to detect duplicates

Reviewed answer: Previously seen keys may need to remain in state indefinitely

Reviewed explanation: Without a valid state eviction rule, deduplication retains previously seen keys to detect later repeats, so state can grow without bound. A watermark-based design bounds state according to the lateness policy; it is not a promise to remember duplicates forever.

This archived record documents the supplied baseline wording. The pack uses the reviewed answer and explanation above; see the linked current primary references for runtime and product details.
