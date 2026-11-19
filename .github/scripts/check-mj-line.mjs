#!/usr/bin/env node
// ==============================================================================
// MJ line pin: a release line never moves past the MJ version it was cut for
//
// Each line is cut for one MJ minor (the 6.2 line for MJ 6.2) and declares the MJ version it was
// cut for as its floor, which it never raises (release-lines.json `mjVersion`). On a line branch,
// and on the release PR into `main`, this checks five places:
//
//   1. peerDependencies on @memberjunction/* are exactly the line range, `>=<mjVersion> <X.(Y+1).0`.
//      A caret (`^6.2.1`) would let a host on MJ 6.3 install a 6.2-line release; the cap is what
//      keeps a line's packages on its own MJ minor for consumers.
//   2. dependencies / devDependencies on @memberjunction/* (root package.json included) are an
//      exact version inside the line (X.Y.z, at or above the floor) or the line range itself.
//   3. Every @memberjunction/* version pnpm-lock.yaml resolves is inside the line, so nothing this
//      repo builds or tests against has moved to a newer MJ (or an Edge prerelease). 0.x packages
//      in the scope (the Skyway migration engine) are versioned on their own, not with MJ, and
//      are skipped.
//   4. Overrides on @memberjunction/* (pnpm-workspace.yaml `overrides:`, root package.json
//      `pnpm.overrides` and `overrides`) are an exact version inside the line or the line range.
//      An override wins over every manifest, so a caret there (`^6.2.1`) would let MJ 6.3 into the
//      install once it is released, whatever the packages declare.
//   5. mj-app.json declares `"line": "X.Y"` and `mjVersionRange` equal to the line range, so the
//      installer refuses a host outside the line and one manifest read tells which line a release
//      belongs to.
//
// `--fix` rewrites 1, 2, 4 and 5 to the line's values (the line cut uses it); run
// `pnpm install --lockfile-only` afterwards for 3.
//
// Usage:  node check-mj-line.mjs --line 6.2 [--fix] [--file release-lines.json | --ref origin/next] [root]
//         node check-mj-line.mjs --branch lts/6.2 ...   (the line whose branch this is)
//         node check-mj-line.mjs --main ...             (the line released through main)
// ==============================================================================
import { existsSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LoadRecordFromFile, LoadRecordFromRef, Lines, MainLine, MjRange, ResolveBranch } from './release-lines.mjs';

