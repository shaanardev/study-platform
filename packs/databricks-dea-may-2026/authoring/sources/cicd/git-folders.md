# Git folders development and review

Databricks Git folders integrate a workspace folder with a remote Git repository. They support cloning, branch management, committing, pushing, pulling, and reviewing diffs. A typical workflow is to work on a feature branch, commit and push it, then open a pull request in the Git provider for review and merge.

Local commits remain local until pushed. Pull retrieves remote commits. Delta table history tracks data versions and does not version or publish code.

Primary documentation checked 2026-10-01:

- [Git folders concepts](https://docs.databricks.com/aws/en/repos/git-folders-concepts)
- [Git folders CI/CD](https://docs.databricks.com/aws/en/repos/ci-cd)
- [What happened to Databricks Repos?](https://docs.databricks.com/aws/en/repos/what-happened-repos)
