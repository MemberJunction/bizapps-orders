#!/usr/bin/env node
/**
 * check-migration-entityfieldvalue-ids.mjs (#815)
 *
 * A migration must not INSERT an EntityFieldValue row whose EntityFieldID is a literal that no
 * migration up to and including that file creates.
 *
 * ── WHY ─────────────────────────────────────────────────────────────────────────
 * CodeGen output folded into a migration copies the authoring database's EntityField IDs. When the
 * field was created by an earlier migration (an EntityField INSERT carrying that literal ID), every
 * database built from migrations has the same ID and the value insert is sound. When the field was
 * created some other way on the authoring database (a CodeGen run never captured, a hand fix), the
 * ID exists only there: on a host whose field has another ID the insert fails on
 * FK_EntityFieldValue_EntityField, and on one that happens to have it the values can be inserted a
 * second time. The sound alternative for such a field is to look it up by natural key (entity and
 * field name) at apply time, as V202609061900 and V202609221500 do, so nothing literal is involved.
 *
 * ── THE RULE ────────────────────────────────────────────────────────────────────
 * For each `INSERT INTO [...].[EntityFieldValue] (...) VALUES (...)` whose EntityFieldID position
 * holds a quoted UUID, that UUID must appear as the ID of an `INSERT INTO [...].[EntityField] (...)
 * VALUES (...)` in this file or in a migration that sorts before it. `INSERT ... SELECT` and a
 * variable or subquery in the EntityFieldID position are not literals and pass.
 *
 * ── SCOPE ───────────────────────────────────────────────────────────────────────
 * CI form (`<base> <head>`): versioned migrations (`V<12 digits>__*.sql`) added or modified between
 * the two commits are checked; every migration is read to learn which field IDs exist. Merged
 * migrations that break the rule are left alone: they are locked, and rewriting them would change
 * Flyway checksums on every existing database. `--all` reports every migration and exits 0.
 *
 * Usage (from any directory inside the repository):
 *   node check-migration-entityfieldvalue-ids.mjs <base> <head>   # CI form
 *   node check-migration-entityfieldvalue-ids.mjs                 # working tree against merge-base(origin/next)
 *   node check-migration-entityfieldvalue-ids.mjs --all           # every migration, informational
 *   node check-migration-entityfieldvalue-ids.mjs --self-test     # the detector's own fixtures
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { stripSqlComments } from './strip-sql-comments.mjs';
import { parseParenList } from './check-migration-entityfield-sequence.mjs';

const RED = '\x1b[0;31m', YELLOW = '\x1b[0;33m', GREEN = '\x1b[0;32m', NC = '\x1b[0m';
const VERSIONED_RE = /^V\d{12}__[^/]*\.sql$/;
const UUID_LITERAL_RE = /^N?'([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})'$/;

const insertRe = (table) =>
    new RegExp(String.raw`INSERT\s+INTO\s+(?:[^\s(]*?[.\]"\x60])?(?:\[${table}\]|"${table}"|${table})\s*\(`, 'gi');

const bare = (s) => s.replace(/^[\[\]"\x60\s]+|[\[\]"\x60\s]+$/g, '').toLowerCase();

function lineOf(text, offset) {
    let n = 1;
    for (let i = 0; i < offset; i++) if (text.charCodeAt(i) === 10) n++;
    return n;
}

/**
 * The items of the tuple `(...)` spanning [open, end) as SOURCE text. Commas are found in the masked
 * text, where string contents are blanked, so a comma inside a literal never splits an item.
 */
function splitTuple(masked, source, open, end) {
    const parts = [];
    let depth = 0, inBracket = false, start = open + 1;
    for (let i = open + 1; i < end - 1; i++) {
        const ch = masked[i];
        if (inBracket) { if (ch === ']') inBracket = false; continue; }
        if (ch === '[') inBracket = true;
        else if (ch === '(') depth++;
        else if (ch === ')') depth--;
        else if (ch === ',' && depth === 0) {
            parts.push({ value: source.slice(start, i).trim(), offset: start });
            start = i + 1;
        }
    }
    parts.push({ value: source.slice(start, end - 1).trim(), offset: start });
    return parts;
}

