# migrations/

SQL Server migrations for the `__mj_BizAppsOrders` schema. `mj migrate` and `mj app install` apply
them in version order, each in its own transaction, and record each one so it never runs twice. How
to write one, and why these rules exist: [`docs/database-migrations.md`](../docs/database-migrations.md).

## Naming

    V<YYYYMMDDHHMM>__v<app-version>__<Description>.sql   e.g. V202610081700__v5.30.x__PaymentWebhookDelivery.sql
    B<YYYYMMDDHHMM>__v<app-version>__<Description>.sql   the baseline; runs only when the schema has no migration history
    V<YYYYMMDDHHMM>__v<app-version>__Metadata_Sync.sql   carries metadata/ rows to hosts; generated at release

- The twelve digits are the version the runner records. A new migration's timestamp sorts above every
  migration on `next`.
- A migration merged to `next` is locked: no edits, renames or deletions. Fix forward in a new file.
- Refer to this app's schema as `${flyway:defaultSchema}`. Do not add `__mj_CreatedAt` /
  `__mj_UpdatedAt` columns or foreign-key indexes: CodeGen adds them, and its SQL goes below the
  migration's CODEGEN OUTPUT banner (`scripts/append-codegen.sh`).

## What CI checks

On a pull request into `next` or `main` (`.github/workflows/changes.yml`, using scripts in
`.github/scripts/`):

- when the PR changes a migration, every `V*.sql` / `B*.sql` file in `migrations/` starts with its
  letter, twelve digits and `__`, with an hour of 23 or less and a minute of 59 or less
  (`validate-migration-filenames.sh`); a file starting with any other letter is not checked;
- every added `V` migration's timestamp is above the highest `V` timestamp on the base branch (`B`
  files are not compared);
- no migration already on the base branch is edited, renamed or deleted (`check-migrations-locked.mjs`);
- no versioned or baseline migration calls `spDeleteUnneededEntityFields` (`check-migration-no-prune.mjs`),
  and no `EntityField` insert uses a literal `Sequence` (`check-migration-entityfield-sequence.mjs`);
- a PR into `next` that changes a migration carries a changeset with at least a `minor` bump.
