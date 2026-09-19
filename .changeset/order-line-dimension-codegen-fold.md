---
'@mj-biz-apps/orders-core-entities-server': patch
---

Fold the dimension CodeGen output into the migration that caused it, per the repo convention.

`V202609191200` added `OrderLine.DimensionID` / `DimensionValueID` and its CodeGen output shipped as
a second file, `V202609191205__..._Metadata.sql`. The convention everywhere in this repo is that
CodeGen output is appended to the migration that caused it, below a run of blank lines and a
do-not-hand-edit banner — the shape the baseline migration carries and `scripts/append-codegen.sh`
produces. The separate file is removed and its contents now sit below that banner.

The appended block also gains the two foreign-key indexes,
`IDX_AUTO_MJ_FKEY_OrderLine_DimensionID` and `IDX_AUTO_MJ_FKEY_OrderLine_DimensionValueID`. CodeGen
creates these on a dev loop, but a host never runs it for this schema — `mj.config.cjs` carries the
app's schema in `excludeSchemas` — so like the view and the procedures they have to ship in the
migration.

Adds unit coverage for the both-or-neither rule on `OrderLineEntityServer.ValidateAsync`. The data
was never at risk, since `CK_OrderLine_DimensionPair` refuses a half-set row; what the check buys is
a refusal that names the missing half on the line that is missing it, rather than a CHECK-constraint
violation raised from inside the order's transaction after every other line has been written.

Note for anyone who has already applied `V202609191200`: editing it changes its Flyway checksum, so
that database needs a repair before its next `mj migrate`.
