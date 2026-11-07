#!/usr/bin/env node
/**
 * check-migration-entityfieldvalue-ids.mjs
 *
 * A versioned migration must not insert an `EntityFieldValue` row keyed on a literal EntityFieldID
 * that the same file does not create.
 *
 * ── WHY ─────────────────────────────────────────────────────────────────────────
 * CodeGen output folded into a migration copies the authoring database's EntityField IDs. Where the
 * same file also inserts that EntityField with that ID, the pair is consistent on every host built
 * from migrations. Where it does not, the ID belongs to some other database's history: on a host
 * whose field has a different ID the insert fails on FK_EntityFieldValue_EntityField and aborts the
 * migration, and on a host where the ID does exist the values can land a second time under new row
 * IDs (#815). A value list for a field created elsewhere is seeded by NATURAL KEY instead: look the
 * field up by entity and name into a variable, as V202609061900 does for OrderLine.FulfillmentStatus.
 *
 * Only the literal form is refused. `@SomeFieldID` (a variable resolved by natural key) and a
 * subquery are what the fix looks like, so they pass.
 *
 * ── SCOPE ───────────────────────────────────────────────────────────────────────
 * CI form (`<base> <head>`): migration files added, modified, copied or renamed between the two
 * commits; only inserts that START on a line the PR adds are reported. Local form (no arguments):
 * the working tree plus untracked files against merge-base(BASE_REF or origin/next, HEAD). Only
 * Flyway versioned files (`V<12 digits>__*.sql`) are scanned; fixture SQL under `tests/` is not.
 * Merged migrations that carry the literal form are locked and stay as they are; `--all` lists them
 * (informational, exit 0).
 *
 * Usage (from any directory inside the repository):
 *   node check-migration-entityfieldvalue-ids.mjs                 # local form
 *   node check-migration-entityfieldvalue-ids.mjs <base> <head>   # CI form
 *   node check-migration-entityfieldvalue-ids.mjs --all           # every migration, informational
 *   node check-migration-entityfieldvalue-ids.mjs --self-test     # test fixtures
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { addedLinesFromDiff } from './check-migration-no-prune.mjs';

const RED = '\x1b[0;31m', YELLOW = '\x1b[0;33m', GREEN = '\x1b[0;32m', DIM = '\x1b[2m', NC = '\x1b[0m';
const GIT_MAX_BUFFER = Number(process.env.MJ_GIT_MAX_BUFFER) || 256 * 1024 * 1024;
const VERSIONED_MIGRATION_RE = /(^|\/)V\d{12}__[^/]*\.sql$/;
const FIXTURE_DIR_RE = /(^|\/)tests?\//;
export const inScope = (f) => VERSIONED_MIGRATION_RE.test(f) && !FIXTURE_DIR_RE.test(f);

const UUID_LITERAL_RE = /^N?'([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})'$/i;

/**
 * `INSERT INTO <schema>.<table> (<columns>) VALUES (` — the table captured unquoted. The schema is
 * anything (`[${mjSchema}]`, `[__mj]`, `__mj`); the values tuple is read by `readTuple`, because a
 * string value may contain a parenthesis.
 */
const INSERT_RE = /INSERT\s+INTO\s+(?:\[[^\]]+\]|"[^"]+"|[\w${}]+)\s*\.\s*(?:\[(\w+)\]|"(\w+)"|(\w+))\s*\(([^)]*)\)\s*VALUES\s*\(/gi;

/** Read a parenthesised, comma-separated tuple starting just after its `(`; quote- and nesting-aware. */
function readTuple(sql, start) {
    const values = [];
    let depth = 0, cur = '', i = start;
    for (; i < sql.length; i++) {
        const c = sql[i];
        if (c === "'") {
            let j = i + 1;
            for (; j < sql.length; j++) {
                if (sql[j] === "'" && sql[j + 1] === "'") { j++; continue; }
                if (sql[j] === "'") break;
            }
            cur += sql.slice(i, j + 1);
            i = j;
            continue;
        }
        if (c === '(') depth++;
        if (c === ')') {
            if (depth === 0) break;
            depth--;
        }
        if (c === ',' && depth === 0) {
            values.push(cur.trim());
            cur = '';
            continue;
        }
        cur += c;
    }
    values.push(cur.trim());
    return values;
}

/** Blank `--` and `/* *\/` comments, keeping string literals and line numbers intact. */
function blankComments(sql) {
    let out = '';
    for (let i = 0; i < sql.length; i++) {
        const c = sql[i];
        if (c === "'") {
            let j = i + 1;
            for (; j < sql.length; j++) {
                if (sql[j] === "'" && sql[j + 1] === "'") { j++; continue; }
                if (sql[j] === "'") break;
            }
            out += sql.slice(i, j + 1);
            i = j;
        } else if (c === '-' && sql[i + 1] === '-') {
            while (i < sql.length && sql[i] !== '\n') { out += ' '; i++; }
            if (i < sql.length) out += '\n';
        } else if (c === '/' && sql[i + 1] === '*') {
            const end = sql.indexOf('*/', i + 2);
            const stop = end === -1 ? sql.length : end + 2;
            out += sql.slice(i, stop).replace(/[^\n]/g, ' ');
            i = stop - 1;
        } else {
            out += c;
        }
    }
    return out;
}

