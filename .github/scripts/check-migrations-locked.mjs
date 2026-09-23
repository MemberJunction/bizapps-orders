#!/usr/bin/env node
/**
 * check-migrations-locked.mjs
 *
 * A migration that is already on the base branch must not be changed. Not edited, not renamed, not
 * deleted.
 *
 * ── WHY ─────────────────────────────────────────────────────────────────────────
 * The runner records every applied migration with its version, script name and a checksum. Change
 * the file and the databases that already ran it refuse to migrate until somebody repairs the
 * history table by hand; the databases that never ran it get different SQL. The two populations
 * diverge, and nothing reports it — the schema a colleague ends up with depends on when they last
 * pulled. Fixing forward in a NEW file is the only operation that converges both.
 *
 * A RENAME IS NOT A LESSER CHANGE. The runner keys on the twelve-digit version in the filename, so
 * a renamed migration is a version nobody has run: it executes again, and plain DDL then fails on
 * objects that already exist. Because a run is one transaction, that failure rolls back everything
 * pending with it. Deleting is worse still — the migration silently stops existing for anyone who
 * has not run it.
 *
 * ── THE HOLE THIS CLOSES ────────────────────────────────────────────────────────
 * The predecessor of this check tested `git diff --diff-filter=M` only. A rename reports as `R` and
 * a deletion as `D`, so neither was seen; and a renamed file is not an addition either, so it also
 * slipped the timestamp check that runs beside it. Both gaps were reachable with an ordinary
 * `git mv`.
 *
 * Renumbering an UNMERGED migration is normal and stays allowed — the file is not on the base
 * branch, so it reads as an addition. What is refused is touching one that is.
 *
 * ── SCOPE ───────────────────────────────────────────────────────────────────────
 * CI form (`<base> <head>`): every `.sql` under `migrations/` that the branch modifies, renames or
 * deletes relative to the base. Local form (no arguments): the same against
 * `merge-base(BASE_REF, HEAD)`, so it answers before the push. `--self-test` exercises the detector
 * against real git repositories in a temp directory and exits non-zero if it stops catching any of
 * the three shapes.
 *
 * Usage (from anywhere inside the repository):
 *   node check-migrations-locked.mjs                 # local form
 *   node check-migrations-locked.mjs <base> <head>   # CI form
 *   node check-migrations-locked.mjs --self-test     # the detector's own fixtures
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const RED = '\x1b[0;31m';
const YELLOW = '\x1b[0;33m';
const DIM = '\x1b[2m';
const OFF = '\x1b[0m';

/** `git` in `cwd`, trimmed, never throwing on a non-zero exit we expect to read. */
function git(args, cwd = process.cwd()) {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/**
 * Migrations the branch changed rather than added, as `[{ Status, Path, From }]`.
 *
 * `-M` asks git to pair a deletion with an addition as a rename, which is what makes `R` reachable
 * at all; without it a `git mv` reads as `D` plus `A` and the addition would look legitimate.
 *
 * THE THREE-DOT IS LOAD-BEARING. `base...head` compares their MERGE BASE with head, i.e. what this
 * branch did. A two-dot `base head` compares the base's CURRENT TIP with head, which reports
 * everything the base gained since the branch last merged as though the branch had done it: a
 * migration added on `next` reads as `deleted` here, and one edited on `next` reads as `modified`.
 * Every branch that is merely behind would fail, which is both wrong and the kind of noise that
 * teaches people to merge past this check — the exact habit it exists to stop.
 */
export function ChangedLockedMigrations(base, head, cwd = process.cwd()) {
    const raw = git(['diff', '--diff-filter=MRD', '--name-status', '-M', `${base}...${head}`, '--', 'migrations/'], cwd);
    if (!raw) return [];
    return raw
        .split('\n')
        .map((line) => line.split('\t'))
        .filter(([status, a, b]) => {
            const touched = status?.startsWith('R') ? b : a;
            return touched?.endsWith('.sql');
        })
        .map(([status, a, b]) => (status.startsWith('R') ? { Status: 'renamed', Path: b, From: a } : { Status: status === 'D' ? 'deleted' : 'modified', Path: a, From: null }));
}

function report(found, baseLabel) {
    if (!found.length) {
        console.log(`${DIM}no migration on ${baseLabel} was modified, renamed or deleted${OFF}`);
        return 0;
    }
    console.error(`${RED}✗ migrations already on ${baseLabel} were changed${OFF}`);
    for (const f of found) {
        const what = f.From ? `${f.From} → ${f.Path}` : f.Path;
        console.error(`    ${YELLOW}${f.Status}${OFF}: ${what}`);
    }
    console.error('');
    console.error('A migration on the base branch is locked. Every database that ran it recorded its');
    console.error('checksum, so changing the file makes those databases refuse to migrate while the ones');
    console.error('that never ran it get different SQL. Renaming counts: the runner keys on the version in');
    console.error('the filename, so a renamed migration runs again against objects that already exist.');
    console.error('');
    console.error('Fix it forward in a NEW migration file.');
    console.error('');
    console.error('If this is genuinely unavoidable, say so in the PR description and get a second');
    console.error('reviewer. Do not merge past this check silently — it has happened, and it is how two');
    console.error('developers end up with different schemas from the same commit.');
    return 1;
}

/* ── Self-test ──────────────────────────────────────────────────────────────── */

function selfTest() {
    const root = mkdtempSync(join(tmpdir(), 'migrations-locked-'));
    const fail = [];
    const scenario = (name, mutate, expected) => {
        const dir = join(root, name);
        mkdirSync(join(dir, 'migrations'), { recursive: true });
        git(['init', '-q', '.'], dir);
        git(['config', 'user.email', 't@t'], dir);
        git(['config', 'user.name', 't'], dir);
        writeFileSync(join(dir, 'migrations', 'V202601010000__v1__A.sql'), 'CREATE TABLE a(i int);\n');
        writeFileSync(join(dir, 'migrations', 'V202601010001__v1__B.sql'), 'CREATE TABLE b(i int);\n');
        git(['add', '-A'], dir);
        git(['commit', '-qm', 'base'], dir);
        const base = git(['rev-parse', 'HEAD'], dir);
        mutate(dir);
        git(['add', '-A'], dir);
        git(['commit', '-qm', 'change'], dir);
        const got = ChangedLockedMigrations(base, git(['rev-parse', 'HEAD'], dir), dir).map((f) => f.Status).sort();
        const want = [...expected].sort();
        const ok = JSON.stringify(got) === JSON.stringify(want);
        console.log(`  ${ok ? '✓' : '✗'} ${name} — expected [${want}], got [${got}]`);
        if (!ok) fail.push(name);
    };

    console.log('self-test:');
    scenario('an edit to a merged migration is caught', (d) => writeFileSync(join(d, 'migrations', 'V202601010000__v1__A.sql'), 'CREATE TABLE a(i int, j int);\n'), ['modified']);
    scenario('a rename of a merged migration is caught', (d) => git(['mv', 'migrations/V202601010000__v1__A.sql', 'migrations/V202699010000__v1__A.sql'], d), ['renamed']);
    scenario('a deletion of a merged migration is caught', (d) => git(['rm', '-q', 'migrations/V202601010000__v1__A.sql'], d), ['deleted']);
    scenario('a brand-new migration is allowed', (d) => writeFileSync(join(d, 'migrations', 'V202699990000__v1__C.sql'), 'CREATE TABLE c(i int);\n'), []);
    scenario('a non-SQL file beside them is ignored', (d) => writeFileSync(join(d, 'migrations', '_README.md'), 'notes\n'), []);
    // The regression that made this check unusable before it shipped: comparing against the base's
    // TIP rather than the merge base reports everything the base gained as though the branch did it.
    {
        const dir = join(root, 'a-branch-merely-behind-is-clean');
        mkdirSync(join(dir, 'migrations'), { recursive: true });
        git(['init', '-q', '.'], dir);
        git(['config', 'user.email', 't@t'], dir);
        git(['config', 'user.name', 't'], dir);
        writeFileSync(join(dir, 'migrations', 'V202601010000__v1__A.sql'), 'CREATE TABLE a(i int);\n');
        git(['add', '-A'], dir);
        git(['commit', '-qm', 'base'], dir);
        git(['branch', 'feature'], dir);

        // The base moves on: one migration added, one edited.
        writeFileSync(join(dir, 'migrations', 'V202699990000__v1__Z.sql'), 'CREATE TABLE z(i int);\n');
        writeFileSync(join(dir, 'migrations', 'V202601010000__v1__A.sql'), 'CREATE TABLE a(i int, j int);\n');
        git(['add', '-A'], dir);
        git(['commit', '-qm', 'base moves on'], dir);
        const baseTip = git(['rev-parse', 'HEAD'], dir);

        // The branch, which touched no migration at all, only its own new one.
        git(['checkout', '-q', 'feature'], dir);
        writeFileSync(join(dir, 'migrations', 'V202699980000__v1__F.sql'), 'CREATE TABLE f(i int);\n');
        git(['add', '-A'], dir);
        git(['commit', '-qm', 'branch adds its own'], dir);

        const got = ChangedLockedMigrations(baseTip, git(['rev-parse', 'HEAD'], dir), dir).map((f) => f.Status);
        const ok = got.length === 0;
        console.log(`  ${ok ? '✓' : '✗'} a branch merely behind the base is clean — expected [], got [${got}]`);
        if (!ok) fail.push('a-branch-merely-behind-is-clean');
    }

    scenario('two at once are both reported', (d) => {
        writeFileSync(join(d, 'migrations', 'V202601010000__v1__A.sql'), 'CREATE TABLE a(i int, j int);\n');
        git(['mv', 'migrations/V202601010001__v1__B.sql', 'migrations/V202699010001__v1__B.sql'], d);
    }, ['modified', 'renamed']);

    rmSync(root, { recursive: true, force: true });
    if (fail.length) {
        console.error(`${RED}self-test failed: ${fail.join(', ')}${OFF}`);
        return 1;
    }
    console.log(`${DIM}self-test passed${OFF}`);
    return 0;
}

/* ── Entry ──────────────────────────────────────────────────────────────────── */

const args = process.argv.slice(2);
if (args[0] === '--self-test') {
    process.exit(selfTest());
}

if (args.length >= 2) {
    process.exit(report(ChangedLockedMigrations(args[0], args[1]), 'the base branch'));
}

const baseRef = process.env.BASE_REF || 'origin/next';
try {
    git(['rev-parse', '--verify', baseRef]);
} catch {
    console.error(`${RED}cannot resolve ${baseRef}; pass <base> <head> explicitly${OFF}`);
    process.exit(2);
}
process.exit(report(ChangedLockedMigrations(baseRef, 'HEAD'), baseRef));
