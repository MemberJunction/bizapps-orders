#!/usr/bin/env node
// ==============================================================================
// Caret pin check (BizApps family) — advisory, not a required check
//
// Dependency ranges are caret (^X.Y.Z): at least the version we tested, and any later release in
// the same major. A tilde (~X.Y.Z) or exact pin (X.Y.Z) caps a package below the next minor or
// patch, so a host on a later release reports the range unmet and installs a second copy, and a
// fixed release never reaches us until someone edits the number by hand.
//
// Checked: dependencies, peerDependencies and optionalDependencies of every package.json.
// Not checked:
//   - devDependencies. They never ship, and an exact devDependency anchors local builds.
//   - overrides (`pnpm.overrides` / `overrides` in package.json, `overrides:` in
//     pnpm-workspace.yaml). A range above tells consumers what we work with; an override forces
//     the one version this repo resolves to. An exact override is the point of having one, and a
//     caret would let the next install pick a newer release nobody tested.
//
// Accepted without complaint:
//   - caret ranges (and || unions of carets): ^6.1.5, ^6.2.0-edge.2, ^21.0.0 || ^22.0.0;
//   - lower-bound ranges, optionally capped: >=0.21.0, >=21.0.0 <22.0.0 (a caret on a 0.x version
//     pins the minor, and some peers are stated as a major window);
//   - protocols: workspace:, file:, link:, catalog:, portal:, patch:, git/URL specs, and npm:
//     aliases whose own range is caret;
//   - exact pins on packages defined in this same repo, which changesets versions in lockstep.
//
// An intentional exception goes in .github/caret-pins-allow.json with a reason:
//   [{ "name": "type-graphql", "section": "dependencies", "reason": "matches MJ's exact pin" }]
// `section` and `file` are optional and narrow the entry. An entry that no longer matches anything
// is reported as stale, without failing the check.
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

const SINGLE_CARET = '\\^\\d+(\\.\\d+){0,2}(-[0-9A-Za-z.-]+)?';
const CARET = new RegExp(`^${SINGLE_CARET}(\\s*\\|\\|\\s*${SINGLE_CARET})*$`);
const LOWER_BOUND = /^>=\s*\d+(\.\d+){0,2}(-[0-9A-Za-z.-]+)?(\s+<\s*\d+(\.\d+){0,2}(-[0-9A-Za-z.-]+)?)?$/;
const PROTOCOL = /^(workspace:|file:|link:|catalog:|portal:|patch:|git\+|git:|github:|https?:|[\w.-]+\/[\w.-]+(#.*)?$)/;

/** Why `spec` is not accepted, or null when it is. */
function problem(spec) {
  const s = spec.trim();
  if (s.startsWith('npm:')) {
    const rest = s.slice(4);
    const at = rest.lastIndexOf('@');
    if (at <= 0 || (rest.startsWith('@') && !rest.slice(0, at).includes('/'))) {
      return 'not a caret range';
    }
    return problem(rest.slice(at + 1));
  }
  if (CARET.test(s) || LOWER_BOUND.test(s) || PROTOCOL.test(s)) {
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

/** Suggested replacement suffix for a violation, or '' when no automatic rewrite applies. */
function suggest(spec, why) {
  if (why === 'not a caret range') {
    return '';
  }
  const s = spec.trim();
  const formatVer = (raw) => {
    const ver = raw.replace(/^[~=v]+/, '');
    return /^0(\.|$)/.test(ver) ? `>=${ver} <1.0.0` : `^${ver}`;
  };
  if (s.startsWith('npm:')) {
    const at = s.lastIndexOf('@');
    return ` — use ${s.slice(0, at + 1)}${formatVer(s.slice(at + 1))}`;
  }
  return ` — use ${formatVer(s)}`;
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
        entries.push({ file, section, name, spec });
      }
    }
  }

  const allowPath = join(root, ALLOWLIST);
  const rawAllow = existsSync(allowPath) ? JSON.parse(readFileSync(allowPath, 'utf8')) : [];
  const allow = Array.isArray(rawAllow) ? rawAllow : [];
  const isValidEntry = (a) =>
    Boolean(a && typeof a === 'object' && typeof a.name === 'string' && a.name.trim() && typeof a.reason === 'string' && a.reason.trim());
  const allowErrors = Array.isArray(rawAllow)
    ? allow
        .filter((a) => !isValidEntry(a))
        .map((a) => `${ALLOWLIST}: entry ${JSON.stringify(a)} needs a "name" and a "reason"`)
    : [`${ALLOWLIST}: root value must be a JSON array`];
  const used = new Set();
  const matches = (a, e) =>
    isValidEntry(a) && a.name === e.name && (!a.section || a.section === e.section) && (!a.file || a.file === e.file);

  const violations = [];
  for (const e of entries) {
    const why = problem(e.spec);
    if (!why || (why === 'exact' && local.has(e.name))) {
      continue;
    }
    const hit = allow.findIndex((a) => matches(a, e));
    if (hit >= 0) {
      used.add(hit);
      continue;
    }
    violations.push({ ...e, why });
  }
  const stale = allow.filter((a, i) => isValidEntry(a) && !used.has(i));
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
    console.log(`::error file=${v.file}::${v.section} ${v.name}: "${v.spec}" is ${v.why}${suggest(v.spec, v.why)}`);
  }
  if (violations.length || allowErrors.length) {
    console.log(
      `\n${violations.length} non-caret pin(s). Use a caret range, or add the package to ${ALLOWLIST} ` +
        'with the reason it must stay pinned. This check is not required: merging red is allowed when the pin is deliberate.',
    );
    return 1;
  }
  console.log('All dependency ranges are caret (devDependencies and overrides not checked).');
  return 0;
}