/**
 * Every literal value in column `column` of each VALUES tuple of each INSERT into `table`.
 * Structure is read from the masked text (comments and string contents blanked, offsets kept);
 * values are read from the source at the same offsets.
 * @returns {{ value: string, offset: number }[]}
 */
export function literalColumnValues(source, table, column) {
    const masked = stripSqlComments(source);
    const out = [];
    const re = insertRe(table);
    let m;
    while ((m = re.exec(masked)) !== null) {
        const cols = parseParenList(masked, m.index + m[0].length - 1);
        if (!cols) continue;
        const idx = cols.items.findIndex((c) => bare(c) === column.toLowerCase());
        let cursor = cols.end;
        const after = masked.slice(cursor).search(/\S/);
        const at = after === -1 ? masked.length : cursor + after;
        if (idx !== -1 && /^VALUES\b/i.test(masked.slice(at, at + 6))) {
            cursor = at + 6;
            for (;;) {
                const lead = masked.slice(cursor).search(/\S/);
                const open = lead === -1 ? -1 : cursor + lead;
                if (open === -1 || masked[open] !== '(') break;
                const tuple = parseParenList(masked, open);
                if (!tuple) break;
                const parts = splitTuple(masked, source, open, tuple.end);
                if (parts[idx]) out.push(parts[idx]);
                cursor = tuple.end;
                const sepLead = masked.slice(cursor).search(/\S/);
                const sep = sepLead === -1 ? -1 : cursor + sepLead;
                if (sep === -1 || masked[sep] !== ',') break;
                cursor = sep + 1;
            }
        }
        re.lastIndex = cursor;
    }
    return out;
}

/** IDs of EntityField rows a file inserts with a literal ID. */
export function createdFieldIDs(source) {
    const ids = new Set();
    for (const { value } of literalColumnValues(source, 'EntityField', 'ID')) {
        const m = UUID_LITERAL_RE.exec(value);
        if (m) ids.add(m[1].toLowerCase());
    }
    return ids;
}

/**
 * EntityFieldValue inserts in `source` whose literal EntityFieldID is not in `known`.
 * @returns {{ line: number, id: string }[]}
 */
export function unknownValueFieldIDs(source, known) {
    const hits = [];
    for (const { value, offset } of literalColumnValues(source, 'EntityFieldValue', 'EntityFieldID')) {
        const m = UUID_LITERAL_RE.exec(value);
        if (m && !known.has(m[1].toLowerCase())) hits.push({ line: lineOf(source, offset), id: m[1] });
    }
    return hits;
}

/**
 * Check `files` (names in `migrations/`, sorted by version) in order, learning field IDs as it goes.
 * @param {(name: string) => string} read
 * @param {Set<string>} report names whose hits are reported
 */
export function checkMigrations(files, read, report) {
    const known = new Set();
    const found = [];
    for (const name of [...files].sort()) {
        const source = read(name);
        for (const id of createdFieldIDs(source)) known.add(id);
        if (!report.has(name)) continue;
        for (const hit of unknownValueFieldIDs(source, known)) found.push({ file: name, ...hit });
    }
    return found;
}

