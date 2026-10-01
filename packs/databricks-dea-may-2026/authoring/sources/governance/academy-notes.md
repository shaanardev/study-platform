# Regulatory Compliance
  - EU GDPR
  - US CPA
  - reduce copies of your PII
  - find PI quickly
  - reliably change delete or export data
  - build in data skipping optimizations (z ordering) and housekeeping of obsolete/deleted data (vacuum)
  - transaction logs for auditing

# Data Privacy
  - [key aspects](./key-aspects.png)
  - [how to address them](./how-to-address-sensitive-data.png)
    - data discovery; comprehensive data inventories to under what PII is being held, involves identifying categorizing and labelling sensitive data to understand its location & usage
    - data classification; classified based on its sensitivity, helps in apply appropriate privacy measures & compliance protocols
    - data mapping; create a clear picture of how data flows including where its stored, who has access and how its used

# Unity Catalog
  - ACL grant answers three questions
    - **Who?** A principal: user, service principal, or group.
    - **What?** A securable object: for example, a catalog, schema, table, view, volume, function, model, external location, or connection.
    - **How?** A privilege: for example, USE CATALOG, USE SCHEMA, SELECT, MODIFY, CREATE TABLE, or EXECUTE.
  - why unified governance matters
    - organizations may have separate controls for:
      - cloud files, often controlled at coarse file or directory granularity rather than by row or column.
      - metadata catalogs, whose permissions can drift from the underlying data.
      - warehouses with a different, finer-grained permission model.
      - dashboards, notebooks, models, and other AI assets with their own controls.
      - multiple cloud providers with different access-management systems.
    - that fragmentation makes policy changes, audits, data discovery, and consistent sharing harder. 
    - if policy is coupled to file layout, reorganizing data can also force security-policy changes.
  - [ACL security model](./acl-model.png)
    - privilege, securables, principals
    - grant management using SQL `GRANT SELECT ON TABLE t TO analysts; REVOKE SELECT ON TABLE t FROM analysts;`
  - lineage
    - capture runtime lineage on Databricks compute and SQL warehouses
    - spanning tables, columns, dashboards, Lakeflow Jobs, notebooks, files, external sources, and models
    - answers answer were did this data come from? and which downstream assets may be affected by a change?
  - comments and tags add context that makes governed data easier to understand and find
  - recommended to generate concise table/column comments for poorly documented assets, establish consistent tag conventions, and apply comments or tags during ingestion
  - data discovery uses the same Unity Catalog permission model; users should only find assets they are authorized to discover
  - tags on catalog, schema, table, or column objects can support search and tag-based policies.
  - fine-grained access control
    - restrict columns; omit protected column values from a user's output.
    - restrict rows; omit records that do not satisfy the user's filter criteria.
    - data masking; return a transformed or partially obscured value instead of the original.
    - can be conditional on membership in a user, service-principal, or group context using Databricks-provided functions
    - masking is useful when a user may need to distinguish records without seeing the full protected value
    - row filtering removes records from query results; column masking preserves the column but changes what it returns.
  - [dynamic views](./dynamic-views.png)
    - can expose a filtered or transformed projection of underlying tables
    - the view owner needs access to the source tables, while a consumer querying the view does not need direct access to those tables
    - grant only the intended view access when the view is meant to mediate access; a separate direct grant to a base table can provide another route to the data.
  - [row filters and column masks](./row-filters-and-column-masking.png)
    - reusable functions to tables/columns
    - row filtering controls which rows are visible
    - masking controls how a column value is returned.
    ```sql
      CREATE OR REPLACE FUNCTION <catalog>.<schema>.us_filter(region STRING)
      RETURNS BOOLEAN
      RETURN IF(is_account_group_member('admin'), true, region = 'US');

      ALTER TABLE <catalog>.<schema>.sales
        SET ROW FILTER <catalog>.<schema>.us_filter ON (region);

      CREATE OR REPLACE FUNCTION <catalog>.<schema>.ssn_mask(ssn STRING)
      RETURNS STRING
      RETURN CASE
        WHEN is_account_group_member('HumanResourceDept') THEN ssn
        ELSE '***-**-****'
      END;

      ALTER TABLE <catalog>.<schema>.users
        ALTER COLUMN ssn SET MASK <catalog>.<schema>.ssn_mask;
    ```
  - governance operating model

    | Governance question | Capability |
    |---|---|
    | What data assets exist? | Centralized catalog |
    | What needs protection, and who can access it? | Centralized ACLs |
    | Who accessed it? | Auditing |
    | How does data flow? | Lineage |
    | How is data used, and where can it be cleaned up? | Data insights |
    | How is quality changing over time? | Lakehouse monitoring |
  
    - [key considerations](./governance-key-considerations.png)
  - PII privacy lifecycle
    - pseudonymization replaces direct identifiers with a substitute that can be easier to locate and act on, but linkage may still permit re-identification.
    - anonymization aims to make identification impractical, which can simplify management but may reduce analytical value.
    - three-stage checklist:
      1. **Identify** PII arriving from batch, streaming, or user-added sources. Use discovery, classification, and data mapping.
      2. **Protect** it with security controls, handling rules, consent management, and privacy-by-design practices. Decide whether to retain, pseudonymize, or anonymize based on the use case.
      3. **Manage** it through governance, compliance, monitoring/auditing, data-subject-rights processes, incident response, and privacy-impact assessment.

