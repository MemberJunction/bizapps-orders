# Database migrations — incremental only

> **The rule:** schema changes are new `V` migrations. Do **not** edit the baseline, and do not
> rebuild the database as part of ordinary development.

## What changed, and why

The baseline was edited in place, and `scripts/rebuild-db.sh` existed to make that safe: drop the
database, re-apply the edited baseline from zero, re-run CodeGen. That was the right call while the
schema was changing constantly and nothing downstream depended on it — a bootstrap practice for a
bootstrap phase.

That phase is over. The schema is depended on now, so the properties that made rebuilding safe no
longer hold:

- **Somebody else already has the old schema.** An edit to the baseline is invisible to any database
  that already ran it. Their column never appears, and nothing reports a problem — the migration is
  recorded as applied.
- **A rebuild throws away data.** Once there is anything worth keeping in a developer or shared
  database, "drop and re-apply" stops being a neutral operation.
- **New databases get the edit; existing ones never do.** A clean install runs the edited script,
  while every database that already ran it keeps what it had. The runner records each script's
  checksum but does not compare it again for a versioned or baseline migration, so nothing reports
  the split. (Repeatable `R__` scripts are the exception: a changed checksum re-runs them. This repo
  has none.)

## What to do instead

Add a new migration:

```
migrations/V<yyyyMMddHHmm>__v<app-version>__<Short_Description>.sql
```

It runs once, after the baseline and every earlier migration, on every deploy — clean install or
existing database — so both converge on the same schema. Write plain DDL: **no existence guards**
(`IF NOT EXISTS`, `IF COL_LENGTH(...) IS NULL`, `IF OBJECT_ID(...) IS NULL`), and add each column
with its constraints inline in one `ALTER TABLE`. The runner's history already guarantees the
migration runs once, in order; a guard only hides the case where it should fail, recording the
migration as applied while an existing object keeps a different shape. Make it work on a database
that already has data: give new `NOT NULL` columns a default or backfill them before adding the
constraint.

Then regenerate the code CodeGen owns:

```bash
pnpm run mj:migrate                      # apply the new migration to your database
pnpm exec mj sync push --dir metadata    # bring your database's metadata up to metadata/
pnpm run mj:codegen                      # entity metadata, base views, CRUD procs, TypeScript
scripts/append-codegen.sh migrations/V<new>.sql   # CodeGen's SQL, below the new migration's banner
```

Then check where each new column landed on its generated form. CodeGen's AI layout pass gives a
new field a section (`EntityField.Category`) only when it runs with an AI key and sees the field as
new; otherwise the field goes in the generic **Details** panel and CodeGen still reports success.
Give such a field a `Category` in `metadata/entity-fields` (one of its form's existing sections where
one fits), `mj sync push` it, and run CodeGen again. CI fails a PR whose generated forms put fields in
Details (`.github/scripts/check-form-details-panel.mjs`).

## A merged migration is locked

No edits, no renames, no deletions once it is on `next`. Fix it forward in a new file.

The runner records each applied migration's version, script name and checksum, and never runs a
recorded version again. Change the file and every database that ran it keeps the old SQL, while
every database that did not run it gets the new SQL. The populations diverge silently — which
schema a colleague has depends on when they last pulled.

Renaming counts, and is the case people miss. The version is the twelve digits in the filename, so a
rename produces a migration nobody has run. On a database whose newest applied migration sorts above
the new name, `mj migrate` refuses the whole run as out of order and applies nothing. Otherwise the
file executes again, plain DDL fails on objects that already exist, and because `mj migrate` runs
each migration in its own transaction and stops at the first failure, that migration rolls back and
everything after it stays pending. Either way the database is stuck until the rename is reverted or
someone edits its history table by hand.

Renumbering a migration that has **not** merged is fine and is the normal response when `next` gains a
higher timestamp while your branch is open. Only the author's own database is affected, and the file
is not yet anybody's history.

`.github/scripts/check-migrations-locked.mjs` enforces this on every PR and carries its own
self-test. Reviewers: a red result here is blocking. It has been merged past twice.

## What must NOT happen any more

**Do not edit the baseline** (`migrations/B202607061431__v0.1.x__Schema_and_Types.sql` and
`migrations/V202607061432__v0.1.x__Tables_and_Objects.sql`), including below the `V` file's CodeGen
banner.
Both files have already been applied everywhere, and like every merged migration they are locked.
`scripts/append-codegen.sh` takes the migration to append to as a required
argument and refuses any file already on `origin/next`, the baseline included: CodeGen output for a
change goes below the banner of the new migration that made the change.

**Do not run `scripts/rebuild-db.sh` as part of feature work.** It stays in the repo for the one case
it is still correct for — standing up a brand-new empty database from nothing — and its own header
says so. It is not a development loop.

**Do not write MJ metadata rows by hand in a migration.** A migration holds schema DDL plus the
CodeGen output captured below its banner, and that captured output is what registers the
`__mj.Entity` / `__mj.EntityField` rows. A hand-written `INSERT` or `UPDATE` against an `__mj.*`
metadata table (entity settings, field categories, display names, form layout) belongs in
`metadata/` instead, applied while you develop as `pnpm run mj:migrate` → `mj sync push` →
`pnpm run mj:codegen`. The next section is how those rows reach a host.

## Metadata reaches a host only as a migration

`mj sync push` seeds *your* database. It does not ship. MJ documents `mj-app.json`'s
`metadata.directory` as a dev-time pointer — "kept purely as documentation of where the metadata
lives" (`packages/OpenApp/Engine/src/manifest/manifest-schema.ts`) — and `mj app install` applies
migrations and nothing else: no CodeGen step, no metadata step. So a row that exists only because
someone ran a push is a row no customer has.

**At release the build engineer regenerates a `*__Metadata_Sync.sql` migration** carrying those rows,
and it installs with every other migration. That is the only path metadata takes to a host, and it is
the same one `bizapps-common` and `bizapps-tasks` already use.

Two properties of that step, both of which fail silently:

- **Generate it from a FRESH database, never a dev one.** A dev-database push emits `spUpdate*`
  statements, which the generator refuses and which would overwrite host state if they got through.
- **No gate catches a pending metadata change with no migration behind it.** CI does not look, and
  the app installs cleanly either way. A `metadata/` edit a host needs is therefore not finished when
  it merges — only when a release carries it.

The practical consequence for anything an external caller depends on (a Remote Operation, an
Application row, a seeded lookup): it does not exist for that caller until a release ships the
metadata migration. If a consumer needs it sooner, a one-off `mj sync push` against the target
environment bridges the gap — deliberately, not as a substitute for the migration.

## The test to apply in review

> If a colleague pulls this branch onto a database that already has last week's schema and runs
> `pnpm run mj:migrate`, do they end up with exactly the schema this branch describes?

If the answer requires them to drop their database, the change is in the wrong place.
