/* Authored primary documentation references. */

export type Reference = [title: string, urls: string[], guidance: string];

export const DB = 'https://docs.databricks.com/aws/en/';

export const SP = 'https://spark.apache.org/docs/3.5.7/';

export const GUIDE_URL =
  'https://www.databricks.com/sites/default/files/2026-05/databricks-certified-data-engineer-associate-exam-guide-may-2026-000.pdf';

export const REFERENCES = {
  copy: [
    'COPY INTO file ingestion',
    [
      'https://docs.databricks.com/aws/en/ingestion/cloud-object-storage/copy-into',
      'https://docs.databricks.com/aws/en/sql/language-manual/delta-copy-into',
    ],
    'COPY INTO tracks file loads. force permits reloading; file tracking does not enforce business-key uniqueness. Source and destination permissions remain required.',
  ],
  'auto-schema': [
    'Auto Loader schema handling',
    ['https://docs.databricks.com/aws/en/ingestion/cloud-object-storage/auto-loader/schema'],
    'Input schema inference, reader evolution, rescued data, and Delta writer evolution are separate concerns. addNewColumns updates the reader schema and needs a restart; rescue retains unexpected fields. JSON and CSV inference defaults to strings.',
  ],
  'auto-production': [
    'Auto Loader production and progress',
    ['https://docs.databricks.com/aws/en/ingestion/cloud-object-storage/auto-loader/production'],
    'Use durable query progress. Independent queries need independent checkpoints. AvailableNow provides bounded incremental execution through streaming APIs.',
  ],
  'auto-discovery': [
    'Auto Loader file discovery',
    [
      'https://docs.databricks.com/aws/en/ingestion/cloud-object-storage/auto-loader/file-notification-mode',
    ],
    'Directory listing and file notifications or managed file events are discovery mechanisms. Choose according to scale, storage configuration, and supported compute.',
  ],
  'standard-connect': [
    'Standard connector selection',
    ['https://docs.databricks.com/aws/en/ingestion/'],
    'Standard connectors expose more processing control through Spark or SQL APIs; managed connectors automate more source-specific ingestion operations.',
  ],
  connect: [
    'Lakeflow Connect managed ingestion',
    ['https://docs.databricks.com/aws/en/ingestion/lakeflow-connect/'],
    'Managed ingestion uses a configured source connection and destination pipeline. Initial and incremental behavior depends on source capabilities. Verify authentication, networking, destination settings, and supported change tracking.',
  ],
  'connect-cdc': [
    'Managed database connector architecture',
    ['https://docs.databricks.com/aws/en/ingestion/lakeflow-connect/cdc-overview'],
    'A database ingestion gateway captures source changes into staging storage. An ingestion pipeline applies them to destination tables. Source change-capture prerequisites and permissions must be configured.',
  ],
  jdbc: [
    'Spark JDBC data source',
    ['https://spark.apache.org/docs/3.5.7/sql-data-sources-jdbc.html'],
    'Spark reads supported JDBC databases using a driver and connection, table, or query options. Incremental cursors and retry-safe destination effects are pipeline design responsibilities.',
  ],
  rest: [
    'HTTP ingestion response handling',
    ['https://www.rfc-editor.org/rfc/rfc9110.html', 'https://www.rfc-editor.org/rfc/rfc6585.html'],
    'HTTP 429 indicates rate limiting. Retry-After communicates a delay. Pagination and cursor semantics come from the source API contract; bounded retries and idempotent writes are engineering choices for recovery.',
  ],
  upload: [
    'Governed file upload and access',
    ['https://docs.databricks.com/aws/en/volumes/volume-files'],
    'A workstation path is not a path on distributed compute. Upload files to supported governed storage and read them using the format and schema appropriate for their contents.',
  ],
  binary: [
    'Spark binary file source',
    ['https://spark.apache.org/docs/3.5.7/sql-data-sources-binaryFile.html'],
    'binaryFile reads file metadata and binary content. Parsing document contents is a separate downstream transformation.',
  ],
  federation: [
    'Lakehouse Federation',
    ['https://docs.databricks.com/aws/en/query-federation/'],
    'Federation queries supported external data through governed connections without ordinary ingestion into local destination tables. Replication pipelines materialize destination data.',
  ],
  'spark-union': [
    'PySpark union alignment',
    [
      'https://spark.apache.org/docs/3.5.7/api/python/reference/pyspark.sql/api/pyspark.sql.DataFrame.unionByName.html',
      'https://spark.apache.org/docs/3.5.7/api/python/reference/pyspark.sql/api/pyspark.sql.DataFrame.union.html',
    ],
    'DataFrame union aligns by position; unionByName aligns by names. Both preserve duplicates. SQL UNION and UNION ALL have distinct duplicate semantics.',
  ],
  'spark-aggregate': [
    'PySpark aggregation and summary',
    [
      'https://spark.apache.org/docs/3.5.7/api/python/reference/pyspark.sql/functions.html',
      'https://spark.apache.org/docs/3.5.7/api/python/reference/pyspark.sql/api/pyspark.sql.DataFrame.summary.html',
    ],
    'count of rows differs from count of non-null column values. Approximate distinct count and mean are aggregate functions; summary computes descriptive statistics.',
  ],
  'spark-df': [
    'PySpark DataFrame operations',
    ['https://spark.apache.org/docs/3.5.7/api/python/reference/pyspark.sql/dataframe.html'],
    'DataFrame transformations return new DataFrames. Select columns, filter rows, cast types, join data, deduplicate, and use an explicit ordering when choosing a latest record.',
  ],
  'spark-tuning': [
    'Spark performance and configuration',
    [
      'https://spark.apache.org/docs/3.5.7/sql-performance-tuning.html',
      'https://spark.apache.org/docs/3.5.7/configuration.html',
    ],
    'SQL shuffle partitions and automatic broadcast thresholds target specific execution concerns. Default RDD parallelism differs from SQL shuffle configuration. Driver and executor memory affect their respective processes; measure after tuning.',
  ],
  'spark-ui': [
    'Spark stage metrics',
    ['https://spark.apache.org/docs/3.5.7/web-ui.html'],
    'Task duration distributions, shuffle sizes, and spill metrics help distinguish skew, movement of data, and memory pressure. Use actual task and stage evidence to diagnose the bottleneck.',
  ],
  'spark-collect': [
    'PySpark collect and driver memory',
    [
      'https://spark.apache.org/docs/3.5.7/api/python/reference/pyspark.sql/api/pyspark.sql.DataFrame.collect.html',
    ],
    'collect returns the full result to the driver. Limit collection or retain distributed processing when the result can exceed driver memory.',
  ],
  streaming: [
    'Structured Streaming query semantics',
    [
      'https://spark.apache.org/docs/3.5.7/structured-streaming-programming-guide.html',
      'https://docs.databricks.com/aws/en/structured-streaming/foreach',
    ],
    'Checkpoint recovery, state retention, output modes, triggers, and sink semantics interact. foreachBatch callbacks can replay; external side effects need application-level idempotency.',
  ],
  delta: [
    'Delta Lake table foundations',
    [
      'https://docs.databricks.com/aws/en/delta/',
      'https://docs.databricks.com/aws/en/delta/history',
      'https://docs.databricks.com/aws/en/delta/merge',
      'https://docs.databricks.com/aws/en/delta/delta-change-data-feed',
    ],
    'Delta tables combine data files and transaction metadata. Historical reads require retained files and logs; MERGE is not a uniqueness constraint. Change Data Feed represents row-level table changes when configured.',
  ],
  architecture: [
    'Databricks architecture',
    ['https://docs.databricks.com/aws/en/getting-started/overview'],
    'Control services and compute execution have different responsibilities. Classic and serverless compute have different deployment ownership, so the compute plane is not universally in the customer account.',
  ],
  compute: [
    'Compute selection and troubleshooting',
    [
      'https://docs.databricks.com/aws/en/compute/',
      'https://docs.databricks.com/aws/en/compute/troubleshooting/',
      'https://docs.databricks.com/aws/en/compute/serverless/migration',
    ],
    'Select compute for the workload and required supported features. Jobs compute has a run lifecycle; serverless manages infrastructure. Startup events separate provisioning problems from later Spark execution failures.',
  ],
  sql: [
    'Databricks SQL language reference',
    [
      'https://docs.databricks.com/aws/en/sql/language-manual/',
      'https://docs.databricks.com/aws/en/sql/',
    ],
    'SQL warehouses serve SQL and BI workloads. Query expressions, permanent views, table creation, and access controls have distinct roles.',
  ],
  materialized: [
    'Materialized views and streaming tables',
    [
      'https://docs.databricks.com/aws/en/ldp/concepts/materialized-views',
      'https://docs.databricks.com/aws/en/ldp/concepts/streaming-tables',
    ],
    'A materialized view maintains stored query results through refresh. A streaming table incrementally processes its configured input. A regular view stores a query definition without stored results.',
  ],
  expectations: [
    'Pipeline data quality expectations',
    [
      'https://docs.databricks.com/aws/en/ldp/expectations',
      'https://docs.databricks.com/aws/en/tables/constraints',
    ],
    'Basic expectations retain invalid rows and record metrics; drop and fail behaviors must be selected explicitly. Enforced CHECK and NOT NULL constraints concern writes, while row filters concern visibility.',
  ],
  schedule: [
    'Lakeflow Job schedules',
    ['https://docs.databricks.com/aws/en/jobs/scheduled'],
    'Advanced schedules use Quartz syntax and a specified time zone. Clock schedules and data-driven triggers encode different readiness conditions.',
  ],
  'file-trigger': [
    'Lakeflow Job file arrival triggers',
    ['https://docs.databricks.com/aws/en/jobs/file-arrival-triggers'],
    'File arrival watches supported governed storage. Wait after last change delays until an arrival quiet interval; minimum time between triggers limits frequency. A trigger is not the file ingestion implementation.',
  ],
  'table-trigger': [
    'Lakeflow Job table update triggers',
    ['https://docs.databricks.com/aws/en/jobs/trigger-table-update'],
    'Configure watched tables and the all or any update rule to match input freshness requirements.',
  ],
  'run-if': [
    'Job dependencies and run conditions',
    ['https://docs.databricks.com/aws/en/jobs/run-if'],
    'Task dependencies form a DAG. All succeeded gates successful upstream work; All done can run cleanup after dependencies finish. Independent upstream tasks can feed a task depending on both.',
  ],
  'if-else': [
    'Job conditional and iterative tasks',
    [
      'https://docs.databricks.com/aws/en/jobs/tasks/if-else',
      'https://docs.databricks.com/aws/en/jobs/tasks/for-each',
    ],
    'If/else evaluates a business condition; For each iterates an array with configurable concurrency. Downstream tasks depend on the For each container.',
  ],
  tasks: [
    'Lakeflow Job task configuration',
    [
      'https://docs.databricks.com/aws/en/jobs/configure-task',
      'https://docs.databricks.com/aws/en/jobs/tasks/sql',
      'https://docs.databricks.com/aws/en/jobs/tasks/pipeline',
      'https://docs.databricks.com/aws/en/jobs/tasks/dashboard',
    ],
    'Select a workload task and appropriate execution resource. Pipeline tasks run an existing pipeline; dashboard tasks refresh a published dashboard. Configure upstream dependencies explicitly.',
  ],
  retries: [
    'Job retries and recovery',
    [
      'https://docs.databricks.com/aws/en/jobs/configure-task',
      'https://docs.databricks.com/aws/en/jobs/repair-job-failures',
    ],
    'Retries are additional task attempts, not an automatic repair of code or data. Repair run can preserve successful upstream work while rerunning failed or selected tasks. Writes must tolerate repeated execution.',
  ],
  'task-values': [
    'Job parameters and task values',
    [
      'https://docs.databricks.com/aws/en/jobs/parameter-use',
      'https://docs.databricks.com/aws/en/jobs/task-values',
    ],
    'Job and task parameters configure workload execution. Task values pass small runtime outputs through a run; use supported dynamic references to consume them.',
  ],
  'job-monitor': [
    'Lakeflow Job monitoring',
    [
      'https://docs.databricks.com/aws/en/jobs/monitor',
      'https://docs.databricks.com/aws/en/jobs/notifications',
    ],
    'Compare run history against representative baselines, inspect dependency blockers in the task graph, and configure duration or failure notifications. A task may be blocked before Spark starts.',
  ],
  bundle: [
    'Declarative Automation Bundles',
    ['https://docs.databricks.com/aws/en/dev-tools/bundles/'],
    'Bundles package resource definitions and code for versioned development and deployment. Promote reviewed commits rather than recreate production resources by hand.',
  ],
  'bundle-vars': [
    'Bundle variable substitution',
    ['https://docs.databricks.com/aws/en/dev-tools/bundles/variables'],
    'Use $' +
      '{var.name} and target overrides for environment-specific values. Deployment substitutions and job runtime parameters are separate evaluation contexts.',
  ],
  'bundle-settings': [
    'Bundle target and resource configuration',
    ['https://docs.databricks.com/aws/en/dev-tools/bundles/settings'],
    'Targets can override workspace and resource configuration. Record the intended deployed configuration in source control to manage drift.',
  ],
  'bundle-cli': [
    'Databricks bundle CLI',
    ['https://docs.databricks.com/aws/en/dev-tools/cli/bundle-commands'],
    'validate checks configuration, deploy updates resources, and run starts a named bundle resource. Use the intended target consistently. Validation does not prove workload business correctness.',
  ],
  git: [
    'Git folders development and review',
    [
      'https://docs.databricks.com/aws/en/repos/git-folders-concepts',
      'https://docs.databricks.com/aws/en/repos/ci-cd',
    ],
    'Branch, commit, push, and pull are Git code operations. Push publishes local commits; create a pull request in the Git provider for review. Table history is not code version control.',
  ],
  'service-principal': [
    'Automation identities and job execution',
    [
      'https://docs.databricks.com/aws/en/admin/users-groups/service-principals',
      'https://docs.databricks.com/aws/en/jobs/privileges',
    ],
    'Service principals are identities for automation. Job permissions, deployment permissions, and job Run as data authorization must be considered separately.',
  ],
  predictive: [
    'Predictive optimization',
    ['https://docs.databricks.com/aws/en/optimizations/predictive-optimization'],
    'Predictive optimization runs maintenance such as OPTIMIZE, VACUUM, and ANALYZE on eligible Unity Catalog managed tables. It is separate from query-time adaptive execution.',
  ],
  liquid: [
    'Liquid clustering layout',
    ['https://docs.databricks.com/aws/en/tables/clustering'],
    'Liquid clustering uses flexible keys rather than fixed partition directories. Key changes do not immediately rewrite all data. It is incompatible with Z-ordering on the same table. Automatic key selection requires its own configuration.',
  ],
  optimize: [
    'Delta file compaction',
    ['https://docs.databricks.com/aws/en/delta/optimize'],
    'OPTIMIZE compacts current table files; VACUUM removes eligible old files. Do not assume one universal target file size for all tables and runtimes.',
  ],
  libraries: [
    'Compute libraries and startup',
    [
      'https://docs.databricks.com/aws/en/libraries/cluster-libraries',
      'https://docs.databricks.com/aws/en/init-scripts/',
    ],
    'Inspect package installation and init-script logs for deterministic environment problems. Supported library and script locations depend on compute runtime and access mode.',
  ],
  privileges: [
    'Unity Catalog privileges',
    [
      'https://docs.databricks.com/aws/en/data-governance/unity-catalog/access-control/privileges-reference',
    ],
    'Effective access can come from direct, group, or inherited grants. Read access requires parent usage privileges. MANAGE is administrative and is excluded from ALL PRIVILEGES; it does not itself grant SELECT.',
  ],
  deny: [
    'SQL DENY scope',
    ['https://docs.databricks.com/aws/en/sql/language-manual/security-deny'],
    'The standalone DENY SQL statement applies to legacy hive_metastore objects and is not supported for Unity Catalog tables. ABAC DENY policies are a separate feature, not a universal DENY SELECT statement.',
  ],
  filters: [
    'Row filters and column masks',
    [
      'https://docs.databricks.com/aws/en/data-governance/unity-catalog/filters-and-masks/',
      'https://docs.databricks.com/aws/en/sql/language-manual/functions/is_account_group_member',
    ],
    'Row filters control query-visible rows with predicates; column masks control query-visible values. They do not physically erase stored data. Use account-group membership checks for account-level Unity Catalog identities.',
  ],
  abac: [
    'Unity Catalog ABAC policies',
    [
      'https://docs.databricks.com/aws/en/data-governance/unity-catalog/abac/',
      'https://docs.databricks.com/aws/en/data-governance/unity-catalog/abac/policies',
    ],
    'Governed tags identify attributes for scoped policies. A centrally configured policy enforces matching row filters or column masks; tags alone do not grant or deny all access.',
  ],
  managed: [
    'Unity Catalog managed table lifecycle',
    ['https://docs.databricks.com/aws/en/tables/managed'],
    'Managed tables use managed storage and lifecycle handling. A dropped managed table has a recovery period before asynchronous data deletion; a DROP does not mean immediate physical erasure.',
  ],
  external: [
    'Unity Catalog external tables',
    ['https://docs.databricks.com/aws/en/tables/external'],
    'External tables register files at customer-controlled locations. Dropping their catalog metadata ordinarily leaves the external files, so data lifecycle remains separately managed.',
  ],
  convert: [
    'External to managed conversion and rollback',
    ['https://docs.databricks.com/aws/en/tables/convert-to-managed'],
    'SET MANAGED converts eligible external Delta tables with documented prerequisites. UNSET MANAGED is a conditional rollback of a prior supported conversion. CONVERT TO DELTA changes a storage format, not lifecycle ownership.',
  ],
  volumes: [
    'Unity Catalog volumes',
    ['https://docs.databricks.com/aws/en/volumes/'],
    'Volumes govern non-tabular files using a catalog, schema, and volume namespace. Managed Delta tables should be accessed by their table names rather than registered as volume directories.',
  ],
  uc: [
    'Unity Catalog foundations',
    ['https://docs.databricks.com/aws/en/data-governance/unity-catalog/'],
    'Unity Catalog organizes and governs data objects, identities, privileges, lineage, and metadata. A metastore is a metadata and governance container, not workload compute.',
  ],
} satisfies Record<string, Reference>;

