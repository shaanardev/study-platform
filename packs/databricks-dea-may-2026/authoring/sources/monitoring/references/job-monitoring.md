# Lakeflow Jobs monitoring

Use run history to compare durations, statuses, task details, and parameters across comparable runs. The job task graph and upstream task status explain dependency blockers, including tasks that never start and therefore have no Spark stages.

A duration warning identifies a run or task that exceeded its configured expected duration. A timeout is a separate maximum-duration limit that stops execution. Configure suitable thresholds and notification destinations for the workload.

Cluster log delivery can retain driver and executor logs at a supported durable destination after compute terminates. It is separate from Spark streaming checkpoints and Delta table history.

Primary references:
- https://docs.databricks.com/aws/en/jobs/monitor
- https://docs.databricks.com/aws/en/jobs/configure-job
- https://docs.databricks.com/aws/en/jobs/notifications
- https://docs.databricks.com/aws/en/compute/clusters-manage
