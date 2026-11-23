#!/usr/bin/env node
// ==============================================================================
// Line status record (release-lines.json): read, validate, resolve
//
// One file lists every release line of this app: the branch, the MJ version the line was cut for,
// the app major it publishes, whether it is open or LTS, and whether it releases through `main`
// (the newest line, npm dist-tag `latest`) or from its own branch (dist-tag `lts-<line>`). It also
// lists the migrations on `next` that are edge-only: they need the upcoming MJ version and stay
// off every line until the next cut.
//
// CI always reads the copy on `next`. A line branch carries its own copy from the cut, but that
// copy is never consulted: a line must not be able to change its own status or publishing route.
//
// Usage:
//   node release-lines.mjs validate [--file F | --ref R] [--base R]   structure, plus transitions vs --base
//   node release-lines.mjs resolve <branch> [--file F | --ref R]      JSON for the line on <branch>, or {}
//   node release-lines.mjs main-line [--file F | --ref R]             JSON for the line released through main
//   node release-lines.mjs open-lines [--file F | --ref R]            JSON array of open lines
//
// --ref defaults to origin/next; --file reads a working-tree file instead.
// ==============================================================================
import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const RECORD_PATH = 'release-lines.json';
const LINE_KEY = /^(\d+)\.(\d+)$/;
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;
const MIGRATION_FILE = /^V\d{12}__[^/]+\.sql$/;
const STATUSES = new Set(['open', 'lts']);
const ROUTES = new Set(['main', 'branch']);

/** Parses the record from a working-tree file. */
export function LoadRecordFromFile(file = RECORD_PATH) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

