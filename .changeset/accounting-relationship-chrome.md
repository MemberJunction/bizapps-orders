---
'@mj-biz-apps/orders-integration-tests': patch
---

Take ownership of the form chrome for the three EntityRelationships that orders creates onto
accounting entities: Journal Entries → Order Lines and → Payment Headers (both `None`, posted
sources are not a JE working surface) and Dimensions → Order Line Dimensions (`More`).

These lived in `bizapps-accounting` and could not stay there. The relationship rows exist only
because THIS app's tables carry the FKs (`Order Lines.JournalEntryID`, `Payment
Headers.JournalEntryID`, `Order Line Dimensions.DimensionID`), so CodeGen creates them when orders
installs — verified against a database with accounting but not orders, where zero EntityRelationship
rows point at an orders entity. Accounting's `@lookup:` therefore resolved nothing and its
`mj sync push` failed outright with a full transaction rollback, meaning accounting's metadata could
not be pushed on any host that installs it without orders. Configuration for a row belongs to
whichever app can guarantee both sides exist.

No code and no schema change: `EntityRelationship.Configuration.UI.inclusion` is layer 1 of the
runtime chrome stack resolved by `@memberjunction/ng-base-forms`, not a CodeGen input, so this takes
effect on accounting's already-published forms with no regeneration.
