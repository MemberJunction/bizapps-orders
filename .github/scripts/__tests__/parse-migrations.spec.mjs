import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listMigrationFiles, prepareMigrationSql, SQLCMD_CANDIDATES, annotationFile } from '../parse-migrations.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

// gh-3. Fails today: listMigrationFiles is a bare `readdirSync(absDir).filter(...).sort()` with no
// try/catch, so a missing/mistyped --dir throws Node's raw ENOENT Error (code 'ENOENT', no mention
// of the --dir value the caller passed) instead of a descriptive, actionable message. Fixed by
// wrapping the readdirSync call and throwing a new Error that names dirArg and absDir.
test('a missing directory throws a descriptive error, not a raw ENOENT', () => {
    const missing = join(HERE, 'does-not-exist-fixture-dir');

    assert.throws(
        () => listMigrationFiles(missing, '--dir value from the caller'),
        (err) => {
            assert.notEqual(err.code, 'ENOENT', 'must not be the raw fs error');
            assert.match(err.message, /--dir value from the caller/, 'must name the --dir value the caller passed');
            assert.match(err.message, new RegExp(missing.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'must name the resolved path');
            return true;
        },
    );
});

// gh-4. Fails today: prepareMigrationSql substitutes Flyway placeholders and wraps the batch, but
// never strips a leading UTF-8 BOM (a real artifact of some Windows editors / `Out-File`). SQL
// Server's own parser sees the BOM as an illegal character, not whitespace, so syntactically valid
// SQL saved with a BOM is reported as a syntax error -- a false fail that would block a PR.
// The unit under test is exactly the text-preparation step; it needs no sqlcmd/DB connection
// (that connection-requiring path -- runner.execute() actually calling out to sqlcmd -- is not
// unit-testable per this repo's test conventions, which forbid touching the network or a DB from
// a test; only the real, reachable-Docker-DB repro the smoke hunt ran can exercise it end-to-end).
test('a leading UTF-8 BOM is stripped before the SQL is wrapped for sqlcmd', () => {
    const withBom = '﻿SELECT 1 AS [Test];\n';
    const wrapped = prepareMigrationSql(withBom, { defaultSchema: '__mj_BizAppsCommon', mjSchema: '__mj' });

    assert.ok(!wrapped.includes('﻿'), 'the BOM must not appear anywhere in the text sent to sqlcmd');
    assert.match(wrapped, /^SET PARSEONLY ON;\nGO\nSELECT 1 AS \[Test\];\n\nGO\n$/);
});

// The sqlcmd-list parity test against check-entityfield-drift.mjs lives in bizapps-common,
// the only repo that has that script. This shared copy keeps every other test.

test('the annotation file path uses the actual --dir, not a hardcoded migrations/ prefix', () => {
    assert.equal(annotationFile('./migrations', 'V202609281200__test.sql'), 'migrations/V202609281200__test.sql');
});

// Hardened in review round 2, item 5: an ABSOLUTE --dir must still produce a path RELATIVE to
// process.cwd(), because GitHub Actions will not turn an absolute file= path into a clickable
// annotation link. The default (relative --dir) is unaffected and stays 'migrations/<f>'.
test('an absolute --dir still emits a file path relative to process.cwd(), not absolute', () => {
    // A concrete, independently-computable case: a dir directly under cwd resolves to a plain
    // relative path, not a re-derivation of the implementation's own formula.
    const dirUnderCwd = join(process.cwd(), 'some-custom-fixtures-dir');
    assert.equal(
        annotationFile(dirUnderCwd, 'V202609281200__test.sql'),
        join('some-custom-fixtures-dir', 'V202609281200__test.sql'),
    );

    // General invariant for any absolute --dir, including one outside the repo entirely.
    assert.ok(
        !isAbsolute(annotationFile('/tmp/custom-fixtures', 'V202609281200__test.sql')),
        'GitHub will not link an absolute file= path',
    );
});
