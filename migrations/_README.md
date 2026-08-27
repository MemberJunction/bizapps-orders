# migrations/ — Skyway (Flyway-compatible) migrations for this app's schema

Applied in filename order against **your app's schema** at install/upgrade and
during development. Once published, a migration is IMMUTABLE — never edit an
applied file; add a new one (see PUBLISH_NO_BREAK policy in docs/publishing.md).

## Naming

    V<YYYYMMDDHHMM>__v<app-version>_<Description>.sql     e.g. V202602120001__v1.0.0_Initial_Schema.sql
    B<YYYYMMDDHHMM>__v<app-version>_<Description>.sql     baseline variant (first schema drop of a new app)
    V<YYYYMMDDHHMM>__v<x.y.x>_Metadata_Sync.sql           metadata seeds captured from `mj sync push`

- Timestamps must be strictly increasing. NOT enforced by CI — this said "(CI enforces this on
  PRs)" and no such check has ever existed, the same way the changeset rule below claimed an
  enforcement that was never written. Flyway applies in filename order, so a migration numbered
  behind one already applied is skipped silently on an existing database and applied in the wrong
  order on a fresh one.
- Use `${flyway:defaultSchema}` for YOUR schema; literal `__mj` for MJ core rows.
- Do NOT add `__mj_CreatedAt`/`__mj_UpdatedAt` columns or FK indexes — CodeGen does.
- A PR that adds or edits a migration MUST carry a changeset with at least a `minor` bump.
  Create one with `npx changeset`. This is NOT enforced by CI — the claim that it was sat here
  unenforced through several schema changes, which is worse than no rule at all. It is a review
  item until somebody wires `changeset status --since=origin/next` into the workflow.

This folder starts EMPTY on purpose — the template ships no schema, so your
first migration is genuinely yours. `EXAMPLE_*.sql.example` is an inert
skeleton to copy for new work; for a complete worked example (table + view +
SPs + entity/field registration) see any shipped BizApps app's baseline
migration. Schema registration (`__mj.SchemaInfo`) is handled by
`metadata/schema-info/` in this template — don't duplicate it here.
See docs/codegen-and-metadata-migrations.md for the full authoring loop.
