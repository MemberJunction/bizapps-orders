import sql from 'mssql';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DB_CONFIG = {
  user: 'sa',
  password: 'KRiUffvIjuP5GoLtxYvVkWIQ1BxHQEEMO7j4T684oPR7',
  server: 'localhost',
  port: 1433,
  database: 'MJ_6_1_0',
  options: { trustServerCertificate: true },
};

const SIDECAR_URL = 'http://127.0.0.1:8000/train';
const ARTIFACT_DIR = process.env.PS_ARTIFACT_DIR || join(tmpdir(), 'mj-ps-artifacts');
await mkdir(ARTIFACT_DIR, { recursive: true });

const STORAGE_PROVIDER_ID = '93DBCFC9-5B2A-48D6-9D95-E93B319C88E5'; // External URL

const ALGORITHMS = {
  LightGBM: { name: 'LightGBM', key: 'lightgbm', id: 'B2FD5E4A-75D4-401A-A1DA-F223A5234FDA' },
  XGBoost: { name: 'XGBoost', key: 'xgboost', id: '25E83BF9-C5EE-4BDF-A891-D36D871B73E3' },
  RandomForest: { name: 'RandomForest', key: 'random_forest', id: 'F966965D-3A87-4DD6-91E0-4F9D1AF17796' },
};

// Fixed UUIDs
const PERSON_IDS = {
  targetEntityId: '7A94ADA9-7880-4FAE-97D8-DB0E934C3F5F', // MJ_BizApps_Common: People
  targetEntityName: 'MJ_BizApps_Common: People',
  pipelines: {
    LightGBM: 'AC9B75DE-5C8F-44A6-AFC8-4EFD955DD9B8',
    XGBoost: '9CE2C6B8-D8A2-4766-9EF1-9769B4292DB9',
    RandomForest: 'EF9EE1B1-9CF2-4F60-B09E-B1361CA1CE70',
  },
  model: 'DAB40DD7-AD2A-4DAC-A117-96D56CB6CE6B',
  scoringBinding: '28BCB67F-CDD5-4E5C-BBEF-B833E8ECE3D8',
  recordProcess: '80EFD2C2-B873-422C-9845-504258B9DEC4',
  artifactFile: '20807389-2716-49A8-9F86-65EB19A73483',
  sourceBindings: [
    { Kind: 'Entity', Ref: 'MJ_BizApps_Common: People' },
    { Kind: 'Entity', Ref: 'MJ_BizApps_Orders: Order Headers' },
    { Kind: 'Entity', Ref: 'MJ_BizApps_Orders: Order Lines' },
    { Kind: 'Entity', Ref: 'MJ_BizApps_Orders: Subscriptions' },
    { Kind: 'Entity', Ref: 'MJ_BizApps_Common: Activities' },
  ],
  featureCols: [
    'FirstOrderGross',
    'FirstOrderMonth',
    'CustomerTenureDays',
    'DaysSinceLastOrder',
    'TotalOrders',
    'OrdersLast12Months',
    'DistinctProductsCount',
    'TotalItemsCount',
    'ActiveSubscriptionsCount',
    'TotalSubscriptionsCount',
    'ActivityCount',
    'DaysSinceLastActivity',
  ],
};

const ORG_IDS = {
  targetEntityId: 'C70448F9-9792-41D7-A82C-784B66429D54', // MJ_BizApps_Common: Organizations
  targetEntityName: 'MJ_BizApps_Common: Organizations',
  pipelines: {
    LightGBM: '6EDE93DE-1964-4E40-BF56-864B480B51D4',
    XGBoost: 'FD851D6A-C67D-46A9-A932-013FC830FB40',
    RandomForest: '8EC6BE82-BC1F-4CA0-96D8-63BAFDE71E2A',
  },
  model: 'FFA04AA8-1D29-425D-AAFF-2E9FF4DCCC8B',
  scoringBinding: '1B95A8CB-AE36-4B44-A0C5-F60AC1396E24',
  recordProcess: 'A81E0AEA-8B52-485E-8951-27569C38439D',
  artifactFile: 'FEBF5439-CCBE-4FB6-9B7E-B3F7E2756DE9',
  sourceBindings: [
    { Kind: 'Entity', Ref: 'MJ_BizApps_Common: Organizations' },
    { Kind: 'Entity', Ref: 'MJ_BizApps_Orders: Order Headers' },
    { Kind: 'Entity', Ref: 'MJ_BizApps_Orders: Order Lines' },
    { Kind: 'Entity', Ref: 'MJ_BizApps_Orders: Subscriptions' },
  ],
  featureCols: [
    'FirstOrderGross',
    'FirstOrderMonth',
    'CustomerTenureDays',
    'DaysSinceLastOrder',
    'TotalOrders',
    'OrdersLast12Months',
    'DistinctProductsCount',
    'TotalItemsCount',
    'ActiveSubscriptionsCount',
    'TotalSubscriptionsCount',
  ],
};

