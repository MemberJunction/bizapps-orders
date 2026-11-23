# Release lines

bizapps-orders follows MJ's branch model, as agreed in the "OpenApp Release Lines" spec (Nov 10,
2026). `next` is built on MJ Edge and never publishes. Each MJ version gets a release line,
`lts/<MJ major.minor>`, which is what production hosts run.

| Branch | Built on | Publishes | What lands there |
|---|---|---|---|
| `next` | MJ Edge | never | all new work, first |
| `lts/X.Y` | MJ X.Y | yes | backports from `next` |
| `main` | the newest line | yes, as `latest` | release merges only |

## The line status record

[`release-lines.json`](../release-lines.json) lists each line: its branch, the MJ version it was
cut for (`mjVersion`, never raised), the app major it publishes, whether it is `open` or `lts`,
and whether it releases through `main` or from its own branch. It also lists `next`'s edge-only
migrations. CI always reads the copy on `next`. Freezing a line or marking a migration edge-only is a
support decision: have one of the owners in `.github/CODEOWNERS` review the change (protect-next
does not enforce it).

A line is `open` (features, fixes and migrations, all backported from `next`) or `lts` (code
fixes only). An LTS line never reopens.

## Daily flow

1. Open the PR against `next`, with a changeset as today.
2. Add a `backport lts/X.Y` label for each line it should reach. When the PR merges, the bot opens
   one cherry-pick PR per line. A conflict comes back as a draft PR for you to finish; if you add
   a commit of your own to resolve it, add the `backport-adjusted` label.
3. A PR that **adds a migration** must be labelled for **every open line**, or be edge-only (it
   needs the upcoming MJ version): list each of its files in `next.edgeOnlyMigrations`. Edge-only
   migrations stay on `next` until the next cut. Don't mix edge-only and shared migrations in one
   PR.
4. Shared migrations must run on the oldest open line's MJ version. Generate them (CodeGen) in a
   workspace checked out on that line, then land the result on `next`.

## Publishing

- **Newest line, through `main`:** a merge into the line refreshes `changeset-release/main` →
  `main`. Dispatch **Cut the Release** with `line` empty. `publish.yml` publishes as `latest`,
  tags `vX.Y.Z`, and the App merges `release-back-merge/vX.Y.Z` into the line.
- **Older line, from its own branch:** a merge refreshes `changeset-release/lts/X.Y` →
  `lts/X.Y`. Dispatch **Cut the Release** with `line` = `X.Y`. `publish.yml` publishes under the
  dist-tag `lts-X.Y`. No back-merge is needed.
- Either way, `publish.yml` then removes from `next` the changesets that release consumed, so
  `next/.changeset` only holds what no line has released yet. A changeset backported to two lines
  is released once on each.
- `publish.yml` only publishes from `main` or a line the record says releases from its own
  branch, and on a line only on the push that changed the version. Every other run is skipped
  or refused.

## The checks

| Check | On | What it enforces |
|---|---|---|
| `lines: record` | PRs into `next` | `release-lines.json` is valid; a line's branch, MJ version and major never change; LTS never reopens |
| `lines: backport or edge-only` | PRs into `next` | an added migration is labelled for every open line, or is edge-only; no migration goes to an LTS line |
| `lines: on next first` | PRs into `lts/*` | every commit carries `(cherry picked from commit <sha>)` with `<sha>` on `next`; hand-written conflict fixes need `backport-adjusted` |
| `lines: migrations` | PRs into `lts/*` | open line: its migrations are `next`'s, same content, no edge-only ones, none added older than the line's newest; LTS line: no migration or metadata change, no minor or major changeset |
| `lines: mj pin` | PRs into `lts/*` and `main` | `@memberjunction/*` peers are the line range (`>=6.2.1 <6.3.0`), pins and the lockfile stay on the line's MJ minor, and `mj-app.json` has the line range and `"line"` |
| `repo: guards` | all PRs | cross-app ranges have an upper bound (private packages too); `mj.config.cjs` never sets `outOfOrder: true` |

The `next` timestamp watermark compares against `next`'s newest, which a backport is often older
than, so it does not run on a line. `lines: migrations` keeps the line's own watermark instead: a
backport may not add a migration older than the line's newest. A line may skip `next`'s
migrations; it does not have to follow `next`'s order.

## Cutting a line

The line cut is coordinated across apps: bizapps-common first, then the apps that depend on it.

1. On `next`, add the line to `release-lines.json` (`status: open`, `releasesThrough: main`) and
   move the previous newest line to `releasesThrough: branch`. Merge after a review by one of its owners.
2. Create `lts/X.Y` from `next` and give it the `protect-lts` ruleset (it covers `lts/*`).
3. On a branch off the new line, run
   `node .github/scripts/check-mj-line.mjs --line X.Y --file release-lines.json --fix`, then
   `pnpm install --lockfile-only`. This caps the MJ peers at the line, pins `mj-app.json`, and
   adds `"line"`. Set the line's `.github/CODEOWNERS` to `* <the line's reviewers>`; protect-lts
   requires code-owner review, so every change to the line needs one of them. From the 6.3 line on, also add a `major` changeset (each line has its own app
   major) and re-stamp migrations as in [Moving to a new line](#moving-to-a-new-line).
   Open it into `lts/X.Y` with the `line-cut` label (a maintainer or admin adds it).
4. The first release of a new newest line has to replace `main`'s history with the line's. That
   step is not automated yet; it is written up when the 6.3 line is cut.

## Moving to a new line

A line takes `next`'s migrations with `next`'s stamps but may skip some, so its hosts can be
behind `next` on a migration older than one they ran. Hosts never move from a line straight to
`next`'s files. When they move to a new line:

1. Re-stamp every `next` migration the old line does not have so it sorts after the old line's
   newest migration, on SQL Server and PostgreSQL together.
2. Check that a database built from the old line's migrations plus the re-stamped ones matches a
   database built from `next`'s migrations.
3. Add migrations to close any gap, or replace the history with a baseline migration.

## Not settled yet

- Whether a migration generated by a newer MJ's CodeGen runs on an older MJ database. Until it is
  verified, generate shared migrations on the oldest open line (daily flow step 4).
- How long an LTS line is supported, and who retires it.
- The 6.1 line: not cut for bizapps-orders. Production runs MJ 6.2.1.
