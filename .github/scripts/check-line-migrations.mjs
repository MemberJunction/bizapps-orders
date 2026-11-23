#!/usr/bin/env node
// ==============================================================================
// Line migrations: what a PR into a release line may do to migrations/, migrations-pg/ and metadata/
//
// Every open line carries the same migrations as `next`, as the same files with the same
// timestamps, apart from `next`'s edge-only ones. That is what lets a host move from one line to
// the next without `mj migrate` refusing an out-of-order run (guides/RELEASE_LINES.md).
//
// OPEN line. After the PR:
//   1. every migration on the line exists on `next` with identical content (no line-only
//      migration, no edited copy);
//   2. no edge-only migration is on the line;
//   3. the PR adds no migration older than the line's newest before the PR. The line's hosts
//      have run that one, and `mj migrate` refuses an older version (outOfOrder is off).
//   The line may skip any of `next`'s migrations. It need not follow `next`'s order: when hosts
//   move to a new line, `next`'s migrations are re-stamped after the old line's
//   (guides/RELEASE_LINES.md, "Moving to a new line").
//
// LTS line. The PR adds, changes or removes no file under migrations/, migrations-pg/ or
// metadata/ (README files aside), and its changesets carry no minor or major bump. A frozen line's
// hosts are already behind a newer line's migrations, so any new migration would be out of order.
//
// Usage:  node check-line-migrations.mjs --branch lts/6.2 [--base <merge-base sha>] [--next origin/next]
//         node check-line-migrations.mjs --self-test
// ==============================================================================
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LoadRecordFromRef, ResolveBranch } from './release-lines.mjs';

const MIGRATION_DIRS = ['migrations', 'migrations-pg'];
const FROZEN_DIRS = ['migrations', 'migrations-pg', 'metadata'];
const STAMP = /^V(\d{12})__/;

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
}

/** `{ path: blobSha }` for every .sql file under the migration folders at `ref`. */
export function MigrationsAt(ref, cwd) {
  const out = {};
  for (const dir of MIGRATION_DIRS) {
    let listing = '';
    try {
      listing = git(['ls-tree', '-r', ref, '--', `${dir}/`], cwd);
    } catch {
      continue;
    }
    for (const row of listing.split('\n')) {
      const m = /^\d+ blob ([0-9a-f]+)\t(.+)$/.exec(row);
      if (m && m[2].endsWith('.sql') && STAMP.test(m[2].split('/').pop())) {
        out[m[2]] = m[1];
      }
    }
  }
  return out;
}

/** The migration's identity across SQL Server and PostgreSQL: its file name without `.pg.sql` / `.sql`. */
export function Stem(path) {
  return path.split('/').pop().replace(/\.pg\.sql$|\.sql$/, '');
}

function stamp(path) {
  return STAMP.exec(path.split('/').pop())?.[1] ?? '0';
}

/** Problems for an OPEN line: the line after the PR (`line`), `next`, and the line before the PR (`before`). */
export function CheckOpenLine(line, next, edgeOnly, before) {
  const problems = [];
  const edge = new Set(edgeOnly.map(Stem));
  for (const [path, blob] of Object.entries(line)) {
    if (edge.has(Stem(path))) {
      problems.push(`${path} is edge-only (release-lines.json next.edgeOnlyMigrations): it needs the upcoming MJ version and stays off every line until the next cut.`);
    } else if (!(path in next)) {
      problems.push(`${path} is not on next. Every migration lands on next first; backport next's file.`);
    } else if (next[path] !== blob) {
      problems.push(`${path} differs from next's copy. A shared migration is the same file on every line; backport next's version.`);
    }
  }
  const newest = Object.keys(before).map(stamp).sort().at(-1) ?? '0';
  for (const path of Object.keys(line).sort()) {
    if (!(path in before) && stamp(path) <= newest) {
      problems.push(`${path} is older than this line's newest migration (V${newest}). The line's hosts have run that one, so \`mj migrate\` would refuse this as out of order. Re-stamp it on next after V${newest} before backporting, or leave it off the line.`);
    }
  }
  return problems;
}