const outcomeConfig = {
  ScoreLabel: 'Predicted Customer LTV',
  StatusLabel: 'LTV Tier',
  Polarity: 'positive',
  Format: 'currency',
  Bands: [
    { Key: 'high', Label: 'High Value', MinScore: 2500, MaxScore: 1000000, Min: 2500, Max: 1000000, BadgeColor: 'green', Icon: 'fa-arrow-trend-up' },
    { Key: 'medium', Label: 'Medium Value', MinScore: 500, MaxScore: 2499.99, Min: 500, Max: 2499.99, BadgeColor: 'amber', Icon: 'fa-minus' },
    { Key: 'standard', Label: 'Standard Value', MinScore: 0, MaxScore: 499.99, Min: 0, Max: 499.99, BadgeColor: 'gray', Icon: 'fa-arrow-trend-down' },
  ],
};

const leakageGuard = {
  DenyFields: ['TotalGross', 'AmountPaid', 'Balance', 'DueDate'],
  SingleFeatureDominanceThreshold: 0.6,
};

const validationStrategy = {
  Strategy: 'kfold',
  K: 5,
  LockedHoldoutFraction: 0.2,
};

async function trainAndRecordSegment(segmentName, config) {
  console.log(`\n======================================================`);
  console.log(`Training and Registering: ${segmentName} Customer LTV`);
  console.log(`Rooted in: ${config.targetEntityName} (${config.targetEntityId})`);
  console.log(`======================================================`);

  const featureCols = config.featureCols;
  const allCols = [...featureCols, 'CustomerActualLTV'];
  const featureSchema = featureCols.map((c) => ({ Name: c, Kind: 'numeric' }));
  const featureSteps = {
    Steps: [{ Id: 'select-raw', Kind: 'select', Columns: featureCols }],
  };

  const conn = await sql.connect(DB_CONFIG);

  let query = '';
  if (segmentName === 'Person') {
    query = `
      WITH FirstOrders AS (
        SELECT 
          o.BillToPersonID,
          o.TotalGross AS FirstOrderGross,
          MONTH(o.OrderDate) AS FirstOrderMonth,
          ROW_NUMBER() OVER (PARTITION BY o.BillToPersonID ORDER BY o.OrderDate ASC, o.ID ASC) AS rn
        FROM [__mj_BizAppsOrders].[OrderHeader] o
        WHERE o.Status = 'Confirmed' AND o.BillToPersonID IS NOT NULL
      ),
      CustomerActivity AS (
        SELECT 
          al.RecordID AS PersonID,
          COUNT(DISTINCT al.ActivityID) AS ActivityCount,
          COALESCE(DATEDIFF(day, MAX(a.StartedAt), GETUTCDATE()), 999) AS DaysSinceLastActivity
        FROM [__mj_BizAppsCommon].[ActivityLink] al
        INNER JOIN [__mj_BizAppsCommon].[Activity] a ON a.ID = al.ActivityID
        WHERE al.EntityID = '7A94ADA9-7880-4FAE-97D8-DB0E934C3F5F'
        GROUP BY al.RecordID
      ),
      CustomerSubs AS (
        SELECT 
          s.BeneficiaryPersonID,
          COUNT(DISTINCT CASE WHEN s.Status = 'Active' THEN s.ID END) AS ActiveSubscriptionsCount,
          COUNT(DISTINCT s.ID) AS TotalSubscriptionsCount
        FROM [__mj_BizAppsOrders].[Subscription] s
        WHERE s.BeneficiaryPersonID IS NOT NULL
        GROUP BY s.BeneficiaryPersonID
      ),
      CustomerLines AS (
        SELECT 
          o.BillToPersonID,
          COUNT(DISTINCT ol.ProductID) AS DistinctProductsCount,
          COALESCE(SUM(ol.Quantity), 0) AS TotalItemsCount
        FROM [__mj_BizAppsOrders].[OrderHeader] o
        INNER JOIN [__mj_BizAppsOrders].[OrderLine] ol ON ol.OrderHeaderID = o.ID
        WHERE o.Status = 'Confirmed' AND o.BillToPersonID IS NOT NULL
        GROUP BY o.BillToPersonID
      )
      SELECT 
        p.ID,
        COALESCE(fo.FirstOrderGross, 0) AS FirstOrderGross,
        COALESCE(fo.FirstOrderMonth, 1) AS FirstOrderMonth,
        COALESCE(DATEDIFF(day, MIN(o.OrderDate), MAX(o.OrderDate)), 0) AS CustomerTenureDays,
        COALESCE(DATEDIFF(day, MAX(o.OrderDate), GETUTCDATE()), 999) AS DaysSinceLastOrder,
        COUNT(DISTINCT o.ID) AS TotalOrders,
        COUNT(DISTINCT CASE WHEN o.OrderDate >= DATEADD(month, -12, GETUTCDATE()) THEN o.ID END) AS OrdersLast12Months,
        COALESCE(cl.DistinctProductsCount, 0) AS DistinctProductsCount,
        COALESCE(cl.TotalItemsCount, 0) AS TotalItemsCount,
        COALESCE(cs.ActiveSubscriptionsCount, 0) AS ActiveSubscriptionsCount,
        COALESCE(cs.TotalSubscriptionsCount, 0) AS TotalSubscriptionsCount,
        COALESCE(ca.ActivityCount, 0) AS ActivityCount,
        COALESCE(ca.DaysSinceLastActivity, 999) AS DaysSinceLastActivity,
        SUM(o.TotalGross) AS CustomerActualLTV
      FROM [__mj_BizAppsCommon].[Person] p
      INNER JOIN [__mj_BizAppsOrders].[OrderHeader] o ON o.BillToPersonID = p.ID AND o.Status = 'Confirmed'
      LEFT JOIN FirstOrders fo ON fo.BillToPersonID = p.ID AND fo.rn = 1
      LEFT JOIN CustomerLines cl ON cl.BillToPersonID = p.ID
      LEFT JOIN CustomerSubs cs ON cs.BeneficiaryPersonID = p.ID
      LEFT JOIN CustomerActivity ca ON ca.PersonID = p.ID
      GROUP BY 
        p.ID, 
        fo.FirstOrderGross, 
        fo.FirstOrderMonth, 
        cl.DistinctProductsCount, 
        cl.TotalItemsCount, 
        cs.ActiveSubscriptionsCount, 
        cs.TotalSubscriptionsCount, 
        ca.ActivityCount, 
        ca.DaysSinceLastActivity
    `;
  } else {
    query = `
      WITH FirstOrders AS (
        SELECT 
          o.BillToOrganizationID,
          o.TotalGross AS FirstOrderGross,
          MONTH(o.OrderDate) AS FirstOrderMonth,
          ROW_NUMBER() OVER (PARTITION BY o.BillToOrganizationID ORDER BY o.OrderDate ASC, o.ID ASC) AS rn
        FROM [__mj_BizAppsOrders].[OrderHeader] o
        WHERE o.Status = 'Confirmed' AND o.BillToOrganizationID IS NOT NULL
      ),
      CustomerSubs AS (
        SELECT 
          s.HolderOrganizationID,
          COUNT(DISTINCT CASE WHEN s.Status = 'Active' THEN s.ID END) AS ActiveSubscriptionsCount,
          COUNT(DISTINCT s.ID) AS TotalSubscriptionsCount
        FROM [__mj_BizAppsOrders].[Subscription] s
        WHERE s.HolderOrganizationID IS NOT NULL
        GROUP BY s.HolderOrganizationID
      ),
      CustomerLines AS (
        SELECT 
          o.BillToOrganizationID,
          COUNT(DISTINCT ol.ProductID) AS DistinctProductsCount,
          COALESCE(SUM(ol.Quantity), 0) AS TotalItemsCount
        FROM [__mj_BizAppsOrders].[OrderHeader] o
        INNER JOIN [__mj_BizAppsOrders].[OrderLine] ol ON ol.OrderHeaderID = o.ID
        WHERE o.Status = 'Confirmed' AND o.BillToOrganizationID IS NOT NULL
        GROUP BY o.BillToOrganizationID
      )
      SELECT 
        org.ID,
        COALESCE(fo.FirstOrderGross, 0) AS FirstOrderGross,
        COALESCE(fo.FirstOrderMonth, 1) AS FirstOrderMonth,
        COALESCE(DATEDIFF(day, MIN(o.OrderDate), MAX(o.OrderDate)), 0) AS CustomerTenureDays,
        COALESCE(DATEDIFF(day, MAX(o.OrderDate), GETUTCDATE()), 999) AS DaysSinceLastOrder,
        COUNT(DISTINCT o.ID) AS TotalOrders,
        COUNT(DISTINCT CASE WHEN o.OrderDate >= DATEADD(month, -12, GETUTCDATE()) THEN o.ID END) AS OrdersLast12Months,
        COALESCE(cl.DistinctProductsCount, 0) AS DistinctProductsCount,
        COALESCE(cl.TotalItemsCount, 0) AS TotalItemsCount,
        COALESCE(cs.ActiveSubscriptionsCount, 0) AS ActiveSubscriptionsCount,
        COALESCE(cs.TotalSubscriptionsCount, 0) AS TotalSubscriptionsCount,
        SUM(o.TotalGross) AS CustomerActualLTV
      FROM [__mj_BizAppsCommon].[Organization] org
      INNER JOIN [__mj_BizAppsOrders].[OrderHeader] o ON o.BillToOrganizationID = org.ID AND o.Status = 'Confirmed'
      LEFT JOIN FirstOrders fo ON fo.BillToOrganizationID = org.ID AND fo.rn = 1
      LEFT JOIN CustomerLines cl ON cl.BillToOrganizationID = org.ID
      LEFT JOIN CustomerSubs cs ON cs.HolderOrganizationID = org.ID
      GROUP BY 
        org.ID, 
        fo.FirstOrderGross, 
        fo.FirstOrderMonth, 
        cl.DistinctProductsCount, 
        cl.TotalItemsCount, 
        cs.ActiveSubscriptionsCount, 
        cs.TotalSubscriptionsCount
    `;
  }

  const res = await conn.query(query);
  await conn.close();

  console.log(`Loaded ${res.recordset.length} ${segmentName} rows`);

  // Seeded deterministic shuffle
  const rawRows = [...res.recordset]
    .sort((a, b) => String(a.ID).localeCompare(String(b.ID)))
    .map((r) => [
      ...featureCols.map((c) => Number(r[c] ?? 0)),
      Number(r.CustomerActualLTV ?? 0),
    ]);

  const trainRows = [];
  const holdoutRows = [];
  rawRows.forEach((r, idx) => {
    if (idx % 5 === 0) holdoutRows.push(r);
    else trainRows.push(r);
  });

  // Train winning algorithm (LightGBM)
  console.log(`Training winning LightGBM model on sidecar...`);
  const trainReq = {
    algorithm: ALGORITHMS.LightGBM.key,
    problem_type: 'regression',
    target: 'CustomerActualLTV',
    feature_schema: featureSchema,
    data: { columns: allCols, rows: trainRows },
    holdout: { columns: allCols, rows: holdoutRows },
    preprocessing: [],
    validation: { strategy: 'kfold', k: 5 },
  };

  const resp = await fetch(SIDECAR_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(trainReq),
  });

  if (!resp.ok) {
    throw new Error(`Sidecar training failed: ${await resp.text()}`);
  }

  const trainRes = await resp.json();
  console.log(`Model trained in ${trainRes.duration_sec?.toFixed(2)}s`);
  console.log(`Train R2: ${trainRes.metrics?.r2?.toFixed(4)}, Holdout R2: ${trainRes.holdout_metrics?.r2?.toFixed(4)}`);

  // Write artifact bytes to local disk
  const artifactBytes = Buffer.from(trainRes.artifact_b64, 'base64');
  const artifactPath = join(ARTIFACT_DIR, `${config.artifactFile}.bin`);
  await writeFile(artifactPath, artifactBytes);
  console.log(`Saved artifact file (${artifactBytes.length} bytes) to ${artifactPath}`);

  // Create File record in SQL Server
  const now = new Date().toISOString();
  for (const db of ['MJ_6_1_0', 'morecheese_c27_zero_20260905_r12']) {
    try {
      const dbConn = await sql.connect({ ...DB_CONFIG, database: db });
      await dbConn.query(`
        IF NOT EXISTS (SELECT 1 FROM [__mj].[File] WHERE ID='${config.artifactFile}')
        BEGIN
          INSERT INTO [__mj].[File] (ID, Name, Description, ProviderID, ContentType, Status)
          VALUES ('${config.artifactFile}', 'model-${config.pipelines.LightGBM}-v1.bin', 'Predictive Studio model artifact (${artifactBytes.length} bytes)', '${STORAGE_PROVIDER_ID}', 'application/octet-stream', 'Pending')
        END
      `);
      await dbConn.close();
    } catch {
      // ignore if db not accessible
    }
  }

  // Build Pipeline metadata entries (all 3 candidates)
  const pipelineEntries = Object.entries(config.pipelines).map(([algoName, pipelineId]) => {
    const algo = ALGORITHMS[algoName];
    return {
      fields: {
        Name: `Predict ${segmentName} customer lifetime value (LTV) (${algo.name})`,
        Description: `Predict cumulative customer lifetime gross revenue at the ${segmentName.toLowerCase()} level to enable early tier classification and VIP treatment.`,
        Version: 1,
        Status: 'Draft',
        TargetEntityID: config.targetEntityId,
        TargetVariable: 'CustomerActualLTV',
        ProblemType: 'regression',
        AlgorithmID: algo.id,
        SourceBindings: JSON.stringify(config.sourceBindings),
        FeatureSteps: JSON.stringify(featureSteps),
        AsOfStrategy: JSON.stringify({ Mode: 'none' }),
        LeakageGuard: JSON.stringify(leakageGuard),
        ValidationStrategy: JSON.stringify(validationStrategy),
        SkipEmbeddings: false,
      },
      primaryKey: {
        ID: pipelineId,
      },
    };
  });

  // Build Model metadata entry (Published winner)
  const lineage = {
    pipelineId: config.pipelines.LightGBM,
    pipelineVersion: 1,
    targetEntityName: config.targetEntityName,
    sourceBindings: config.sourceBindings,
    featureSteps: featureSteps,
    asOfStrategy: { Mode: 'none' },
    sidecarVersion: 'predictive-studio-agent',
    lockedHoldoutRowCount: holdoutRows.length,
    trainingRowCount: trainRows.length,
    assembledAt: now,
    outcomeConfig: outcomeConfig,
  };

  const modelEntry = {
    fields: {
      PipelineID: config.pipelines.LightGBM,
      Version: 1,
      AlgorithmID: ALGORITHMS.LightGBM.id,
      ArtifactFileID: config.artifactFile,
      FittedPreprocessing: JSON.stringify(trainRes.fitted_preprocessing ?? { ops: [], output_columns: featureCols }),
      FeatureSchema: JSON.stringify(featureSchema),
      TargetVariable: 'CustomerActualLTV',
      ProblemType: 'regression',
      Metrics: JSON.stringify(trainRes.metrics),
      HoldoutMetrics: JSON.stringify(trainRes.holdout_metrics),
      FeatureImportance: JSON.stringify(trainRes.feature_importance),
      Lineage: JSON.stringify(lineage),
      TrainedAt: now,
      TrainingDurationSec: Math.round(trainRes.duration_sec || 1),
      TrainingRowCount: trainRows.length,
      Status: 'Published',
      SkipEmbeddings: false,
    },
    primaryKey: {
      ID: config.model,
    },
  };

  // Build Scoring Binding entry (Overlay / non-materialized)
  const scoringBindingEntry = {
    fields: {
      MLModelID: config.model,
      RecordProcessID: config.recordProcess,
      TargetEntityID: config.targetEntityId,
      TargetColumn: null,
      Mode: 'Scheduled',
      SkipEmbeddings: false,
    },
    primaryKey: {
      ID: config.scoringBinding,
    },
  };

  // Build Record Process entry (Inference results captured in ProcessRunDetail.ResultPayload)
  const recordProcessEntry = {
    fields: {
      Name: `Score ${segmentName} Customer LTV with model ${config.model} (Weekly)`,
      EntityID: config.targetEntityId,
      Status: 'Active',
      WorkType: 'ML Model',
      ScopeType: 'Filter',
      ScopeFilter: "Status = 'Active'",
      OnChangeEnabled: false,
      ScheduleEnabled: true,
      CronExpression: '0 0 * * 0', // Weekly on Sunday
      Timezone: 'UTC',
      OnDemandEnabled: true,
      OutputMapping: null,
      SkipUnchanged: true,
      BatchSize: 100,
      MaxConcurrency: 1,
      Configuration: JSON.stringify({
        modelId: config.model,
        primaryKeyField: 'ID',
      }),
      SkipEmbeddings: false,
    },
    primaryKey: {
      ID: config.recordProcess,
    },
  };

  return {
    pipelineEntries,
    modelEntry,
    scoringBindingEntry,
    recordProcessEntry,
    records: res.recordset,
    featureCols,
    artifactFile: config.artifactFile,
  };
}

