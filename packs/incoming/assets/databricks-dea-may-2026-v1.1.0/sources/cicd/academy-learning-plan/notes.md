# Supplied academy notes: Declarative Automation Bundles

These notes summarize the supplied academy learning plan for deploying a Databricks project.

- Bundles support source control, code review, testing, and CI/CD for data and AI projects.
- YAML configuration describes project artifacts, resources, and settings.
- The Databricks CLI provides bundle commands to validate, deploy, and run workflows.
- Targets can configure deployments for different environments, including separate workspace hosts.
- The notes' example sequence is `databricks bundle validate`, `databricks bundle deploy -t development`, then `databricks bundle run -t development l1_simple_dab`.

The current product name is Declarative Automation Bundles; the academy notes use the older abbreviation DABs and older naming. The CLI command group and configuration conventions remain supported.
