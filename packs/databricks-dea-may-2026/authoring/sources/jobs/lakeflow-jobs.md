# Lakeflow Jobs reviewed source notes

This digest supports the reviewed Lakeflow Jobs questions. The supplied academy notes at
`../materials/academy-learning-plan/lakeflow-job-workloads/notes.md` are supplemental; current
Databricks documentation takes precedence where behavior or terminology differs.

## Tasks, dependencies, and conditional flow

A Lakeflow Job orchestrates one or more tasks. Dependencies form a directed acyclic graph; tasks
without dependency edges may run in parallel when capacity allows. Run-if conditions evaluate
upstream task outcomes, including all succeeded, at least one succeeded, none failed, all done,
at least one failed, and all failed. If/else tasks branch on Boolean expressions using supported
job parameters, dynamic values, or task values. For each tasks run a nested task for array items
with configurable concurrency. A downstream task can depend on the For each container.

Task values pass run-time results between tasks. Retries permit a configured number of additional
attempts and do not make task side effects idempotent. Repair run reruns failed or selected affected
tasks and required downstream work, while successful upstream work can be preserved. Review writes
before repair because rerunning a partially completed task can repeat its side effects.

## Schedules and triggers

A schedule expresses time-based execution; set the intended time zone and use the supported Quartz
cron expression format for advanced schedules. File arrival triggers monitor a supported Unity
Catalog storage location. Table update triggers watch configured source tables and can be set to
wait after the latest update. These triggers start a job; task dependencies and ingestion logic
still determine data readiness and processing behavior. Run now starts a job manually.

## Official documentation checked October 1, 2026

- [Lakeflow Jobs overview](https://docs.databricks.com/aws/en/jobs/)
- [Control task flow, retries, and conditional tasks](https://docs.databricks.com/gcp/en/jobs/control-flow)
- [Configure task dependencies](https://docs.databricks.com/aws/en/jobs/run-if)
- [Configure and edit tasks](https://docs.databricks.com/gcp/en/jobs/configure-task)
- [Repair job failures](https://docs.databricks.com/aws/en/jobs/repair-job-failures)
- [Automate jobs with schedules and triggers](https://docs.databricks.com/aws/en/jobs/triggers)
- [Configure task parameters](https://docs.databricks.com/gcp/en/jobs/task-parameters)
