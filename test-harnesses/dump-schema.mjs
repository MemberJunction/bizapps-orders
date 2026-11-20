/**
 * Read the AS-BUILT orders schema out of sys.* and emit JSON.
 *
 *     node test-harnesses/dump-schema.mjs /tmp/orders-schema.json
 *
 * The ERD is generated from THIS, never from prose or from the migration text — a migration
 * says what was intended, sys.tables says what is there. Run it against a database the
 * committed migrations actually built. `scripts/rebuild-db.sh` builds one; it drops and recreates
 * the `.env` database, so point `.env` at a throwaway one.
 *
 * The connection comes from the repo-root `.env`, the file `scripts/rebuild-db.sh` and
 * `mj.config.cjs` read: DB_HOST, DB_PORT, DB_DATABASE, DB_USERNAME, DB_PASSWORD. A variable
 * already set in the environment wins over the file.
 *
 * CHECK constraint bodies come from OBJECT_DEFINITION, which returns NULL for a login without
 * VIEW DEFINITION on the schema. `gen-erd.mjs` then needs a checkdefs file; see its header.
 */
import path from 'node:path';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import sql from 'mssql';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '..', '.env'), quiet: true });

const outPath = process.argv[2];
if (!outPath) {
    console.error('usage: node test-harnesses/dump-schema.mjs <output.json>');
    process.exit(1);
}

const { DB_HOST, DB_PORT, DB_DATABASE, DB_USERNAME, DB_PASSWORD } = process.env;
const unset = Object.entries({ DB_DATABASE, DB_USERNAME, DB_PASSWORD }).filter(([, v]) => !v).map(([k]) => k);
if (unset.length) {
    console.error(`${unset.join(', ')} not set: put them in the repo-root .env or the environment`);
    process.exit(1);
}

const SCHEMA = '__mj_BizAppsOrders';
const pool = await sql.connect({
    server: DB_HOST || 'localhost', port: Number(DB_PORT || 1433), database: DB_DATABASE,
    user: DB_USERNAME, password: DB_PASSWORD,
    options: { encrypt: false, trustServerCertificate: true },
});
const q = async (t) => (await pool.request().query(t)).recordset ?? [];

const tables = await q(`
  SELECT t.name AS TableName
    FROM sys.tables t JOIN sys.schemas s ON s.schema_id = t.schema_id
   WHERE s.name = '${SCHEMA}' ORDER BY t.name`);
if (!tables.length) {
    console.error(`no tables in ${SCHEMA} on ${DB_DATABASE}: point .env at a database built from this repo's migrations`);
    process.exit(1);
}

const columns = await q(`
  SELECT t.name AS TableName, c.name AS ColumnName, c.column_id AS Ord,
         ty.name AS DataType, c.max_length AS MaxLen, c.precision AS Prec, c.scale AS Scale,
         c.is_nullable AS IsNullable, c.is_computed AS IsComputed,
         CAST(ISNULL(dc.definition,'') AS NVARCHAR(MAX)) AS DefaultDef
    FROM sys.columns c
    JOIN sys.tables t ON t.object_id = c.object_id
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    JOIN sys.types ty ON ty.user_type_id = c.user_type_id
    LEFT JOIN sys.default_constraints dc ON dc.object_id = c.default_object_id
   WHERE s.name = '${SCHEMA}' ORDER BY t.name, c.column_id`);

const fks = await q(`
  SELECT fk.name AS FKName,
         ps.name AS ParentSchema, pt.name AS ParentTable, pc.name AS ParentColumn,
         rs.name AS RefSchema,    rt.name AS RefTable,    rc.name AS RefColumn,
         fk.delete_referential_action_desc AS OnDelete
    FROM sys.foreign_keys fk
    JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
    JOIN sys.tables pt ON pt.object_id = fk.parent_object_id
    JOIN sys.schemas ps ON ps.schema_id = pt.schema_id
    JOIN sys.columns pc ON pc.object_id = pt.object_id AND pc.column_id = fkc.parent_column_id
    JOIN sys.tables rt ON rt.object_id = fk.referenced_object_id
    JOIN sys.schemas rs ON rs.schema_id = rt.schema_id
    JOIN sys.columns rc ON rc.object_id = rt.object_id AND rc.column_id = fkc.referenced_column_id
   WHERE ps.name = '${SCHEMA}' ORDER BY pt.name, fk.name`);

const checks = await q(`
  SELECT t.name AS TableName, cc.name AS CheckName, OBJECT_DEFINITION(cc.object_id) AS Definition
    FROM sys.check_constraints cc
    JOIN sys.tables t ON t.object_id = cc.parent_object_id
    JOIN sys.schemas s ON s.schema_id = t.schema_id
   WHERE s.name = '${SCHEMA}' ORDER BY t.name, cc.name`);

const indexes = await q(`
  SELECT t.name AS TableName, i.name AS IndexName, i.is_unique AS IsUnique,
         i.is_primary_key AS IsPK, i.has_filter AS HasFilter,
         CAST(ISNULL(i.filter_definition,'') AS NVARCHAR(MAX)) AS FilterDef,
         STUFF((SELECT ', ' + c2.name FROM sys.index_columns ic2
                  JOIN sys.columns c2 ON c2.object_id = ic2.object_id AND c2.column_id = ic2.column_id
                 WHERE ic2.object_id = i.object_id AND ic2.index_id = i.index_id AND ic2.is_included_column = 0
                 ORDER BY ic2.key_ordinal FOR XML PATH('')), 1, 2, '') AS Cols
    FROM sys.indexes i
    JOIN sys.tables t ON t.object_id = i.object_id
    JOIN sys.schemas s ON s.schema_id = t.schema_id
   WHERE s.name = '${SCHEMA}' AND i.type > 0 ORDER BY t.name, i.name`);

const triggers = await q(`
  SELECT t.name AS TableName, tr.name AS TriggerName, tr.is_disabled AS IsDisabled
    FROM sys.triggers tr
    JOIN sys.tables t ON t.object_id = tr.parent_id
    JOIN sys.schemas s ON s.schema_id = t.schema_id
   WHERE s.name = '${SCHEMA}' ORDER BY t.name, tr.name`);

const views = await q(`
  SELECT v.name AS ViewName FROM sys.views v JOIN sys.schemas s ON s.schema_id = v.schema_id
   WHERE s.name = '${SCHEMA}' ORDER BY v.name`);

const out = { schema: SCHEMA, tables, columns, fks, checks, indexes, triggers, views };
writeFileSync(outPath, JSON.stringify(out, null, 1));
console.log(`tables=${tables.length} columns=${columns.length} fks=${fks.length} checks=${checks.length} indexes=${indexes.length} triggers=${triggers.length} views=${views.length}`);
const noBody = checks.filter((c) => !c.Definition).length;
if (noBody) console.warn(`${noBody}/${checks.length} CHECK bodies came back NULL: this login lacks VIEW DEFINITION`);
process.exit(0);
