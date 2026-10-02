# Reviewed baseline question 124

Question: How can you deploy a Databricks job to multiple workspaces (dev, staging, prod)?

Reviewed answer: Use Declarative Automation Bundles with environment-specific configuration files and CI/CD pipelines

Declarative Automation Bundles (DABs) define jobs as YAML files with environment-specific overrides. Use the same bundle with different target environments (databricks bundle deploy -t dev/staging/prod). CI/CD pipelines automate testing and promotion. This ensures consistency across environments.
