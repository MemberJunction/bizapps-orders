/**
 * MAINT (not a test) — snapshot / diff this app's __mj metadata.
 *
 * The AI-enrichment rebuild (drop-schema -> migrate -> codegen --ai) re-creates every Entity and
 * EntityField row from scratch. So the ONLY way to answer "did we lose anything we had deliberately
 * set?" is to compare SEMANTICALLY — keyed on entity+field NAME, never on ID, ignoring ordering.
 *
 * Comparing by ID would also be misleading in the other direction: on a baseline whose generated
 * half carries hardcoded INSERTs, the IDs are REPRODUCED, so an ID-keyed diff reports "no change"
 * even where the AI rewrote every description.
 *
 *   node test-harnesses/_maint-metadata-snapshot.mjs snapshot <out.json>
 *   node test-harnesses/_maint-metadata-snapshot.mjs diff <before.json> <after.json>
 *
 * Ported from bizapps-accounting's _maint-metadata-snapshot.ts (2026-08-06 AI-enrichment run).
 */
import sql from 'mssql';
import { readFileSync, writeFileSync } from 'node:fs';

const SCHEMA = '__mj_BizAppsOrders';

const env = Object.fromEntries(
    readFileSync(new URL('../../../MJAPI/.env', import.meta.url), 'utf8')
        .split('\n')
        .filter((l) => l.includes('=') && !l.startsWith('#'))
        .map((l) => {
            const i = l.indexOf('=');
            return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
        })
);

async function connect() {
    return sql.connect({
        server: env.DB_HOST || 'localhost',
        port: +(env.DB_PORT || 1433),
        database: env.DB_DATABASE,
        user: env.DB_USERNAME,
        password: env.DB_PASSWORD,
        options: { encrypt: false, trustServerCertificate: true },
    });
}

async function snapshot(out) {
    const pool = await connect();
    const q = async (t) => (await pool.request().query(t)).recordset ?? [];
    const snap = {
        entities: await q(`
      SELECT e.Name AS Entity, ISNULL(e.Description,'') AS Description, ISNULL(e.BaseView,'') AS BaseView,
             ISNULL(CAST(pe.Name AS NVARCHAR(255)),'') AS ParentEntity
      FROM __mj.Entity e
      LEFT JOIN __mj.Entity pe ON pe.ID = e.ParentID
      WHERE e.SchemaName='${SCHEMA}' ORDER BY e.Name`),
        fields: await q(`
      SELECT e.Name AS Entity, f.Name AS Field, ISNULL(f.Description,'') AS Description,
             ISNULL(f.Category,'') AS Category, f.IsNameField, f.DefaultInView,
             f.IncludeInUserSearchAPI, f.Sequence
      FROM __mj.Entity e JOIN __mj.EntityField f ON f.EntityID=e.ID
      WHERE e.SchemaName='${SCHEMA}' ORDER BY e.Name, f.Name`),
        relationships: await q(`
      SELECT e.Name AS Entity, re.Name AS RelatedEntity, r.DisplayInForm, ISNULL(r.DisplayName,'') AS DisplayName
      FROM __mj.EntityRelationship r
      JOIN __mj.Entity e ON e.ID=r.EntityID JOIN __mj.Entity re ON re.ID=r.RelatedEntityID
      WHERE e.SchemaName='${SCHEMA}' ORDER BY e.Name, re.Name`),
        permissions: await q(`
      SELECT e.Name AS Entity, COUNT(*) AS Permissions
      FROM __mj.Entity e JOIN __mj.EntityPermission p ON p.EntityID=e.ID
      WHERE e.SchemaName='${SCHEMA}' GROUP BY e.Name ORDER BY e.Name`),
    };
    writeFileSync(out, JSON.stringify(snap, null, 1));
    console.log(
        `snapshot -> ${out}\n  entities=${snap.entities.length} fields=${snap.fields.length} ` +
            `relationships=${snap.relationships.length} entities-with-permissions=${snap.permissions.length}`
    );
    await pool.close();
}

