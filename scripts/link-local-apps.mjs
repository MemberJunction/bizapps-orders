#!/usr/bin/env node
/**
 * Apply local Open App links declared in .mj-links.json.
 *
 * INTERIM TOOL — stands in for the proposed `mj app link` (MemberJunction/MJ#3273).
 * Delete this script and the config once that ships.
 *
 * Why it exists: bizapps-accounting is not published to npm, so orders cannot resolve
 * it through the registry. The alternatives all fail:
 *   - `npm link`   -> global invisible state, destroyed by `npm install`
 *   - `file:` deps -> npm reads the linked package's manifest and tries to resolve ITS
 *                     deps from the registry; accounting depends on unpublished siblings
 *                     by exact version ("accounting-entities": "0.1.0") -> 404
 * Raw symlinks avoid both: npm never inspects them, and node's runtime resolution walks
 * the symlink's REAL path, finding the producer's own node_modules.
 *
 * Runs on postinstall so links survive `npm install`.
 */
import { readFileSync, existsSync, readdirSync, rmSync, symlinkSync, mkdirSync, lstatSync } from 'node:fs';
import { join, resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const configPath = join(root, '.mj-links.json');

if (!existsSync(configPath)) process.exit(0);

const { links = {} } = JSON.parse(readFileSync(configPath, 'utf8'));
const entries = Object.entries(links);
if (entries.length === 0) process.exit(0);

let linked = 0;
const problems = [];

for (const [appName, cfg] of entries) {
  const appRoot = resolve(root, cfg.path);
  const pkgDir = join(appRoot, 'packages');

  if (!existsSync(pkgDir)) {
    problems.push(`${appName}: no packages/ directory at ${cfg.path} — is the sibling repo checked out?`);
    continue;
  }

  for (const dir of readdirSync(pkgDir)) {
    const manifest = join(pkgDir, dir, 'package.json');
    if (!existsSync(manifest)) continue;

    const { name, main } = JSON.parse(readFileSync(manifest, 'utf8'));
    if (!name) continue;

    // Client packages stay unlinked: two copies of @angular/* in one bundle breaks
    // Angular DI (class-identity based). Server-side duplication is safe.
    if (cfg.scope === 'server' && /-ng$/.test(name)) continue;

    if (main && !existsSync(join(pkgDir, dir, main))) {
      problems.push(`${name}: not built (missing ${main}) — run \`npm run build\` in ${cfg.path}`);
    }

    const [scope, short] = name.startsWith('@') ? name.split('/') : [null, name];
    const destDir = scope ? join(root, 'node_modules', scope) : join(root, 'node_modules');
    const dest = join(destDir, short);

    mkdirSync(destDir, { recursive: true });
    if (existsSync(dest) || safeLstat(dest)) rmSync(dest, { recursive: true, force: true });
    symlinkSync(relative(destDir, join(pkgDir, dir)), dest, 'dir');
    linked++;
  }
}

function safeLstat(p) { try { return lstatSync(p); } catch { return null; } }

if (linked) console.log(`mj-links: linked ${linked} package(s) from ${entries.length} local app(s)`);
for (const p of problems) console.warn(`mj-links: WARNING ${p}`);
