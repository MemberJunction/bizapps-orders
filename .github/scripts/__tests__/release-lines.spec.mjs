import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DistTag, MainLine, MjRange, ResolveBranch, ValidateRecord, ValidateTransition } from '../release-lines.mjs';
import { CheckAppManifest, CheckLockfile, CheckManifest, CheckPackageOverrides, CheckWorkspaceOverrides, InLine } from '../check-mj-line.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');

const line = (key, extra = {}) => ({
  branch: `lts/${key}`, status: 'open', mjVersion: `${key}.0`, appMajor: 1, releasesThrough: 'branch', ...extra,
});
const record = (lines, edgeOnlyMigrations = []) => ({ next: { edgeOnlyMigrations }, lines });

test('the committed release-lines.json is valid', () => {
  const committed = JSON.parse(readFileSync(join(ROOT, 'release-lines.json'), 'utf8'));
  assert.deepEqual(ValidateRecord(committed), []);
});

test('a well-formed two-line record is valid', () => {
  const r = record({ '6.2': line('6.2', { status: 'lts' }), '6.3': line('6.3', { appMajor: 2, releasesThrough: 'main' }) });
  assert.deepEqual(ValidateRecord(r), []);
});

test('exactly one line releases through main, and it is the newest', () => {
  assert.equal(ValidateRecord(record({ '6.2': line('6.2') })).length, 1);
  const twoMains = record({ '6.2': line('6.2', { releasesThrough: 'main' }), '6.3': line('6.3', { releasesThrough: 'main' }) });
  assert.ok(ValidateRecord(twoMains).some((p) => p.includes('exactly one')));
  const olderMain = record({ '6.2': line('6.2', { releasesThrough: 'main' }), '6.3': line('6.3') });
  assert.ok(ValidateRecord(olderMain).some((p) => p.includes('newest line (6.3)')));
});

test('branch, mjVersion and status are checked against the key', () => {
  const bad = record({ '6.2': line('6.2', { branch: 'release/6.2', mjVersion: '6.3.0', status: 'frozen', releasesThrough: 'main' }) });
  const problems = ValidateRecord(bad);
  assert.ok(problems.some((p) => p.includes('branch must be "lts/6.2"')));
  assert.ok(problems.some((p) => p.includes('mjVersion must be a 6.2.x')));
  assert.ok(problems.some((p) => p.includes('status must be')));
});

test('edge-only entries are bare migration file names', () => {
  const r = record({ '6.2': line('6.2', { releasesThrough: 'main' }) }, ['migrations/V202601010000__a.sql']);
  assert.equal(ValidateRecord(r).length, 1);
});

test('an LTS line never reopens, and a line keeps its MJ version and major', () => {
  const before = record({ '6.2': line('6.2', { status: 'lts', releasesThrough: 'main' }) });
  const reopened = record({ '6.2': line('6.2', { status: 'open', releasesThrough: 'main' }) });
  assert.equal(ValidateTransition(before, reopened).length, 1);
  const moved = record({ '6.2': line('6.2', { status: 'lts', mjVersion: '6.2.3', appMajor: 2, releasesThrough: 'main' }) });
  assert.equal(ValidateTransition(before, moved).length, 2);
  const frozen = record({ '6.2': line('6.2', { status: 'lts', releasesThrough: 'main' }) });
  assert.deepEqual(ValidateTransition(record({ '6.2': line('6.2', { releasesThrough: 'main' }) }), frozen), []);
});

test('resolving a branch gives the dist-tag and MJ range', () => {
  const r = record({ '6.2': line('6.2', { mjVersion: '6.2.1' }), '6.3': line('6.3', { releasesThrough: 'main' }) });
  const old = ResolveBranch(r, 'lts/6.2');
  assert.equal(old.distTag, 'lts-6.2');
  assert.equal(old.mjRange, '>=6.2.1 <6.3.0');
  assert.equal(MainLine(r).distTag, 'latest');
  assert.equal(ResolveBranch(r, 'next'), null);
  assert.equal(DistTag({ key: '6.3', releasesThrough: 'main' }), 'latest');
  assert.equal(MjRange({ key: '6.9', mjVersion: '6.9.4' }), '>=6.9.4 <6.10.0');
});

