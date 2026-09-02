#!/usr/bin/env node
/**
 * Release-readiness: does every primaryKey UUID declared under metadata/ appear in some
 * shipped migrations/*.sql?
 *
 * NOT a PR gate. PRs contribute JSON only; the build engineer generates one Metadata_Sync
 * per release. Run this when cutting that seed — it should be loud at release and silent
 * the rest of the time. `lint:distribution` does not invoke it.
 *
 *   node scripts/check-release-seed-coverage.mjs
 *
 * Exit 1 lists the JSON files whose IDs are in no migration. That is the table
 * docs/PUBLISHING.md used to maintain by hand.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const METADATA = join(ROOT, 'metadata');
const MIGRATIONS = join(ROOT, 'migrations');
const IGNORED_DIRS = new Set(['sql_logging', '.backups']);

function walkJson(dir, acc = []) {
    for (const name of readdirSync(dir).sort()) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) {
            if (!IGNORED_DIRS.has(name)) walkJson(full, acc);
        } else if (name.endsWith('.json') && name !== '.mj-sync.json') {
            acc.push(full);
        }
    }
    return acc;
}

const UUID =
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function collectIds(node, acc) {
    if (Array.isArray(node)) {
        for (const item of node) collectIds(item, acc);
        return;
    }
    if (!node || typeof node !== 'object') return;
    const pk = node.primaryKey;
    if (pk && typeof pk.ID === 'string' && UUID.test(pk.ID.trim())) acc.push(pk.ID.trim());
    for (const value of Object.values(node)) collectIds(value, acc);
}

const sql = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => readFileSync(join(MIGRATIONS, f), 'utf8'))
    .join('\n')
    .toLowerCase();

const missing = [];
for (const file of walkJson(METADATA)) {
    const ids = [];
    collectIds(JSON.parse(readFileSync(file, 'utf8')), ids);
    const unseen = [...new Set(ids)].filter((id) => !sql.includes(id.toLowerCase()));
    if (unseen.length) {
        missing.push({
            file: relative(ROOT, file).split(sep).join('/'),
            unseen,
        });
    }
}

if (missing.length) {
    console.error('Release seed coverage — these metadata primaryKeys appear in no migration:\n');
    for (const row of missing) {
        console.error(`  ❌ ${row.file}: ${row.unseen.length} undeclared in SQL`);
        console.error(`       e.g. ${row.unseen[0]}`);
    }
    console.error('\nGenerate the release Metadata_Sync, then re-run.');
    process.exit(1);
}

console.log('Release seed coverage passed — every metadata primaryKey appears in migrations/.');
