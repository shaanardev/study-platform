# Unity Catalog privileges and identity

Unity Catalog uses principals (users, groups, and service principals), securable objects, and privileges. For a table read, the principal needs `SELECT` on the table (or an inherited parent grant), `USE SCHEMA` on its schema, and `USE CATALOG` on its catalog. Catalog and schema grants can inherit to current and future child objects, so inspect all effective grants, group membership, and parent grants before concluding access was removed.

`GRANT` assigns specified privileges and `REVOKE` removes specified grants. `ALL PRIVILEGES` does not include `MANAGE`, `READ METADATA`, `EXTERNAL USE SCHEMA`, or `EXTERNAL USE LOCATION`. `MANAGE` supports administration such as managing privileges and ownership; it does not itself grant table data reads. The standalone SQL `DENY` statement applies to `hive_metastore`, not Unity Catalog. ABAC DENY policies are a separate Beta mechanism with a defined supported scope.

Job tasks normally use the job's configured Run as identity for data authorization; task type and compute can have documented exceptions. Service principals are suitable non-human identities for automation. Cluster policies constrain permitted compute configurations; they do not grant Unity Catalog data privileges.

## Official Databricks documentation

- [Unity Catalog privileges reference](https://docs.databricks.com/aws/en/data-governance/unity-catalog/access-control/privileges-reference)
- [Unity Catalog permissions concepts](https://docs.databricks.com/aws/en/data-governance/unity-catalog/access-control/permissions-concepts)
- [Unity Catalog securable objects](https://docs.databricks.com/aws/en/data-governance/unity-catalog/securable-objects)
- [SQL DENY](https://docs.databricks.com/aws/en/sql/language-manual/security-deny)
- [Databricks service principals](https://docs.databricks.com/aws/en/admin/users-groups/service-principals)
- [Lakeflow Jobs identity and privileges](https://docs.databricks.com/aws/en/jobs/privileges)
- [Cluster policies](https://docs.databricks.com/aws/en/compute/clusters-manage)

Documentation checked October 1, 2026.
