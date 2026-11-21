#!/usr/bin/env node
// The `next` mode of the ci-install action: build this Open App against MemberJunction `next` and
// its sibling Open Apps' `next`, from source, in one pnpm workspace — the layout every developer
// uses (`mj dev workspace`). No dependencies beyond Node and git; `tsx` is fetched to run MJ's own
// workspace generator from MJ's source, so the CI workspace is the one `mj dev workspace` writes.
//
//   prepare     resolve the MJ commit, clone MJ and the sibling apps beside this checkout, write
//               the parent pnpm-workspace.yaml / package.json / .npmrc
//   install     pnpm install at the parent, limited to this app and what it depends on
//   fetch-dist  download MJ's own build of that commit (the `mj-dist` artifact of its
//               "Build all packages for testing" run), when there is one
//   build       build MJ from source when no build was fetched or cached, then the sibling apps
//
// Which MJ commit: the newest commit on MJ `next` whose "Build all packages for testing" run
// passed, so a broken MJ merge does not turn every Open App red at once. MJ_NEXT_REF overrides it.
// The commit is printed in the log and the job summary, so a run can be reproduced.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const MJ_REPO = 'MemberJunction/MJ';
const MJ_BUILD_WORKFLOW = 'build.yml';
const MJ_DIST_ARTIFACT = 'mj-dist';
const TSX = 'tsx@4.21.0';
const MAX_SIBLINGS = 40;

const appDir = process.env.GITHUB_WORKSPACE ? path.resolve(process.env.GITHUB_WORKSPACE) : process.cwd();
const parentDir = path.dirname(appDir);
const appName = path.basename(appDir);
const mjDir = path.join(parentDir, 'MJ');
const stateFile = path.join(process.env.RUNNER_TEMP || parentDir, 'mj-next-workspace.json');

const startedAt = Date.now();

function log(message) {
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0).padStart(4);
  console.log(`[mj-next-workspace +${elapsed}s] ${message}`);
}

/** Parallel builds: one per CPU, but never more than memory allows at ~3 GB per tsc/ngc. */
function buildConcurrency() {
  const cpus = typeof os.availableParallelism === 'function' ? os.availableParallelism() : os.cpus().length;
  const byMemory = Math.max(1, Math.floor(os.totalmem() / (3 * 1024 ** 3)));
  return Math.max(1, Math.min(cpus, byMemory));
}

function fail(message) {
  console.log(`::error::mj-next-workspace: ${message}`);
  process.exit(1);
}

function run(cmd, args, options = {}) {
  log(`$ ${cmd} ${args.join(' ')}`);
  const result = spawnSync(cmd, args, { stdio: 'inherit', ...options });
  if (result.status !== 0) fail(`${cmd} ${args.join(' ')} exited ${result.status ?? result.signal}`);
}

function capture(cmd, args, options = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options }).trim();
}

function setOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

