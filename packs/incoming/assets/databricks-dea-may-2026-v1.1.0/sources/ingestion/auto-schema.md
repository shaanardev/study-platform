# Auto Loader schema inference and evolution

Reviewed source digest for the May 2026 practice pack. Use the linked documentation for platform and runtime details.

Auto Loader infers and tracks source schemas. JSON and CSV fields default to strings unless type inference is enabled. Schema evolution modes include addNewColumns and rescue; reader evolution and Delta writer evolution are separate settings.

Primary reference: [https://docs.databricks.com/aws/en/ingestion/cloud-object-storage/auto-loader/schema](https://docs.databricks.com/aws/en/ingestion/cloud-object-storage/auto-loader/schema)