/** Every INSERT … VALUES in `sql`, as { table, columns, values, line }. */
function inserts(sql) {
    const masked = blankComments(sql);
    const found = [];
    for (const m of masked.matchAll(INSERT_RE)) {
        const table = m[1] ?? m[2] ?? m[3];
        const columns = m[4].split(',').map((c) => c.trim().replace(/^\[|\]$|^"|"$/g, '').toLowerCase());
        const values = readTuple(masked, m.index + m[0].length);
        const line = masked.slice(0, m.index).split('\n').length;
        found.push({ table, columns, values, line });
    }
    return found;
}

/**
 * The value inserts in `sql` whose EntityFieldID is a literal the same file does not create.
 * Returns [{ line, entityFieldID, value }] (1-indexed lines).
 */
export function scanContent(sql) {
    const all = inserts(sql);
    const created = new Set();
    for (const ins of all) {
        if (ins.table.toLowerCase() !== 'entityfield') continue;
        const id = ins.values[ins.columns.indexOf('id')]?.match(UUID_LITERAL_RE)?.[1];
        if (id) created.add(id.toLowerCase());
    }
    const hits = [];
    for (const ins of all) {
        if (ins.table.toLowerCase() !== 'entityfieldvalue') continue;
        const fieldID = ins.values[ins.columns.indexOf('entityfieldid')]?.match(UUID_LITERAL_RE)?.[1];
        if (!fieldID || created.has(fieldID.toLowerCase())) continue;
        hits.push({ line: ins.line, entityFieldID: fieldID, value: ins.values[ins.columns.indexOf('value')] ?? '' });
    }
    return hits;
}

const FIELD = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const valueInsert = (fieldRef, value = "'Pending'") =>
    `INSERT INTO [\${mjSchema}].[EntityFieldValue]\n    ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])\n  VALUES\n    ('33333333-3333-4333-8333-333333333333', ${fieldRef}, 1, ${value}, ${value}, GETUTCDATE(), GETUTCDATE());`;
const fieldInsert = (id) =>
    `INSERT INTO [\${mjSchema}].[EntityField]\n  ( [ID], [EntityID], [Sequence], [Name], [Type] )\n  VALUES\n  ( '${id}', '44444444-4444-4444-8444-444444444444', 100025, 'Status', 'nvarchar' );`;

export const SELF_TEST_FIXTURES = [
    ['a literal EntityFieldID the file does not create is refused', true, valueInsert(`'${FIELD}'`)],
    ['the same in upper case is refused', true, valueInsert(`'${FIELD.toUpperCase()}'`)],
    ['a literal EntityFieldID the same file creates passes', false, `${fieldInsert(FIELD)}\n${valueInsert(`'${FIELD}'`)}`],
    ['created with a different case still matches', false, `${fieldInsert(FIELD.toUpperCase())}\n${valueInsert(`'${FIELD}'`)}`],
    ['a field created in the file does not excuse a different one', true, `${fieldInsert(OTHER)}\n${valueInsert(`'${FIELD}'`)}`],
    ['a variable resolved by natural key passes', false, valueInsert('@FulfillmentStatusFieldID')],
    ['a subquery passes', false, valueInsert(`(SELECT ID FROM [\${mjSchema}].[EntityField] WHERE Name = 'Status')`)],
    ['a value containing a comma and a parenthesis does not shift the columns', true, valueInsert(`'${FIELD}'`, "'Net (30, 60)'")],
    ['an insert inside a block comment is ignored', false, `/*\n${valueInsert(`'${FIELD}'`)}\n*/`],
    ['an insert after a line comment marker is ignored', false, valueInsert(`'${FIELD}'`).split('\n').map((l) => `-- ${l}`).join('\n')],
    ['an EntityField insert alone is not a value insert', false, fieldInsert(FIELD)],
];

const SCOPE_TEST_FIXTURES = [
    ['V-prefix migration is in scope', true, 'migrations/V202610181700__v5.x__Example.sql'],
    ['baselines are skipped', false, 'migrations/B202607061431__v0.1.x__Schema_and_Types.sql'],
    ['fixture in tests/ is excluded', false, 'tests/migrations/V202610181700__v5.x__Example.sql'],
    ['repeatable migration is excluded', false, 'migrations/R__RefreshMetadata.sql'],
    ['non-migration sql file is excluded', false, 'scripts/seed.sql'],
];