export const OBJECTIVE_REFERENCES = {
  P1: ['delta', 'architecture', 'uc'],
  P2: ['compute', 'sql'],
  I1: ['streaming', 'delta'],
  I2: ['copy'],
  I3: ['auto-schema', 'auto-production'],
  I4: ['connect', 'connect-cdc'],
  I5: ['jdbc', 'rest'],
  I6: ['standard-connect'],
  I7: ['binary', 'upload'],
  T1: ['spark-df', 'managed'],
  T2: ['spark-df', 'spark-union'],
  T3: ['spark-df', 'sql'],
  T4: ['spark-df', 'spark-aggregate', 'delta'],
  T5: ['spark-tuning'],
  T6: ['materialized', 'sql'],
  T7: ['expectations'],
  J1: ['run-if', 'if-else', 'retries', 'task-values'],
  J2: ['tasks', 'task-values'],
  J3: ['schedule'],
  J4: ['schedule'],
  C1: ['git'],
  C2: ['bundle-vars'],
  C3: ['bundle', 'bundle-settings'],
  C4: ['bundle-cli'],
  M1: ['job-monitor'],
  M2: ['job-monitor'],
  M3: ['spark-ui', 'streaming'],
  M4: ['liquid', 'predictive', 'optimize'],
  M5: ['libraries', 'compute'],
  G1: ['managed', 'external', 'volumes', 'uc'],
  G2: ['privileges', 'service-principal'],
  G3: ['filters', 'expectations'],
  G4: ['abac'],
} satisfies Record<string, string[]>;
