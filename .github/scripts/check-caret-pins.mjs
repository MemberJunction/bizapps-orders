#!/usr/bin/env node
// ==============================================================================
// Caret pin check (BizApps family) — advisory, not a required check
//
// Dependency ranges are caret (^X.Y.Z): at least the version we tested, and any later release in
// the same major. A tilde (~X.Y.Z) or exact pin (X.Y.Z) caps a package below the next minor or
// patch, so a host on a later release reports the range unmet and installs a second copy, and a
// fixed release never reaches us until someone edits the number by hand.
//
// Checked: dependencies, peerDependencies and optionalDependencies of every package.json, the
// root package.json `pnpm.overrides` / `overrides`, and `overrides:` in pnpm-workspace.yaml.
// Not checked: devDependencies. They never ship, and an exact devDependency anchors local builds.
//
// Accepted without complaint:
//   - caret ranges: ^6.1.5, ^6.2.0-edge.2;
//   - lower-bound ranges, optionally capped: >=0.21.0, >=21.0.0 <22.0.0 (a caret on a 0.x version
//     pins the minor, and some peers are stated as a major window);
//   - protocols: workspace:, file:, link:, catalog:, portal:, patch:, git/URL specs, and npm:
//     aliases whose own range is caret;
//   - override references ($name) and removals (-);
//   - exact pins on packages defined in this same repo, which changesets versions in lockstep.
//
// An intentional exception goes in .github/caret-pins-allow.json with a reason:
//   [{ "name": "type-graphql", "section": "overrides", "reason": "matches MJ's exact pin" }]
// `section` and `file` are optional; when given they narrow the entry. An entry that no longer
// matches anything is reported as stale, without failing the check.
//
// The check is not a required status check. A red result can be merged by someone who knows why
// the pin has to be exact; a lasting exception belongs in the allowlist.
//
// Usage:  node .github/scripts/check-caret-pins.mjs [repo-root]
//         node .github/scripts/check-caret-pins.mjs --self-test
// ==============================================================================
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

const SECTIONS = ['dependencies', 'peerDependencies', 'optionalDependencies'];
const ALLOWLIST = '.github/caret-pins-allow.json';
const MAX_DEPTH = 4;

