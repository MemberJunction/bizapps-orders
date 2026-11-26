# GENERAL RULE
Don't say "You're absolutely right" each time I correct you. Mix it up, that's so boring!

# BizApps Orders Development Guide

This is an **open app** built on top of the [MemberJunction](https://github.com/MemberJunction/MJ) platform.

**MemberJunction's own `CLAUDE.md` is the authoritative guide — read it first:**
[`MJ/CLAUDE.md`](https://github.com/MemberJunction/MJ/blob/next/CLAUDE.md). When this app is
dev-linked into an MJ instance it sits three levels up, at `../../../CLAUDE.md`.

## Commands

Run from the repo root; the package manager is pnpm. Copy `.env.example` to `.env` (gitignored)
first: the MJ CLI, `scripts/` and `test-harnesses/` read their database settings from it.

| Command | What it does |
|---|---|
| `pnpm install` | Install the workspace. |
| `pnpm run build` | Build every `@mj-biz-apps/*` package with Turborepo. |
| `pnpm run test:unit` | Vitest over `packages/*/src/**/*.test.ts`. No database, but build first: tests load the other workspace packages from `dist/`. |
| `pnpm run test:integration` | The integration suite (`test-harnesses/integration.mjs`) against the database in `.env`, using the built packages, so build first. Each check's orders, journal entries, payments and subscription terms roll back; the shared ORD-WORLD catalog and the catalog rows a bundle's Setup adds are committed. |
| `pnpm run verify` | Unit tests, build, integration suite, then `scripts/assert-check-count.mjs`, which fails when any check failed or fewer ran than `registry-parity.test.ts` declares. |
| `pnpm run mj:migrate` | Apply `migrations/` to the `__mj_BizAppsOrders` schema (`migrations-pg/` when `DB_PLATFORM=postgresql`). |
| `pnpm run mj:codegen` | Run MJ CodeGen against the database in `.env`. Needs an AI key; see "CodeGen output must be reproducible from this repo" below. |
| `scripts/append-codegen.sh migrations/V<new>.sql` | Put CodeGen's SQL below a new migration's banner. Refuses a migration already on `origin/next`. |

## Where docs go

[`docs/README.md`](docs/README.md) indexes the docs. `docs/` describes what is built; when the system
changes, update the doc that describes it, starting with
[`docs/HOW_THE_SYSTEM_WORKS.md`](docs/HOW_THE_SYSTEM_WORKS.md). Plans and specs for work not yet
started go in `plans/`, including ones a tool or plugin writes. `docs/superpowers/` keeps the
Bill.com plan and specs because code and metadata cite their paths; never add files there.

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


## Performance & Caching Standard (5 Rules)

Every engine, server operation, and Angular component in this repository MUST follow these five rules:

1. **`BaseEngine` (`BaseSingleton` + `@RegisterForStartup`) for Bounded Reference & Catalog Metadata:**
   - Lookup, taxonomy, policy, and catalog tables (`Payment Types`, `Payment Provider Types`, `Payment Providers`, `Payment Terms Types`, `Charge Types`, `Product Types`, `Subscription Types`, `Subscription Families`, `Revenue Recognition Types`, `Promotion Types`, `Order Company Policies`, `Price Lists`, `Price Tiers`, `Products`, `Product Prices`, `Product Categories`, `Product Bundle Items`, `Dimension Defaults`, `Event Products`) MUST be read from `OrdersEngine.Instance` after `LoadOrdersEngine(provider, user)` — NEVER re-queried via ad-hoc `RunView` per widget mount or per line.
   - Keep `OrdersEngine` configs unfiltered with no `OrderBy` and `ResultType: 'entity_object'` (default), and do NOT override `AdditionalLoading`, so `BaseEngine` applies immediate in-place mutations on entity save/delete.

2. **Multi-Provider & Impersonation Safety:**
   - Override `ProviderToUse` on `BaseEngine` subclasses (`this._activeProvider ?? Metadata.Provider ?? super.ProviderToUse`) and update `_activeProvider` in `Config()` / `SetProvider()` so persona impersonation and multi-provider hosts immediately route through the active provider instead of `BaseEngine`'s first-wins `_provider` latch.
   - Track `_loadedForUserId` and force a refresh when the client-side (`ProviderType.Network`) user changes; NEVER evict/reload on server-side (`ProviderType.Database`) `contextUser` changes because one server process serves all users. Provide `InvalidateCache()` and `IsConfiguredForUser()`.
   - Set `CacheLocal: true` ONLY on global non-RLS reference metadata; set `CacheLocal: false` on any RLS-filtered entity to prevent cross-persona IndexedDB bleed.
   - Gate optional cross-app or restricted-entity queries on `EntityInfo.GetUserPermisions(user)?.CanRead` (and rely on `BaseEngine.GetConfigData` throwing `PermissionConstrainedError` for engine properties).

3. **Mandatory `rv.RunViews([...])` Single-Request Batching:**
   - NEVER fire `Promise.all([rv.RunView(...), rv.RunView(...)])` or sequential independent `await rv.RunView(...)` calls when the queries do not depend on each other's output.
   - Collapse independent reads into a single `rv.RunViews([...])` GraphQL / database batch using `RunView.FromMetadataProvider(this.ProviderToUse)` (or `LoadOverviewBatch` in Angular form panels / `RunViewsBatch` in `CoreEntitiesServer`).
   - Use `ResultType: 'simple'` with narrow `Fields` (or `ResultType: 'count_only'`) whenever entity mutation is not needed; reserve `ResultType: 'entity_object'` for rows that will be mutated and saved.

4. **`ConversationEngine`-Style Bounded Container Caching Only (No Arbitrary Filtered List Caches):**
   - NEVER cache unbounded transactional tables (`Order Headers`, `Order Lines`, `Payment Headers`, `Payment Lines`, `Subscriptions`, `Subscription Terms`, `External Invoices`, `External Payments`) globally, and NEVER build a generic cache keyed by arbitrary `ExtraFilter` SQL strings.
   - If a surface caches a bounded detail bundle (e.g., an open order's lines/charges/payments), key strictly by container ID with `BaseEntity` event invalidation, explicit `Invalidate*()` hooks, and persona-switch eviction.

5. **RLS-Safe Two-Step Entity Reads:**
   - NEVER write raw SQL subqueries against RLS-filtered base views (`vw*`) inside `ExtraFilter` — MJServer rejects SQL that reaches a row-filtered entity's base view directly.
   - Instead, read the RLS-protected entity via a first-class `RunView` first to collect IDs, then query the target entity with `ID IN (...)` (chunked when large; short-circuited when empty).


## Database changes — INCREMENTAL MIGRATIONS ONLY

**[`docs/database-migrations.md`](docs/database-migrations.md) is binding for this repo.**

Schema changes are **new `V` migrations**. Do **not** edit the baseline, and do not rebuild the
database as part of ordinary development.

Editing the baseline was correct while the schema changed constantly and nothing depended on it.
That phase is over: an edit to the baseline is invisible to any database that already ran it — the
column never appears and nothing reports a problem — while every new database gets the edited
version. `scripts/rebuild-db.sh` remains only for standing up a brand-new empty database; it is not
a development loop.

**Once a migration is merged to `next` it is LOCKED — no edits, no renames, no deletions.** Fix it
forward in a new file. Every database that ran it has recorded it as applied and never runs it
again, so a change never reaches those databases while the ones that never ran it get different
SQL; the two diverge and nothing reports it. A rename is not a lesser change: the runner keys on
the twelve-digit version in the filename, so a renamed migration is one nobody has run: it executes
again against objects that already exist, or, when its new version sorts below the newest one the
database has applied, `mj migrate` refuses the whole run as out of order. Renumbering an
**unmerged** migration is ordinary and stays allowed — that is the normal answer when `next` gains a
higher timestamp while your branch is open.

CI enforces this (`.github/scripts/check-migrations-locked.mjs`), and **reviewers should treat it as a
blocking finding, not a nit.** It has been merged past: `V202609221500` was edited a PR after it
landed, and `V202609061900` twice, with the check red. If a change to a merged migration is genuinely
unavoidable, it needs saying explicitly in the PR description and a second reviewer — never a quiet
merge over a failing gate.

Migrations run once, in timestamp order, so write plain DDL: no `IF NOT EXISTS` /
`IF COL_LENGTH(...) IS NULL` / `IF OBJECT_ID` existence guards, and add each column with its
constraints inline in one `ALTER TABLE`. A guard turns a mismatch into silence: where the object already
exists, the migration records itself as applied while the object keeps whatever shape it had. Assume the database already has data: give a new `NOT NULL` column a default, or
backfill it before adding the constraint. A migration holds schema DDL plus the CodeGen output
captured below its banner, which is what registers the `__mj.Entity` / `__mj.EntityField` rows. Do
not hand-write `INSERT` or `UPDATE` against `__mj.*` metadata tables (entity settings, field
categories, form layout) in a migration: that belongs in `metadata/`, applied **during development**
as `pnpm run mj:migrate` → `mj sync push` → `pnpm run mj:codegen`.

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
- **Nothing on a feature PR detects a pending metadata change with no migration behind it.** The
  gate is at release: the Version Packages PR (`changeset-release/main` → `main`, opened by
  `version.yml`) runs `rr: metadata shipped` (`ci/check-metadata-shipped.sh`), which fails when
  `metadata/` changed substantively since the last `v*` tag without a `*__Metadata_Sync.sql` behind
  it. So a `metadata/` edit that matters to a host is not "done" when it merges, only when a release
  carries it.

The review test: *if a colleague pulls this branch onto a database that already has last week's
schema and runs `pnpm run mj:migrate`, do they get exactly the schema this branch describes?*


## SQL Safety — NO MANUAL REGEX ESCAPING IN FILTERS

**Never use plain inline regex like `.replace(/'/g, "''")` when constructing SQL `ExtraFilter` or `Where` clauses.**
- For SQL string escaping, always use `EscapeSQLString` from `@memberjunction/global` (published from 6.1.5; this repo's floor is 6.2.1). `EscapeText` in `packages/CoreEntitiesServer/src/sql-guards.ts` remains for values already known non-null.
- For IDs, use `RequireUUID` and `RequireUUIDs`, exported by `@mj-biz-apps/orders-entities` (`packages/Entities/src/sql-guards.ts`) so code on either tier can use them, and re-exported by `CoreEntitiesServer/src/sql-guards.ts`.
- For boundary validation of IDs and dates from remote callers, use `RequireUUID`, `RequireUUIDs`, and `RequireDate` from `CoreEntitiesServer/src/sql-guards.ts`.
- For a caller-supplied day typed `Date | string` (an optional as-of or request day), use `RequireOptionalDay` from `sql-guards.ts`. It refuses an invalid `Date` as well as a malformed string; checking only the string form lets `new Date('garbage')` reach `CalendarDayOrToday`, which silently reads it as today.
- Plain regex escaping is fragile, misses null-byte injection (`\0`), breaks on `null`/`undefined`, and creates divergent ad-hoc sanitization.

## Release lines

`next` is built on MJ Edge and never publishes. Production releases come from release lines (`lts/<MJ major.minor>`), listed in `release-lines.json`. Land every change on `next` first, then add a `backport lts/X.Y` label; a PR that adds a migration needs a label for every open line, or its files listed as edge-only in `release-lines.json`. Never open a PR straight into a line or into `main`. Full rules, publishing and the line cut: [guides/RELEASE_LINES.md](guides/RELEASE_LINES.md).

## MemberJunction versions — `next` follows MJ `next`; release lines pin what hosts run

AIDP Next runs MemberJunction's 6.2 LTS line (6.2.1), pinned exactly in `aidp-next/package.json`. This repo releases from the matching release line, `lts/6.2`, and builds, tests and runs CodeGen against that same version, so what passes here is what runs there (bc-aidp-next-golive#298). On a release line every MJ range, override and `mj-app.json`'s `mjVersionRange` is capped at the line's MJ minor (`>=6.2.1 <6.3.0`); the cut sets them and `lines: mj pin` keeps them there. The caret ranges below describe the release lines. On `next` every MJ floor is MJ 6.3 (`^6.3.0-edge.1`, the newest 6.3 build), the same as every other BizApps Open App: a prerelease floor is fine there, because hosts install from a release line, never from `next`. `next` itself is not held to a published MJ: its CI builds and tests against MJ `next` and the sibling apps' `next`, from source, in the same workspace `mj dev workspace` makes (`.github/actions/ci-install`), so work that needs an unreleased MJ change merges without waiting for an MJ build. Release PRs and the release lines install the committed lockfile, i.e. the published MJ their ranges claim.

- **Declared ranges.** In a published package, `@memberjunction/*` (and any other app's `@mj-biz-apps/*`) is a **peer** with a caret range, `^6.2.N` (`>=0.X.Y <1.0.0` for a 0.x app such as accounting, where a caret would pin the minor; every cross-app range needs an upper bound at the next major, which `check-dependency-model.mjs` enforces), and never appears in `dependencies`: the host installs one copy, and a `~6.2.N` or exact peer makes every later host (6.3, say) install a second 6.2 tree, which splits the ClassFactory. Each peer also has a `devDependencies` entry in the same package: the same caret floor for MJ, `^6.2.N`, where 6.2.N is the version AIDP Next runs, and an exact version for another app's package. The lockfile resolves MJ to that LTS release, so builds, tests and CodeGen run against what AIDP Next runs. On a release line, never an edge or prerelease range (`6.2.0-edge.x` sorts *before* 6.2.0 and has none of the LTS fixes). `.github/scripts/check-dependency-model.mjs` enforces this in CI. Packages MJ versions separately (`@memberjunction/connector-*`, `@memberjunction/skyway-*`) keep their own ranges.
- **Overrides (`overrides:` in `pnpm-workspace.yaml`).** `@memberjunction/core` and `@memberjunction/global` carry the same caret floor as every other MJ range, `^6.2.N` (for example `"^6.2.1"`), so every request in the graph resolves to one copy. Two copies of `core` split the ClassFactory: registrations land in one factory while the resolver reads the other, and nothing errors. Overrides are workspace-local and never published. Keep them here rather than under `package.json`'s `pnpm` field so there is one place to look — not because that field is ignored: pnpm 10.33 does read `pnpm.overrides` from `package.json` and applies it, with no warning (bizapps-contracts keeps its MJ overrides there and its committed lockfile shows both applied). Do not exact-pin sibling `@mj-biz-apps/*` packages here; how the apps declare each other is bc-aidp-next-golive#265.
- **One copy of each.** After any install, `pnpm why @memberjunction/core` must show a single version. A sibling app package that exact-pins an old MJ build brings a second copy in (for example `@mj-biz-apps/common-ng@5.37.0` pinned edge.3 packages); fix it by raising that package's floor, not with more overrides. The same holds for other apps' `@mj-biz-apps/*` packages: a package that uses one declares it (exact devDependency, caret peer) rather than leaving `auto-install-peers` to pick a version. `.github/scripts/check-single-copy.mjs` fails CI when `pnpm-lock.yaml` holds two versions of any `@memberjunction/*` or sibling-app package.
- **Bumping to a new 6.2.N**, when this repo needs a newer LTS patch: raise every `^6.2.N` floor, in peers, devDependencies and both overrides; `pnpm install`; confirm one copy; `mjVersionRange` in `mj-app.json` follows in the Version Packages PR (`ci/sync-mj-app-version.mjs`); rebuild the database from migrations on MJ core `v6.2.N` (`MJ_CORE_VERSION` in `.env` and `.env.example`) and regenerate (below); run the full test suite; add a `patch` changeset; commit the lockfile. If CI then fails on the lockfile although a clean local install works, GitHub is testing the merge with `next`: merge `next` in, run `pnpm install --no-frozen-lockfile`, and commit the lockfile.
- **Never patch MemberJunction.** No `pnpm patch`, `patchedDependencies`, patch-package or `sed` against `@memberjunction/*` `dist/`. That is AIDP Next's hard rule (`.github/workflows/MJ_PATCH_REGISTER.md` in aidp-next). Fix MJ on its `next` branch and bring the fix to the line with the `backport lts/6.2` label, or with a hand-port PR against `lts/6.2` when the fix can't be isolated; then wait for the patch release.

### CodeGen output must be reproducible from this repo

Generated files are committed, and AIDP Next ships them as they are: it excludes every `__mj_BizApps*` schema from its own CodeGen and installs the published packages. So the committed output has to be what this repo's toolchain produces from its migrations.

- Run CodeGen only with this repo's pinned MJ version, against a database built from migrations (MJ core `v6.2.N`, then the apps this one depends on, then this repo), after `mj sync push` of `metadata/`.
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