function summary(markdown) {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function readState() {
  if (!existsSync(stateFile)) fail(`no state at ${stateFile}; run "prepare" first`);
  return readJson(stateFile);
}

/** The newest MJ `next` commit whose build workflow passed, and that run's id. */
function resolveMjCommit() {
  const override = process.env.MJ_NEXT_REF?.trim();
  if (override) {
    const sha = /^[0-9a-f]{40}$/i.test(override) ? override : lsRemote(`https://github.com/${MJ_REPO}`, override);
    return { sha, runId: findRunFor(sha), source: `MJ_NEXT_REF=${override}` };
  }
  try {
    const out = capture('gh', [
      'api',
      `repos/${MJ_REPO}/actions/workflows/${MJ_BUILD_WORKFLOW}/runs?branch=next&event=push&status=success&per_page=1`,
      '--jq',
      '.workflow_runs[0] | "\\(.head_sha) \\(.id)"',
    ]);
    const [sha, runId] = out.split(' ');
    if (/^[0-9a-f]{40}$/i.test(sha)) return { sha, runId, source: 'newest MJ next commit whose build passed' };
  } catch (error) {
    log(`could not read MJ's build runs (${error.message.split('\n')[0]}); using the head of next`);
  }
  return { sha: lsRemote(`https://github.com/${MJ_REPO}`, 'next'), runId: '', source: 'head of MJ next' };
}

function findRunFor(sha) {
  try {
    return capture('gh', [
      'api',
      `repos/${MJ_REPO}/actions/workflows/${MJ_BUILD_WORKFLOW}/runs?head_sha=${sha}&status=success&per_page=1`,
      '--jq',
      '.workflow_runs[0].id // ""',
    ]);
  } catch {
    return '';
  }
}

function lsRemote(url, ref) {
  const line = capture('git', ['ls-remote', url, `refs/heads/${ref}`]);
  const sha = line.split(/\s+/)[0];
  if (!/^[0-9a-f]{40}$/i.test(sha)) fail(`could not resolve ${ref} of ${url}`);
  return sha;
}

/** Shallow clone of one commit or branch into dir. */
function shallowClone(url, ref, dir) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  run('git', ['init', '-q'], { cwd: dir });
  run('git', ['fetch', '-q', '--depth', '1', '--no-tags', url, ref], { cwd: dir });
  run('git', ['checkout', '-q', 'FETCH_HEAD'], { cwd: dir });
  return capture('git', ['rev-parse', 'HEAD'], { cwd: dir });
}

