/**
 * scripts/score-ltv-models.mjs — Developer bench tooling for demo data generation.
 *
 * Simulates batch scoring of Person and Organization Customer LTV models against local
 * demo database records, generating Process Run Details and prediction history artifacts.
 * This script is developer/demo bench tooling and does not execute in production runtime.
 */

import sql from 'mssql';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const DB_CONFIG = {
  user: 'sa',
  password: 'KRiUffvIjuP5GoLtxYvVkWIQ1BxHQEEMO7j4T684oPR7',
  server: 'localhost',
  port: 1433,
  database: 'MJ_6_1_0',
  options: { trustServerCertificate: true },
};

const SIDECAR_URL = 'http://127.0.0.1:8000/predict';
const ARTIFACT_DIR = process.env.PS_ARTIFACT_DIR || join(tmpdir(), 'mj-ps-artifacts');

const SEGMENTS = [
  {
    name: 'Person Customer LTV',
    targetEntityId: '7A94ADA9-7880-4FAE-97D8-DB0E934C3F5F', // MJ_BizApps_Common: People
    targetEntityName: 'MJ_BizApps_Common: People',
    modelId: 'DAB40DD7-AD2A-4DAC-A117-96D56CB6CE6B',
    processId: '80EFD2C2-B873-422C-9845-504258B9DEC4',
    bindingId: '28BCB67F-CDD5-4E5C-BBEF-B833E8ECE3D8',
    artifactFileId: '20807389-2716-49A8-9F86-65EB19A73483',
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
    query: `
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
        p.DisplayName,
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
        COALESCE(ca.DaysSinceLastActivity, 999) AS DaysSinceLastActivity
      FROM [__mj_BizAppsCommon].[Person] p
      INNER JOIN [__mj_BizAppsOrders].[OrderHeader] o ON o.BillToPersonID = p.ID AND o.Status = 'Confirmed'
      LEFT JOIN FirstOrders fo ON fo.BillToPersonID = p.ID AND fo.rn = 1
      LEFT JOIN CustomerLines cl ON cl.BillToPersonID = p.ID
      LEFT JOIN CustomerSubs cs ON cs.BeneficiaryPersonID = p.ID
      LEFT JOIN CustomerActivity ca ON ca.PersonID = p.ID
      GROUP BY 
        p.ID, 
        p.DisplayName,
        fo.FirstOrderGross, 
        fo.FirstOrderMonth, 
        cl.DistinctProductsCount, 
        cl.TotalItemsCount, 
        cs.ActiveSubscriptionsCount, 
        cs.TotalSubscriptionsCount, 
        ca.ActivityCount, 
        ca.DaysSinceLastActivity
      ORDER BY TotalOrders DESC, p.ID ASC
    `,
  },
  {
    name: 'Organization Customer LTV',
    targetEntityId: 'C70448F9-9792-41D7-A82C-784B66429D54', // MJ_BizApps_Common: Organizations
    targetEntityName: 'MJ_BizApps_Common: Organizations',
    modelId: 'FFA04AA8-1D29-425D-AAFF-2E9FF4DCCC8B',
    processId: 'A81E0AEA-8B52-485E-8951-27569C38439D',
    bindingId: '1B95A8CB-AE36-4B44-A0C5-F60AC1396E24',
    artifactFileId: 'FEBF5439-CCBE-4FB6-9B7E-B3F7E2756DE9',
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
    query: `
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
        org.Name AS OrgName,
        COALESCE(fo.FirstOrderGross, 0) AS FirstOrderGross,
        COALESCE(fo.FirstOrderMonth, 1) AS FirstOrderMonth,
        COALESCE(DATEDIFF(day, MIN(o.OrderDate), MAX(o.OrderDate)), 0) AS CustomerTenureDays,
        COALESCE(DATEDIFF(day, MAX(o.OrderDate), GETUTCDATE()), 999) AS DaysSinceLastOrder,
        COUNT(DISTINCT o.ID) AS TotalOrders,
        COUNT(DISTINCT CASE WHEN o.OrderDate >= DATEADD(month, -12, GETUTCDATE()) THEN o.ID END) AS OrdersLast12Months,
        COALESCE(cl.DistinctProductsCount, 0) AS DistinctProductsCount,
        COALESCE(cl.TotalItemsCount, 0) AS TotalItemsCount,
        COALESCE(cs.ActiveSubscriptionsCount, 0) AS ActiveSubscriptionsCount,
        COALESCE(cs.TotalSubscriptionsCount, 0) AS TotalSubscriptionsCount
      FROM [__mj_BizAppsCommon].[Organization] org
      INNER JOIN [__mj_BizAppsOrders].[OrderHeader] o ON o.BillToOrganizationID = org.ID AND o.Status = 'Confirmed'
      LEFT JOIN FirstOrders fo ON fo.BillToOrganizationID = org.ID AND fo.rn = 1
      LEFT JOIN CustomerLines cl ON cl.BillToOrganizationID = org.ID
      LEFT JOIN CustomerSubs cs ON cs.HolderOrganizationID = org.ID
      GROUP BY 
        org.ID, 
        org.Name,
        fo.FirstOrderGross, 
        fo.FirstOrderMonth, 
        cl.DistinctProductsCount, 
        cl.TotalItemsCount, 
        cs.ActiveSubscriptionsCount, 
        cs.TotalSubscriptionsCount
      ORDER BY TotalOrders DESC, org.ID ASC
    `,
  },
];

