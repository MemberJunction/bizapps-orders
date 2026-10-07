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
import { readdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const isSelfTest = process.argv.includes('--self-test');
const dir = process.argv.find((_, i, arr) => arr[i - 1] === '--dir') || './migrations';
const defaultSchema = process.argv.find((_, i, arr) => arr[i - 1] === '--schema') || '__mj_BizAppsCommon';
const mjSchema = process.argv.find((_, i, arr) => arr[i - 1] === '--core-schema') || '__mj';

const host = process.env.DB_HOST || 'localhost';
const port = process.env.DB_PORT || '1433';
const user = process.env.DB_USERNAME || 'sa';
const password = process.env.DB_PASSWORD || 'KRiUffvIjuP5GoLtxYvVkWIQ1BxHQEEMO7j4T684oPR7';

function findExecutionMethod() {
    const candidates = [
        'sqlcmd',
        '/opt/mssql-tools18/bin/sqlcmd',
        '/opt/mssql-tools/bin/sqlcmd',
        '/usr/local/bin/sqlcmd',
    ];
    for (const c of candidates) {
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
    process.exit(0);
}

const absDir = resolve(dir);
const files = readdirSync(absDir).filter(f => f.endsWith('.sql')).sort();

if (files.length === 0) {
    console.error(`::error::No migration files found in ${dir} to parse!`);
    process.exit(1);
}

console.log(`Checking ${files.length} migration files in ${dir} with SQL Server SET PARSEONLY ON (via ${runner.cmd})...`);

let parsedCount = 0;
for (const file of files) {
    const filePath = join(absDir, file);
    let sql = readFileSync(filePath, 'utf8');

    // Substitute Flyway placeholders
    sql = sql.replace(/\$\{flyway:defaultSchema\}/g, defaultSchema);
    sql = sql.replace(/\$\{mjSchema\}/g, mjSchema);

    // Prepend SET PARSEONLY ON in its own batch, followed by migration content
    const wrapped = `SET PARSEONLY ON;\nGO\n${sql}\nGO\n`;

    try {
        runner.execute(wrapped);
        parsedCount++;
    } catch (err) {
        const output = err.stdout?.toString() || err.stderr?.toString() || err.message;
        console.error(`\n::error file=migrations/${file}::Syntax error parsing ${file}:\n${output.trim()}\n`);
        process.exit(1);
    }
}

console.log(`✓ All ${parsedCount} migration files parsed cleanly by SQL Server (no syntax errors)`);
