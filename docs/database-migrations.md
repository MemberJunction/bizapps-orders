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
- **Flyway checksums the baseline.** Editing a script that has already run makes every existing
  database refuse to migrate until someone repairs it by hand.

## What to do instead

Add a new migration:

```
migrations/V<yyyyMMddHHmm>__v<app-version>__<Short_Description>.sql
```

It runs after the baseline on every deploy — clean install or existing database — so both converge
on the same schema. Write it to be **idempotent** and to work on a database that already has data:
guard with `IF NOT EXISTS` / `IF COL_LENGTH(...) IS NULL`, and give new `NOT NULL` columns a default
or backfill them before adding the constraint.

Then regenerate the code CodeGen owns:

```bash
npm run mj:migrate      # apply the new migration to your database
npm run mj:codegen      # entity metadata, base views, CRUD procs, TypeScript
```

## What must NOT happen any more

**Do not edit the baseline** (`migrations/V202607061432__v0.1.x__Tables_and_Objects.sql`), above or
below the CodeGen banner. Its generated half is still replaced wholesale by `append-codegen.sh` when
CodeGen runs against a bare database — that is why a hand edit below the banner disappears — but the
hand-authored half above it is now equally off limits, because it has already been applied
everywhere.

**Do not run `scripts/rebuild-db.sh` as part of feature work.** It stays in the repo for the one case
it is still correct for — standing up a brand-new empty database from nothing — and its own header
says so. It is not a development loop.

**A migration that depends on CodeGen metadata cannot assume it exists.** Entity and field rows are
created by CodeGen, which runs *after* migrations. A migration that reads `__mj.Entity` must skip
cleanly when the row is absent rather than throw, or it will fail on precisely the clean installs it
was supposed to support. If the change is really about metadata — field categories, display names,
form layout — its home is `metadata/` and `mj sync push`, not a migration at all.

## The test to apply in review

> If a colleague pulls this branch onto a database that already has last week's schema and runs
> `npm run mj:migrate`, do they end up with exactly the schema this branch describes?

If the answer requires them to drop their database, the change is in the wrong place.
