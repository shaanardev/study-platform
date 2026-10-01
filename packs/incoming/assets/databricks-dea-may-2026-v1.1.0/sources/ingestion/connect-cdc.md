# Managed database connector architecture

Reviewed source digest for the May 2026 practice pack. Use the linked documentation for platform and runtime details.

For supported database CDC designs, an ingestion gateway captures source changes into staging storage and an ingestion pipeline applies staged data to destination tables. Source change-capture prerequisites and permissions must be configured.

Primary reference: [https://docs.databricks.com/aws/en/ingestion/lakeflow-connect/cdc-overview](https://docs.databricks.com/aws/en/ingestion/lakeflow-connect/cdc-overview)
