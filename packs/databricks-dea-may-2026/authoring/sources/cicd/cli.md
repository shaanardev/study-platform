# Databricks bundle CLI commands

Run bundle commands from the bundle project. `databricks bundle validate -t <target>` validates configuration for the selected target. `databricks bundle deploy -t <target>` deploys or updates the bundle's resources in that target workspace. `databricks bundle run -t <target> <resource-key>` runs a named deployed resource; it does not implicitly deploy preceding changes. The `-t` flag selects a bundle target.

Validation checks bundle configuration and resource definitions. It does not execute workload tests or prove business correctness, source availability, or runtime data permissions.

Primary documentation checked 2026-10-01:

- [Bundle command group](https://docs.databricks.com/aws/en/dev-tools/cli/bundle-commands)
- [Develop Declarative Automation Bundles](https://docs.databricks.com/aws/en/dev-tools/bundles/work-tasks)