function selfTest() {
  const cases = [
    ['^6.1.5', null], ['^6.2.0-edge.2', null], ['^21.0.0 || ^22.0.0', null], ['^6.1.5 || ^7.0.0-alpha.1', null],
    ['>=0.21.0', null], ['>=21.0.0 <22.0.0', null],
    ['workspace:*', null], ['npm:tar-fs@^3.0.4', null], ['npm:tar-fs@3.0.4', 'exact'],
    ['npm:@scope/pkg@^1.2.0', null], ['npm:@scope/pkg@1.2.0', 'exact'], ['npm:@scope/pkg@~1.2.0', 'tilde'],
    ['npm:lodash', 'not a caret range'], ['npm:@scope/pkg', 'not a caret range'], ['npm:@1.0.0', 'not a caret range'],
    ['^21.0.0 || 22.0.0', 'not a caret range'], ['^21.0.0 || ~22.0.0', 'not a caret range'],
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
  const suggestCases = [
    ['6.1.5', 'exact', ' — use ^6.1.5'],
    ['~3.24.4', 'tilde', ' — use ^3.24.4'],
    ['0.8.0', 'exact', ' — use >=0.8.0 <1.0.0'],
    ['~0.8.0', 'tilde', ' — use >=0.8.0 <1.0.0'],
    ['npm:tar-fs@3.0.4', 'exact', ' — use npm:tar-fs@^3.0.4'],
    ['npm:@scope/pkg@~1.2.0', 'tilde', ' — use npm:@scope/pkg@^1.2.0'],
    ['npm:pkg@0.8.0', 'exact', ' — use npm:pkg@>=0.8.0 <1.0.0'],
    ['*', 'not a caret range', ''],
  ];
  for (const [spec, why, want] of suggestCases) {
    const got = suggest(spec, why);
    if (got !== want) {
      failed++;
      console.error(`suggest(${JSON.stringify(spec)}, ${JSON.stringify(why)}) = ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    }
  }

  const dir = mkdtempSync(join(tmpdir(), 'caret-pins-'));
  try {
    const write = (path, value) => {
      mkdirSync(join(dir, path, '..'), { recursive: true });
      writeFileSync(join(dir, path), typeof value === 'string' ? value : JSON.stringify(value));
    };
    // Exact and tilde overrides are not violations.
    write('package.json', {
      name: 'root',
      pnpm: { overrides: { zod: '~3.24.0', 'a@1>graphql': '16.0.0' } },
      overrides: { '@angular/core': '21.1.3' },
    });
    write('pnpm-workspace.yaml', "packages:\n  - 'packages/*'\noverrides:\n  '@angular/core': '21.1.3'\n  type-graphql: '2.0.0-beta.3'\n");
    write('packages/a/package.json', {
      name: '@x/a',
      dependencies: { '@x/b': '1.0.0', lodash: '4.17.21', 'type-graphql': '2.0.0-beta.3', ok: '^1.0.0' },
      peerDependencies: { '@angular/core': '>=21.0.0 <22.0.0' },
      devDependencies: { typescript: '5.9.3' },
    });
    write('packages/b/package.json', { name: '@x/b', optionalDependencies: { fsevents: '~2.3.0' } });
    write('.github/caret-pins-allow.json', [
      { name: 'type-graphql', section: 'dependencies', reason: 'matches MJ' },
      { name: 'gone', reason: 'old' },
    ]);
    const { violations, stale, allowErrors } = check(dir);
    const got = violations.map((v) => `${v.file}|${v.name}|${v.why}`).sort();
    const want = ['packages/a/package.json|lodash|exact', 'packages/b/package.json|fsevents|tilde'];
    if (JSON.stringify(got) !== JSON.stringify(want)) {
      failed++;
      console.error(`violations:\n  ${got.join('\n  ')}\nwant:\n  ${want.join('\n  ')}`);
    }
    if (stale.length !== 1 || stale[0].name !== 'gone' || allowErrors.length) {
      failed++;
      console.error(`stale/allowErrors wrong: ${JSON.stringify({ stale, allowErrors })}`);
    }

    // An allowlist entry with a blank/missing reason must report an allowError AND must not suppress violations.
    write('.github/caret-pins-allow.json', [
      { name: 'lodash', reason: '   ' },
      null,
    ]);
    const invalidEntryRes = check(dir);
    if (invalidEntryRes.allowErrors.length !== 2 || !invalidEntryRes.violations.some((v) => v.name === 'lodash')) {
      failed++;
      console.error(`invalid allowlist entry suppressed violation or missed allowErrors: ${JSON.stringify(invalidEntryRes)}`);
    }

    // A non-array allowlist root value must report an allowError instead of throwing TypeError.
    write('.github/caret-pins-allow.json', { name: 'lodash', reason: 'wrong root shape' });
    let nonArrayRes;
    try {
      nonArrayRes = check(dir);
    } catch (err) {
      nonArrayRes = { threw: String(err), allowErrors: [] };
    }
    if (!nonArrayRes.allowErrors || nonArrayRes.allowErrors.length !== 1) {
      failed++;
      console.error(`non-array allowlist failed to report allowError cleanly: ${JSON.stringify(nonArrayRes)}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log(failed ? `${failed} self-test failure(s)` : 'check-caret-pins self-test passed');
  return failed ? 1 : 0;
}

const arg = process.argv[2];
process.exit(arg === '--self-test' ? selfTest() : report(arg ?? process.cwd()));