function evaluateBand(score) {
  if (score >= 2500) {
    return { key: 'high', label: 'High Value', badgeColor: 'green', icon: 'fa-arrow-trend-up' };
  } else if (score >= 500) {
    return { key: 'medium', label: 'Medium Value', badgeColor: 'amber', icon: 'fa-minus' };
  } else {
    return { key: 'standard', label: 'Standard Value', badgeColor: 'gray', icon: 'fa-arrow-trend-down' };
  }
}

async function scoreSegment(seg, pool) {
  console.log(`\n=============================================================`);
  console.log(`Scoring Segment: ${seg.name}`);
  console.log(`Target Entity: ${seg.targetEntityName} (${seg.targetEntityId})`);
  console.log(`=============================================================`);

  // 1. Fetch Model spec
  const mRes = await pool.request().query(`
    SELECT FittedPreprocessing, FeatureSchema 
    FROM [__mj].[MLModel] 
    WHERE ID = '${seg.modelId}'
  `);
  const modelRec = mRes.recordset[0];
  const fittedPreprocessing = JSON.parse(modelRec.FittedPreprocessing);
  const featureSchema = JSON.parse(modelRec.FeatureSchema);

  // 2. Read Artifact
  const artifactPath = join(ARTIFACT_DIR, `${seg.artifactFileId}.bin`);
  const artifactBytes = await readFile(artifactPath);
  const artifactB64 = artifactBytes.toString('base64');
  console.log(`Loaded artifact (${artifactBytes.length} bytes) from ${artifactPath}`);

  // 3. Query Target Records
  const qStart = Date.now();
  const recordsRes = await pool.request().query(seg.query);
  const records = recordsRes.recordset;
  console.log(`Fetched ${records.length} ${seg.name} records in ${Date.now() - qStart}ms`);

  if (records.length === 0) {
    console.log(`No records to score for ${seg.name}`);
    return;
  }

  // 4. Batch Scoring via Sidecar
  const sidecarBatchSize = 500;
  const allPredictions = [];
  const scoreStart = Date.now();

  for (let i = 0; i < records.length; i += sidecarBatchSize) {
    const chunk = records.slice(i, i + sidecarBatchSize);
    const rows = chunk.map((r) => {
      const rowObj = {};
      for (const col of seg.featureCols) {
        rowObj[col] = Number(r[col] ?? 0);
      }
      return rowObj;
    });

    const reqBody = {
      artifact_b64: artifactB64,
      fitted_preprocessing: fittedPreprocessing,
      feature_schema: featureSchema,
      rows: rows,
    };

    const resp = await fetch(SIDECAR_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody),
    });

    if (!resp.ok) {
      throw new Error(`Sidecar predict failed (${resp.status}): ${await resp.text()}`);
    }

    const data = await resp.json();
    for (let j = 0; j < chunk.length; j++) {
      allPredictions.push({
        recordId: chunk[j].ID,
        recordName: chunk[j].DisplayName || chunk[j].OrgName || chunk[j].ID,
        pred: data.predictions[j],
        features: rows[j],
      });
    }
    process.stdout.write(`  Scored ${allPredictions.length} / ${records.length} rows...\r`);
  }
  console.log(`\nSidecar scored ${allPredictions.length} rows in ${Date.now() - scoreStart}ms`);

  // 5. Create ProcessRun
  const runId = randomUUID().toUpperCase();
  const startTime = new Date(scoreStart);
  const endTime = new Date();
  const config = JSON.stringify({
    recordProcessName: `Score ${seg.name} with model ${seg.modelId} (Weekly)`,
    workType: 'ML Model',
    scopeType: 'Filter',
  });

  await pool.request()
    .input('id', runId)
    .input('processId', seg.processId)
    .input('entityId', seg.targetEntityId)
    .input('filter', "Status = 'Active'")
    .input('startTime', startTime)
    .input('endTime', endTime)
    .input('count', allPredictions.length)
    .input('config', config)
    .query(`
      INSERT INTO [__mj].[ProcessRun] (
        ID, RecordProcessID, EntityID, TriggeredBy, SourceType, SourceFilter, Status,
        StartTime, EndTime, TotalItemCount, ProcessedItems, SuccessCount, ErrorCount, SkippedCount,
        BatchSize, CancellationRequested, DryRun, Configuration
      ) VALUES (
        @id, @processId, @entityId, 'OnDemand', 'Filter', @filter, 'Completed',
        @startTime, @endTime, @count, @count, @count, 0, 0,
        100, 0, 0, @config
      )
    `);
  console.log(`Created ProcessRun record: ${runId}`);

  // 6. Insert ProcessRunDetail records in batches
  const dbBatchSize = 250;
  const scoredAtStr = endTime.toISOString();
  console.log(`Inserting ${allPredictions.length} ProcessRunDetail records for ${seg.name}...`);

  for (let i = 0; i < allPredictions.length; i += dbBatchSize) {
    const chunk = allPredictions.slice(i, i + dbBatchSize);
    const req = pool.request();
    const valueClauses = [];

    chunk.forEach((item, idx) => {
      const detailId = randomUUID().toUpperCase();
      const rawScore = Number(item.pred?.score ?? 0);
      const roundedScore = Math.max(0, Math.round(rawScore * 100) / 100);
      const band = evaluateBand(roundedScore);

      // Top signed drivers for this customer
      const topDrivers = [
        { label: 'Total Orders', value: item.features.TotalOrders, up: item.features.TotalOrders > 2 },
        { label: 'Customer Tenure Days', value: item.features.CustomerTenureDays, up: item.features.CustomerTenureDays > 365 },
        { label: 'First Order Gross', value: item.features.FirstOrderGross, up: item.features.FirstOrderGross > 250 },
      ];

      const payloadObj = {
        output: {
          modelId: seg.modelId,
          target: 'CustomerActualLTV',
          problemType: 'regression',
          score: roundedScore,
          class: band.label,
          status: band.label,
          band: band.key,
          badgeColor: band.badgeColor,
          icon: band.icon,
          scoreLabel: 'Predicted Customer LTV',
          statusLabel: 'LTV Tier',
          drivers: topDrivers,
          scoredAt: scoredAtStr,
        },
      };

      req.input(`id_${idx}`, detailId);
      req.input(`rid_${idx}`, item.recordId);
      req.input(`payload_${idx}`, JSON.stringify(payloadObj));

      valueClauses.push(
        `(@id_${idx}, '${runId}', '${seg.targetEntityId}', @rid_${idx}, 'Succeeded', DATEADD(second, -1, GETUTCDATE()), GETUTCDATE(), 2, 1, @payload_${idx})`
      );
    });

    await req.query(`
      INSERT INTO [__mj].[ProcessRunDetail] (
        ID, ProcessRunID, EntityID, RecordID, Status, StartedAt, CompletedAt, DurationMs, AttemptCount, ResultPayload
      ) VALUES ${valueClauses.join(', ')}
    `);

    process.stdout.write(`  Inserted ${Math.min(i + dbBatchSize, allPredictions.length)} / ${allPredictions.length} details...\r`);
  }
  console.log(`\nAll ProcessRunDetail records inserted successfully for ${seg.name}!`);

  // 7. Update MLModelScoringBinding
  await pool.request()
    .input('bindingId', seg.bindingId)
    .input('count', allPredictions.length)
    .query(`
      UPDATE [__mj].[MLModelScoringBinding]
      SET LastScoredAt = GETUTCDATE(),
          LastRowCount = @count,
          __mj_UpdatedAt = GETUTCDATE()
      WHERE ID = @bindingId
    `);
  console.log(`Updated MLModelScoringBinding: ${seg.bindingId}`);
}

async function main() {
  const pool = await sql.connect(DB_CONFIG);
  console.log('Connected to SQL Server: MJ_6_1_0');

  for (const seg of SEGMENTS) {
    await scoreSegment(seg, pool);
  }

  await pool.close();
  console.log('\nAll LTV scoring runs completed successfully!');
}

main().catch((err) => {
  console.error('Scoring error:', err);
  process.exit(1);
});
