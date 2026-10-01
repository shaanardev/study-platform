# Archived baseline question 092

Original v1.0.0 prompt:

What is the impact of a large state store on Structured Streaming performance?

Original choices:

1. No impact
2. Large state can cause slow processing, memory pressure, and longer checkpointing times
3. It always improves performance
4. It reduces checkpoint size

Original keyed answer: Large state can cause slow processing, memory pressure, and longer checkpointing times

Reviewed answer: More state can increase memory use, state access work, and checkpoint overhead

Reviewed explanation: Stateful operators retain information across batches. Growing state can increase resource pressure and checkpoint costs. Check the operator metrics and use valid watermark or timeout semantics to bound state when the business logic permits.

This archived record documents the supplied baseline wording. The pack uses the reviewed answer and explanation above; see the linked current primary references for runtime and product details.
