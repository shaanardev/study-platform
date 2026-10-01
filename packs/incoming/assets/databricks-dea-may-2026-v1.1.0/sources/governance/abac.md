# Unity Catalog ABAC

Unity Catalog ABAC policies use governed tags and policy conditions to apply access behavior across matching objects. Tags classify objects; a tag alone does not create a mask, filter, grant, or deny. Tag assignment is security-sensitive because changing policy-relevant attributes can change which policies apply. Governed tags require controlled assignment permissions.

Policy scope is explicit. A policy attached to a metastore, catalog, schema, or table is evaluated only within that scope and for the securable types in its `FOR` clause. Row-filter and column-mask ABAC policies support catalog, schema, or table scope; table-level row filters and masks and ABAC policies are related but distinct mechanisms. Policies at a catalog or schema can apply automatically to newly created matching descendants within scope; they do not become global outside that scope.

ABAC row-filter and column-mask policies require governed tags and supported compute. Current requirements include serverless compute, Standard compute on Databricks Runtime 16.4+, or Dedicated compute on Runtime 16.4+ with fine-grained access control filtering enabled. Confirm current requirements before deployment. ABAC also supports GRANT policies and Beta DENY policies; those should not be confused with the standalone SQL `DENY` statement, which is not supported on Unity Catalog.

## Official Databricks documentation

- [ABAC core concepts](https://docs.databricks.com/aws/en/data-governance/unity-catalog/abac/core-concepts)
- [ABAC policy requirements and limitations](https://docs.databricks.com/aws/en/data-governance/unity-catalog/abac/requirements)
- [ABAC policy evaluation](https://docs.databricks.com/aws/en/data-governance/unity-catalog/abac/policy-evaluation)
- [Governed tags](https://docs.databricks.com/aws/en/admin/governed-tags/)

Documentation checked October 1, 2026.
