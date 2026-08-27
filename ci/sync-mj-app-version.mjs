#!/usr/bin/env node
/**
 * Syncs `mj-app.json`'s `version` and `mjVersionRange` from the packages.
 *
 * Runs as part of `version:ci`, i.e. INSIDE the Version Packages PR. This used to happen
 * in publish.yml, but publish no longer writes anything back to the repo except the tag —
 * so if the manifest were not synced here it would never be synced at all, and every
 * release would ship an mj-app.json still claiming the previous version.
 *
 *   version         <- packages/Entities/package.json .version (all packages are fixed-versioned)
 *   mjVersionRange  <- the @memberjunction/core dependency, as ">=<min> <nextMajor>.0.0"
 *
 * The range derivation deliberately keeps any prerelease suffix: `^6.1.0-edge.3` yields
 * `>=6.1.0-edge.3 <7.0.0`, not `>=6.1.0 <7.0.0`. Both behave identically through MJ's host
 * gate — it coerces the host version to its base tuple before matching, so neither form can
 * distinguish edge.1 from edge.3 — but the suffixed form states the floor the app actually
 * needs (it imports MJCard* components that exist only in 6.1.0-edge.3), and that floor IS
 * hard-enforced in each package's npm ranges, which pnpm and npm evaluate without coercion.
 * A previous attempt to strip the suffix here is what pushed the manifest back to `>=6.1.0`;
 * the un-stripped derivation is the intended behaviour.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const SOURCE = 'packages/Entities/package.json';
const TARGET = 'mj-app.json';

const pkg = JSON.parse(readFileSync(SOURCE, 'utf8'));
const version = pkg.version;
if (!version) {
  console.error(`✗ no version found in ${SOURCE}`);
  process.exit(1);
}

const mjDep = pkg.dependencies?.['@memberjunction/core'] ?? pkg.peerDependencies?.['@memberjunction/core'];
let range = null;
if (mjDep) {
  const min = mjDep.replace(/^[^0-9]*/, ''); // drop ^, ~, >=, … but KEEP any -edge.N
  const major = Number.parseInt(min.split('.')[0], 10);
  if (Number.isNaN(major)) {
    console.error(`✗ could not parse a major version from @memberjunction/core dep "${mjDep}"`);
    process.exit(1);
  }
  range = `>=${min} <${major + 1}.0.0`;
} else {
  console.warn(`! no @memberjunction/core dependency in ${SOURCE} — leaving mjVersionRange as-is`);
}

// Targeted line rewrites rather than JSON.stringify, so formatting and key order survive and
// the PR diff is one line per changed field.
let raw = readFileSync(TARGET, 'utf8');
const escape = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const replaceField = (text, field, next) => {
  const current = JSON.parse(text)[field];
  if (current === next) {
    console.log(`✓ ${TARGET} ${field} already "${next}"`);
    return text;
  }
  const pattern = new RegExp(`("${field}"\\s*:\\s*)"${escape(current)}"`);
  if (!pattern.test(text)) {
    console.error(`✗ could not locate "${field}": "${current}" in ${TARGET}`);
    process.exit(1);
  }
  console.log(`✓ ${TARGET} ${field} "${current}" -> "${next}"`);
  return text.replace(pattern, `$1"${next}"`);
};

raw = replaceField(raw, 'version', version);
if (range) raw = replaceField(raw, 'mjVersionRange', range);
writeFileSync(TARGET, raw);
