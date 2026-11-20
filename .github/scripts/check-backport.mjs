#!/usr/bin/env node
// ==============================================================================
// Backport checks: the two ends of "every change lands on next first, then reaches each line"
//
// labels      (a PR into `next`) A PR that adds a migration says where it goes: a
//             `backport lts/X.Y` label for EVERY open line, or every migration it adds is listed as
//             edge-only in release-lines.json (it needs the upcoming MJ version and waits for the
//             next cut). Shared migrations must reach every open line, or the lines stop carrying
//             the same set. A migration may never go to an LTS line, and a label must name a line
//             that exists. A PR without a migration may backport anywhere, or nowhere.
//
// provenance  (a PR into `lts/X.Y`) Proves the change is already on `next`. Every commit carries
//             the `(cherry picked from commit <sha>)` line the backport bot writes (git cherry-pick
//             -x), and that <sha> is on `next`. A commit without one comes from resolving a
//             cherry-pick conflict by hand: the PR then needs the `backport-adjusted` label, and
//             still at least one commit that is proven. Exempt: the release PRs the App opens
//             (`changeset-release/*`, `release-back-merge/*`), and a line cut, which carries the
//             `line-cut` label added by a maintainer or admin.
//
// Usage:  node check-backport.mjs labels     --base <merge-base sha> --labels '<json array>' [--record release-lines.json]
//         node check-backport.mjs provenance --base <merge-base sha> --labels '<json array>' [--next origin/next]
//                                            [--head-ref <branch>] [--author-type Bot|User]
//         node check-backport.mjs --self-test
// Env for `line-cut`: GH_TOKEN, GITHUB_REPOSITORY, PR_NUMBER (looks up who added the label).
// ==============================================================================
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LoadRecordFromFile, Lines } from './release-lines.mjs';
import { Stem } from './check-line-migrations.mjs';

const BACKPORT_LABEL = /^backport (lts\/\d+\.\d+)$/;
const CHERRY = /\(cherry picked from commit ([0-9a-f]{7,40})\)/g;
const APP_HEADS = ['changeset-release/', 'release-back-merge/'];

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
}

/** Problems for a PR into next. `added` = migration paths the PR adds. */
export function CheckLabels(record, labels, added) {
  const problems = [];
  const lines = Lines(record);
  const byBranch = new Map(lines.map((l) => [l.branch, l]));
  const targets = labels.map((l) => BACKPORT_LABEL.exec(l)?.[1]).filter(Boolean);
  for (const t of targets) {
    if (!byBranch.has(t)) {
      problems.push(`label "backport ${t}": ${t} is not a line in release-lines.json.`);
    }
  }
  if (added.length === 0) {
    return problems;
  }
  const edge = new Set((record.next?.edgeOnlyMigrations ?? []).map(Stem));
  const edgeAdded = added.filter((p) => edge.has(Stem(p)));
  const shared = added.filter((p) => !edge.has(Stem(p)));
  if (edgeAdded.length > 0 && shared.length > 0) {
    problems.push(`This PR adds edge-only migrations (${edgeAdded.join(', ')}) and shared ones (${shared.join(', ')}). A backport carries every file, so split them into two PRs.`);
    return problems;
  }
  if (shared.length === 0) {
    for (const t of targets) {
      problems.push(`label "backport ${t}": this PR's migrations are edge-only, so it stays on next until the next cut.`);
    }
    return problems;
  }
  for (const t of targets) {
    if (byBranch.get(t)?.status === 'lts') {
      problems.push(`label "backport ${t}": ${t} is LTS and takes no migrations. Remove the label; hosts that need this move to a newer line.`);
    }
  }
  for (const line of lines.filter((l) => l.status === 'open')) {
    if (!targets.includes(line.branch)) {
      problems.push(`This PR adds migrations (${shared.join(', ')}), so it must reach every open line: add the "backport ${line.branch}" label. If it needs the upcoming MJ version instead, list it in release-lines.json next.edgeOnlyMigrations (needs a CODEOWNERS review).`);
    }
  }
  return problems;
}