test('MJ line pin: versions inside the line', () => {
  const l = { key: '6.2', mjVersion: '6.2.1' };
  assert.equal(InLine('6.2.1', l), true);
  assert.equal(InLine('6.2.9', l), true);
  assert.equal(InLine('6.2.0', l), false, 'below the floor');
  assert.equal(InLine('6.3.0', l), false, 'past the line');
  assert.equal(InLine('6.3.0-edge.1', l), false, 'an Edge prerelease');
});

test('MJ line pin: peers must be the line range; dev pins inside the line', () => {
  const l = { key: '6.2', mjVersion: '6.2.1' };
  const ok = { peerDependencies: { '@memberjunction/core': '>=6.2.1 <6.3.0' }, devDependencies: { '@memberjunction/core': '6.2.4' } };
  assert.deepEqual(CheckManifest(ok, l), []);
  const caret = { peerDependencies: { '@memberjunction/core': '^6.2.1' } };
  assert.equal(CheckManifest(caret, l).length, 1);
  const edge = { devDependencies: { '@memberjunction/core': '6.3.0-edge.1' } };
  assert.equal(CheckManifest(edge, l).length, 1);
  const fixed = { peerDependencies: { '@memberjunction/core': '^6.2.1' } };
  CheckManifest(fixed, l, true);
  assert.equal(fixed.peerDependencies['@memberjunction/core'], '>=6.2.1 <6.3.0');
});

test('MJ line pin: the lockfile and mj-app.json', () => {
  const l = { key: '6.2', mjVersion: '6.2.1' };
  const lock = "packages:\n\n  '@memberjunction/core@6.2.1':\n    resolution: {}\n  '@memberjunction/global@6.3.0':\n  '@memberjunction/skyway-core@0.7.1':\n";
  assert.deepEqual(CheckLockfile(lock, l).length, 1);
  const app = '{\n  "version": "1.14.0",\n  "mjVersionRange": ">=6.2.1 <7.0.0",\n  "x": 1\n}\n';
  const { problems, text } = CheckAppManifest(app, l, true);
  assert.equal(problems.length, 2);
  assert.deepEqual(CheckAppManifest(text, l).problems, []);
  assert.equal(JSON.parse(text).line, '6.2');
});

test('MJ line pin: overrides in pnpm-workspace.yaml and package.json', () => {
  const l = { key: '6.2', mjVersion: '6.2.1' };
  const yaml = "packages:\n  - packages/*\noverrides:\n  '@angular/core': '21.1.3'\n  '@memberjunction/core': '^6.2.1'\n  \"@memberjunction/global\": 6.2.4\n  '@memberjunction/server': '>=6.2.1 <6.3.0' # capped\nother:\n  '@memberjunction/core': '^9.0.0'\n";
  const { problems, text } = CheckWorkspaceOverrides(yaml, l, true);
  assert.equal(problems.length, 1, 'only the caret inside overrides:, not the block after it');
  assert.ok(text.includes("'@memberjunction/core': '>=6.2.1 <6.3.0'"));
  assert.ok(text.includes("'@memberjunction/server': '>=6.2.1 <6.3.0' # capped"));
  assert.deepEqual(CheckWorkspaceOverrides(text, l).problems, []);
  const pkg = { pnpm: { overrides: { '@memberjunction/core': '^6.2.1', lodash: '^4' } }, overrides: { '@memberjunction/global': '6.3.0' } };
  assert.equal(CheckPackageOverrides(pkg, l, true).length, 2);
  assert.equal(pkg.pnpm.overrides['@memberjunction/core'], '>=6.2.1 <6.3.0');
  assert.equal(pkg.overrides['@memberjunction/global'], '>=6.2.1 <6.3.0');
  assert.equal(pkg.pnpm.overrides.lodash, '^4');
});

for (const script of ['check-line-migrations.mjs', 'check-backport.mjs', 'check-dependency-model.mjs']) {
  test(`${script} --self-test`, () => {
    const run = spawnSync(process.execPath, [join(HERE, '..', script), '--self-test'], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stdout + run.stderr);
  });
}
