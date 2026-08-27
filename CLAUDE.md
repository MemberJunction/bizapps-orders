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

Write migrations idempotently (`IF NOT EXISTS`, `IF COL_LENGTH(...) IS NULL`) and assume the database
already has data. A migration that reads `__mj.Entity` must skip cleanly when the row is absent —
CodeGen runs *after* migrations — and if the change is really about metadata (field categories,
form layout), its home is `metadata/` and `mj sync push` **during development**.

**But `metadata/` ships to nobody.** MJ's manifest schema calls `mj-app.json`'s `metadata.directory`
a dev-time pointer (`packages/OpenApp/Engine/src/manifest/manifest-schema.ts`), and `mj app install`
runs migrations and nothing else. A `mj sync push` whose result lives only in your database is an
**unshipped change** — the rows exist for you and for no host. At release the build engineer
regenerates a `*__Metadata_Sync.sql` migration carrying those rows, and it installs alongside every
other migration; that is how metadata reaches a customer.

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
- Plain regex escaping is fragile, misses null-byte injection (`\0`), breaks on `null`/`undefined`, and creates divergent ad-hoc sanitization.

