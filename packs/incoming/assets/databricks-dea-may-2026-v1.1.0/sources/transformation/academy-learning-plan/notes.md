# Overview
  - https://docs.databricks.com/aws/en/ldp/load
  - let your team focus on what really matters; writing and managing transformation logic.
  - simplified pipeline authoring
    - write sql or python
    - no orchestration logic
    - zero boilerplate
  - intelligent optimization
    - auto scaling
    - self healing
    - lower overhead
  - unified batch & streaming
    - one platform
    - workflow aware
    - no rewrites
  - use either batch or streaming method with medallion architecture
    - batch; large volumes of dat that arrive all at once
    - streaming; handles data that flows continuously in small increments, enabling near real-time processing.
  - incremental processing
    - [run one](./incremental-processing-run-one.png); Raw data -> appended to Bronze -> transformed and appended to Silver -> processed into the Gold Materialized View with built-in Serverless optimizations. 
    - [run two](incremental-processing-run-two.png); Only new data (File 2) is incrementally ingested into Bronze -> incrementally transformed and appended into Silver -> then the full Silver table is processed into the Gold Materialized View with built-in Serverless optimizations. 
  - creating a pipeline
    - workspace menu
    - jobs & pipelines
  - dataset types
    - [streaming tables](./streaming-table-overview.png); a table with streaming support or incremental data processing, only processing new data
    - [materialized views](./materialized-views-overview.png); 
      - records are processed as required to return accurate results for the current data state
      - used for; transformations, aggregations, pre computing slow queries, frequently used computations
    - [views](./view-overview.png)
      - virtual table with no physical data based on the query in your pipelines, 
      - [temporary view](https://docs.databricks.com/aws/en/ldp/developer/ldp-sql-ref-create-temporary-view)
        ```sql
          CREATE TEMPORARY VIEW orders_active AS
          SELECT *
          FROM 2_silver_db.orders_silver
          WHERE notifications = 'Y';
        ```
      - [regular view](https://docs.databricks.com/aws/en/ldp/developer/ldp-sql-ref-create-view)
        ```sql
          CREATE VIEW 3_gold_db.orders_active_view AS
          SELECT *
          FROM 2_silver_db.orders_silver
          WHERE notifications = 'Y';
        ```
  - Delta Live Tables (DLT) to Spark Declarative Pipelines (SDP)
    - old keywords remain supported for backward compatibility, but all new pipelines should use the updated syntax.

    | Before (DLT) | After (SDP) |
    |---|---|
    | `CREATE OR REFRESH STREAMING LIVE TABLE` | `CREATE OR REFRESH STREAMING TABLE` |
    | `CREATE OR REFRESH LIVE TABLE` | `CREATE OR REFRESH MATERIALIZED VIEW` |
    | `CREATE LIVE VIEW` / `CREATE TEMPORARY LIVE VIEW` | `CREATE OR REFRESH TEMPORARY VIEW` |
  - [declarative pipeline graph](./declarative-pipeline-graph.png)
    - automatic linking simplifies pipeline development and reduces errors by removing the need to manually manage execution order. 
    - makes it easy to view and monitor your pipeline and its dependencies, giving you clear visibility into how data flows through each stage. 

# Simplified Pipeline Development and Common Pipeline Settings
  - IDE like layout in databricks platform; multi file editor, dry run, scheduling, changing compute, budget, tags, default location for data assets
  - common settings
    - compute; [serverless](./serverless-compute.png) or [classic fixed size](./classic-compute.png)
      - https://docs.databricks.com/aws/en/ldp/serverless#select-a-performance-mode
      - https://docs.databricks.com/aws/en/ldp/serverless#serverless-pipeline-features
    - code assets 
      - pipeline root folder is set to automatically and includes all relevant files within that folder for your pipeline project (unless otherwise specified by the user). 
      - source code section lets you specify which subfolders or individual files to include in your pipeline, typically sub folders and files within the root folder. 
    - [configuration](./configuration-parameters.png)

# Ensure Data Quality with Expectations
  - data quality rules (expectations)
  - validate your data row by row to ensure integrity
  ```sql
    CONSTRAINT constraint_name
    EXPECT (column_condition)
    [ON VIOLATION action]
  ```
  - three violation actions
    - warn
      - log Violations, keep rows
      - default behavior when no action is specified
      - result
        - invalid rows are still written to the target  
        - logs include counts of valid vs. invalid records and other metrics.
    ```sql
      CONSTRAINT valid_notification
      EXPECT (notifications IN ('Y','N'))
    ```
    - drop
      - exclude invalid rows
      - remove bad records from the target table
      - result
        - invalid rows are dropped from the table
        - logs include the count of dropped rows and other metrics
    ```sql
      CONSTRAINT valid_date
      EXPECT (order_timestamp > '2021-01-01')
      ON VIOLATION DROP ROW
    ```
    - fail
      - stop the flow when constraints are violated
      - fail only the specific flow
      - result
        - the affected flow fails
        - other flows in the pipeline continue running
        - manual intervention is required to resolve the issue
    ```sql
      CONSTRAINT valid_id
      EXPECT (customer_id IS NOT NULL)
      ON VIOLATION FAIL UPDATE
    ```
  - example silver table with all three data quality constraints
    ```sql
      CREATE OR REFRESH STREAMING TABLE 2_silver_db.orders_silver
      (
        CONSTRAINT valid_notifications EXPECT (notifications IN ('Y','N')),
        CONSTRAINT valid_date EXPECT (order_timestamp > "2021-01-01") ON VIOLATION FAIL UPDATE,
        CONSTRAINT valid_id EXPECT (customer_id IS NOT NULL) ON VIOLATION DROP ROW
      )
      AS
      SELECT
        order_id,
        timestamp(order_timestamp) AS order_timestamp,
        customer_id,
        notifications
      FROM STREAM 1_bronze_db.orders_bronze;
    ```
  - Materialized views that use expectations can be incrementally refreshed when the expectations and query are supported. Otherwise, Databricks performs a full refresh.

# Streaming Joins
  - [overview](./streaming-joins-overview.png)
  - [comparison](./join-types-comparison.png)
  - stream-snapshot join 
    - https://docs.databricks.com/gcp/en/transform/join#stream-stream-joins
    - joining a Streaming Table to a Static Table (sometimes called a Stream-Snapshot Join or Stream-static join depending on the scenario)
    - incrementally join new data from a streaming table to a static lookup table to create another streaming table.
    - useful when you want to enrich your streaming data with reference information that doesn’t change often.
    - every new record in the streaming table is matched against all available data in the static table, ensuring a complete and accurate join each time.
    - result of that join is then appended to your final streaming output table, continuing the pipeline flow.
    - great pattern for enriching streaming data with context, like converting country codes, product IDs, or user roles into readable formats using static reference data.
    - efficient, reliable, and works well since only one side of the join, the streaming table, is changing over time.
    - as new data is appended to your source streaming table, only the new rows are joined with the entire static lookup table.
    - incremental join, meaning the static table doesn’t need to be reprocessed, only the incoming streaming data is evaluated.
    - keeps the process highly efficient, and ensures that each new record is immediately enriched with the latest reference data from the static table.
  - joining streaming tables w/ materialized views
    - join all rows from both streaming tables each time the pipeline is run
    - typically used when both input datasets are changing continuously, and you need to combine them regularly to produce a unified, up-to-date result.
    - because both sides are streaming, a materialized view is required to handle this join efficiently and keep the results current.
    - the materialized view will process all new rows from both tables and incrementally refresh, depending on pipeline configuration and compute mode.
    - ensures that every new record from either side is matched correctly, producing an up-to-date and complete output.
    - use of a materialized view allows the join to scale efficiently, leveraging incremental refresh where possible to avoid unnecessary recomputation.
    - this join pattern is ideal when both data sources are live and frequently updated, and you want to keep your results synchronized across both.
    - 
  - stream-stream joins
    - designed to incrementally join new data from two streaming tables as it arrives.
    - only the new incoming data from each stream is joined, past data is not considered during each run.
    -  useful for detecting relationships between events that occur close together in time, such as joining clickstream data with real-time ad impressions.
    - because stream-stream joins often involve windowing logic, watermarking, and other advanced streaming concepts, they are outside the scope of this course.

# Deploying Pipelines to prod
  - scheduling
    - triggered
      - ideal for batch workloads
      - pipelines triggered manually or set to run on a recurring schedule
      - pipeline refreshes selected tables using the data available at the start of executions
      - pipeline stops once updates are complete
      - best for; batch processing or pipelines that don't need to run constantly.
    - continuous
      - ideal for streaming workloads
      - continuously process new data to keep streaming tables & materialized views up to date in near real time
      - system monitors dependencies and updates only when source data changes
      - ensuring efficiency without unnecessary reprocessing
  - notifications
    - events; pipeline starts, pipeline succeeds, pipeline fails
  - monitoring with event log
    - audit logs; who did what when, full history of actions taken against pipelines & its datasets
    - data quality checks; monitor the results of expectations & constraints including pass/fail counts and violation details
    - pipeline progress; status & progress of each pipeline run including row counts processed, completed stages, current execution state
    - data lineage; understand how data flows & transforms through the pipeline from source ingestion through the bronze, silver gold layers
    - querying event log
      - by default written as a hidden UC table located in the pipelines default catalog and schema
      - public to metastore; publish the event log as a UC table
      - `SELECT * FROM &lt;catalog&gt;.&lt;schema&gt;.&lt;event_log_table_name&gt;`

# Change Data Capture (CDC)
  - [overview](./cdc-overview.png)
  - technique used to track and capture changes in a data source (such as a database, lakehouse or data warehouse). Those changes are then applied to a target table, for example, your Lakehouse, to keep it up to date with the latest state from the source.
  - closely related to how we handle Slowly Changing Dimensions, or SCDs, which define how historical changes are tracked and stored in your target
  - SCD type 1 
    - overwrites the target table with the latest values on every change — no history is retained, making it the simplest and most efficient approach when only current data matters.
    - simplest CDC strategy, and it’s ideal when maintaining historical changes isn’t necessary. You just need the latest, most accurate data.
    - on update; previous record is overwritten by its key with the new value
    - on delete; the record is removed
    - on insert; no tracking of old keys (rows) only the current data is retained
    - [example](./scd-type-one-scenario.png) -> [applied](./scd-type-one-scenario-applied.png)
      - Peter (customer_id 1): His address is updated to the latest address based on the ProcessDate to 123 Main St. from the updates table.
      - Samarth (customer_id 2): He’s been deleted, so his row is removed from the target table.
      - Kostas (customer_id 3): He’s a new customer, so his record is inserted into the table.
      - end result; customers table contains a current snapshot of all active customers, with no history, just the most recent customers.
  - SCD type 2
    - preserves every historical version of a record by adding `__START_AT` and `__END_AT` metadata columns 
    - active rows have a null `__END_AT`, while inactive and deleted rows carry a date, enabling full historical analysis.
    - on update or insert; old record is preserved w/ additional column indicating its validity period (start date, end date or a current flag), a new row is inserted with the updated information
    - on delete; when a record is marked as deleted the record is kept and a column indicates the record is inactive
    - used when historical data is important, the system needs to track how attributes changed over time
    - [worked example](./scd-type-two-worked-example.png)
  - AUTO CDC INTO in Spark Declarative Pipelines (Formerly APPLY CHANGES INTO)
    - Lakeflow's built-in declarative CDC mechanism
    - replaces complex `MERGE INTO` batch logic with a concise, readable syntax where KEYS, APPLY AS DELETE WHEN, SEQUENCE BY, COLUMNS, and STORED AS each play a distinct role.
    - https://docs.databricks.com/aws/en/ldp/cdc
    - https://docs.databricks.com/aws/en/ldp/developer/ldp-sql-ref-apply-changes-into

# 