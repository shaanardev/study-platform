# Unity Catalog row filters and column masks

Table-level row filters and column masks are attached to individual tables and evaluated at query time. A row filter function returns a Boolean predicate: matching rows are visible, while other rows are omitted from query results. A column mask transforms the value exposed to a query; it does not automatically rewrite or delete the stored value. These controls do not replace the required object privileges.

Identity checks must match the identity model. `is_account_group_member()` checks account-level group membership; `is_member()` is for workspace-local groups. Dynamic views can also provide filtered projections, but a consumer's direct access to the base table is a separate access path.

Table-level row filters and masks have compute and feature limitations. Current docs state that runtimes below 12.2 LTS do not support them; dedicated compute has separate runtime/serverless fine-grained access control requirements. Check the live requirements for the workload and operation rather than treating the feature as available on every compute configuration.

## Official Databricks documentation

- [Row filters and column masks](https://docs.databricks.com/aws/en/data-governance/unity-catalog/filters-and-masks/)
- [Unity Catalog access control](https://docs.databricks.com/aws/en/data-governance/unity-catalog/access-control/)

Documentation checked October 1, 2026.