function selfTest() {
    const FIELD = 'AAAAAAAA-0000-4000-8000-000000000001';
    const OTHER = 'BBBBBBBB-0000-4000-8000-000000000002';
    const efInsert = (id) => `INSERT INTO [\${mjSchema}].[EntityField] ([ID], [EntityID], [Name], [Sequence])
        VALUES ('${id}', 'CCCCCCCC-0000-4000-8000-000000000003', 'Status', (SELECT 1));`;
    const efvInsert = (id) => `INSERT INTO [\${mjSchema}].[EntityFieldValue]
        ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
        VALUES ('DDDDDDDD-0000-4000-8000-000000000004', '${id}', 1, 'Open', 'Open', GETUTCDATE(), GETUTCDATE());`;
    const cases = [
        ['value for a field created in the same file passes', { V202601010000__a: efInsert(FIELD) + efvInsert(FIELD) }, 0],
        ['value for a field created by an earlier file passes', { V202601010000__a: efInsert(FIELD), V202601020000__b: efvInsert(FIELD) }, 0],
        ['value for a field no migration creates is refused', { V202601010000__a: efInsert(FIELD), V202601020000__b: efvInsert(OTHER) }, 1],
        ['value for a field created only by a LATER file is refused', { V202601010000__a: efvInsert(FIELD), V202601020000__b: efInsert(FIELD) }, 1],
        ['a commented-out insert is ignored', { V202601010000__a: `/* ${efvInsert(OTHER)} */` }, 0],
        [
            'a variable or SELECT form passes',
            {
                V202601010000__a: `DECLARE @f UNIQUEIDENTIFIER;
INSERT INTO [\${mjSchema}].[EntityFieldValue] ([ID], [EntityFieldID], [Value]) VALUES ('DDDDDDDD-0000-4000-8000-000000000004', @f, 'Open');
INSERT INTO [\${mjSchema}].[EntityFieldValue] ([ID], [EntityFieldID], [Value]) SELECT NEWID(), ID, 'Open' FROM [\${mjSchema}].[EntityField];`,
            },
            0,
        ],
    ];
    let failed = 0;
    for (const [name, files, expected] of cases) {
        const names = Object.keys(files).map((k) => `${k}.sql`);
        const got = checkMigrations(names, (n) => files[n.replace(/\.sql$/, '')], new Set(names)).length;
        if (got !== expected) {
            failed++;
            console.error(`${RED}self-test FAIL${NC}: ${name} (expected ${expected}, got ${got})`);
        }
    }
    if (failed) process.exit(1);
    console.log(`${GREEN}self-test: ${cases.length} cases pass${NC}`);
}

function main() {
    const args = process.argv.slice(2);
    if (args[0] === '--self-test') return selfTest();
    const git = (a) => execFileSync('git', a, { encoding: 'utf8' }).trim();
    const root = git(['rev-parse', '--show-toplevel']);
    const dir = join(root, 'migrations');
    const files = readdirSync(dir).filter((f) => VERSIONED_RE.test(f));
    const read = (name) => readFileSync(join(dir, name), 'utf8');

    let report;
    const all = args[0] === '--all';
    if (all) {
        report = new Set(files);
    } else {
        const base = args[0] ?? git(['merge-base', process.env.BASE_REF ?? 'origin/next', 'HEAD']);
        const head = args[1];
        const changed = git(['-C', root, 'diff', '--name-only', '--diff-filter=AM', base, ...(head ? [head] : []), '--', 'migrations'])
            .split('\n')
            .filter(Boolean)
            .map((p) => p.replace(/^migrations\//, ''))
            .filter((f) => VERSIONED_RE.test(f));
        report = new Set(changed);
    }

    const hits = checkMigrations(files, read, report);
    for (const h of hits) {
        const msg =
            `migrations/${h.file}:${h.line}: EntityFieldValue for EntityFieldID '${h.id}', which no migration up to this one ` +
            `creates. Look the field up by entity and name at apply time instead.`;
        console.log(all ? `${YELLOW}${msg}${NC}` : `::error file=migrations/${h.file},line=${h.line}::${msg}`);
    }
    if (hits.length === 0) {
        console.log(`${GREEN}No EntityFieldValue insert names an EntityFieldID that no migration creates (${report.size} file(s) checked).${NC}`);
        return;
    }
    if (!all) process.exit(1);
    console.log(`${YELLOW}${hits.length} finding(s); --all is informational.${NC}`);
}

const isMain = (() => {
    try {
        return !!process.argv[1] && existsSync(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
    } catch {
        return false;
    }
})();
if (isMain) main();