# [Unity Catalog - Object metadata](./system-tables-object-metadata.png)
  - `system.information_schema` exposes metadata for catalogs visible in the workspace. 
  - by contrast, `<catalog>.information_schema` scopes queries to one catalog. 
  - returned rows are still limited by the caller’s privileges. `TABLES` currently includes `TABLE_OWNER`, `LAST_ALTERED`, and `LAST_ALTERED_BY`; `TABLE_PRIVILEGES` includes the grantee and privilege type.
  - `LAST_ALTERED` describes a change to the relation definition; it is not a reliable timestamp for the most recent row/data update. 
  - use Delta table history or the appropriate operational records when the question is specifically about data writes. 
  - the information schema only reports grants visible to the querying principal; a `MANAGE` holder may need `SHOW GRANTS` or Catalog Explorer to inspect all grants.

  ```sql
    -- List tables in one catalog
    SELECT table_schema, table_name, table_type
    FROM system.information_schema.tables
    WHERE table_catalog = 'sales'
    ORDER BY table_schema, table_name;

    -- Inspect the grants visible to the current principal
    SELECT grantee, table_catalog, table_schema, table_name, privilege_type
    FROM system.information_schema.table_privileges
    WHERE table_catalog = 'sales'
      AND table_schema = 'churn'
      AND table_name = 'login_data_silver';

    -- Find who last altered the table definition and when
    SELECT table_name, last_altered_by, last_altered
    FROM system.information_schema.tables
    WHERE table_catalog = 'retail_prod'
      AND table_schema = 'churn_gold'
    ORDER BY last_altered DESC;

    -- Find the current owner
    SELECT table_owner
    FROM system.information_schema.tables
    WHERE table_catalog = 'retail_prod'
      AND table_schema = 'churn_gold'
      AND table_name = 'churn_features';
  ```
  
# [Unity Catalog - Billing, DBU usage and Attribution](./system-tables-billing-logs.png)
  - billable usage table is `system.billing.usage`. `usage_date`, `sku_name`, `usage_quantity`, `usage_unit`, `identity_metadata.run_as`, and fields nested under `usage_metadata` support common summaries.
  - sum all `record_type` values for corrected totals: retractions negate erroneous records and restatements carry corrected usage. 
  - `usage_metadata.job_id` is populated for serverless jobs and jobs on job compute, not jobs on all-purpose compute.
  - `run_as` semantics vary by workload. 
  - DBUs measure Databricks usage, not dollars; calculate monetary cost by joining usage to the applicable price records in `system.billing.list_prices` with the correct SKU and effective date.

  ```sql
    -- Daily usage by unit (keep units separate)
    SELECT usage_date, usage_unit, SUM(usage_quantity) AS usage_quantity
    FROM system.billing.usage
    GROUP BY usage_date, usage_unit
    ORDER BY usage_date, usage_unit;

    -- DBU quantity by SKU in the current month
    SELECT sku_name, SUM(usage_quantity) AS dbus
    FROM system.billing.usage
    WHERE usage_unit = 'DBU'
      AND usage_date >= DATE_TRUNC('MONTH', CURRENT_DATE())
    GROUP BY sku_name
    ORDER BY dbus DESC;

    -- Usage attributed to the run-as identity
    SELECT identity_metadata.run_as AS run_as_identity,
          SUM(usage_quantity) AS dbus
    FROM system.billing.usage
    WHERE usage_unit = 'DBU'
    GROUP BY identity_metadata.run_as
    ORDER BY dbus DESC
    LIMIT 10;

    -- Job-attributed DBUs where a job ID is populated
    SELECT usage_metadata.job_id AS job_id,
          SUM(usage_quantity) AS dbus
    FROM system.billing.usage
    WHERE usage_unit = 'DBU'
      AND usage_metadata.job_id IS NOT NULL
    GROUP BY usage_metadata.job_id
    ORDER BY dbus DESC;
  ```

