#!/usr/bin/env node
/**
 * Build-time gate on `migrations-pg/` — the directory MemberJunction runs VERBATIM on a
 * PostgreSQL host.
 *
 * ── WHY THIS RUNS DURING THE BUILD ────────────────────────────────────────────────────────────
 * `install-orchestrator`'s `DownloadAppMigrations` appends `-pg` to the manifest's migrations
 * directory on a PostgreSQL host and executes what it finds there through `skyway-postgres`, which
 * issues raw `pool.query` calls. There is no conversion step at install time and no rewrite layer:
 * whatever is committed here is what runs on a customer's database.
 *
 * That makes PostgreSQL parity a property of the ARTIFACT, not of the deployment. The build is the
 * last moment it can be checked before the artifact exists, so it is checked here and nowhere
 * else — not at install, not at runtime, where the only remaining outcome is a half-applied
 * schema. Migrations are forward-only: a PG migration that fails midway leaves a database that
 * cannot roll back and cannot roll forward.
 *
 * ── TWO CHECKS ────────────────────────────────────────────────────────────────────────────────
 *   1. PARITY  — every `migrations/*.sql` has a counterpart in `migrations-pg/`.
 *   2. VALIDITY — no committed `.pg.sql` contains T-SQL or a converter failure marker.
 *
 * Check 2 exists because check 1 is trivially satisfiable by committing raw `mj migrate convert`
 * output, and that output is not shippable. In `bizapps-caliber`, ten converted files were
 * committed carrying T-SQL the converter had failed to translate — 133 `"EXEC"` calls,
 * quoted-identifier `"THROW"`, `DECLARE @` blocks, T-SQL `UPDATE alias SET alias.col … FROM …
 * JOIN`, and in three places the converter's own `-- Could not parse:` marker left inline. Each is
 * a hard syntax error on PostgreSQL. Parity was satisfied; the install was worse than before.
 *
 * The converter is a starting point. Its output is hand-finished and replayed against a real
 * PostgreSQL instance before it is committed.
 *
 * ── CONVENTIONS ───────────────────────────────────────────────────────────────────────────────
 *   migrations/X.sql            → migrations-pg/X.pg.sql        the ordinary port
 *   migrations/X.sql            → migrations-pg/X.pgonly.sql    port that is deliberately
 *                                 (or X.pg-only.sql)            PG-specific rather than a
 *                                                               translation
 *   migrations-pg/Y.pgonly.sql  with no migrations/Y.sql        a PG-only migration (CodeGen
 *                                                               plpgsql baked in by hand); allowed
 *                                                               and NOT reported as drift
 *   migrations/codegen/*.sql                                    SQL Server CodeGen capture; not a
 *                                                               migration, never ported
 *
 * ── DEBT ──────────────────────────────────────────────────────────────────────────────────────
 * A repo mid-port may record unported files in `migrations-pg/.pg-parity-allow.json`:
 *
 *     { "reason": "…", "unported": ["V2026…__Thing.sql"] }
 *
 * Entries are DEBT, made visible rather than silent. Removing one means writing the port and
 * replaying it. Adding one is not a way to skip that work, and should be challenged in review.
 * The file is absent in a repo at full parity, which is the intended resting state.
 *
 * Usage:  node scripts/check-pg-parity.mjs [--json]
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MSSQL_DIR = path.join(REPO_ROOT, 'migrations');
const PG_DIR = path.join(REPO_ROOT, 'migrations-pg');
const ALLOW_FILE = path.join(PG_DIR, '.pg-parity-allow.json');

/**
 * Constructs that are valid T-SQL and invalid PostgreSQL, each with the error a host would hit.
 *
 * Every pattern here was observed in a committed file, not imagined — this list is a record of
 * what the converter actually emits when it gives up.
 */