/** Problems for a PR into a line. `commits` = [{ sha, message }]; `onNext(sha)` = is it on next. */
export function CheckProvenance(commits, onNext, adjusted) {
  const problems = [];
  const unproven = [];
  let proven = 0;
  for (const { sha, message } of commits) {
    const sources = [...message.matchAll(CHERRY)].map((m) => m[1]);
    if (sources.length > 0 && sources.every(onNext)) {
      proven++;
    } else {
      unproven.push(`${sha.slice(0, 10)} ${message.split('\n')[0]}${sources.length > 0 ? ` (cherry-picked from ${sources.join(', ')}, which is not on next)` : ''}`);
    }
  }
  if (commits.length === 0) {
    problems.push('This PR has no commits of its own to check.');
  } else if (proven === 0) {
    problems.push(`No commit in this PR was cherry-picked from next. Land the change on next first, then add the "backport <line>" label to the merged PR; the bot opens this PR for you. Commits:\n  ${unproven.join('\n  ')}`);
  } else if (unproven.length > 0 && !adjusted) {
    problems.push(`These commits are not cherry-picks of commits on next:\n  ${unproven.join('\n  ')}\nIf they only resolve a cherry-pick conflict, add the "backport-adjusted" label so a reviewer checks them. Anything else lands on next first.`);
  }
  return problems;
}

/** Login and repository role of whoever last added `label` to the PR, via the GitHub API. */
function labelApplierRole(label) {
  const { GITHUB_REPOSITORY: repo, PR_NUMBER: pr } = process.env;
  try {
    const login = execFileSync('gh', ['api', '--paginate', `repos/${repo}/issues/${pr}/events`,
      '--jq', `.[] | select(.event == "labeled" and .label.name == "${label}") | .actor.login`], { encoding: 'utf8' })
      .trim().split('\n').filter(Boolean).at(-1);
    if (!login) {
      return { login: '', role: '' };
    }
    const role = execFileSync('gh', ['api', `repos/${repo}/collaborators/${login}/permission`, '--jq', '.role_name'], { encoding: 'utf8' }).trim();
    return { login, role };
  } catch {
    return { login: '', role: '' };
  }
}