# [Unity Catalog - Audit logs](./system-tables-audit-logs.png)
  - Audit events are recorded in `system.access.audit`. 
  - the table is currently Public Preview. 
  - an account admin enables system tables; readers need the appropriate system catalog/schema access. 
  - most events are region-local. Filter by the partition column `event_date` for performance, and use `event_time` for precise ordering.
  - `request_params` is a map and its keys depend on the event. 
  - confirm the exact key and `action_name` in the audit log reference for the operation you are investigating; examples such as table deletion should not be assumed to use one universal key. 
  - some SQL-definition parameters are hidden unless the reader is an account admin or belongs to `databricks_pii_access`. - If a workspace is deleted, its events older than 14 days are removed from this system table.

  ```sql
    -- Recent activity for one user
    SELECT event_time,
          user_identity.email AS user_email,
          service_name,
          action_name,
          request_params
    FROM system.access.audit
    WHERE event_date >= CURRENT_DATE() - INTERVAL 1 DAY
      AND user_identity.email = 'user@example.com'
    ORDER BY event_time DESC;

    -- Inspect events that mention a given table
    SELECT event_time,
          user_identity.email AS user_email,
          service_name,
          action_name,
          request_params['full_name_arg'] AS object_name
    FROM system.access.audit
    WHERE event_date >= CURRENT_DATE() - INTERVAL 30 DAYS
      AND request_params['full_name_arg'] = 'catalog.schema.table'
    ORDER BY event_time DESC;
  ```

# [Unity Catalog - Lineage](./system-tables-lineage.png)
  - `system.access.table_lineage` records table/path read and write relationships
  - `system.access.column_lineage` adds column-level relationships. 
  - the system table reference currently lists 365 days of retention and regional availability. 
  - `entity_metadata` is the current structured workload metadata; older `entity_type`, `entity_id`, and `entity_run_id` fields are deprecated. 
  - `statement_id` can link to query history when populated.
  - for external data accessed by cloud path, filter `source_path` or `target_path`; the full table name may not be present. 
  - a null `entity_metadata` means no supported Databricks entity was associated with the event. 
  - lineage is useful for provenance and impact analysis, but it does not promise a SQL text record for every event.

  ```sql
    -- Find upstream tables used to produce a target
    SELECT DISTINCT source_table_full_name, created_by, event_time
    FROM system.access.table_lineage
    WHERE target_table_full_name = 'catalog.schema.target_table'
    ORDER BY event_time DESC;

    -- Find downstream tables produced from a source
    SELECT DISTINCT target_table_full_name, created_by, event_time
    FROM system.access.table_lineage
    WHERE source_table_full_name = 'catalog.schema.source_table'
    ORDER BY event_time DESC;

    -- Inspect the current entity metadata for matching lineage events
    SELECT entity_metadata, statement_id, created_by, event_time
    FROM system.access.table_lineage
    WHERE source_table_full_name = 'catalog.schema.source_table'
      OR target_table_full_name = 'catalog.schema.source_table'
    ORDER BY event_time DESC;
  ```