export function runSelfTest() {
    let failed = 0;
    for (const [name, expected, sql] of SELF_TEST_FIXTURES) {
        const actual = scanContent(sql).length > 0;
        if (actual !== expected) {
            console.error(`${RED}FAIL${NC} ${name}: expected ${expected}, got ${actual}`);
            failed++;
        } else {
            console.log(`${GREEN}PASS${NC} ${name}`);
        }
    }
    const lineHit = scanContent(`\n\n${valueInsert(`'${FIELD}'`)}`)[0];
    if (lineHit?.line !== 3) {
        console.error(`${RED}FAIL${NC} reports the line the insert starts on: expected 3, got ${lineHit?.line}`);
        failed++;
    } else {
        console.log(`${GREEN}PASS${NC} reports the line the insert starts on`);
    }
    for (const [name, expected, path] of SCOPE_TEST_FIXTURES) {
        const actual = inScope(path);
        if (actual !== expected) {
            console.error(`${RED}FAIL${NC} ${name}: expected ${expected}, got ${actual}`);
            failed++;
        } else {
            console.log(`${GREEN}PASS${NC} ${name}`);
        }
    }
    if (failed > 0) {
        console.error(`\n${RED}Self-test failed: ${failed} fixture(s) failed.${NC}`);
        process.exit(1);
    }
    console.log(`\n${GREEN}Self-test passed: all fixtures behaved as expected.${NC}`);
}

function git(args, opts = {}) {
    return execFileSync('git', args, { encoding: 'utf8', maxBuffer: GIT_MAX_BUFFER, ...opts });
}

const lines = (text) => text.split('\n').map((f) => f.trim()).filter(Boolean);

function report(file, hits, informational) {
    console[informational ? 'log' : 'error'](`${informational ? YELLOW : RED}${informational ? '' : '✗ '}${file}${NC}${informational ? ' (informational)' : ''}`);
    for (const h of hits) {
        console[informational ? 'log' : 'error'](`    ${DIM}line ${h.line}:${NC} EntityFieldID '${h.entityFieldID}' for value ${h.value}`);
    }
}

function main() {
    const args = process.argv.slice(2);
    if (args.includes('--self-test')) {
        runSelfTest();
        return;
    }

    const root = git(['rev-parse', '--show-toplevel']).trim();

    if (args.includes('--all')) {
        for (const file of lines(git(['ls-files', '*.sql'], { cwd: root })).filter(inScope)) {
            const abs = join(root, file);
            if (!existsSync(abs)) continue;
            const hits = scanContent(readFileSync(abs, 'utf8'));
            if (hits.length) report(file, hits, true);
        }
        return;
    }

    const isCi = args.length >= 2;
    let base = args[0];
    let head = args[1];
    let changedFiles;
    if (isCi) {
        changedFiles = lines(git(['diff', '--name-only', '--diff-filter=ACMR', base, head], { cwd: root })).filter(inScope);
    } else {
        const baseRef = process.env.BASE_REF || 'origin/next';
        try {
            base = git(['merge-base', baseRef, 'HEAD'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
        } catch (err) {
            // Falling back to HEAD would diff the tree against itself and scan nothing committed.
            console.error(`${RED}✗ could not resolve base ref '${baseRef}'${NC}`);
            console.error(`  ${err.stderr?.toString().trim() || err.message}`);
            console.error('  Fetch it (e.g. `git fetch origin next`), or set BASE_REF to a ref that resolves.');
            process.exit(1);
        }
        const diffFiles = lines(git(['diff', '--name-only', '--diff-filter=ACMR', base], { cwd: root })).filter(inScope);
        const untracked = lines(git(['ls-files', '--others', '--exclude-standard'], { cwd: root })).filter(inScope);
        changedFiles = [...new Set([...diffFiles, ...untracked])];
    }

    let violations = 0;
    for (const file of changedFiles) {
        const abs = join(root, file);
        if (!existsSync(abs)) continue;
        let hits = scanContent(readFileSync(abs, 'utf8'));
        if (!hits.length) continue;
        if (isCi) {
            const added = addedLinesFromDiff(git(['diff', '-U0', base, head, '--', file], { cwd: root }));
            hits = hits.filter((h) => added.has(h.line));
        }
        if (!hits.length) continue;
        report(file, hits, false);
        violations += hits.length;
    }

    if (violations > 0) {
        console.error(`\n${RED}EntityFieldValue inserts keyed on an EntityFieldID this file does not create.${NC}`);
        console.error(`
That ID is the authoring database's. On another host the insert fails on
FK_EntityFieldValue_EntityField or duplicates the value list. Seed the values by
natural key instead: resolve the field by entity and name into a variable (see the
FulfillmentStatus block in V202609061900).`);
        process.exit(1);
    }
    console.log(`${GREEN}✓ no EntityFieldValue insert in changed migrations uses a foreign EntityFieldID${NC}`);
}

const isEntry = () => {
    try {
        return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
    } catch {
        return false;
    }
};

if (isEntry()) {
    main();
}