const MJ_SCOPE = '@memberjunction/';
const SEMVER = /^(\d+)\.(\d+)\.(\d+)(-[0-9A-Za-z.-]+)?$/;
const LOCK_ENTRY = /^ {2}'?(@memberjunction\/[^@'\s]+)@(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/;

/** -1 / 0 / 1. A prerelease sorts before its release. */
export function CompareVersions(a, b) {
  const pa = SEMVER.exec(a);
  const pb = SEMVER.exec(b);
  for (let i = 1; i <= 3; i++) {
    const d = Number(pa[i]) - Number(pb[i]);
    if (d !== 0) {
      return Math.sign(d);
    }
  }
  if (pa[4] && !pb[4]) return -1;
  if (!pa[4] && pb[4]) return 1;
  return 0;
}

/** True when `version` is an exact release inside the line: same minor, at or above the floor. */
export function InLine(version, line) {
  const v = SEMVER.exec(version);
  if (!v || v[4]) {
    return false;
  }
  const [major, minor] = line.key.split('.');
  return v[1] === major && v[2] === minor && CompareVersions(version, line.mjVersion) >= 0;
}

function manifestPaths(root) {
  const paths = [join(root, 'package.json')];
  const packages = join(root, 'packages');
  if (existsSync(packages)) {
    for (const entry of readdirSync(packages, { withFileTypes: true })) {
      const file = join(packages, entry.name, 'package.json');
      if (entry.isDirectory() && existsSync(file)) {
        paths.push(file);
      }
    }
  }
  return paths.filter(existsSync);
}

/** Problems in one package.json; with `fix`, rewrites `json` in place and returns what changed. */
export function CheckManifest(json, line, fix = false) {
  const range = MjRange(line);
  const problems = [];
  for (const section of ['peerDependencies', 'dependencies', 'devDependencies']) {
    for (const [name, spec] of Object.entries(json[section] ?? {})) {
      if (!name.startsWith(MJ_SCOPE)) {
        continue;
      }
      const value = String(spec).trim();
      const ok = section === 'peerDependencies'
        ? value === range
        : value === range || InLine(value.replace(/^=/, ''), line);
      if (ok) {
        continue;
      }
      const want = section === 'peerDependencies' ? range : (json.private ? range : line.mjVersion);
      problems.push(`${section} ${name}@${value}: the ${line.key} line needs ${section === 'peerDependencies' ? `"${range}"` : `an exact ${line.key}.x version at or above ${line.mjVersion}, or "${range}"`}`);
      if (fix) {
        json[section][name] = want;
      }
    }
  }
  return problems;
}

/** True when an override value keeps MJ inside the line: the line range or an exact in-line version. */
function overrideOk(value, line) {
  return value === MjRange(line) || InLine(value.replace(/^=/, ''), line);
}

function overrideProblem(where, name, value, line) {
  return `${where} ${name}@${value}: the ${line.key} line needs an exact ${line.key}.x version at or above ${line.mjVersion}, or "${MjRange(line)}"`;
}

/** Problems in root package.json overrides (`pnpm.overrides`, npm `overrides`); with `fix`, rewrites `json`. */
export function CheckPackageOverrides(json, line, fix = false) {
  const problems = [];
  for (const [where, map] of [['pnpm.overrides', json.pnpm?.overrides], ['overrides', json.overrides]]) {
    for (const [name, spec] of Object.entries(map ?? {})) {
      if (!name.startsWith(MJ_SCOPE) || typeof spec !== 'string' || overrideOk(spec.trim(), line)) {
        continue;
      }
      problems.push(overrideProblem(where, name, spec.trim(), line));
      if (fix) {
        map[name] = MjRange(line);
      }
    }
  }
  return problems;
}

const WORKSPACE_OVERRIDE = /^(\s+)(['"]?)(@memberjunction\/[^'":\s]+)\2\s*:\s*(['"]?)([^'"#\n]*?)\4\s*(#.*)?$/;

/** Problems in pnpm-workspace.yaml's `overrides:` block; with `fix`, returns the corrected text too. */
export function CheckWorkspaceOverrides(text, line, fix = false) {
  const problems = [];
  const lines = text.split('\n');
  let inOverrides = false;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (/^\S/.test(raw)) {
      inOverrides = /^overrides\s*:/.test(raw);
      continue;
    }
    const m = inOverrides ? WORKSPACE_OVERRIDE.exec(raw) : null;
    if (!m || overrideOk(m[5].trim(), line)) {
      continue;
    }
    problems.push(overrideProblem('overrides', m[3], m[5].trim(), line));
    if (fix) {
      lines[i] = `${m[1]}${m[2]}${m[3]}${m[2]}: '${MjRange(line)}'${m[6] ? ` ${m[6]}` : ''}`;
    }
  }
  return { problems, text: lines.join('\n') };
}

/** Problems in pnpm-lock.yaml: every resolved @memberjunction/* version must be inside the line. */
export function CheckLockfile(text, line) {
  const outside = new Map();
  for (const raw of text.split('\n')) {
    const m = LOCK_ENTRY.exec(raw);
    if (m && !m[2].startsWith('0.') && !InLine(m[2], line)) {
      outside.set(`${m[1]}@${m[2]}`, true);
    }
  }
  return [...outside.keys()].sort().map((entry) =>
    `pnpm-lock.yaml resolves ${entry}, outside the ${line.key} line (${MjRange(line)}). Something moved MJ past the line; pin it back and run pnpm install --lockfile-only.`);
}

/** Problems in mj-app.json; with `fix`, returns the corrected text too. */
export function CheckAppManifest(text, line, fix = false) {
  const json = JSON.parse(text);
  const range = MjRange(line);
  const problems = [];
  let out = text;
  if (json.mjVersionRange !== range) {
    problems.push(`mj-app.json mjVersionRange is "${json.mjVersionRange}", the ${line.key} line needs "${range}"`);
    if (fix) {
      out = out.replace(/("mjVersionRange"\s*:\s*)"[^"]*"/, `$1"${range}"`);
    }
  }
  if (json.line !== line.key) {
    problems.push(`mj-app.json line is ${json.line === undefined ? 'missing' : `"${json.line}"`}, the ${line.key} line needs "line": "${line.key}"`);
    if (fix) {
      out = json.line === undefined
        ? out.replace(/^(\s*)("mjVersionRange")/m, `$1"line": "${line.key}",\n$1$2`)
        : out.replace(/("line"\s*:\s*)"[^"]*"/, `$1"${line.key}"`);
    }
  }
  return { problems, text: out };
}

/** Runs every check under `root`. */
export function CheckRepo(root, line, fix = false) {
  const results = [];
  for (const file of manifestPaths(root)) {
    const json = JSON.parse(readFileSync(file, 'utf8'));
    const problems = CheckManifest(json, line, fix);
    if (file === join(root, 'package.json')) {
      problems.push(...CheckPackageOverrides(json, line, fix));
    }
    if (problems.length > 0) {
      results.push({ file: relative(root, file), problems });
      if (fix) {
        writeFileSync(file, JSON.stringify(json, null, 2) + '\n');
      }
    }
  }
  const workspace = join(root, 'pnpm-workspace.yaml');
  if (existsSync(workspace)) {
    const { problems, text } = CheckWorkspaceOverrides(readFileSync(workspace, 'utf8'), line, fix);
    if (problems.length > 0) {
      results.push({ file: 'pnpm-workspace.yaml', problems });
      if (fix) {
        writeFileSync(workspace, text);
      }
    }
  }
  const app = join(root, 'mj-app.json');
  if (existsSync(app)) {
    const { problems, text } = CheckAppManifest(readFileSync(app, 'utf8'), line, fix);
    if (problems.length > 0) {
      results.push({ file: 'mj-app.json', problems });
      if (fix) {
        writeFileSync(app, text);
      }
    }
  }
  const lock = join(root, 'pnpm-lock.yaml');
  if (existsSync(lock) && !fix) {
    const problems = CheckLockfile(readFileSync(lock, 'utf8'), line);
    if (problems.length > 0) {
      results.push({ file: 'pnpm-lock.yaml', problems });
    }
  }
  return results;
}

function option(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function main(args) {
  const file = option(args, '--file');
  const record = file ? LoadRecordFromFile(file) : LoadRecordFromRef(option(args, '--ref') ?? 'origin/next');
  if (!record) {
    console.error('✗ no release-lines.json to read. Fetch next first: git fetch --no-tags origin next');
    return 2;
  }
  let line = null;
  if (option(args, '--line')) {
    line = Lines(record).find((l) => l.key === option(args, '--line')) ?? null;
  } else if (option(args, '--branch')) {
    line = ResolveBranch(record, option(args, '--branch'));
  } else if (args.includes('--main')) {
    line = MainLine(record);
  }
  if (!line) {
    console.error('✗ no matching line in release-lines.json (pass --line X.Y, --branch lts/X.Y or --main)');
    return 2;
  }
  const flags = new Set(['--line', '--branch', '--file', '--ref']);
  const root = args.find((a, i) => !a.startsWith('--') && !flags.has(args[i - 1])) ?? process.cwd();
  const fix = args.includes('--fix');
  const results = CheckRepo(root, line, fix);
  for (const { file: f, problems } of results) {
    for (const p of problems) {
      console.log(fix ? `fixed ${f}: ${p}` : `::error file=${f}::${p}`);
    }
  }
  if (fix) {
    console.log(results.length > 0
      ? `\nRewritten to the ${line.key} line. Now run: pnpm install --lockfile-only`
      : `✓ already pinned to the ${line.key} line`);
    return 0;
  }
  if (results.length > 0) {
    return 1;
  }
  console.log(`✓ Every MJ dependency, override, the lockfile and mj-app.json stay inside the ${line.key} line (${MjRange(line)})`);
  return 0;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