/** Problems for an LTS line: the paths this PR touches under frozen folders, and its changesets. */
export function CheckLtsLine(changedPaths, addedChangesets) {
  const problems = [];
  for (const path of changedPaths) {
    if (FROZEN_DIRS.some((d) => path.startsWith(`${d}/`)) && !path.toLowerCase().endsWith('.md')) {
      problems.push(`${path}: an LTS line takes code fixes only. No migration or metadata change may land on it; a host that needs one moves to the next line.`);
    }
  }
  for (const { path, text } of addedChangesets) {
    const front = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? '';
    if (/:\s*['"]?(minor|major)['"]?\s*$/m.test(front)) {
      problems.push(`${path}: an LTS line releases patches only. Make this changeset a patch.`);
    }
  }
  return problems;
}

function option(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function main(args) {
  const branch = option(args, '--branch');
  const nextRef = option(args, '--next') ?? 'origin/next';
  const base = option(args, '--base');
  const record = LoadRecordFromRef(nextRef);
  if (!record) {
    console.error(`✗ no release-lines.json at ${nextRef}. Fetch it first: git fetch --no-tags origin next`);
    return 2;
  }
  const line = ResolveBranch(record, branch);
  if (!line) {
    console.log(`::error::${branch} is not a line in release-lines.json on next.`);
    return 1;
  }
  let problems;
  if (!base) {
    console.error('✗ a line needs --base <merge-base sha> to know what this PR changed');
    return 2;
  }
  if (line.status === 'open') {
    problems = CheckOpenLine(MigrationsAt('HEAD'), MigrationsAt(nextRef), record.next?.edgeOnlyMigrations ?? [], MigrationsAt(base));
  } else {
    const changed = git(['diff', '--name-only', base, 'HEAD']).split('\n').filter(Boolean);
    const added = git(['diff', '--name-only', '--diff-filter=A', base, 'HEAD', '--', '.changeset/']).split('\n')
      .filter((p) => p.endsWith('.md') && !p.endsWith('README.md'))
      .map((p) => ({ path: p, text: git(['show', `HEAD:${p}`]) }));
    problems = CheckLtsLine(changed, added);
  }
  for (const p of problems) {
    console.log(`::error::${p}`);
  }
  if (problems.length > 0) {
    return 1;
  }
  console.log(line.status === 'open'
    ? `✓ The ${line.key} line's migrations are next's, none older than the line's newest was added, and none is edge-only`
    : `✓ The ${line.key} line is LTS and this PR changes no migration or metadata and bumps no minor`);
  return 0;
}

// ---------------------------------------------------------------------------
// Self-test
// ---------------------------------------------------------------------------
function selfTest() {
  const cases = [
    ['an open line equal to next passes', CheckOpenLine({ 'migrations/V202601010000__a.sql': 'x' }, { 'migrations/V202601010000__a.sql': 'x' }, [], {}), 0],
    ['an open line behind next passes (newer ones come with later backports)', CheckOpenLine(
      { 'migrations/V202601010000__a.sql': 'x' },
      { 'migrations/V202601010000__a.sql': 'x', 'migrations/V202602010000__b.sql': 'y' }, [], {}), 0],
    ['a line-only migration fails', CheckOpenLine({ 'migrations/V202601010000__a.sql': 'x' }, {}, [], {}), 1],
    ['an edited copy fails', CheckOpenLine({ 'migrations/V202601010000__a.sql': 'x' }, { 'migrations/V202601010000__a.sql': 'z' }, [], {}), 1],
    ['skipping an older next migration passes', CheckOpenLine(
      { 'migrations/V202601010000__a.sql': 'x', 'migrations/V202603010000__c.sql': 'z' },
      { 'migrations/V202601010000__a.sql': 'x', 'migrations/V202602010000__b.sql': 'y', 'migrations/V202603010000__c.sql': 'z' }, [],
      { 'migrations/V202601010000__a.sql': 'x' }), 0],
    ['adding a migration older than the line\'s newest fails', CheckOpenLine(
      { 'migrations/V202602010000__b.sql': 'y', 'migrations/V202603010000__c.sql': 'z' },
      { 'migrations/V202602010000__b.sql': 'y', 'migrations/V202603010000__c.sql': 'z' }, [],
      { 'migrations/V202603010000__c.sql': 'z' }), 1],
    ['adding two migrations newer than the line\'s newest passes', CheckOpenLine(
      { 'migrations/V202601010000__a.sql': 'x', 'migrations/V202602010000__b.sql': 'y', 'migrations-pg/V202602010000__b.pg.sql': 'p' },
      { 'migrations/V202601010000__a.sql': 'x', 'migrations/V202602010000__b.sql': 'y', 'migrations-pg/V202602010000__b.pg.sql': 'p' }, [],
      { 'migrations/V202601010000__a.sql': 'x' }), 0],
    ['an edge-only migration on a line fails', CheckOpenLine(
      { 'migrations/V202602010000__b.sql': 'y' }, { 'migrations/V202602010000__b.sql': 'y' }, ['V202602010000__b.sql'], {}), 1],
    ['LTS: a code fix passes', CheckLtsLine(['packages/Core/src/a.ts'], []), 0],
    ['LTS: a migration fails', CheckLtsLine(['migrations/V202601010000__a.sql'], []), 1],
    ['LTS: a metadata change fails', CheckLtsLine(['metadata/tasks/.tasks.json'], []), 1],
    ['LTS: a metadata README passes', CheckLtsLine(['metadata/tasks/README.md'], []), 0],
    ['LTS: a minor changeset fails', CheckLtsLine([], [{ path: '.changeset/a.md', text: "---\n'@mj-biz-apps/tasks-core': minor\n---\n\nx" }]), 1],
    ['LTS: a patch changeset passes', CheckLtsLine([], [{ path: '.changeset/a.md', text: "---\n'@mj-biz-apps/tasks-core': patch\n---\n\nx" }]), 0],
  ];
  let failed = 0;
  for (const [name, problems, want] of cases) {
    const ok = (problems.length > 0 ? 1 : 0) === want;
    failed += ok ? 0 : 1;
    console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — got ${problems.length} problem(s): ${problems.join(' | ')}`}`);
  }
  // MigrationsAt against a real repository: reads both folders, ignores non-migrations.
  const dir = mkdtempSync(join(tmpdir(), 'line-migrations-'));
  try {
    git(['init', '-q'], dir);
    mkdirSync(join(dir, 'migrations'));
    mkdirSync(join(dir, 'migrations-pg'));
    writeFileSync(join(dir, 'migrations', 'V202601010000__a.sql'), 'x');
    writeFileSync(join(dir, 'migrations', 'README.md'), 'x');
    writeFileSync(join(dir, 'migrations-pg', 'V202601010000__a.pg.sql'), 'y');
    git(['add', '.'], dir);
    git(['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'x'], dir);
    const found = Object.keys(MigrationsAt('HEAD', dir)).sort().join(',');
    const ok = found === 'migrations-pg/V202601010000__a.pg.sql,migrations/V202601010000__a.sql';
    failed += ok ? 0 : 1;
    console.log(`${ok ? '✓' : '✗'} MigrationsAt reads both folders and only migrations (${found})`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log(failed === 0 ? '\nSelf-test passed.' : `\nSelf-test FAILED: ${failed}.`);
  return failed === 0 ? 0 : 1;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  process.exit(args[0] === '--self-test' ? selfTest() : main(args));
}
