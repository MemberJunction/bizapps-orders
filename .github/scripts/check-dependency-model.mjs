#!/usr/bin/env node
// ==============================================================================
// Dependency model guard (BizApps family)
//
// A host installs ONE copy of MemberJunction and one copy of each Open App. A package that brings
// its own copy splits the class-factory registry: entities and resolvers stop registering, with no
// error. Two declarations do that:
//
//   1. @memberjunction/* in `dependencies`. A dependency is resolved on its own, so whenever its
//      range misses the host's version, pnpm installs a second MemberJunction tree.
//   2. A peer range that rejects later minor releases: `~6.1.5` (>=6.1.5 <6.2.0) or an exact
//      version. Every 6.2 host then reports the peer unmet and gets a 6.1 copy.
//
// The same holds for another app's @mj-biz-apps/* packages: the host installs that app once.
//
// So, for every published package in packages/ (private packages are skipped):
//   - @memberjunction/* and other apps' @mj-biz-apps/* packages never appear in `dependencies`;
//   - their peerDependencies ranges are caret (^X.Y.Z), or `>=X.Y.Z` (optionally `<N.0.0`) for a
//     0.x package, where a caret would pin the minor;
//   - exact versions belong in devDependencies, which anchor local builds and never ship.
// This repo's own packages may depend on each other with exact versions.
//
// Usage:  node .github/scripts/check-dependency-model.mjs [repo-root]
//         node .github/scripts/check-dependency-model.mjs --self-test
// ==============================================================================
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const MJ_SCOPE = '@memberjunction/';
const APP_SCOPE = '@mj-biz-apps/';
/**
 * `^6.1.5` / `^6.1.0-edge.5` (major 1 or above), or `>=0.5.0` with an optional upper bound on a major
 * boundary (`>=0.5.0 <1.0.0`). Caret on a 0.x version (`^0.5.0` = `>=0.5.0 <0.6.0`) pins the minor,
 * so it is checked separately below.
 */
const ACCEPTED_RANGE = /^(\^[1-9]\d*\.\d+\.\d+(-[0-9A-Za-z.-]+)?|>=\s*\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\s+<\s*\d+\.0\.0(-0)?)?)$/;
const ZERO_MAJOR_CARET = /^\^0\.\d+\.\d+/;
const MAX_DEPTH = 3;

/** Every package.json under `dir` (node_modules and dot-directories skipped), to MAX_DEPTH levels. */
function findManifests(dir, depth = 0) {
  if (!existsSync(dir) || depth > MAX_DEPTH) {
    return [];
  }
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
      continue;
    }
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...findManifests(path, depth + 1));
    } else if (entry.name === 'package.json') {
      found.push(path);
    }
  }
  return found;
}

/** True for a package that comes from MemberJunction or from another Open App. */
function isHostProvided(name, ownNames) {
  return name.startsWith(MJ_SCOPE) || (name.startsWith(APP_SCOPE) && !ownNames.has(name));
}

/** The problems in one manifest, as human-readable lines. */
export function CheckManifest(manifest, ownNames) {
  const problems = [];
  for (const [name, spec] of Object.entries(manifest.dependencies ?? {})) {
    if (isHostProvided(name, ownNames)) {
      problems.push(`${name}@${spec} is in dependencies: move it to peerDependencies with a caret range, `
        + 'and keep an exact devDependencies entry for local builds.');
    }
  }
  for (const [name, spec] of Object.entries(manifest.peerDependencies ?? {})) {
    const range = String(spec).trim();
    if (!isHostProvided(name, ownNames) || ACCEPTED_RANGE.test(range)) {
      continue;
    }
    problems.push(ZERO_MAJOR_CARET.test(range)
      ? `peer ${name}@${spec}: ^0.x pins the minor version. Use >=${range.slice(1)} <1.0.0.`
      : `peer ${name}@${spec}: use a caret range (^X.Y.Z), or >=X.Y.Z for a 0.x package. `
        + '~ and exact versions reject every later minor release of the host.');
  }
  return problems;
}

/** Checks every published package under `root`/packages; returns `{ file, problems }[]`. */
export function CheckRepo(root) {
  const manifests = findManifests(join(root, 'packages')).map((file) => ({
    file,
    json: JSON.parse(readFileSync(file, 'utf8')),
  }));
  const ownNames = new Set(manifests.map((m) => m.json.name).filter(Boolean));
  return manifests
    .filter((m) => m.json.name && m.json.private !== true)
    .map((m) => ({ file: relative(root, m.file), problems: CheckManifest(m.json, ownNames) }))
    .filter((r) => r.problems.length > 0);
}

