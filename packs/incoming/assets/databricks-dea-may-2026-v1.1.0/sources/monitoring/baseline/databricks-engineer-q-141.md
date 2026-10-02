# Archived baseline question 141

Original v1.0.0 prompt:

What is the purpose of the cluster-scoped library installation method?

Original choices:

1. To install libraries on all clusters automatically
2. To install libraries on a specific cluster, available to all notebooks running on that cluster
3. To share libraries between workspaces
4. To uninstall libraries

Original keyed answer: To install libraries on a specific cluster, available to all notebooks running on that cluster

Reviewed answer: The specified compute resource, subject to its runtime and access-mode support

Reviewed explanation: Compute-scoped libraries are configured for a particular compute resource. Supported package sources and behavior depend on runtime and access mode. Specify compatible versions and inspect installation status if the workload reports missing or conflicting dependencies.

This archived record documents the supplied baseline wording. The pack uses the reviewed answer and explanation above; see the linked current primary references for runtime and product details.
