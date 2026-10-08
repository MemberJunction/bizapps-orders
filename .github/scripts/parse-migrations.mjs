#!/usr/bin/env node
/**
 * parse-migrations.mjs
 *
 * Verifies that all T-SQL migrations in migrations/ are syntactically valid
 * by compiling them on SQL Server with SET PARSEONLY ON.
 *
 * Catches unclosed quotation marks (e.g. unescaped single quotes like "item's"),
 * invalid keyword placement, unbalanced parentheses, and malformed T-SQL batches
 * that textual lints cannot detect.
 *
 * SET PARSEONLY ON checks syntax without object name resolution (unlike SET NOEXEC ON,
 * which compiles batches and fails when views/SPs reference tables created in earlier batches).
 */

import { execFileSync, execSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync, unlinkSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve, relative } from 'node:path';
import { tmpdir } from 'node:os';

const host = process.env.DB_HOST || 'localhost';
const port = process.env.DB_PORT || '1433';
const user = process.env.DB_USERNAME || 'sa';
const password = process.env.DB_PASSWORD || 'KRiUffvIjuP5GoLtxYvVkWIQ1BxHQEEMO7j4T684oPR7';

/**
 * gh-5: standard sqlcmd install locations to fall back to when `sqlcmd` isn't on PATH. Kept
 * aligned with check-entityfield-drift.mjs's identical list -- the two scripts share the same
 * stated purpose (find sqlcmd), so a location one resolves and the other doesn't is a bug, not a
 * platform difference.
 */
export const SQLCMD_CANDIDATES = [
    'sqlcmd',
    '/opt/mssql-tools18/bin/sqlcmd',
    '/opt/mssql-tools/bin/sqlcmd',
    '/usr/local/bin/sqlcmd',
    '/opt/homebrew/bin/sqlcmd',
];

function findExecutionMethod() {
    for (const c of SQLCMD_CANDIDATES) {
        try {
            execSync(`${c} -?`, { stdio: 'ignore' });
            return {
                type: 'local',
                cmd: c,
                execute: (sql) => {
                    const tempFile = join(tmpdir(), `parse_${Date.now()}_${Math.random().toString(36).slice(2)}.sql`);
                    try {
                        writeFileSync(tempFile, sql, 'utf8');
                        execFileSync(c, [
                            '-S', `${host},${port}`,
                            '-U', user,
                            '-P', password,
                            '-C',
                            '-b',
                            '-i', tempFile
                        ], { stdio: 'pipe' });
                    } finally {
                        try { unlinkSync(tempFile); } catch {}
                    }
                }
            };
        } catch {
            // try next
        }
    }

    return null;
}

/**
 * gh-4: Prepare a migration file's raw text for sqlcmd: substitute Flyway placeholders and wrap
 * the batch in SET PARSEONLY ON.
 */
export function prepareMigrationSql(sql, { defaultSchema, mjSchema }) {
    // A leading UTF-8 BOM is an encoding artifact (Windows editors, PowerShell Out-File), not SQL
    // content: SQL Server's parser treats it as an illegal character rather than whitespace, so it
    // would report a syntax error on otherwise-valid SQL. Only the LEADING byte is the artifact --
    // a BOM character elsewhere in the file is real content and must be left alone.
    if (sql.charCodeAt(0) === 0xFEFF) sql = sql.slice(1);
    sql = sql.replace(/\$\{flyway:defaultSchema\}/g, defaultSchema);
    sql = sql.replace(/\$\{mjSchema\}/g, mjSchema);
    return `SET PARSEONLY ON;\nGO\n${sql}\nGO\n`;
}

/**
 * gh-3: Migration filenames in `absDir`, sorted. Throws a descriptive Error naming the --dir
 * value (never a raw ENOENT) when the directory can't be read, so a missing/mistyped --dir (or
 * running from the wrong cwd, so the default ./migrations doesn't exist) is diagnosable.
 */
