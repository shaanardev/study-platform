# Reviewed baseline question 129

Question: What is the databricks bundle deploy command used for?

Reviewed answer: To deploy Databricks resources defined in an Declarative Automation Bundle to a target workspace

databricks bundle deploy deploys resources defined in databricks.yml (jobs, pipelines, notebooks, queries) to the specified target workspace. It validates the bundle, creates/updates resources, and handles dependencies. This enables infrastructure-as-code deployment from local development or CI/CD pipelines.
