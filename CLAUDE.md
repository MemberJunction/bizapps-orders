# GENERAL RULE
Don't say "You're absolutely right" each time I correct you. Mix it up, that's so boring!

# BizApps Orders Development Guide

This is an **open app** built on top of the [MemberJunction](https://github.com/MemberJunction/MJ) platform.

**MemberJunction's own `CLAUDE.md` is the authoritative guide — read it first:**
[`MJ/CLAUDE.md`](https://github.com/MemberJunction/MJ/blob/next/CLAUDE.md). When this app is
dev-linked into an MJ instance it sits three levels up, at `../../../CLAUDE.md`.

## UI architecture — READ BEFORE TOUCHING ANGULAR

**[`docs/ui-architecture.md`](docs/ui-architecture.md) is binding for this repo.**

The short version: **there is no data-access service layer.** Components bind directly to
`BaseEntity` subclasses and call Remote Operation classes. Those are already strongly typed from the
schema and already network-transparent — the same object works in the browser and on the server — so
a service wrapping them replaces generated types with hand-written DTOs and loses the compiler.

Angular services remain legitimate for Angular-shaped, non-persistent state — wizard step, selection,
filter panels, router coordination. If a method on one loads, saves, validates or maps entity data,
it is in the wrong place.

The review test: *could a non-Angular host do this same work with the same objects?* If yes, the
logic belongs on the entity, its shared subclass, or a Remote Operation.


## Database changes — INCREMENTAL MIGRATIONS ONLY

**[`docs/database-migrations.md`](docs/database-migrations.md) is binding for this repo.**

Schema changes are **new `V` migrations**. Do **not** edit the baseline, and do not rebuild the
database as part of ordinary development.

Editing the baseline was correct while the schema changed constantly and nothing depended on it.
That phase is over: an edit to the baseline is invisible to any database that already ran it — the
column never appears and nothing reports a problem — and flyway checksums the script, so every
existing database refuses to migrate until someone repairs it by hand. `scripts/rebuild-db.sh`
remains only for standing up a brand-new empty database; it is not a development loop.

**Once a migration is merged to `next` it is LOCKED — no edits, no renames, no deletions.** Fix it
forward in a new file. Every database that ran it recorded its checksum, so a change makes those
databases refuse to migrate while the ones that never ran it get different SQL; the two diverge and
nothing reports it. A rename is not a lesser change: the runner keys on the twelve-digit version in
the filename, so a renamed migration is one nobody has run, and it executes again against objects
that already exist. Renumbering an **unmerged** migration is ordinary and stays allowed — that is the
normal answer when `next` gains a higher timestamp while your branch is open.

CI enforces this (`.github/scripts/check-migrations-locked.mjs`), and **reviewers should treat it as a
blocking finding, not a nit.** It has been merged past: `V202609221500` was edited a PR after it
landed, and `V202609061900` twice, with the check red. If a change to a merged migration is genuinely
unavoidable, it needs saying explicitly in the PR description and a second reviewer — never a quiet
merge over a failing gate.

Migrations run once, in timestamp order, so write plain DDL: no `IF NOT EXISTS` /
`IF COL_LENGTH(...) IS NULL` / `IF OBJECT_ID` existence guards, and add each column with its
constraints inline in one `ALTER TABLE`. A guard turns a mismatch into silence: where the object already
exists, the migration records itself as applied while the object keeps whatever shape it had. Assume the database already has data: give a new `NOT NULL` column a default, or
backfill it before adding the constraint. A migration that reads `__mj.Entity` must skip cleanly
when the row is absent — CodeGen runs *after* migrations — and if the change is really about
metadata (field categories, form layout), its home is `metadata/` and `mj sync push` **during
development**.

**But `metadata/` ships to nobody.** MJ's manifest schema calls `mj-app.json`'s `metadata.directory`
a dev-time pointer (`packages/OpenApp/Engine/src/manifest/manifest-schema.ts`), and `mj app install`
runs migrations and nothing else. A `mj sync push` whose result lives only in your database is an
**unshipped change** — the rows exist for you and for no host. At release the build engineer
regenerates a `*__Metadata_Sync.sql` migration carrying those rows, and it installs alongside every
other migration; that is how metadata reaches a customer.
The model, and the Open App steps that differ from core (`--schema`, the `${mjSchema}` substitution): [Release Metadata Migrations Guide](https://github.com/MemberJunction/MJ/blob/next/guides/RELEASE_METADATA_MIGRATIONS_GUIDE.md).

Two things about that step, because both fail quietly:
- It must be generated from a **fresh** database. A push against a dev database emits `spUpdate*`,
  which the generator refuses and which would overwrite host state.
- **Nothing in CI detects a pending metadata change with no migration behind it.** The guard is the
  release process, not a gate — so a `metadata/` edit that matters to a host is not "done" when it
  merges, only when a release carries it.

The review test: *if a colleague pulls this branch onto a database that already has last week's
schema and runs `pnpm run mj:migrate`, do they get exactly the schema this branch describes?*


## SQL Safety — NO MANUAL REGEX ESCAPING IN FILTERS

**Never use plain inline regex like `.replace(/'/g, "''")` when constructing SQL `ExtraFilter` or `Where` clauses.**
- For SQL string escaping, always use `EscapeSQLString` from `packages/CoreEntitiesServer/src/sql-guards.ts` (or `EscapeText` in the same file, for values that are already known non-null). **Import it from `sql-guards.ts`, not from `@memberjunction/global`** — no published `@memberjunction/global` exports `EscapeSQLString`, and importing it from there breaks the build for anyone not dev-linked to an MJ working tree. Re-point these imports at the package once MJ publishes it.
- For boundary validation of IDs and dates from remote callers, use `RequireUUID`, `RequireUUIDs`, and `RequireDate` from `sql-guards.ts`.
- For a caller-supplied day typed `Date | string` (an optional as-of or request day), use `RequireOptionalDay` from `sql-guards.ts`. It refuses an invalid `Date` as well as a malformed string; checking only the string form lets `new Date('garbage')` reach `CalendarDayOrToday`, which silently reads it as today.
- Plain regex escaping is fragile, misses null-byte injection (`\0`), breaks on `null`/`undefined`, and creates divergent ad-hoc sanitization.

## MemberJunction versions — the LTS line AIDP Next runs

AIDP Next runs MemberJunction's 6.1 LTS line, pinned exactly in `aidp-next/package.json`. This repo builds, tests and runs CodeGen against that same version, so what passes here is what runs there (bc-aidp-next-golive#298).

- **Declared ranges.** Every `@memberjunction/*` range in `dependencies`, `devDependencies` and `peerDependencies` is `~6.1.N`, where 6.1.N is the version AIDP Next runs: the 6.1 line, capped below 6.2. Never an edge or prerelease range (`6.1.0-edge.x` sorts *before* 6.1.0 and has none of the LTS fixes), and never `^`, which admits 6.2. Packages MJ versions separately (`@memberjunction/connector-*`, `@memberjunction/skyway-*`) keep their own ranges.
- **`pnpm.overrides`.** `@memberjunction/core` and `@memberjunction/global` are pinned **exactly** to AIDP Next's version (for example `"6.1.5"`), not to a range. A range override can still leave two copies of `core`, and two copies split the ClassFactory: registrations land in one factory while the resolver reads the other, and nothing errors. Overrides are workspace-local and never published. Do not exact-pin sibling `@mj-biz-apps/*` packages here; how the apps declare each other is bc-aidp-next-golive#265.
- **One copy of each.** After any install, `pnpm why @memberjunction/core` must show a single version. A sibling app package that exact-pins an old MJ build brings a second copy in (for example `@mj-biz-apps/common-ng@5.37.0` pinned edge.3 packages); fix it by raising that package's floor, not with more overrides.
- **Bumping to a new 6.1.N**, when AIDP Next moves: update every `~6.1.N` floor and both overrides; `pnpm install`; confirm one copy; `mjVersionRange` in `mj-app.json` follows in the Version Packages PR (`ci/sync-mj-app-version.mjs`); rebuild the database from migrations on MJ core `v6.1.N` and regenerate (below); run the full test suite; add a `patch` changeset; commit the lockfile. If CI then fails on the lockfile although a clean local install works, GitHub is testing the merge with `next`: merge `next` in, run `pnpm install --no-frozen-lockfile`, and commit the lockfile.
- **Never patch MemberJunction.** No `pnpm patch`, `patchedDependencies`, patch-package or `sed` against `@memberjunction/*` `dist/`. That is AIDP Next's hard rule (`.github/workflows/MJ_PATCH_REGISTER.md` in aidp-next). Fix MJ on its `next` branch and bring the fix to the line with the `backport lts/6.1` label, or with a hand-port PR against `lts/6.1` when the fix can't be isolated; then wait for the patch release.

### CodeGen output must be reproducible from this repo

Generated files are committed, and AIDP Next ships them as they are: it excludes every `__mj_BizApps*` schema from its own CodeGen and installs the published packages. So the committed output has to be what this repo's toolchain produces from its migrations.

- Run CodeGen only with this repo's pinned MJ version, against a database built from migrations (MJ core `v6.1.N`, then the apps this one depends on, then this repo), after `mj sync push` of `metadata/`.
- Set an AI key in your gitignored `.env`: `AI_VENDOR_API_KEY__GeminiLLM` (every CodeGen prompt ranks Gemini first), or `AI_VENDOR_API_KEY__OpenRouterLLM`. Without one, CodeGen silently drops AI-written output: check-constraint `Validate*()` methods, display names, descriptions and form layouts.
- Never hand-edit generated files, and never paste in generated output from another toolchain or another database. That is how OrderLine lost `OrderHeader`'s `@Field` (bc-aidp-next-golive#295).
- Review what AI wrote. Validators, names and descriptions are not deterministic between runs.
- If CodeGen has to create metadata in the database that the generated code depends on (fields, value lists, relationships, validator code), ship it in a migration in the same PR. Otherwise every host installed from migrations drifts from the code.

## Filing issues (pilot of the BizApps issue system)
- **Never work around a bug in this repo or in MJ silently.** File it with the `/report-issue` skill
  (`.claude/skills/report-issue/`), which picks the repo where the fix lives, captures the
  environment, searches for duplicates, and writes the same headings as the web form
  (`.github/ISSUE_TEMPLATE/bug.yml`). If the bug already exists, it posts an occurrence comment on
  the original instead of a new issue.
- Filing from the web: **New issue → Bug report**. Every bug lands as `needs-triage`; a second
  person reproduces it before it is `confirmed`. Confidence is a field, not a gate — say what you
  actually did.
- Not filed during the pilot: nits (cosmetic, no user impact) go in a local `BUGS.md`, not GitHub.
  An agent files only with a minimal repro or after seeing the same failure twice, at most five
  per session, and never closes, relabels, transfers or assigns anything.
- MJ-core bugs go to `MemberJunction/MJ` (always pass `--repo`); mjdev-tool bugs to
  `MemberJunction/MJDev`. Say which repo you chose and why under "Duplicate search".

