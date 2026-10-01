# Archived baseline question 136

Original v1.0.0 prompt:

What is the correct pattern for implementing a data pipeline with SLAs that alerts if processing takes too long?

Original choices:

1. No alerting needed
2. Configure job duration threshold alerts in notifications and set appropriate task timeouts
3. Check manually only
4. Restart jobs frequently

Original keyed answer: Configure job duration threshold alerts in notifications and set appropriate task timeouts

Reviewed answer: Configure duration warning notifications and suitable task timeouts

Reviewed explanation: A duration warning signals slow execution, while a timeout limits how long a task is allowed to run. Monitor historical baselines and failure patterns. Notification delivery depends on its configured destinations.

This archived record documents the supplied baseline wording. The pack uses the reviewed answer and explanation above; see the linked current primary references for runtime and product details.
