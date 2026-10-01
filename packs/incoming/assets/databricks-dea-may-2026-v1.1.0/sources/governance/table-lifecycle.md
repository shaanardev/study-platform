# Unity Catalog tables, namespaces, and volumes

A Unity Catalog table's three-part name is `catalog.schema.table`. A schema is also called a database in some interfaces. A volume is a governed file container for non-tabular files; it is not a table registration.

Managed tables use configured Unity Catalog managed storage and Unity Catalog manages their data lifecycle. Dropping a managed table starts a recovery window (seven days by default); after the window, an asynchronous purge removes managed data files. External tables register data at an external location. Dropping an external table removes its catalog metadata but leaves the files in cloud storage.

Creating an eligible table with an explicit external `LOCATION` registers it as external. Creating a managed table normally omits `LOCATION`. Converting an eligible external Delta table with `ALTER TABLE ... SET MANAGED` is a separate operation and requires Databricks Runtime 17.3 LTS or above or serverless compute, table ownership, and other documented prerequisites. `UNSET MANAGED` is a conditional rollback for a supported prior conversion, not a universal conversion of any managed table.

## Official Databricks documentation

- [Unity Catalog table types](https://docs.databricks.com/aws/en/tables/types)
- [Object storage lifecycle in Unity Catalog](https://docs.databricks.com/aws/en/data-governance/unity-catalog/object-storage-lifecycle)
- [Managed tables](https://docs.databricks.com/aws/en/tables/managed)
- [External tables](https://docs.databricks.com/aws/en/tables/external)
- [Convert external or foreign Delta tables to managed tables](https://docs.databricks.com/aws/en/tables/convert-to-managed)
- [Unity Catalog volumes](https://docs.databricks.com/aws/en/volumes/)

Documentation checked October 1, 2026.