function report(root) {
  const failures = CheckRepo(root);
  for (const { file, problems } of failures) {
    console.log(`✗ ${file}`);
    for (const problem of problems) {
      console.log(`    ${problem}`);
    }
  }
  if (failures.length > 0) {
    console.log('\nSee the "Angular pinning model" / dependency rules in CLAUDE.md: host-provided packages are caret peers.');
    return 1;
  }
  console.log('✓ Dependency model: MemberJunction and other apps\' packages are caret peers only.');
  return 0;
}

// ---------------------------------------------------------------------------
// Self-test: each fixture must produce exactly the expected number of problems.
// ---------------------------------------------------------------------------

const FIXTURES = [
  { name: 'caret peers + exact dev anchors pass', expect: 0, pkg: {
    name: '@mj-biz-apps/demo-entities',
    peerDependencies: { '@memberjunction/core': '^6.1.5', '@mj-biz-apps/common-entities': '^5.51.0' },
    devDependencies: { '@memberjunction/core': '6.1.5' } } },
  { name: 'major-bounded range passes', expect: 0, pkg: {
    name: '@mj-biz-apps/demo-ng', peerDependencies: { '@memberjunction/ng-shared': '>=6.1.5 <7.0.0' } } },
  { name: 'open lower bound passes for a 0.x package', expect: 0, pkg: {
    name: '@mj-biz-apps/demo-ng', peerDependencies: { '@mj-biz-apps/accounting-entities': '>=0.5.0' } } },
  { name: 'caret on a 0.x package fails (pins the minor)', expect: 1, pkg: {
    name: '@mj-biz-apps/demo-ng', peerDependencies: { '@mj-biz-apps/accounting-entities': '^0.5.0' } } },
  { name: 'MJ in dependencies fails', expect: 1, pkg: {
    name: '@mj-biz-apps/demo-server', dependencies: { '@memberjunction/server': '^6.1.5' } } },
  { name: 'tilde peer fails', expect: 1, pkg: {
    name: '@mj-biz-apps/demo-server', peerDependencies: { '@memberjunction/core': '~6.1.5' } } },
  { name: 'exact peer fails', expect: 1, pkg: {
    name: '@mj-biz-apps/demo-server', peerDependencies: { '@memberjunction/core': '6.1.5' } } },
  { name: "another app's package pinned in dependencies fails", expect: 1, pkg: {
    name: '@mj-biz-apps/demo-server', dependencies: { '@mj-biz-apps/common-entities': '5.34.0' } } },
  { name: "this repo's own packages may pin each other", expect: 0, pkg: {
    name: '@mj-biz-apps/demo-server', dependencies: { '@mj-biz-apps/demo-entities': '1.2.3' } } },
  { name: 'private packages are skipped', expect: 0, pkg: {
    name: '@mj-biz-apps/demo-tests', private: true, dependencies: { '@memberjunction/core': '6.1.5' } } },
];

function selfTest() {
  let failed = 0;
  for (const fixture of FIXTURES) {
    const root = mkdtempSync(join(tmpdir(), 'dep-model-'));
    try {
      const own = join(root, 'packages', 'Entities');
      mkdirSync(own, { recursive: true });
      writeFileSync(join(own, 'package.json'), JSON.stringify({ name: '@mj-biz-apps/demo-entities' }));
      const dir = join(root, 'packages', 'Subject');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'package.json'), JSON.stringify(fixture.pkg));
      const found = CheckRepo(root).flatMap((r) => r.problems).length;
      const ok = found === fixture.expect;
      failed += ok ? 0 : 1;
      console.log(`${ok ? '✓' : '✗'} ${fixture.name} (expected ${fixture.expect}, found ${found})`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
  console.log(failed === 0 ? `\nSelf-test passed: ${FIXTURES.length} fixtures.` : `\nSelf-test FAILED: ${failed} fixture(s).`);
  return failed === 0 ? 0 : 1;
}

/**
 * True only when this file was run directly, not imported. Both sides go through realpathSync, so a
 * script reached through a symlink (macOS `/tmp` is one) still runs `main`. An `argv[1]` that cannot
 * be resolved does not name this file, so `false` is the answer, not a swallowed error.
 */
function isDirectlyExecuted() {
  if (process.argv[1] === undefined) {
    return false;
  }
  let invokedPath;
  try {
    invokedPath = realpathSync(process.argv[1]);
  } catch {
    return false;
  }
  return invokedPath === realpathSync(fileURLToPath(import.meta.url));
}

if (isDirectlyExecuted()) {
  const arg = process.argv[2];
  process.exit(arg === '--self-test' ? selfTest() : report(arg ?? process.cwd()));
}