# Unity Catalog - Data Isolation
  - use catalogs as the usual logical data-isolation boundary, then reinforce that boundary with managed storage, workspace bindings, scoped cloud credentials, and appropriate compute access modes. 
  - Unity Catalog namespace is `catalog.schema.object`
  - a schema contains tables, views, volumes, models, and functions
  - Grants can inherit from parent objects, so catalog ownership and broad catalog grants carry significant authority.
  - [data hierarchy](./uc-data-heirachy.png)
  - metastores
    - regional metadata infrastructure; it provides regional isolation but is not generally intended as the default unit of data isolation.
    -  contains top-level objects such as storage credentials, external locations, and Delta Sharing securables
  - create catalogs aligned to an environment, team, business unit, or project
  - grant access at catalog/schema scope when that matches the boundary, and assign production catalog ownership to groups.
  - catalogs are accessible from all workspaces attached to their metastore by default
  - can store managed tables and managed volumes at the metastore, catalog, or schema level
  - Databricks recommends catalog-level managed storage for logical data isolation
  - the lowest configured location wins: schema location, then catalog, then metastore
  - metastore-level storage is optional in current setups
  - Changing a catalog/schema managed location affects newly created managed objects; it does not relocate existing ones

  ```sql
    -- Create a catalog with its own managed storage root
    CREATE CATALOG prod_finance
    MANAGED LOCATION 's3://example-uc-managed/prod-finance';

    -- Optionally give one schema a narrower managed storage root
    CREATE SCHEMA prod_finance.restricted
    MANAGED LOCATION 's3://example-uc-managed/prod-finance/restricted';
  ```

  - volumes
    - non-tabular files such as libraries, configuration, documents, and checkpoint files
    - managed volumes are stored and governed by Unity Catalog; external volumes register an existing directory under an external location
    - files are accessed through a volume path such as `/Volumes/<catalog>/<schema>/<volume>/...`
    - a volume is not itself a table, though files can be read and processed into a separately registered table.
    - the external path must be covered by a Unity Catalog external location, and the creator needs the corresponding volume privileges.

    ```sql
      -- A managed volume uses Unity Catalog-managed storage
      CREATE VOLUME prod_finance.restricted.checkpoints;

      -- An external volume registers a directory under an external location
      CREATE EXTERNAL VOLUME prod_finance.restricted.incoming_files
      LOCATION 's3://example-landing/finance/incoming';
    ```
  - govern cloud storage
    - a storage credential represents the cloud identity Unity Catalog uses. 
    - an external location pairs that credential with a cloud storage path. 
    - users can then receive scoped Unity Catalog privileges without needing long-lived cloud keys in their code. 
    - UC still uses cloud credentials to access cloud storage on users’ behalf; the goal is to avoid broad direct end-user access that bypasses Unity Catalog.
    - keep `CREATE EXTERNAL LOCATION` limited to administrators or trusted data engineers
    - grant consumers access to tables or volumes where possible; avoid broad `READ FILES` / `WRITE FILES` grants
    - limit direct access to the underlying buckets and avoid DBFS mounts for storage governed by Unity Catalog.
    ```sql
      CREATE EXTERNAL LOCATION finance_landing
      URL 's3://example-landing/finance'
      WITH (STORAGE CREDENTIAL finance_storage_credential);
    ```
    - external locations and storage credentials are open to all workspaces in the metastore by default
    - workspace bindings can restrict them to specific workspaces, which helps ensure production credentials and paths are used only from production workspaces
    - catalog bindings, external-location bindings, and credential bindings protect different steps; use the relevant binding for each object.
  - [secure query flow and compute isolation](./query-flow.png)
    - a principal submits a query through compute.
    - unity Catalog checks object metadata and evaluates applicable grants.
    - the relevant cloud identity is used to access the data.
    - short-lived access is issued so compute can read from storage.
    - compute enforces applicable policies.
    - results are returned to the caller.
    - unity catalog records applicable audit events.
    - this is a conceptual flow; individual queries may use different credential or url mechanisms.
    - compute mode is not a substitute for catalog grants or workspace bindings
    - if dev and prod must be separated, use distinct workspaces and bind the relevant catalogs (and, where appropriate, storage credentials/external locations) to those workspaces.
    - for classic compute, use the current access-mode terms:

    | Current term | Older slide term | Isolation behavior |
    |---|---|---|
    | **Standard** | Shared access | Multiple users can share compute while Databricks enforces user isolation and data permissions. Recommended for most workloads. |
    | **Dedicated** | Single-user access | Compute is assigned to one user or one group. Use when workload requirements need it. |
    | SQL warehouse | Shared SQL warehouse | Governed SQL execution; use the workspace/catalog boundaries and grants appropriate to the users. |
  
  - sensitive data & encryption
    - physical and workspace boundaries complement table acls, row filters,column masks, dynamic views, careful handling of raw pii
    - limit human access to raw data.
    - pseudonymize or de-identify data where the use case permits.
    - remove unnecessary identifying detail from downstream analytical views.
    - pseudonymization alone does not prove that data can never be re-identified.
    - encryption defaults and options depend on the cloud, data location and service
    - customer-managed keys are configurable for supported data categories.