const CARET = /^\^\d+(\.\d+){0,2}(-[0-9A-Za-z.-]+)?$/;
const LOWER_BOUND = /^>=\s*\d+(\.\d+){0,2}(-[0-9A-Za-z.-]+)?(\s+<\s*\d+(\.\d+){0,2}(-[0-9A-Za-z.-]+)?)?$/;
const PROTOCOL = /^(workspace:|file:|link:|catalog:|portal:|patch:|git\+|git:|github:|https?:|[\w.-]+\/[\w.-]+(#.*)?$)/;

/** Why `spec` is not accepted, or null when it is. */
function problem(spec) {
  const s = spec.trim();
  if (s.startsWith('npm:')) {
    const at = s.lastIndexOf('@');
    return at > 4 ? problem(s.slice(at + 1)) : null;
  }
  if (CARET.test(s) || LOWER_BOUND.test(s) || PROTOCOL.test(s) || s.startsWith('$') || s === '-') {
    return null;
  }
  if (s.startsWith('~')) {
    return 'tilde';
  }
  if (/^=?v?\d+(\.\d+){0,2}(-[0-9A-Za-z.-]+)?$/.test(s)) {
    return 'exact';
  }
  return 'not a caret range';
}

/** Every package.json under `dir` (node_modules and dot-directories skipped). */
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

/** Flattens an overrides object: nested selectors ({ "a": { "b": "1" } }) become "a > b". */
function flattenOverrides(obj, prefix = '') {
  const out = [];
  for (const [key, value] of Object.entries(obj ?? {})) {
    const name = prefix ? `${prefix} > ${key}` : key;
    if (typeof value === 'string') {
      // npm's "." entry sets the version of the parent package itself.
      out.push([key === '.' ? prefix : name, value]);
    } else if (value && typeof value === 'object') {
      out.push(...flattenOverrides(value, name));
    }
  }
  return out;
}

/** The `overrides:` map of a pnpm-workspace.yaml, read without a YAML library (flat map only). */
function workspaceOverrides(text) {
  const out = [];
  let inBlock = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, '');
    if (/^overrides:\s*$/.test(line)) {
      inBlock = true;
      continue;
    }
    if (!inBlock || !line.trim() || line.trim().startsWith('#')) {
      continue;
    }
    if (!/^\s/.test(line)) {
      break;
    }
    const m = line.match(/^\s+(['"]?)(.+?)\1\s*:\s*(['"]?)(.*?)\3\s*$/);
    if (m) {
      out.push([m[2], m[4]]);
    }
  }
  return out;
}

/** The package an override key targets: "@a/b@1>c@2" targets "c". */
function overrideTarget(key) {
  const last = key.split(/\s*>\s*/).pop();
  const at = last.lastIndexOf('@');
  return at > 0 ? last.slice(0, at) : last;
}

function check(root) {
  const manifests = findManifests(root).map((path) => ({
    file: relative(root, path).split('\\').join('/'),
    json: JSON.parse(readFileSync(path, 'utf8')),
  }));
  const local = new Set(manifests.map((m) => m.json.name).filter(Boolean));

  const entries = [];
  for (const { file, json } of manifests) {
    for (const section of SECTIONS) {
      for (const [name, spec] of Object.entries(json[section] ?? {})) {
        entries.push({ file, section, name, target: name, spec });
      }
    }
    if (file === 'package.json') {
      for (const [section, obj] of [['overrides', json.pnpm?.overrides], ['overrides', json.overrides]]) {
        for (const [name, spec] of flattenOverrides(obj)) {
          entries.push({ file, section, name, target: overrideTarget(name), spec });
        }
      }
    }
  }
  const workspaceFile = join(root, 'pnpm-workspace.yaml');
  if (existsSync(workspaceFile)) {
    for (const [name, spec] of workspaceOverrides(readFileSync(workspaceFile, 'utf8'))) {
      entries.push({ file: 'pnpm-workspace.yaml', section: 'overrides', name, target: overrideTarget(name), spec });
    }
  }

  const allowPath = join(root, ALLOWLIST);
  const allow = existsSync(allowPath) ? JSON.parse(readFileSync(allowPath, 'utf8')) : [];
  const allowErrors = allow
    .filter((a) => !a.name || !a.reason || !String(a.reason).trim())
    .map((a) => `${ALLOWLIST}: entry ${JSON.stringify(a)} needs a "name" and a "reason"`);
  const used = new Set();
  const matches = (a, e) =>
    a.name === e.name && (!a.section || a.section === e.section) && (!a.file || a.file === e.file);

  const violations = [];
  for (const e of entries) {
    const why = problem(e.spec);
    if (!why || (why === 'exact' && local.has(e.target))) {
      continue;
    }
    const hit = allow.findIndex((a) => matches(a, e));
    if (hit >= 0) {
      used.add(hit);
      continue;
    }
    violations.push({ ...e, why });
  }
  const stale = allow.filter((a, i) => a.name && a.reason && !used.has(i));
  return { violations, stale, allowErrors };
}

function report(root) {
  const { violations, stale, allowErrors } = check(root);
  for (const a of stale) {
    console.log(`::warning file=${ALLOWLIST}::Stale allowlist entry for ${a.name}: nothing matches it any more`);
  }
  for (const msg of allowErrors) {
    console.log(`::error file=${ALLOWLIST}::${msg}`);
  }
  for (const v of violations) {
    const suggestion = v.why === 'not a caret range' ? '' : ` — use ^${v.spec.replace(/^[~=v]+/, '')}`;
    console.log(`::error file=${v.file}::${v.section} ${v.name}: "${v.spec}" is ${v.why}${suggestion}`);
  }
  if (violations.length || allowErrors.length) {
    console.log(
      `\n${violations.length} non-caret pin(s). Use a caret range, or add the package to ${ALLOWLIST} ` +
        'with the reason it must stay pinned. This check is not required: merging red is allowed when the pin is deliberate.',
    );
    return 1;
  }
  console.log('All dependency ranges are caret (devDependencies not checked).');
  return 0;
}

function selfTest() {
  const cases = [
    ['^6.1.5', null], ['^6.2.0-edge.2', null], ['>=0.21.0', null], ['>=21.0.0 <22.0.0', null],
    ['workspace:*', null], ['npm:tar-fs@^3.0.4', null], ['npm:tar-fs@3.0.4', 'exact'], ['$foo', null],
    ['github:org/repo#main', null], ['~3.24.4', 'tilde'], ['6.1.5', 'exact'], ['2.0.0-beta.3', 'exact'],
    ['*', 'not a caret range'], ['latest', 'not a caret range'], ['1.x', 'not a caret range'],
  ];
  let failed = 0;
  for (const [spec, want] of cases) {
    const got = problem(spec);
    if (got !== want) {
      failed++;
      console.error(`problem(${JSON.stringify(spec)}) = ${got}, want ${want}`);
    }
  }

  const dir = mkdtempSync(join(tmpdir(), 'caret-pins-'));
  try {
    const write = (path, value) => {
      mkdirSync(join(dir, path, '..'), { recursive: true });
      writeFileSync(join(dir, path), typeof value === 'string' ? value : JSON.stringify(value));
    };
    write('package.json', { name: 'root', pnpm: { overrides: { zod: '~3.24.0', 'a@1>graphql': '16.0.0' } } });
    write('pnpm-workspace.yaml', "packages:\n  - 'packages/*'\noverrides:\n  '@angular/core': '21.1.3'  # pinned\n  type-graphql: '2.0.0-beta.3'\n  '@memberjunction/core': '^6.1.5'\nlinkWorkspacePackages: true\n");
    write('packages/a/package.json', {
      name: '@x/a',
      dependencies: { '@x/b': '1.0.0', lodash: '4.17.21', ok: '^1.0.0' },
      peerDependencies: { '@angular/core': '>=21.0.0 <22.0.0' },
      devDependencies: { typescript: '5.9.3' },
    });
    write('packages/b/package.json', { name: '@x/b', optionalDependencies: { fsevents: '~2.3.0' } });
    write('.github/caret-pins-allow.json', [
      { name: 'type-graphql', section: 'overrides', reason: 'matches MJ' },
      { name: 'gone', reason: 'old' },
    ]);
    const { violations, stale, allowErrors } = check(dir);
    const got = violations.map((v) => `${v.file}|${v.name}|${v.why}`).sort();
    const want = [
      'package.json|a@1>graphql|exact',
      'package.json|zod|tilde',
      'packages/a/package.json|lodash|exact',
      'packages/b/package.json|fsevents|tilde',
      'pnpm-workspace.yaml|@angular/core|exact',
    ];
    if (JSON.stringify(got) !== JSON.stringify(want)) {
      failed++;
      console.error(`violations:\n  ${got.join('\n  ')}\nwant:\n  ${want.join('\n  ')}`);
    }
    if (stale.length !== 1 || stale[0].name !== 'gone' || allowErrors.length) {
      failed++;
      console.error(`stale/allowErrors wrong: ${JSON.stringify({ stale, allowErrors })}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log(failed ? `${failed} self-test failure(s)` : 'check-caret-pins self-test passed');
  return failed ? 1 : 0;
}

const arg = process.argv[2];
process.exit(arg === '--self-test' ? selfTest() : report(arg ?? process.cwd()));
