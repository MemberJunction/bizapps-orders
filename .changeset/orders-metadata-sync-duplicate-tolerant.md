---
"@mj-biz-apps/orders": minor
---

Make the Metadata_Sync seed migration tolerant of rows that already exist under a different ID.

The seed guarded each `spCreate*` with `IF NOT EXISTS (... WHERE [ID] = @ID_x)`. That only
catches a primary-key collision. On a host where the metadata was previously applied by
`mj sync push`, MJ minted its own IDs, so the row is present under a *different* ID with the
same natural key — and the create then trips a unique constraint instead (e.g.
`UQ_UserApplication_UserID_ApplicationID`, `UQ_RevenueRecognitionType_Code`).

Twelve core tables and nine app tables the seed writes to carry a unique constraint beyond
their PK, several of them filtered indexes, so enumerating natural keys per table would be
both verbose and fragile. Instead each create now runs inside `BEGIN TRY` with a `CATCH` that
swallows only errors 2601/2627 (duplicate key/index) and re-throws everything else, so a
genuine failure — a bad FK, a null violation — still aborts the migration.
