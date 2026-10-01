# Compute startup and environment failures

Use compute event logs and startup logs to identify the failure phase. Provisioning or network connection errors occur before Spark workload execution; check the cloud capacity, instance permissions, routing, firewall, and required service connectivity named by the event. Init-script failures are investigated through startup events and init-script logs.

Package installation or import failures should be diagnosed from the installation status and logs. Confirm that package versions are compatible with the runtime and each other. Compute-scoped libraries are subject to supported package sources, runtime, and access mode; installing a library on a compute resource does not make every package compatible.

Primary references:
- https://docs.databricks.com/aws/en/compute/troubleshooting/
- https://docs.databricks.com/aws/en/compute/clusters-manage
- https://docs.databricks.com/aws/en/libraries/cluster-libraries
- https://docs.databricks.com/aws/en/init-scripts/
