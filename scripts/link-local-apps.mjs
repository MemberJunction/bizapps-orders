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
 * That last property is also the trap — see SHARED_IDENTITY below.
 *
 * Runs on postinstall so links survive `npm install`.
 */
import { readFileSync, existsSync, readdirSync, rmSync, symlinkSync, mkdirSync, lstatSync, realpathSync } from 'node:fs';
import { join, resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const configPath = join(root, '.mj-links.json');

if (!existsSync(configPath)) process.exit(0);

const { links = {} } = JSON.parse(readFileSync(configPath, 'utf8'));
const entries = Object.entries(links);
if (entries.length === 0) process.exit(0);

/**
 * Packages whose module IDENTITY must be singular across every linked app.
 *
 * WHY THIS IS NOT THE SAME AS "server-side duplication is safe". That claim holds for
 * MemberJunction because BaseSingleton parks instances on `globalThis`, so two copies of
 * @memberjunction/global still share one ClassFactory. It does NOT generalise. The three
 * packages below keep their state in MODULE-LOCAL storage, so a second copy is a second,
 * independent universe:
 *
 *   type-graphql     — decorators write into a metadata storage held in module scope.
 *                      Accounting's @ObjectType/@Field/@Arg register into ITS copy while
 *                      buildSchema() reads OURS, so every accounting type looks
 *                      undeclared. Presents as CannotDetermineGraphQLTypeError on an
 *                      arbitrary accounting resolver — for us,
 *                      mjBizAppsAccountingJournalEntryBatchSequence — with the decorator
 *                      plainly correct in both source and dist, which sends you hunting
 *                      for a bug that is not there.
 *   graphql          — carries its own instanceof checks and refuses mixed copies outright
 *                      ("Cannot use GraphQLScalarType from another module"). Ours resolved
 *                      16.14.2 against accounting's 16.14.0, so even the versions differed.
 *   reflect-metadata — patches the Reflect global, but each copy keeps its own WeakMap of
 *                      design:type entries. Two copies means emitted type metadata is
 *                      written where the reader never looks.
 *
 * Node resolves a symlinked package's imports from its REAL path, and the sibling repos are
 * siblings — ../bizapps-accounting is not below us — so accounting can never fall through to
 * our node_modules on its own. Deleting its copies would break it outright. Pointing them at
 * ours is what actually collapses the two universes into one: Node's module cache is keyed on
 * the RESOLVED REAL path, so once both sides resolve to the same directory there is exactly
 * one instance and one metadata storage.
 *
 * `--preserve-symlinks` looks like the tidy alternative but is not: it changes resolution for
 * EVERY package at once, so the failure simply relocates to whichever linked app is unlucky
 * next (it moved ours to @mj-biz-apps/tasks-core). This list is surgical and self-documenting.
 */
const SHARED_IDENTITY = ['type-graphql', 'graphql', 'reflect-metadata'];

/**
 * Scopes where EVERY package is shared when the two sides agree on the version.
 *
 * Collapsing type-graphql alone is not enough, and the way it fails is instructive: with one
 * shared metadata storage, both copies of @memberjunction/server suddenly register their types
 * into it, and buildSchema dies on "Schema must contain uniquely named types but contains
 * multiple types named RunViewByIDInput". Fixing the storage split turns a missing-type error
 * into a duplicate-type error — the same root cause seen from the other side. At least five MJ
 * packages declare GraphQL types (server, graphql-dataprovider, codegen-lib, react-runtime,
 * entity-communications-client), so an explicit list would need constant maintenance.
 *
 * The rule instead: if both trees have the identical version, share one copy. Every
 * @memberjunction/* package here is 5.49.0 on both sides and the skyway ones are 0.6.2, so in
 * practice this collapses the whole framework to one instance — which is what we want anyway,
 * since MJ's globalThis trick makes duplication survivable rather than desirable.
 *
 * A VERSION MISMATCH IS LEFT ALONE and warned about. Silently forcing a peer onto a version it
 * was not built against trades a loud boot failure for a subtle runtime one, which is a bad
 * trade. graphql above is the deliberate exception: 16.14.0 vs 16.14.2 must be reconciled
 * because graphql refuses mixed copies outright, and a patch bump is safe to force.
 */
const SHARED_SCOPES = ['@memberjunction'];

let linked = 0;
let deduped = 0;
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

  // Collapse the identity-sensitive packages onto our copy. Every node_modules in the
  // linked repo is redirected, not just the top one: a nested copy under packages/*/
  // shadows the root and would reintroduce the split silently.
  for (const nm of nodeModulesDirs(appRoot)) {
    for (const pkg of sharedPackagesIn(nm)) {
      const ours = join(root, 'node_modules', pkg);
      if (!existsSync(ours)) continue;               // we do not have it; nothing to share
      const theirs = join(nm, pkg);

      // Already pointing at us? Leave it be, so repeat postinstalls stay quiet.
      const st = safeLstat(theirs);
      if (!st) continue;  // they never had it — their own resolution already reaches ours or fails loudly
      if (st.isSymbolicLink() && safeRealpath(theirs) === safeRealpath(ours)) continue;

      // Version guard. SHARED_IDENTITY is forced regardless (see the note above); a
      // scope-shared package with mismatched versions is skipped and reported.
      if (!SHARED_IDENTITY.includes(pkg)) {
        const ov = versionOf(ours), tv = versionOf(theirs);
        if (!ov || !tv || ov !== tv) {
          problems.push(`${pkg}: version differs (ours ${ov ?? '?'} vs ${appName} ${tv ?? '?'}) — left unshared`);
          continue;
        }
      }

      rmSync(theirs, { recursive: true, force: true });
      symlinkSync(relative(dirname(theirs), ours), theirs, 'dir');
      deduped++;
    }
  }
}

/** The identity packages plus every member of a shared scope actually installed at `nm`. */
function sharedPackagesIn(nm) {
  const out = [...SHARED_IDENTITY];
  for (const scope of SHARED_SCOPES) {
    const dir = join(nm, scope);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) out.push(`${scope}/${name}`);
  }
  return out;
}

function versionOf(pkgDir) {
  try { return JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')).version ?? null; }
  catch { return null; }
}

/** Every node_modules directory in a linked repo: the root one plus one per workspace package. */
function nodeModulesDirs(appRoot) {
  const found = [];
  const rootNm = join(appRoot, 'node_modules');
  if (existsSync(rootNm)) found.push(rootNm);

  const pkgDir = join(appRoot, 'packages');
  if (existsSync(pkgDir)) {
    for (const dir of readdirSync(pkgDir)) {
      const nm = join(pkgDir, dir, 'node_modules');
      if (existsSync(nm)) found.push(nm);
    }
  }
  return found;
}

function safeLstat(p) { try { return lstatSync(p); } catch { return null; } }
function safeRealpath(p) { try { return realpathSync(p); } catch { return null; } }

if (linked) console.log(`mj-links: linked ${linked} package(s) from ${entries.length} local app(s)`);
if (deduped) console.log(`mj-links: redirected ${deduped} duplicate package copy(ies) onto ours (${SHARED_IDENTITY.join(', ')} + ${SHARED_SCOPES.join(', ')}/* at matching versions)`);
for (const p of problems) console.warn(`mj-links: WARNING ${p}`);