(async () => {
  const person = await trainAndRecordSegment('Person', PERSON_IDS);
  const org = await trainAndRecordSegment('Organization', ORG_IDS);

  // Read existing metadata files and append new entries
  console.log('\n======================================================');
  console.log('Writing Declarative Metadata JSON Files');
  console.log('======================================================');

  // 1. Pipelines
  const pipelinesPath = 'metadata/ml-training-pipelines/.ml-training-pipelines.json';
  const currentPipelines = JSON.parse(await readFile(pipelinesPath, 'utf8'));
  const ourPipelineIds = new Set([
    ...Object.values(PERSON_IDS.pipelines),
    ...Object.values(ORG_IDS.pipelines),
  ]);
  const basePipelines = currentPipelines.filter((p) => !ourPipelineIds.has(p.primaryKey.ID));
  const newPipelines = [
    ...basePipelines,
    ...person.pipelineEntries,
    ...org.pipelineEntries,
  ];
  await writeFile(pipelinesPath, JSON.stringify(newPipelines, null, 2) + '\n');
  console.log(`Updated ${pipelinesPath} (now ${newPipelines.length} pipelines)`);

  // 2. Models
  const modelsPath = 'metadata/ml-models/.ml-models.json';
  const currentModels = JSON.parse(await readFile(modelsPath, 'utf8'));
  const ourModelIds = new Set([PERSON_IDS.model, ORG_IDS.model]);
  const baseModels = currentModels.filter((m) => !ourModelIds.has(m.primaryKey.ID));
  const newModels = [
    ...baseModels,
    person.modelEntry,
    org.modelEntry,
  ];
  await writeFile(modelsPath, JSON.stringify(newModels, null, 2) + '\n');
  console.log(`Updated ${modelsPath} (now ${newModels.length} models)`);

  // 3. Scoring Bindings
  const bindingsPath = 'metadata/ml-model-scoring-bindings/.ml-model-scoring-bindings.json';
  const currentBindings = JSON.parse(await readFile(bindingsPath, 'utf8'));
  const ourBindingIds = new Set([PERSON_IDS.scoringBinding, ORG_IDS.scoringBinding]);
  const baseBindings = currentBindings.filter((b) => !ourBindingIds.has(b.primaryKey.ID));
  const newBindings = [
    ...baseBindings,
    person.scoringBindingEntry,
    org.scoringBindingEntry,
  ];
  await writeFile(bindingsPath, JSON.stringify(newBindings, null, 2) + '\n');
  console.log(`Updated ${bindingsPath} (now ${newBindings.length} scoring bindings)`);

  // 4. Record Processes
  const processesPath = 'metadata/record-processes/.record-processes.json';
  const currentProcesses = JSON.parse(await readFile(processesPath, 'utf8'));
  const ourProcessIds = new Set([PERSON_IDS.recordProcess, ORG_IDS.recordProcess]);
  const baseProcesses = currentProcesses.filter((p) => !ourProcessIds.has(p.primaryKey.ID));
  const newProcesses = [
    ...baseProcesses,
    person.recordProcessEntry,
    org.recordProcessEntry,
  ];
  await writeFile(processesPath, JSON.stringify(newProcesses, null, 2) + '\n');
  console.log(`Updated ${processesPath} (now ${newProcesses.length} record processes)`);

  console.log('\nAll metadata authored successfully!');
})();