function option(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function report(problems, ok) {
  for (const p of problems) {
    console.log(`::error::${p.replace(/\n/g, '%0A')}`);
  }
  if (problems.length === 0) {
    console.log(ok);
  }
  return problems.length > 0 ? 1 : 0;
}

function main(args) {
  const [mode] = args;
  const base = option(args, '--base');
  const labels = JSON.parse(option(args, '--labels') ?? '[]');
  if (!base) {
    console.error('✗ --base <merge-base sha> is required');
    return 2;
  }
  if (mode === 'labels') {
    const record = LoadRecordFromFile(option(args, '--record') ?? 'release-lines.json');
    const added = git(['diff', '--name-only', '--diff-filter=A', base, 'HEAD', '--', 'migrations/', 'migrations-pg/'])
      .split('\n').filter((p) => p.endsWith('.sql') && /^V\d{12}__/.test(p.split('/').pop()));
    const problems = CheckLabels(record, labels, added);
    return report(problems, added.length === 0
      ? '✓ No migration added: backport labels are optional'
      : '✓ Every added migration is marked for every open line, or is edge-only');
  }
  if (mode === 'provenance') {
    const headRef = option(args, '--head-ref') ?? '';
    if (option(args, '--author-type') === 'Bot' && APP_HEADS.some((h) => headRef.startsWith(h))) {
      console.log(`✓ ${headRef} is a release PR opened by the App; nothing to trace to next`);
      return 0;
    }
    if (labels.includes('line-cut')) {
      const { login, role } = labelApplierRole('line-cut');
      if (role === 'admin' || role === 'maintain') {
        console.log(`✓ Line cut (line-cut label added by ${login}, ${role})`);
        return 0;
      }
      return report([`The "line-cut" label was added by ${login || 'someone unknown'} (${role || 'no role found'}); only a maintainer or admin may mark a PR as a line cut.`], '');
    }
    const nextRef = option(args, '--next') ?? 'origin/next';
    const shas = git(['rev-list', '--no-merges', `${base}..HEAD`]).split('\n').filter(Boolean);
    const commits = shas.map((sha) => ({ sha, message: git(['log', '-1', '--format=%B', sha]) }));
    const onNext = (sha) => {
      try {
        git(['merge-base', '--is-ancestor', sha, nextRef]);
        return true;
      } catch {
        return false;
      }
    };
    const problems = CheckProvenance(commits, onNext, labels.includes('backport-adjusted'));
    return report(problems, `✓ Every commit is a cherry-pick of a commit on next${labels.includes('backport-adjusted') ? ' (conflict fixes allowed by backport-adjusted)' : ''}`);
  }
  console.error('usage: check-backport.mjs labels|provenance --base <sha> --labels <json>');
  return 2;
}

// ---------------------------------------------------------------------------
// Self-test
// ---------------------------------------------------------------------------
function selfTest() {
  const record = {
    next: { edgeOnlyMigrations: ['V202605010000__edge.sql'] },
    lines: {
      '6.1': { branch: 'lts/6.1', status: 'lts', mjVersion: '6.1.6', appMajor: 1, releasesThrough: 'branch' },
      '6.2': { branch: 'lts/6.2', status: 'open', mjVersion: '6.2.1', appMajor: 1, releasesThrough: 'branch' },
      '6.3': { branch: 'lts/6.3', status: 'open', mjVersion: '6.3.0', appMajor: 2, releasesThrough: 'main' },
    },
  };
  const mig = ['migrations/V202604010000__x.sql', 'migrations-pg/V202604010000__x.pg.sql'];
  const edge = ['migrations/V202605010000__edge.sql', 'migrations-pg/V202605010000__edge.pg.sql'];
  const onNext = (sha) => sha.startsWith('aaa');
  const pick = (sha, from) => ({ sha, message: `fix: thing\n\n(cherry picked from commit ${from})` });
  const cases = [
    ['no migration, no label passes', CheckLabels(record, [], []), 0],
    ['no migration, a backport label passes', CheckLabels(record, ['backport lts/6.2'], []), 0],
    ['a migration labelled for every open line passes', CheckLabels(record, ['backport lts/6.2', 'backport lts/6.3'], mig), 0],
    ['a migration missing an open line fails', CheckLabels(record, ['backport lts/6.3'], mig), 1],
    ['a migration labelled for an LTS line fails', CheckLabels(record, ['backport lts/6.1', 'backport lts/6.2', 'backport lts/6.3'], mig), 1],
    ['an edge-only migration with no label passes', CheckLabels(record, [], edge), 0],
    ['an edge-only migration with a backport label fails', CheckLabels(record, ['backport lts/6.2'], edge), 1],
    ['edge-only and shared in one PR fails', CheckLabels(record, ['backport lts/6.2', 'backport lts/6.3'], [...mig, ...edge]), 1],
    ['a label for an unknown line fails', CheckLabels(record, ['backport lts/9.9'], []), 1],
    ['cherry-picks of next commits pass', CheckProvenance([pick('b1', 'aaa1111'), pick('b2', 'aaa2222')], onNext, false), 0],
    ['a cherry-pick of a commit not on next fails', CheckProvenance([pick('b1', 'fff1111')], onNext, false), 1],
    ['a commit with no trailer fails', CheckProvenance([pick('b1', 'aaa1111'), { sha: 'b2', message: 'fix conflict' }], onNext, false), 1],
    ['a conflict fix passes with backport-adjusted', CheckProvenance([pick('b1', 'aaa1111'), { sha: 'b2', message: 'fix conflict' }], onNext, true), 0],
    ['backport-adjusted alone is not enough', CheckProvenance([{ sha: 'b2', message: 'new work' }], onNext, true), 1],
  ];
  let failed = 0;
  for (const [name, problems, want] of cases) {
    const ok = (problems.length > 0 ? 1 : 0) === want;
    failed += ok ? 0 : 1;
    console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — got: ${problems.join(' | ')}`}`);
  }
  console.log(failed === 0 ? '\nSelf-test passed.' : `\nSelf-test FAILED: ${failed}.`);
  return failed === 0 ? 0 : 1;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  process.exit(args[0] === '--self-test' ? selfTest() : main(args));
}
