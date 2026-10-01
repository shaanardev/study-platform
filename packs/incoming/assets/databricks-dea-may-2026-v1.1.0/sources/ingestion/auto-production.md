# Auto Loader production patterns

Reviewed source digest for the May 2026 practice pack. Use the linked documentation for platform and runtime details.

Use a durable, query-specific checkpoint for progress and state. Configure schemaLocation for schema metadata. Discovery modes, checkpoint recovery, and bounded AvailableNow processing address different concerns.

Primary reference: [https://docs.databricks.com/aws/en/ingestion/cloud-object-storage/auto-loader/production](https://docs.databricks.com/aws/en/ingestion/cloud-object-storage/auto-loader/production)
