# Archived baseline question 140

Original v1.0.0 prompt:

What is the purpose of the init script in a Databricks cluster?

Original choices:

1. To create notebooks
2. To run initialization code when a cluster starts, such as installing libraries or configuring settings
3. To schedule jobs
4. To manage users

Original keyed answer: To run initialization code when a cluster starts, such as installing libraries or configuring settings

Reviewed answer: Inspect cluster events and init-script logs for the failing startup command

Reviewed explanation: Init scripts run during classic compute initialization. A failing command or missing dependency can prevent startup, so inspect startup events and logs. Use supported governed script locations for the access mode; legacy DBFS script storage should not be assumed.

This archived record documents the supplied baseline wording. The pack uses the reviewed answer and explanation above; see the linked current primary references for runtime and product details.