# PII Data Security
  - PII risk depends on whether someone can identify a person from a value alone or in combination with other data. 
  - protecting a name while leaving a precise birth date, location, or rare demographic combination can still expose an identity. 
  - choose the least identifying representation that supports the approved use case, then restrict access to the original data and any re-identification material.
  - databricks secrets api to store salt values
  - permissions to these secrets can be granted to only prod jobs and authorized users
  - ensures that salt values are never displayed in plain text within notebooks

![Pseudonymization compared with anonymization](./pii-pseudonymization-vs-anonymization.png)

  - privacy lifecycle
    1. **Identify:** inventory personal data from batch, streaming, and user-provided sources; classify and map where it flows.
    2. **Protect:** apply access controls and handling rules, minimize data, and choose whether to keep direct identifiers, pseudonymize, or generalize/suppress them.
    3. **Manage:** monitor access, audit use, govern retention and deletion, and maintain processes for privacy requests and incidents.
  - reassess risk when new datasets are joined or when data moves into reports, dashboards, or ML features
  - pseudonymization
    - replaces a direct identifier with a substitute such as a token or hash
    - if additional information can reconnect that substitute to a person, the data remains linkable and needs protection
    - the separation and safeguarding of that additional information; it does not turn pseudonymized personal data into anonymous information
    - [hashing](./pii-hashing.png)
      - provide a stable substitute that supports matching records, but a hash is not encryption and does not automatically make data anonymous
      - common or low-entropy identifiers can be guessed and hashed for comparison
      - a salt can make precomputed attacks harder, but it must be handled securely
      - a shared fixed salt is not a substitute for a sound key-management design
      - If reversible identity lookup is required, use a separately protected mapping or token vault instead of implying that the hash can be reversed.
    - [tokenization](./pii-tokenization)
      - replaces sensitive values with lookup keys and keeps the original-to-token mapping in a separately protected token vault
      - supports controlled re-identification, but access to the vault is a critical security boundary
      - slower to write and faster to read; actual performance depends on the vault, workload, and lookup design
  - anonymization
    - aims to make a person no longer identifiable using means reasonably likely to be used
    - a risk assessment, not a label guaranteed by one transformation
    - evaluate auxiliary data, rare combinations, outliers, and the audience who can access the output
    - combining methods is often safer than relying on a single one.
    - [data suppression](./pii-data-suppression)
      - remove identifier columns from an analyst-facing view or report.
      - suppress rows or grouped results when a cohort is too small to protect individuals.
      - consider rare combinations and outliers; an aggregate can still expose a person if only one person fits a group.
      - changes what is released or visible
      - it does not erase the source PII. 
      - protect the underlying table with privileges and suitable row/column controls.
      - use dynamic access controls to provide conditional access to full data
    - generalization
      - reduces precision while retaining useful trends: group specific categories into broader groups, bin ages or salaries into ranges, round numeric values, or truncate IP addresses
      - choose bins and thresholds for the audience and analytical purpose
      - a `/24` IPv4 prefix, a broad age band, or a rounded salary may still identify someone when combined with other attributes; IPv6 and local policy may need different treatment.
      - [categorical](./pii-categorical-generalization.png); remove precision from data
      - [binning](./pii-binning.png); anonymizes a numeric or date value by replacing the exact value with a broader range, or “bin.”
      - [truncating IP addresses](./pii-ip-truncation.png)
      - [rounding](./pii-rounding.png)

  - UC data classification
    - scan supported catalog tables, streaming tables, and materialized views and apply system governed tags such as `class.email_address`, `class.phone_number`, and `class.us_ssn`
    - helps discover candidate sensitive columns
    - review detections and exclusions because automated classification is not proof that every PII value was found or correctly classified
    - capability uses an agentic AI system and requires serverless compute to be available. View scanning is a separate
    - classification tags can drive Unity Catalog **ABAC** policies. Databricks recommends ABAC for consistent tag-based masking across catalogs or schemas
    - a policy adds restrictions; it does not grant the base table access, so ordinary object privileges still need to be granted separately
    - use table-level row filters or column masks for table-specific logic, and dynamic views when you need to expose a curated or transformed projection of one or more source tables.

