---
'@mj-biz-apps/orders-entities': patch
---

Make the Metadata_Sync migration idempotent — it cannot upgrade a host that ever ran `mj sync push`.

`V202609020400__v5.3.x__Metadata_Sync.sql` fails on the first record against any database that already
holds this app's metadata:

```
Migration failed for schema '__mj_BizAppsOrders': Failed at batch 1/248 (lines 1-83):
Violation of PRIMARY KEY constraint 'PK_RevenueRecognitionType'.
The duplicate key value is (a1d4e7b0-3c62-4f85-9a17-2b3c4d5e6f01).
```

That is not a hypothetical. It is what an upgrade hits on AIDP stage, where **78 of the 91 declared
metadata primaryKeys already exist** because somebody ran `mj sync push` against that database
directly — the stopgap `docs/database-migrations.md` explicitly sanctions ("If a consumer needs it
sooner, a one-off `mj sync push` against the target environment bridges the gap"). The seed was
generated against a clean database, so every `spCreate*` is an unguarded INSERT.

Neither skipping nor deleting works: skipping leaves the 13 genuinely-missing rows uncreated, and the
78 that exist include `ProductType` / `PaymentType` rows that live order data references by FK.

All **154** `spCreate*` calls are now wrapped:

```sql
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[RevenueRecognitionType] WHERE [ID] = @ID_83a57164)
EXEC [${flyway:defaultSchema}].spCreateRevenueRecognitionType @ID = @ID_83a57164, ...
```

so the migration creates what is missing and steps over what is already there. The 93 `spUpdate*` calls
are untouched — they target rows CodeGen already made and are naturally re-runnable.

Verified both directions on SQL Server 2022 with MJ core v6.1.0-edge.5:
- **Existing metadata** (the AIDP case, colliding ID present): applies cleanly, and twice more, with
  row counts unchanged.
- **Fresh install** (core 69 + common 22 + tasks 7 + accounting 8 + orders 16): still seeds everything
  — Application 1, Remote Operations 44, ProductType 11, PaymentType 11, both party-order queries.
  Release seed coverage still passes.
