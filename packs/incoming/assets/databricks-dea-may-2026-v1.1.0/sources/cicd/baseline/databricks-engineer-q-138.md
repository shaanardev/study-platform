# Reviewed baseline question 138

Question: A bundle job has already been deployed. What does databricks bundle run -t prod daily_etl do?

Reviewed answer: Starts the named deployed bundle resource for the prod target

bundle run runs a specified bundle resource; deploy changes first with bundle deploy. validate checks configuration. Selecting a target controls the environment to which the command applies.