# Capturing Change Data
  - CDF; Change Data Feed, the Delta/Databricks feed of row-level changes from a table
  - similar to dynamo db event streams
  - normal Structured Streaming read from a Delta table processes appended rows
  - if an upstream table is modified with `UPDATE`, `DELETE`, `MERGE`, or overwrite, a plain append stream can fail because it cannot infer how to apply those changes downstream.
  - recomputing every downstream table is one option, but can be expensive. CDF lets a consumer process inserts, updates, and deletes incrementally.
  - Structured Streaming processes data incrementally, usually in micro-batches
  - A checkpoint records source progress, committed batches, and any state needed by the query so it can resume after a restart. Give each streaming query its own durable checkpoint location; deleting it causes the query to start fresh.
  - how to handle upstream changes

  | Approach | What it does | When it fits |
  |---|---|---|
  | `skipChangeCommits` | Skips source commits that modify or delete existing data; the stream processes appends only. | Existing-row changes are handled separately or do not need to propagate. |
  | Change Data Feed | Emits row-level inserts, updates, and deletes for downstream logic to apply. | Downstream tables must reflect all source changes. |
  | Full refresh | Reprocesses the source to rebuild downstream state. | Data is small and upstream changes are rare. |

  - `skipChangeCommits` does not propagate updates or deletes. 
  - `ignoreDeletes` and mention the former `ignoreChanges`; current Databricks guidance treats those as legacy options and recommends `skipChangeCommits` for append-only streams that intentionally ignore modifications. If all changes matter, use CDF instead.
  - for an update, the feed can contain both the **preimage** (row before the update) and **postimage** (row after it). 
  - inserts and deletes each have their own change record.
  - metadata columns

  | Column | Meaning |
  |---|---|
  | `_change_type` | `insert`, `delete`, `update_preimage`, or `update_postimage` |
  | `_commit_version` | Table version that committed the change |
  | `_commit_timestamp` | Commit timestamp |

  - this is an event feed, not necessarily one final row per key. 
  - a downstream consumer must apply the event types correctly—for example, use the postimage as the new value and handle deletes explicitly. 
  - a micro-batch can contain multiple source commits, including several changes to the same key, so define sequencing and deduplication rules for the workload.
  - [how delta cdf works](./how-cdf-works.png)
  - [stream versus batch CDF](./stream-versus-batch-cdf.png)
  - auto CDF; 
    - computes row changes when read using row tracking or row lineage
    - Databricks Runtime 19 or later and a supported Unity Catalog table. 
    - Delta tables need row tracking; 
    - Apache Iceberg v3 is supported for Databricks readers. 
    - No per-table CDF property is needed. 
  - metadata columns
    - `_change_type`; insert delete, update_preimage or update_postimage
    - `_commit_version`; commit version associated with the change
    - `_commit_timestamp`; timestamp of the change

  ```sql
    ALTER TABLE <catalog>.<schema>.<table>
      SET TBLPROPERTIES (delta.enableChangeDataFeed = true);
    ```

    Read a version range in batch with SQL:

    ```sql
    SELECT *
    FROM table_changes('<catalog>.<schema>.<table>', 10, 20);
    ```

    The start and end versions are inclusive. To stream the feed, use Structured Streaming:

    ```python
    cdf = (spark.readStream
        .option("readChangeFeed", "true")
        .table("<catalog>.<schema>.<table>"))
  ```

  - not a permanent audit log
  - records changes only from when the feed is available, and old versions/change data are removed according to table retention and `VACUUM`
  - If permanent history is required, incrementally write the feed into a separate history table with its own retention and access policy. 
  - read it through the supported CDF API; do not query the internal `_change_data` directory directly.
  - [CDC versus CDF](./cdf-versus-cdc.png)
    - CDF exposes change events. 
    - in Lakeflow pipelines, **AUTO CDC** consumes a CDC feed or snapshots and applies ordering, keys, and SCD Type 1 or Type 2 behavior to a target table. 
    - the newer `AUTO CDC` APIs replace the older `APPLY CHANGES` APIs; the older names still work, but Databricks recommends using `AUTO CDC`. 
    - they solve different parts of the pipeline: CDF supplies change records, while AUTO CDC applies them to maintain the target state.

