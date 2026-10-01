# Reviewed baseline question 133

Question: What is the databricks bundle validate command used for?

Reviewed answer: To check the syntax and configuration of a Declarative Automation Bundle without deploying

databricks bundle validate checks the bundle configuration for errors: valid YAML syntax, correct resource definitions, valid references, and environment configurations. It catches issues before deployment. Run this in CI/CD pipelines and before deploy to ensure bundle correctness.
