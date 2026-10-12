#!/usr/bin/env node
// ==============================================================================
// One copy of each host package (BizApps family)
//
// check-dependency-model.mjs checks what this repo's packages declare. This check reads what the
// workspace actually installs. pnpm-lock.yaml must hold one version of every @memberjunction/*
// package and of every other app's @mj-biz-apps/* package. Two versions of one package split the
// class-factory registry: entity subclasses and engine singletons register in one copy while code
// reads the other, and nothing errors.
//
// A second version usually means two declarations disagree: an exact devDependencies pin below
// another app's peer floor, or a package that leaves out a peer another app needs, so
// auto-install-peers picks a version on its own. Fix it by raising the floor or declaring the
// package where it is used (CLAUDE.md, "One copy of each"), not with overrides.
//
// Usage:  node .github/scripts/check-single-copy.mjs [repo-root]
//         node .github/scripts/check-single-copy.mjs --self-test
// ==============================================================================
import { readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOST_SCOPES = ['@memberjunction/', '@mj-biz-apps/'];
/** A key in the lockfile's `packages:` section: `  '@scope/name@1.2.3':` (quotes optional). */
const PACKAGE_KEY = /^  '?(@[^@/\s]+\/[^@\s]+)@([^'(:\s]+)'?:\s*$/;

/** Each host package in the lockfile's `packages:` section that resolves to more than one version. */
export function FindDuplicates(lockText) {
  const versions = new Map();
  let inPackages = false;
  for (const line of lockText.split('\n')) {
    if (/^\S/.test(line)) {
      inPackages = line.startsWith('packages:');
      continue;
    }
    const match = inPackages ? PACKAGE_KEY.exec(line) : null;
    if (!match || !HOST_SCOPES.some((scope) => match[1].startsWith(scope))) {
      continue;
    }
    const [, name, version] = match;
    if (!versions.has(name)) {
      versions.set(name, new Set());
    }
    versions.get(name).add(version);
  }
  return [...versions]
    .filter(([, found]) => found.size > 1)
    .map(([name, found]) => ({ name, versions: [...found].sort() }));
}

function report(root) {
  const duplicates = FindDuplicates(readFileSync(join(root, 'pnpm-lock.yaml'), 'utf8'));
  for (const { name, versions } of duplicates) {
    console.log(`✗ ${name}: ${versions.join(', ')}`);
  }
  if (duplicates.length > 0) {
    console.log('\nRun `pnpm why <package>` to see which declaration brings each version, then raise the floor '
      + 'or declare the package where it is used (CLAUDE.md, "One copy of each").');
    return 1;
  }
  console.log('✓ One copy: every @memberjunction/* and @mj-biz-apps/* package resolves to one version.');
  return 0;
}

// ---------------------------------------------------------------------------
// Self-test: each fixture must produce exactly the expected number of duplicated packages.
// ---------------------------------------------------------------------------

const lock = (...keys) => ['lockfileVersion: \'9.0\'', '', 'packages:', '', ...keys.map((k) => `  '${k}':\n    resolution: {}\n`),
  'snapshots:', '', "  '@mj-biz-apps/common-entities@5.49.0(@memberjunction/core@6.1.5)':", '    dependencies: {}'].join('\n');

const FIXTURES = [
  { name: 'one version of each passes', expect: 0,
    text: lock('@memberjunction/core@6.1.5', '@mj-biz-apps/common-entities@5.52.0') },
  { name: 'two versions of an app package fail', expect: 1,
    text: lock('@mj-biz-apps/common-entities@5.49.0', '@mj-biz-apps/common-entities@5.52.0') },
  { name: 'two versions of an MJ package fail', expect: 1,
    text: lock('@memberjunction/core@6.1.4', '@memberjunction/core@6.1.5') },
  { name: 'other scopes are ignored', expect: 0,
    text: lock('@angular/core@21.1.3', '@angular/core@20.0.0', '@mj-biz-apps/common-entities@5.52.0') },
  { name: 'snapshots section is ignored', expect: 0,
    text: lock('@mj-biz-apps/common-entities@5.52.0') },
];

function selfTest() {
  let failed = 0;
  for (const fixture of FIXTURES) {
    const found = FindDuplicates(fixture.text).length;
    const ok = found === fixture.expect;
    failed += ok ? 0 : 1;
    console.log(`${ok ? '✓' : '✗'} ${fixture.name} (expected ${fixture.expect}, found ${found})`);
  }
  console.log(failed === 0 ? `\nSelf-test passed: ${FIXTURES.length} fixtures.` : `\nSelf-test FAILED: ${failed} fixture(s).`);
  return failed === 0 ? 0 : 1;
}

/** True only when this file was run directly, not imported (symlinked paths resolved on both sides). */
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