# Delete Data
  - row delete not physical purge
  - `DELETE` removes matching rows from the table’s current logical state. 
  - Delta Lake keeps table history for time travel and may keep old data files until their retention period expires 
  -  `VACUUM` removes files no longer referenced by the table. 
  - tables using deletion vectors need an additional `REORG TABLE ... APPLY (PURGE)` step to rewrite the current data files before old files can be vacuumed.
  - delta lakes supports arbitrary commit messages
  - CDF data can be used to propagate delete action downstream
  - note when delta lake history and CDF features are implemented, delete PII values are still present in older versions of the data
    - use `VACUUM` to physically delete PIIs
    - deleting at a partition boundary makes the whole process more efficient
  - practical deletion workflow
    1. **Record and schedule requests.** Keep a control table of deletion requests and run a separate, monitored workflow to process them. Keep request identifiers and status, but avoid copying the PII being deleted into logs or metadata.
    2. **Delete at the source.** Use `DELETE` for targeted removals. For many requested users, a `MERGE ... WHEN MATCHED THEN DELETE` from a request table can process the batch. Also remove data from upstream systems such as Kafka, files, or databases when required.
    3. **Propagate to downstream tables.** Process deletes explicitly with CDF, remove rows from streaming-table targets, and refresh materialized views. A regular streaming read from a Delta table expects appends; source updates/deletes can break it. `skipChangeCommits` avoids that failure by ignoring modification commits, but it does not propagate those changes. Use CDF when the stream must apply updates and deletes.
    4. **Purge retained files and derived data.** Check deletion vectors, CDF archives, clones, caches, exports, and other copies. Run the appropriate purge and maintenance steps for each affected dataset, then verify completion through query history, table history, and the deletion workflow’s status.
  - [SQL delete](./deletion-streaming-table-dml.png)
    ```sql
      DELETE FROM <catalog>.<schema>.users
      WHERE user_id = 123;
      ```

      For a batch of requests stored in a control table:

      ```sql
      MERGE INTO <catalog>.<schema>.users AS target
      USING <catalog>.<schema>.deletion_requests AS request
      ON target.user_id = request.user_id
      WHEN MATCHED THEN DELETE;
    ```
  - a streaming table that reads a Delta source as an append-only stream can fail when an upstream `DELETE` or `UPDATE` changes existing rows
  - delta engine will prevent `VACUUM` operations with less than 7 days of retention
  - `VACUUM` removes change-data files under `_change_data` too, but an independently archived CDF table must be handled separately.
  - when disk caching is enabled, a cluster can retain cached Parquet data after `VACUUM`; restart the cluster to clear that cache before treating removal as complete.
  - to manually run `VACUUM`
    - disable sparks retention duration check `retentionDurationCheck.enabled`
    - run `VACUUM <catalog>.<schema>.users DRY RUN;` to preview files
    - run `VACUUM <catalog>.<schema>.users`
  - if deletion vectors are enabled on a streaming table, Databricks documents `REORG TABLE ... APPLY (PURGE)` for physical deletion as a Public Preview feature requiring Databricks Runtime 15.4 or later
  - `REORG ... APPLY (PURGE)` rewrites the current files; the old files still remain available for time travel until they pass the `VACUUM` retention threshold

   ```sql
      REORG TABLE <catalog>.<schema>.users APPLY (PURGE);
      -- Wait until old files pass the configured retention threshold.
      VACUUM <catalog>.<schema>.users;
    ```

  - after the purge, allow the configured data retention period to pass, refresh the streaming table, and let its maintenance vacuum old files. The default data-file retention threshold is seven days.
  - materialized views
    - do not support direct `INSERT`, `UPDATE`, `DELETE`, or `MERGE`. t
    - they derive their contents from source queries. 
    - once a source deletion is processed, refresh the view and run maintenance; refresh may use incremental computation or recompute the result to preserve correctness.
    - refresh mechanism rather than updating with every query; `REFRESH MATERIALIZED VIEW users_by_date FULL;`
    - precomputed results for faster data retrieval

    ```sql
      CREATE OR REFRESH MATERIALIZED VIEW users_by_date AS
        SELECT COUNT(*), updated
        FROM my_live_tables.users
        GROUP BY (updated);
    ```