/** Open App repos this app depends on, transitively, from each mj-app.json's dependencies. */
function cloneSiblings() {
  const cloned = new Map();
  const queue = [appDir];
  while (queue.length > 0) {
    const repoDir = queue.shift();
    const manifest = path.join(repoDir, 'mj-app.json');
    if (!existsSync(manifest)) continue;
    const dependencies = readJson(manifest).dependencies ?? {};
    for (const [appId, spec] of Object.entries(dependencies)) {
      const url = typeof spec === 'object' ? spec.repository : undefined;
      const match = url?.match(/github\.com\/([^/]+)\/([^/.#]+)/i);
      if (!match) {
        log(`${appId}: no GitHub repository in mj-app.json; it resolves from the registry`);
        continue;
      }
      const [, owner, repo] = match;
      const dirName = repo;
      if (dirName === appName || dirName === 'MJ' || cloned.has(dirName)) continue;
      if (cloned.size >= MAX_SIBLINGS) fail(`more than ${MAX_SIBLINGS} sibling apps; is mj-app.json cyclic?`);
      const target = path.join(parentDir, dirName);
      try {
        const sha = cloneSibling(owner, repo, target);
        cloned.set(dirName, { appId, repo: `${owner}/${repo}`, sha });
        queue.push(target);
      } catch (error) {
        rmSync(target, { recursive: true, force: true });
        log(`${owner}/${repo}: not cloned (${error.message.split('\n')[0]}); it resolves from the registry`);
      }
    }
  }
  return cloned;
}

/**
 * Public siblings clone anonymously. A private or internal one (bizapps-caliber is internal)
 * needs SIBLING_TOKEN, an org App token the caller mints; it is passed to git through an
 * environment-scoped header, never in the URL, so it cannot reach a log or an error message.
 */
function cloneSibling(owner, repo, target) {
  const url = `https://github.com/${owner}/${repo}`;
  try {
    return shallowCloneQuiet(url, 'next', target);
  } catch (error) {
    const token = process.env.SIBLING_TOKEN;
    if (!token) throw error;
    const basic = Buffer.from(`x-access-token:${token}`).toString('base64');
    return shallowCloneQuiet(url, 'next', target, {
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
      GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${basic}`,
    });
  }
}

function shallowCloneQuiet(url, ref, dir, extraEnv = {}) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', ...extraEnv };
  capture('git', ['init', '-q'], { cwd: dir, env });
  capture('git', ['fetch', '-q', '--depth', '1', '--no-tags', url, ref], { cwd: dir, env });
  capture('git', ['checkout', '-q', 'FETCH_HEAD'], { cwd: dir, env });
  return capture('git', ['rev-parse', 'HEAD'], { cwd: dir });
}

/** Runs MJ's own `mj dev workspace` generator, from MJ source, to write the parent files. */
function generateWorkspace() {
  const libDir = path.join(mjDir, 'packages/MJCLI/src/lib/dev-workspace');
  if (!existsSync(path.join(libDir, 'build.ts'))) fail(`MJ's workspace generator is not at ${libDir}`);
  run('npx', ['--yes', TSX, process.argv[1], 'generate'], { cwd: parentDir, env: { ...process.env, MJ_WORKSPACE_LIB: libDir } });
}

async function generate() {
  const lib = process.env.MJ_WORKSPACE_LIB;
  const { DetectCandidates, LoadRepo, ParseWorkspacePackagesGlobs, SelectAppGlobs } = await import(path.join(lib, 'detect.ts'));
  const { AssertAppPackageNamesUnique, BuildRootPackageJson, BuildWorkspaceYaml, BuildNpmrc } = await import(path.join(lib, 'build.ts'));
  const { WriteWorkspaceFiles } = await import(path.join(lib, 'write.ts'));
  const members = withOwnAppGlobs(DetectCandidates(parentDir), { LoadRepo, ParseWorkspacePackagesGlobs, SelectAppGlobs });
  log(`members: ${members.map((m) => m.Name).join(', ')}`);
  AssertAppPackageNamesUnique(members);
  const rootPkg = BuildRootPackageJson(path.basename(parentDir), members);
  for (const conflict of rootPkg.Conflicts ?? []) log(`devDependency conflict on ${conflict.Package} (resolved by the generator)`);
  dropPlatformBindingPins(rootPkg.PnpmSettings?.overrides ?? {});
  dropOlderMajorPins(rootPkg.PnpmSettings?.overrides ?? {});
  preferMjResolutions(members, rootPkg.PnpmSettings?.overrides ?? {});
  const files = [
    { Name: 'pnpm-workspace.yaml', Content: BuildWorkspaceYaml(members, rootPkg.PnpmSettings) },
    { Name: '.npmrc', Content: BuildNpmrc() },
    { Name: 'package.json', Content: rootPkg.Content },
  ];
  const result = WriteWorkspaceFiles(parentDir, files, true);
  log(`wrote ${result.Written.join(', ')} at ${parentDir}`);
}

/**
 * The generator admits only `packages/*` from each member, because app shells (`apps/*`) collide
 * across repos. The app under test is the exception: its own non-packages workspace members (an
 * `e2e` project, `apps/MJAPI`) are part of its CI, and no other member can collide with them. This
 * is `mj dev workspace --apps` applied to that one member.
 */
function withOwnAppGlobs(members, { LoadRepo, ParseWorkspacePackagesGlobs, SelectAppGlobs }) {
  const yamlPath = path.join(appDir, 'pnpm-workspace.yaml');
  if (!existsSync(yamlPath)) return members;
  const appGlobs = ParseWorkspacePackagesGlobs(readFileSync(yamlPath, 'utf8')).filter((glob) => {
    const body = glob.replace(/^\.\//, '');
    if (glob.startsWith('!') || body.startsWith('packages/') || body === '.' || body === '') return false;
    try {
      return SelectAppGlobs([glob]).length === 1;
    } catch {
      log(`not admitting ${appName}'s workspace glob '${glob}' (a shape the generator does not take)`);
      return false;
    }
  });
  if (appGlobs.length === 0) return members;
  log(`admitting ${appName}'s own workspace members: ${appGlobs.join(', ')}`);
  return members.map((member) => (member.Name === appName ? LoadRepo(parentDir, appName, { AppGlobs: appGlobs }) ?? member : member));
}

/**
 * Platform binaries (rollup's, esbuild's, swc's ...) must be the exact version of the package that
 * loads them. One workspace-wide pin taken from a lockfile (MJ's root lists
 * `@rollup/rollup-linux-x64-gnu` 4.17.2 directly) hands rollup 4.57 a 4.17 parser, and every
 * pkgroll build fails with "ast.body is not iterable". Each package keeps its own binding instead.
 */
const PLATFORM_BINDING = /^(@rollup\/rollup-|@esbuild\/|@rolldown\/binding-|@swc\/core-|lightningcss-|@img\/sharp-|@parcel\/watcher-|@lmdb\/lmdb-|@nx\/nx-|@oxc-[a-z-]+\/binding-|@biomejs\/cli-|turbo-(linux|darwin|windows)-)/;

function dropPlatformBindingPins(overrides) {
  const dropped = Object.keys(overrides).filter((key) => PLATFORM_BINDING.test(key) && !key.includes('>'));
  for (const key of dropped) delete overrides[key];
  if (dropped.length > 0) log(`dropped ${dropped.length} platform-binding pins: ${dropped.join(', ')}`);
}

/**
 * For a package resolved in two majors the generator pins each one (`@types/express@^4`,
 * `@types/express@^5`). pnpm applies a `name@^4` selector to any dependency whose range
 * intersects it — including `*` — so `@types/compression` (which asks for `@types/express: *`)
 * got express types 4 next to the app's 5, and every Express handler stopped type-checking. Only
 * the newest major keeps its pin; older majors resolve as their own dependents ask.
 */
function dropOlderMajorPins(overrides) {
  const byName = new Map();
  for (const key of Object.keys(overrides)) {
    const match = /^(@?[^@>]+)@\^(\d+)$/.exec(key);
    if (!match) continue;
    const [, name, major] = match;
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push({ key, major: Number(major) });
  }
  const dropped = [];
  for (const keys of byName.values()) {
    if (keys.length < 2) continue;
    const newest = Math.max(...keys.map((k) => k.major));
    for (const { key, major } of keys) {
      if (major === newest) continue;
      delete overrides[key];
      dropped.push(key);
    }
  }
  if (dropped.length > 0) log(`dropped ${dropped.length} older-major pins: ${dropped.join(', ')}`);
}

/**
 * Where MJ and an app's committed lockfiles resolve the same tool to different versions in one
 * major, the generator pins the newest (e.g. rollup 4.62 from the apps over MJ's 4.57, which
 * MJ's pkgroll build cannot use). CI builds MJ from source here, so MJ's own resolution wins
 * whenever it still satisfies every range a member declares for that package; otherwise the
 * generator's pin stands.
 */
function preferMjResolutions(members, overrides) {
  const mj = members.find((m) => m.Name === 'MJ');
  const resolutions = mj?.Lockfile?.Resolutions;
  if (!Array.isArray(resolutions)) return;
  const mjVersions = new Map();
  for (const entry of resolutions) {
    if (!mjVersions.has(entry.Name)) mjVersions.set(entry.Name, new Set());
    mjVersions.get(entry.Name).add(entry.Version);
  }
  const declared = declaredRanges(members);
  const changed = [];
  for (const [key, pinned] of Object.entries(overrides)) {
    const match = /^(@?[^@>]+)(?:@\^(\d+))?$/.exec(key);
    if (!match || typeof pinned !== 'string' || !/^\d+\.\d+\.\d+/.test(pinned)) continue;
    const [, name] = match;
    const major = pinned.split('.')[0];
    const candidates = [...(mjVersions.get(name) ?? [])].filter((v) => v.split('.')[0] === major && v !== pinned);
    if (candidates.length !== 1 || mjVersions.get(name).has(pinned)) continue;
    const mjVersion = candidates[0];
    if (!(declared.get(name) ?? []).every((range) => satisfies(mjVersion, range))) continue;
    overrides[key] = mjVersion;
    changed.push(`${key} ${pinned} -> ${mjVersion}`);
  }
  if (changed.length > 0) log(`kept MJ's lockfile resolution for ${changed.length}: ${changed.join(', ')}`);
}

function declaredRanges(members) {
  const ranges = new Map();
  for (const member of members) {
    const manifests = [readJsonIfExists(path.join(parentDir, member.Name, 'package.json')), ...(member.Packages ?? []).map((p) => p.PackageJson)];
    for (const manifest of manifests) {
      for (const deps of [manifest?.dependencies, manifest?.devDependencies, manifest?.peerDependencies, manifest?.optionalDependencies]) {
        for (const [name, range] of Object.entries(deps ?? {})) {
          if (!ranges.has(name)) ranges.set(name, []);
          ranges.get(name).push(range);
        }
      }
    }
  }
  return ranges;
}

function readJsonIfExists(file) {
  return existsSync(file) ? readJson(file) : null;
}

/** A small semver check for the range shapes the family uses; unknown shapes never match. */
function satisfies(version, range) {
  const v = parseVersion(version);
  if (!v) return false;
  return range.split('||').some((alt) => alt.trim().split(/\s+/).every((part) => satisfiesPart(v, part)));
}

function satisfiesPart(v, part) {
  if (part === '*' || part === 'x' || part === '' || part === 'latest') return true;
  const m = /^(\^|~|>=|<=|>|<|=)?v?(\d+)(?:\.(\d+|x|\*))?(?:\.(\d+|x|\*))?(-[0-9A-Za-z.-]+)?$/.exec(part);
  if (!m) return false;
  const [, op = '', maj, min = 'x', pat = 'x'] = m;
  const lo = [Number(maj), min === 'x' || min === '*' ? 0 : Number(min), pat === 'x' || pat === '*' ? 0 : Number(pat)];
  const cmp = compareTriples(v, lo);
  if (op === '>=') return cmp >= 0;
  if (op === '>') return cmp > 0;
  if (op === '<') return cmp < 0;
  if (op === '<=') return cmp <= 0;
  if (op === '^') return cmp >= 0 && (lo[0] > 0 ? v[0] === lo[0] : lo[1] > 0 ? v[0] === 0 && v[1] === lo[1] : v[0] === 0 && v[1] === 0 && v[2] === lo[2]);
  if (op === '~' || min === 'x' || pat === 'x') return cmp >= 0 && v[0] === lo[0] && (min === 'x' && op !== '~' ? true : v[1] === lo[1]);
  return cmp === 0;
}

function parseVersion(version) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function compareTriples(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

/** A key for the cached MJ build: the MJ commit plus every package.json that shapes the closure. */
function distKey(mjSha) {
  const hash = createHash('sha256');
  for (const dir of [appDir, ...listDirs(parentDir).filter((d) => d !== appDir && d !== mjDir)]) {
    for (const file of packageJsonFiles(dir)) hash.update(file).update(readFileSync(file));
  }
  return `mj-next-dist-v1-${mjSha}-${hash.digest('hex').slice(0, 16)}`;
}

function listDirs(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules')
    .map((e) => path.join(dir, e.name));
}

function packageJsonFiles(repoDir) {
  const files = [path.join(repoDir, 'package.json')];
  const packagesDir = path.join(repoDir, 'packages');
  if (existsSync(packagesDir)) {
    for (const pkg of listDirs(packagesDir)) files.push(path.join(pkg, 'package.json'));
  }
  return files.filter((f) => existsSync(f)).sort();
}

function prepare() {
  if (existsSync(path.join(parentDir, '.git'))) fail(`${parentDir} is a git repo; the app must be checked out one level below a plain directory`);
  const mj = resolveMjCommit();
  log(`MJ ${mj.sha} (${mj.source})`);
  shallowClone(`https://github.com/${MJ_REPO}`, mj.sha, mjDir);
  const siblings = cloneSiblings();
  generateWorkspace();
  const key = distKey(mj.sha);
  writeFileSync(stateFile, JSON.stringify({ mjSha: mj.sha, runId: mj.runId, siblings: Object.fromEntries(siblings) }, null, 2));
  setOutput('mj-dir', mjDir);
  setOutput('mj-sha', mj.sha);
  setOutput('dist-key', key);
  summary(
    [
      '### Built against MemberJunction `next`',
      '',
      `- MJ: [\`${mj.sha.slice(0, 10)}\`](https://github.com/${MJ_REPO}/commit/${mj.sha}) — ${mj.source}`,
      ...[...siblings.entries()].map(([dir, s]) => `- ${dir}: [\`${s.sha.slice(0, 10)}\`](https://github.com/${s.repo}/commit/${s.sha}) (next)`),
      '',
      'Reproduce locally: check out those commits side by side and run `mj dev workspace` in their parent.',
    ].join('\n')
  );
}

/**
 * A full install of the generated workspace — exactly what a developer runs at the parent. A
 * filtered install (only this app's dependency closure) changes which copy of a multi-major type
 * package pnpm hoists (`@types/express` 4 instead of 5), and MJ's server stops compiling.
 */
function install() {
  const logFile = path.join(process.env.RUNNER_TEMP || parentDir, 'mj-next-install.log');
  const result = spawnSync('bash', ['-c', `set -o pipefail; pnpm install --no-frozen-lockfile 2>&1 | tee "${logFile}"`], {
    cwd: parentDir,
    stdio: 'inherit',
  });
  if (result.status === 0) return;
  const failedMember = memberLifecycleFailure(readFileSync(logFile, 'utf8'));
  if (!failedMember) fail(`pnpm install exited ${result.status}`);
  // A workspace member's own install-time script (bizapps-caliber's Angular `prepare` runs its
  // prebuild) can need MJ's dist/, which does not exist until the build step. Dependencies'
  // scripts have already run by then; finish the linking without lifecycle scripts and carry on.
  // The member's prebuild still runs as part of its own build.
  log(`${failedMember} failed at install time, before MJ is built; finishing the install without lifecycle scripts`);
  run('pnpm', ['install', '--no-frozen-lockfile', '--offline', '--ignore-scripts'], { cwd: parentDir });
}

/** The workspace member whose own lifecycle script failed the install, if that is the only failure. */
function memberLifecycleFailure(output) {
  const match = /^(\S+) (preinstall|install|postinstall|prepare): Failed$/m.exec(output.replace(/\x1b\[[0-9;]*m/g, ''));
  if (!match || match[1].includes('node_modules')) return null;
  return `${match[1]} (${match[2]})`;
}

/** Re-links package bins (e.g. `mj`) whose targets only exist once dist/ is built. */
function relink() {
  run('pnpm', ['install', '--no-frozen-lockfile', '--offline', '--ignore-scripts'], { cwd: parentDir });
}

function fetchDist() {
  const { runId } = readState();
  if (!runId) {
    log('no MJ build run for this commit; MJ is built from source or restored from cache');
    setOutput('found', 'false');
    return;
  }
  const downloadDir = path.join(process.env.RUNNER_TEMP || parentDir, 'mj-dist');
  rmSync(downloadDir, { recursive: true, force: true });
  const result = spawnSync('gh', ['run', 'download', runId, '-R', MJ_REPO, '-n', MJ_DIST_ARTIFACT, '-D', downloadDir], { stdio: 'inherit' });
  const archive = path.join(downloadDir, 'mj-dist.tar.gz');
  if (result.status !== 0 || !existsSync(archive)) {
    log(`MJ run ${runId} has no ${MJ_DIST_ARTIFACT} artifact this job can download; MJ is built from source or restored from cache`);
    setOutput('found', 'false');
    return;
  }
  run('tar', ['-xzf', archive, '-C', mjDir]);
  log(`MJ build restored from run ${runId}`);
  setOutput('found', 'true');
}

/**
 * Builds what this app depends on, in dependency order, by package NAME rather than version range.
 * pnpm's own ordering (`pnpm -r run build`) matches workspace packages by range, and a sibling app
 * that declares `^6.2.1` does not match MJ `next`'s `6.3.0-edge.N` (a prerelease), so pnpm would
 * build that sibling before the MJ packages it imports. The workspace links them by name
 * (`workspace:*` overrides), so the build order follows names too.
 */
function build() {
  const mjReady = process.env.MJ_DIST_READY === 'true' || restoreCachedDist();
  if (!mjReady) log('building MJ from source — no build of this commit was downloaded or cached');
  const projects = workspaceProjects();
  const byName = new Map(projects.map((p) => [p.name, p]));
  const isApp = (p) => isUnder(p.path, appDir);
  const isMj = (p) => isUnder(p.path, mjDir);
  const needed = closure(projects.filter(isApp), byName);
  const toBuild = [...needed].filter((name) => {
    const p = byName.get(name);
    return !isApp(p) && !(mjReady && isMj(p)) && p.manifest.scripts?.build;
  });
  const levels = topologicalLevels(new Set(toBuild), byName);
  log(`building ${toBuild.length} packages in ${levels.length} dependency levels`);
  const env = { ...process.env, NODE_OPTIONS: process.env.NODE_OPTIONS || '--max-old-space-size=4096' };
  const concurrency = buildConcurrency();
  levels.forEach((level, index) => {
    log(`level ${index + 1}/${levels.length}: ${level.length} package(s)`);
    const filters = level.flatMap((name) => ['--filter', name]);
    run('pnpm', ['-r', ...filters, `--workspace-concurrency=${concurrency}`, '--reporter=append-only', 'run', 'build'], { cwd: parentDir, env });
  });
  if (!mjReady) packDistForCache();
  relink();
}

/** The cached tarball for this MJ commit, if the cache step restored one. */
function restoreCachedDist() {
  const archive = process.env.MJ_DIST_CACHE && path.join(process.env.MJ_DIST_CACHE, 'mj-dist.tar.gz');
  if (!archive || !existsSync(archive)) return false;
  run('tar', ['-xzf', archive, '-C', mjDir]);
  log('MJ build restored from the cache');
  return true;
}

/** Writes MJ's dist/ folders as one tarball for the cache step (node_modules excluded). */
function packDistForCache() {
  if (!process.env.MJ_DIST_CACHE) return;
  mkdirSync(process.env.MJ_DIST_CACHE, { recursive: true });
  const archive = path.join(process.env.MJ_DIST_CACHE, 'mj-dist.tar.gz');
  run('bash', ['-c', `find packages -name node_modules -prune -o -name dist -type d -prune -print0 | tar --null -czf "${archive}" -T -`], { cwd: mjDir });
  log(`packed MJ's build for the cache (${(readFileSize(archive) / 1024 / 1024).toFixed(0)} MB)`);
  setOutput('built-mj', 'true');
}

function readFileSize(file) {
  return statSync(file).size;
}

function isUnder(child, parent) {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** Every project in the generated workspace, with its package.json. */
function workspaceProjects() {
  const listed = JSON.parse(capture('pnpm', ['ls', '-r', '--depth', '-1', '--json'], { cwd: parentDir, maxBuffer: 64 * 1024 * 1024 }));
  return listed
    .filter((p) => p.name && p.path)
    .map((p) => ({ name: p.name, path: p.path, manifest: readJson(path.join(p.path, 'package.json')) }));
}

function workspaceDependencies(project, byName) {
  const m = project.manifest;
  const names = new Set(
    [m.dependencies, m.devDependencies, m.peerDependencies, m.optionalDependencies].flatMap((d) => Object.keys(d ?? {}))
  );
  names.delete(project.name);
  return [...names].filter((name) => byName.has(name));
}

/** Names of the given projects and everything they depend on inside the workspace. */
function closure(roots, byName) {
  const seen = new Set();
  const stack = roots.map((p) => p.name);
  while (stack.length > 0) {
    const name = stack.pop();
    if (seen.has(name)) continue;
    seen.add(name);
    stack.push(...workspaceDependencies(byName.get(name), byName));
  }
  return seen;
}

/** Groups names into levels; each level depends only on earlier ones. Breaks cycles loudly. */
function topologicalLevels(names, byName) {
  const remaining = new Set(names);
  const levels = [];
  while (remaining.size > 0) {
    const ready = [...remaining].filter((name) =>
      workspaceDependencies(byName.get(name), byName).every((dep) => !remaining.has(dep))
    );
    if (ready.length === 0) {
      log(`dependency cycle among: ${[...remaining].join(', ')} — building them together`);
      levels.push([...remaining].sort());
      break;
    }
    ready.sort();
    levels.push(ready);
    for (const name of ready) remaining.delete(name);
  }
  return levels;
}

const command = process.argv[2];
switch (command) {
  case 'prepare':
    prepare();
    break;
  case 'generate':
    await generate();
    break;
  case 'install':
    install();
    break;
  case 'fetch-dist':
    fetchDist();
    break;
  case 'build':
    build();
    break;
  default:
    fail(`unknown command "${command}"`);
}