export function listMigrationFiles(absDir, dirArg) {
    let entries;
    try {
        entries = readdirSync(absDir);
    } catch (err) {
        throw new Error(`Could not read migration directory '${dirArg}' (resolved to '${absDir}'): ${err.message}`);
    }
    return entries.filter((f) => f.endsWith('.sql')).sort();
}

/**
 * gh-6: The `file=` path for a GitHub Actions ::error:: annotation on `file`, found under `dirArg`
 * (the --dir the caller actually passed) -- never a hardcoded 'migrations/' prefix, which points at
 * a path that doesn't exist once --dir is anything other than the default. Reported relative to
 * process.cwd(): GitHub Actions annotations only link a repo-relative path, so an absolute --dir
 * (round 2, item 5) must still be reported relative to where the workflow step runs, not absolute.
 */
export function annotationFile(dirArg, file) {
    return relative(process.cwd(), join(dirArg, file));
}

function main() {
    const isSelfTest = process.argv.includes('--self-test');
    const dir = process.argv.find((_, i, arr) => arr[i - 1] === '--dir') || './migrations';
    const defaultSchema = process.argv.find((_, i, arr) => arr[i - 1] === '--schema') || '__mj_BizAppsCommon';
    const mjSchema = process.argv.find((_, i, arr) => arr[i - 1] === '--core-schema') || '__mj';

    const runner = findExecutionMethod();
    if (!runner) {
        console.error('::error::sqlcmd utility was not found in PATH or standard locations.');
        process.exit(1);
    }

    if (isSelfTest) {
        console.log(`Running parse-migrations self-test (via ${runner.cmd})...`);
        // Valid batch test
        try {
            runner.execute('SET PARSEONLY ON;\nGO\nSELECT 1 AS [Test];\nGO\n');
        } catch (e) {
            console.error('Self-test failed on valid SQL:', e.message);
            process.exit(1);
        }

        // Invalid batch test
        let failedAsExpected = false;
        try {
            runner.execute("SET PARSEONLY ON;\nGO\nPRINT 'item's';\nGO\n");
        } catch (err) {
            failedAsExpected = true;
            const msg = err.stdout?.toString() || err.stderr?.toString() || err.message;
            console.log('✓ Self-test caught invalid syntax as expected:\n  ' + msg.trim().split('\n')[0]);
        }
        if (!failedAsExpected) {
            console.error('Self-test failed: syntax error was not caught!');
            process.exit(1);
        }

        console.log('✓ parse-migrations self-test passed');
        return;
    }

    const absDir = resolve(dir);
    let files;
    try {
        files = listMigrationFiles(absDir, dir);
    } catch (err) {
        console.error(`::error::${err.message}`);
        process.exit(1);
    }

    if (files.length === 0) {
        console.error(`::error::No migration files found in ${dir} to parse!`);
        process.exit(1);
    }

    console.log(`Checking ${files.length} migration files in ${dir} with SQL Server SET PARSEONLY ON (via ${runner.cmd})...`);

    let parsedCount = 0;
    for (const file of files) {
        const filePath = join(absDir, file);
        const sql = readFileSync(filePath, 'utf8');
        const wrapped = prepareMigrationSql(sql, { defaultSchema, mjSchema });

        try {
            runner.execute(wrapped);
            parsedCount++;
        } catch (err) {
            const output = err.stdout?.toString() || err.stderr?.toString() || err.message;
            console.error(`\n::error file=${annotationFile(dir, file)}::Syntax error parsing ${file}:\n${output.trim()}\n`);
            process.exit(1);
        }
    }

    console.log(`✓ All ${parsedCount} migration files parsed cleanly by SQL Server (no syntax errors)`);
}

/** True when this module is the process entry point, so importing it (e.g. from a test) never
 *  runs the CLI -- no self-test, no runner detection, no sqlcmd invocation as a side effect. */
function isEntryPoint() {
    if (!process.argv[1]) return false;
    try {
        return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
    } catch {
        return false;
    }
}

if (isEntryPoint()) {
    main();
}