/** Parses the record as it stands at a git ref, or returns null when the ref has none. */
export function LoadRecordFromRef(ref = 'origin/next') {
  try {
    const text = execFileSync('git', ['show', `${ref}:${RECORD_PATH}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Every line as `{ key, ...fields }`, in record order. */
export function Lines(record) {
  return Object.entries(record?.lines ?? {}).map(([key, line]) => ({ key, ...line }));
}

/** npm dist-tag a line publishes under: `latest` through main, `lts-<line>` from its own branch. */
export function DistTag(line) {
  return line.releasesThrough === 'main' ? 'latest' : `lts-${line.key}`;
}

/** The MJ range a line's packages and mj-app.json declare: the line's MJ version up to the next minor. */
export function MjRange(line) {
  const [, major, minor] = LINE_KEY.exec(line.key);
  return `>=${line.mjVersion} <${major}.${Number(minor) + 1}.0`;
}

/** The line whose branch is `branch`, with derived fields, or null. */
export function ResolveBranch(record, branch) {
  const line = Lines(record).find((l) => l.branch === branch);
  return line ? Describe(line) : null;
}

/** The line released through main, or null. */
export function MainLine(record) {
  const line = Lines(record).find((l) => l.releasesThrough === 'main');
  return line ? Describe(line) : null;
}

/** Open lines, with derived fields. */
export function OpenLines(record) {
  return Lines(record).filter((l) => l.status === 'open').map(Describe);
}

function Describe(line) {
  return { ...line, distTag: DistTag(line), mjRange: MjRange(line) };
}

/** Structural problems with a record, as readable lines. Empty when valid. */
export function ValidateRecord(record) {
  const problems = [];
  if (!record || typeof record !== 'object') {
    return ['the record is not a JSON object'];
  }
  const edgeOnly = record.next?.edgeOnlyMigrations;
  if (!Array.isArray(edgeOnly)) {
    problems.push('next.edgeOnlyMigrations must be an array (empty when there are none)');
  } else {
    for (const name of edgeOnly) {
      if (typeof name !== 'string' || !MIGRATION_FILE.test(name)) {
        problems.push(`next.edgeOnlyMigrations: "${name}" is not a migration file name (V<12 digits>__<name>.sql, no folder)`);
      }
    }
  }
  const lines = Lines(record);
  if (lines.length === 0) {
    problems.push('lines is empty: at least one line must exist');
  }
  for (const line of lines) {
    const where = `lines["${line.key}"]`;
    const key = LINE_KEY.exec(line.key);
    if (!key) {
      problems.push(`${where}: the key must be the MJ major.minor, e.g. "6.2"`);
      continue;
    }
    if (line.branch !== `lts/${line.key}`) {
      problems.push(`${where}: branch must be "lts/${line.key}" (got "${line.branch}")`);
    }
    if (!STATUSES.has(line.status)) {
      problems.push(`${where}: status must be "open" or "lts" (got "${line.status}")`);
    }
    if (!ROUTES.has(line.releasesThrough)) {
      problems.push(`${where}: releasesThrough must be "main" or "branch" (got "${line.releasesThrough}")`);
    }
    const mj = SEMVER.exec(line.mjVersion ?? '');
    if (!mj || mj[1] !== key[1] || mj[2] !== key[2]) {
      problems.push(`${where}: mjVersion must be a ${line.key}.x version (got "${line.mjVersion}")`);
    }
    if (!Number.isInteger(line.appMajor) || line.appMajor < 0) {
      problems.push(`${where}: appMajor must be a whole number (got "${line.appMajor}")`);
    }
  }
  const throughMain = lines.filter((l) => l.releasesThrough === 'main');
  if (lines.length > 0 && throughMain.length !== 1) {
    problems.push(`exactly one line releases through main (found ${throughMain.length}): main can follow only one line's history`);
  }
  if (throughMain.length === 1) {
    const newest = [...lines].sort(CompareKeys).at(-1);
    if (newest.key !== throughMain[0].key) {
      problems.push(`the line released through main must be the newest line (${newest.key}), not ${throughMain[0].key}`);
    }
  }
  return problems;
}

/** Problems with going from `base` to `head`. A line's identity never changes; LTS is final. */
export function ValidateTransition(base, head) {
  const problems = [];
  const before = new Map(Lines(base).map((l) => [l.key, l]));
  for (const line of Lines(head)) {
    const was = before.get(line.key);
    if (!was) {
      continue; // a new line: a cut
    }
    for (const field of ['branch', 'mjVersion', 'appMajor']) {
      if (was[field] !== line[field]) {
        problems.push(`lines["${line.key}"].${field} changed from "${was[field]}" to "${line[field]}": a line's ${field} is fixed when it is cut`);
      }
    }
    if (was.status === 'lts' && line.status !== 'lts') {
      problems.push(`lines["${line.key}"] goes from lts back to ${line.status}: an LTS line never reopens, because hosts on it may already be behind a newer line's migrations`);
    }
  }
  return problems;
}

function CompareKeys(a, b) {
  const [, am, an] = LINE_KEY.exec(a.key);
  const [, bm, bn] = LINE_KEY.exec(b.key);
  return Number(am) - Number(bm) || Number(an) - Number(bn);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function option(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function load(args) {
  const file = option(args, '--file');
  if (file) {
    return LoadRecordFromFile(file);
  }
  const ref = option(args, '--ref') ?? 'origin/next';
  const record = LoadRecordFromRef(ref);
  if (!record) {
    console.error(`✗ no ${RECORD_PATH} at ${ref}. Fetch it first: git fetch --no-tags origin next`);
    process.exit(2);
  }
  return record;
}

function main(argv) {
  const [command, ...args] = argv;
  switch (command) {
    case 'validate': {
      const record = load(args);
      const problems = ValidateRecord(record);
      const baseRef = option(args, '--base');
      if (baseRef) {
        const base = LoadRecordFromRef(baseRef);
        if (base) {
          problems.push(...ValidateTransition(base, record));
        }
      }
      if (problems.length > 0) {
        for (const p of problems) {
          console.log(`::error file=${RECORD_PATH}::${p}`);
        }
        return 1;
      }
      console.log(`✓ ${RECORD_PATH}: ${Lines(record).map((l) => `${l.key} ${l.status}`).join(', ')}`);
      return 0;
    }
    case 'resolve': {
      const branch = args[0];
      if (!branch || branch.startsWith('--')) {
        console.error('usage: release-lines.mjs resolve <branch>');
        return 2;
      }
      console.log(JSON.stringify(ResolveBranch(load(args.slice(1)), branch) ?? {}));
      return 0;
    }
    case 'main-line':
      console.log(JSON.stringify(MainLine(load(args)) ?? {}));
      return 0;
    case 'open-lines':
      console.log(JSON.stringify(OpenLines(load(args))));
      return 0;
    default:
      console.error('usage: release-lines.mjs validate|resolve|main-line|open-lines [--file F | --ref R]');
      return 2;
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