function diff(beforePath, afterPath) {
    const a = JSON.parse(readFileSync(beforePath, 'utf8'));
    const b = JSON.parse(readFileSync(afterPath, 'utf8'));
    const fk = (f) => `${f.Entity}::${f.Field}`;
    const before = new Map(a.fields.map((f) => [fk(f), f]));
    const after = new Map(b.fields.map((f) => [fk(f), f]));

    const lost = [];
    const gained = [];
    const changed = [];

    for (const [k, f] of before) {
        const g = after.get(k);
        if (!g) {
            lost.push(`  FIELD GONE: ${k}`);
            continue;
        }
        // A value we HAD and no longer have is the only true regression.
        if (f.Description && !g.Description) lost.push(`  DESC LOST: ${k}\n      was: ${f.Description.slice(0, 110)}`);
        else if (f.Description && g.Description && f.Description !== g.Description)
            changed.push(`  DESC CHANGED: ${k}\n      was: ${f.Description.slice(0, 110)}\n      now: ${g.Description.slice(0, 110)}`);
        else if (!f.Description && g.Description) gained.push(`  DESC ADDED: ${k}: ${g.Description.slice(0, 100)}`);

        for (const flag of ['IsNameField', 'DefaultInView', 'IncludeInUserSearchAPI']) {
            if (f[flag] && !g[flag]) lost.push(`  ${flag} TURNED OFF: ${k}`);
            else if (!f[flag] && g[flag]) gained.push(`  ${flag} turned on: ${k}`);
        }
        if (f.Category && !g.Category) lost.push(`  CATEGORY CLEARED: ${k} (was '${f.Category}')`);
        else if (!f.Category && g.Category) gained.push(`  CATEGORY set: ${k} -> '${g.Category}'`);
        else if (f.Category && g.Category && f.Category !== g.Category)
            changed.push(`  CATEGORY: ${k}: '${f.Category}' -> '${g.Category}'`);
    }
    for (const k of after.keys()) if (!before.has(k)) gained.push(`  NEW FIELD: ${k}`);

    const eBefore = new Map(a.entities.map((e) => [e.Entity, e]));
    for (const e of b.entities) {
        const o = eBefore.get(e.Entity);
        if (!o) {
            gained.push(`  NEW ENTITY: ${e.Entity}`);
            continue;
        }
        if (o.Description && o.Description !== e.Description)
            (e.Description ? changed : lost).push(
                `  ENTITY DESC ${e.Description ? 'CHANGED' : 'LOST'}: ${e.Entity}\n      was: ${o.Description.slice(0, 110)}\n      now: ${e.Description.slice(0, 110)}`
            );
        else if (!o.Description && e.Description) gained.push(`  ENTITY DESC ADDED: ${e.Entity}: ${e.Description.slice(0, 100)}`);
        // IS-A wiring: ParentID is set from codegen-schema-info.json, so losing it means the
        // config was not read — the child entity stops inheriting the parent's fields.
        if (o.ParentEntity && !e.ParentEntity) lost.push(`  IS-A PARENT LOST: ${e.Entity} (was ${o.ParentEntity})`);
        else if (!o.ParentEntity && e.ParentEntity) gained.push(`  IS-A PARENT set: ${e.Entity} -> ${e.ParentEntity}`);
        if (o.BaseView && !e.BaseView) lost.push(`  BASE VIEW LOST: ${e.Entity}`);
    }
    for (const e of eBefore.keys()) if (!b.entities.some((x) => x.Entity === e)) lost.push(`  ENTITY GONE: ${e}`);

    const rk = (r) => `${r.Entity} -> ${r.RelatedEntity}`;
    const rBefore = new Map(a.relationships.map((r) => [rk(r), r]));
    for (const r of b.relationships) {
        const o = rBefore.get(rk(r));
        if (!o) {
            gained.push(`  NEW REL: ${rk(r)}`);
            continue;
        }
        if (o.DisplayInForm !== r.DisplayInForm)
            (o.DisplayInForm ? lost : gained).push(`  REL DisplayInForm ${o.DisplayInForm ? 'OFF' : 'on'}: ${rk(r)}`);
    }
    for (const k of rBefore.keys()) if (!b.relationships.some((x) => rk(x) === k)) lost.push(`  REL GONE: ${k}`);

    // Permissions are not an AI concern, but a CodeGen run that died partway leaves entities with
    // none — and that ships a database whose reads fail. Cheap to check while we are here.
    const pBefore = new Map(a.permissions.map((p) => [p.Entity, p.Permissions]));
    for (const e of b.entities) if (!b.permissions.some((p) => p.Entity === e.Entity)) lost.push(`  NO PERMISSIONS: ${e.Entity}`);
    for (const p of b.permissions) {
        const o = pBefore.get(p.Entity);
        if (o !== undefined && p.Permissions < o) lost.push(`  PERMISSIONS DROPPED: ${p.Entity} ${o} -> ${p.Permissions}`);
    }

    const section = (title, rows) => {
        console.log(`\n${title} (${rows.length})`);
        rows.slice(0, 80).forEach((r) => console.log(r));
        if (rows.length > 80) console.log(`  … and ${rows.length - 80} more`);
    };
    console.log('SEMANTIC METADATA DIFF — keyed on name, order-independent');
    console.log(`  before: ${beforePath}\n  after:  ${afterPath}`);
    section('🔴 REGRESSIONS (had a value, now gone/off) — REVIEW EVERY ONE', lost);
    section('🟡 CHANGED (both had values, AI rewrote)', changed);
    section('🟢 GAINED (was empty, AI filled)', gained);
    console.log(`\nSUMMARY: ${lost.length} regressions · ${changed.length} rewrites · ${gained.length} additions`);
}