export const FORBIDDEN = [
    {
        name: 'converter failure marker',
        pattern: /Could not parse:/i,
        why: 'the converter gave up and left the untranslated statement inline',
        // Scanned in the RAW text, not the executable subset. The converter emits this marker as a
        // COMMENT, so stripping comments first would make the rule unfirable. It is a provenance
        // signal, not a syntax construct: its presence means a human never finished the port,
        // whatever the surrounding SQL looks like.
        scanRaw: true,
    },
    {
        name: 'EXEC of a stored procedure',
        pattern: /\bEXEC\b|"EXEC"/i,
        why: 'PostgreSQL has no EXEC; observed as `syntax error at or near "EXEC"`',
    },
    {
        name: 'THROW',
        pattern: /"THROW"|\bTHROW\s+\d/i,
        why: 'T-SQL THROW; PostgreSQL needs RAISE EXCEPTION',
    },
    {
        name: 'T-SQL variable declaration',
        pattern: /\bDECLARE\s+@/i,
        why: 'PostgreSQL has no @variables; needs a DO $$ DECLARE block',
    },
    {
        name: 'bracket-quoted identifier',
        pattern: /\[(?:__mj|ID|Name|Entity)\]/,
        why: 'PostgreSQL quotes identifiers with double quotes, not brackets',
    },
    {
        name: 'GO batch separator',
        pattern: /^GO\s*$/m,
        why: 'GO is a SQL Server client construct and is a syntax error to the PG driver',
    },
    {
        name: 'T-SQL UPDATE ... FROM with alias-qualified SET',
        pattern: /\bUPDATE\s+\w+\s+SET\s+\w+\./i,
        why: 'observed as `ERROR: relation "f" does not exist`; PostgreSQL UPDATE targets the table, not an alias',
    },
    {
        name: 'untranslated T-SQL builtin',
        // A quoted ALL-CAPS identifier used as a FUNCTION CALL — `"JSON_MODIFY"(...)` — is the
        // converter's signature for a builtin it could not translate: it fell back to quoting the
        // name, producing a call to a function that does not exist in PostgreSQL. Matching the
        // SHAPE rather than a list of known functions means the next one is caught too.
        pattern: /"[A-Z][A-Z0-9_]{2,}"\s*\(/,
        why: 'the converter quoted a T-SQL builtin it could not translate; the function does not exist in PostgreSQL',
    },
];

/**
 * Reduce a file to the text a PostgreSQL parser would treat as SYNTAX — dropping comments and the
 * CONTENTS of string literals, while keeping the literals' delimiters so statements stay shaped.
 *
 * Both exclusions matter, and each was found the same way — by the checker being wrong about a
 * real file:
 *
 *   • Comments. A hand-ported migration legitimately DISCUSSES the T-SQL it replaced. Matching
 *     inside comments would fail a correct file, or pressure someone into deleting the
 *     explanation.
 *   • String contents. A seeded description or prompt may contain the word EXEC or a `--`.
 *     Literal data cannot produce a syntax error, so scanning it only produces false alarms — and
 *     a gate that cries wolf gets switched off.
 */
export function stripNonExecutable(sql) {
    let out = '';
    let inLine = false;
    let inBlock = false;
    let inString = false;
    let dollarTag = null;

    for (let i = 0; i < sql.length; i++) {
        const c = sql[i];
        const next = sql[i + 1];

        if (inLine) {
            if (c === '\n') { inLine = false; out += c; }
            continue;
        }
        if (inBlock) {
            if (c === '*' && next === '/') { inBlock = false; i++; }
            continue;
        }
        if (inString) {
            if (c === "'") { inString = false; out += c; }
            continue;
        }

        // Dollar-quoting makes a BARE apostrophe legal PostgreSQL, so a scanner that only knows
        // '…' quoting inverts its polarity at the first one inside a function body and swallows
        // everything after it as "literal" — masking real T-SQL. A gate that fails OPEN is worse
        // than no gate, because it is believed.
        //
        // $tag$ delimiters are skipped as TOKENS; the body between them is scanned by this same
        // loop as ordinary SQL. Both extremes were wrong: skipping the body hid 133 EXEC calls,
        // because converter output puts its untranslated T-SQL inside `DO $$ … $$`; scanning it
        // while ignoring quotes failed correct files that record the original T-SQL error number
        // as `RAISE … DETAIL = 'THROW 50010'` — a string, not a statement.
        if (c === '$' && !inString) {
            const tag = /^\$[A-Za-z_]*\$/.exec(sql.slice(i));
            if (tag && (dollarTag === null || dollarTag === tag[0])) {
                dollarTag = dollarTag === null ? tag[0] : null;
                i += tag[0].length - 1;
                continue;
            }
        }
        if (c === "'") { inString = true; out += c; continue; }
        if (c === '-' && next === '-') { inLine = true; continue; }
        if (c === '/' && next === '*') { inBlock = true; i++; continue; }
        out += c;
    }

    // Postcondition. Ending mid-string or mid-body means the scan lost track of what is code, and
    // everything after that point was discarded unexamined. Refusing is the only honest answer:
    // the alternative is reporting "clean" about text never inspected.
    if (inString || dollarTag || inBlock) {
        throw new Error(
            `Could not determine where SQL ends and literals begin (ended ` +
                `${dollarTag ? `inside a ${dollarTag} body` : inString ? 'inside a string literal' : 'inside a block comment'}). ` +
                `This file has NOT been checked.`,
        );
    }
    return out;
}

/** Every forbidden construct present in a file's executable SQL. */
export function findForbidden(sql) {
    let executable;
    try {
        executable = stripNonExecutable(sql);
    } catch (error) {
        // Failing to delimit literals is itself a finding — but scan the RAW text as well rather
        // than reporting only that. A file that cannot be parsed is usually a file full of the
        // very constructs this gate exists to reject, and naming them is far more useful to
        // whoever has to fix it than "unparseable". False positives are acceptable here: the file
        // is already being refused.
        return [
            { name: 'unparseable', why: error.message },
            ...FORBIDDEN.filter((rule) => rule.pattern.test(sql)).map((rule) => ({ name: rule.name, why: rule.why })),
        ];
    }
    return FORBIDDEN.filter((rule) => rule.pattern.test(rule.scanRaw ? sql : executable)).map((rule) => ({
        name: rule.name,
        why: rule.why,
    }));
}

/** Strips the PG suffix from a counterpart filename, yielding the SQL Server basename it ports. */
function pgBase(file) {
    return file.replace(/\.pg\.sql$/, '').replace(/\.pg-?only\.sql$/, '');
}

/** SQL Server migrations with no committed PostgreSQL counterpart, excluding recorded debt. */
export function findUnported(mssqlFiles, pgFiles, allowed = new Set()) {
    const ported = new Set(pgFiles.map(pgBase));
    return mssqlFiles.filter((f) => !allowed.has(f)).filter((f) => !ported.has(f.replace(/\.sql$/, '')));
}

/** Top-level `.sql` files only — `migrations/codegen/` is a capture directory, not migrations. */
function listSql(dir) {
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
        .filter((f) => f.endsWith('.sql'))
        .filter((f) => statSync(path.join(dir, f)).isFile())
        .sort();
}

function readAllowlist() {
    if (!existsSync(ALLOW_FILE)) return { reason: null, unported: new Set() };
    const raw = JSON.parse(readFileSync(ALLOW_FILE, 'utf8'));
    if (!Array.isArray(raw.unported)) {
        throw new Error(`${path.relative(REPO_ROOT, ALLOW_FILE)} must contain an "unported" array`);
    }
    return { reason: raw.reason ?? null, unported: new Set(raw.unported) };
}

function main() {
    const json = process.argv.includes('--json');

    // No migrations directory means there is nothing that COULD be out of parity. This is a real
    // state for a repo that ships no schema, and passing is correct rather than fail-open.
    if (!existsSync(MSSQL_DIR)) {
        if (json) console.log(JSON.stringify({ ok: true, skipped: 'no migrations/ directory' }));
        else console.log('PG parity: no migrations/ directory — nothing to check.');
        return;
    }

    const mssqlFiles = listSql(MSSQL_DIR);
    const pgFiles = listSql(PG_DIR);
    const allow = readAllowlist();

    // A migrations/ directory that exists but holds nothing means this gate inspected nothing. It
    // has not passed; it has failed to run.
    if (mssqlFiles.length === 0) {
        console.error('::error::migrations/ exists but contains no .sql files — this gate inspected nothing, so it has not passed.');
        process.exit(1);
    }

    const problems = [];

    for (const file of pgFiles) {
        for (const v of findForbidden(readFileSync(path.join(PG_DIR, file), 'utf8'))) {
            problems.push({ kind: 'invalid', file: `migrations-pg/${file}`, detail: `Contains ${v.name} — ${v.why}` });
        }
    }

    const schemaHint = process.env.PG_PARITY_SCHEMA ?? '<app schema>';
    for (const file of findUnported(mssqlFiles, pgFiles, allow.unported)) {
        problems.push({
            kind: 'unported',
            file: `migrations/${file}`,
            detail:
                `No PostgreSQL counterpart. Expected migrations-pg/${file.replace(/\.sql$/, '.pg.sql')}. ` +
                `Start with \`mj migrate convert --file ${file} --source-dir migrations --output-dir migrations-pg ` +
                `--schema ${schemaHint}\`, then FINISH the port by hand and replay it against a real PostgreSQL ` +
                `instance. Do not commit raw converter output.`,
        });
    }

    if (json) {
        console.log(JSON.stringify({ ok: problems.length === 0, mssql: mssqlFiles.length, pg: pgFiles.length, problems }, null, 2));
        process.exit(problems.length === 0 ? 0 : 1);
    }

    for (const p of problems) console.error(`::error file=${p.file}::${p.detail}`);

    if (problems.length > 0) {
        console.error(
            `\nmigrations-pg/ is what MemberJunction runs verbatim on a PostgreSQL host — there is no ` +
                `conversion at install time, and migrations are forward-only. Shipping this artifact would ` +
                `half-apply on every PostgreSQL tenant.`,
        );
        process.exit(1);
    }

    const debt = allow.unported.size > 0 ? `, ${allow.unported.size} recorded as debt` : '';
    console.log(
        `PG parity OK — ${mssqlFiles.length} migration(s), ${pgFiles.length} PostgreSQL file(s) containing no T-SQL${debt}.`,
    );
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
    main();
}
