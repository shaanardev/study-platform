# Archived baseline question 130

Original v1.0.0 prompt:

What is the purpose of the Cluster log delivery path setting?

Original choices:

1. To store notebook code
2. To persist driver and executor logs to DBFS or cloud storage for debugging after cluster termination
3. To configure cluster size
4. To set the job schedule

Original keyed answer: To persist driver and executor logs to DBFS or cloud storage for debugging after cluster termination

Reviewed answer: Cluster log delivery to a supported durable location

Reviewed explanation: Configure log delivery to durable storage before the run. Retained logs help investigate failures after compute terminates. This is separate from Spark streaming checkpoints and Delta table history.

This archived record documents the supplied baseline wording. The pack uses the reviewed answer and explanation above; see the linked current primary references for runtime and product details.