/**
 * Prove the metadata IDs come from the committed migration rather than being minted at deploy time.
 *
 * This is the guarantee that makes the baseline safe to ship: a clean deploy must reproduce the
 * SAME entity and field UUIDs, because other repos, metadata files and seed data reference them.
 * A semantic diff cannot show this — it is keyed on names precisely so that it ignores IDs — and
 * you cannot check it after the fact either, since the rebuild has already replaced the rows you
 * would have compared against. Asking whether each live ID appears verbatim in the migration
 * answers it at any time, from the artefact that will actually be deployed.
 *
 * A miss means that row was created by something other than the baseline — CodeGen minting a new
 * one at install time — and every reference to it elsewhere will dangle on a fresh deployment.
 */
async function ids(migrationPath) {
    const pool = await connect();
    const q = async (t) => (await pool.request().query(t)).recordset ?? [];
    const migration = readFileSync(migrationPath, 'utf8').toLowerCase();
    const has = (id) => migration.includes(String(id).toLowerCase());

    const entities = await q(`SELECT ID, Name FROM __mj.Entity WHERE SchemaName='${SCHEMA}' ORDER BY Name`);
    const fields = await q(`
      SELECT f.ID, e.Name AS Entity, f.Name AS Field
      FROM __mj.EntityField f JOIN __mj.Entity e ON e.ID = f.EntityID
      WHERE e.SchemaName='${SCHEMA}' ORDER BY e.Name, f.Name`);

    const missingEntities = entities.filter((r) => !has(r.ID));
    const missingFields = fields.filter((r) => !has(r.ID));
    console.log(`ID STABILITY vs ${migrationPath}`);
    console.log(`  entities: ${entities.length - missingEntities.length}/${entities.length} hardcoded in the migration`);
    console.log(`  fields:   ${fields.length - missingFields.length}/${fields.length} hardcoded in the migration`);
    for (const r of missingEntities.slice(0, 20)) console.log(`  🔴 ENTITY NOT IN MIGRATION: ${r.Name}`);
    for (const r of missingFields.slice(0, 20)) console.log(`  🔴 FIELD NOT IN MIGRATION: ${r.Entity}::${r.Field}`);
    const missing = missingEntities.length + missingFields.length;
    if (missing > 40) console.log(`  … and ${missing - 40} more`);
    console.log(missing === 0 ? '\nAll metadata IDs are reproduced by the baseline.' : `\n${missing} ID(s) would be re-minted on a clean deploy.`);
    await pool.close();
    return missing === 0 ? 0 : 1;
}

const [mode, x, y] = process.argv.slice(2);
if (mode === 'snapshot' && x) {
    await snapshot(x);
    process.exit(0);
}
if (mode === 'diff' && x && y) {
    diff(x, y);
    process.exit(0);
}
if (mode === 'ids') {
    process.exit(await ids(x ?? 'migrations/V202607061432__v0.1.x__Tables_and_Objects.sql'));
}
console.error('usage: snapshot <out.json> | diff <before.json> <after.json> | ids [migration.sql]');
process.exit(2);
