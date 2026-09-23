---
'@mj-biz-apps/orders-entities': minor
'@mj-biz-apps/orders-core-entities-server': minor
'@mj-biz-apps/orders-server': minor
'@mj-biz-apps/orders-ng': minor
---

A posted progress observation can be superseded, so a mistyped date no longer freezes the line (bc-aidp-next-golive#260). `Orders.RecordProgress` takes an optional `SupersedesMeasurementID` naming the line's latest observation; for a user holding the new `MJ.BizApps.Orders.Progress.Supersede` authorization (shipped with an `Orders Revenue Supervisor` role, assigned alongside Engagement Lead because a supersede is itself an attestation and still needs `MJ.BizApps.Orders.Progress.Attest`), it reverses that observation's recognition on the observation's own date, then posts the new observation's catch-up from the restored total — all in one transaction, with no row edited. `OrderLineProgressMeasurement` gains `SupersedesMeasurementID` (at most one row per observation, by filtered unique index) and `ReversalJournalEntryID`; a superseded row stays Posted and immutable and stops counting as the line's last observation, in the ordering guard and on the worklist. A measurement date after the current business month's end now returns an advisory `FutureDateWarning` on preview and post; forward dating is still allowed. The attestation screen offers "Supersede last" to users with the grant and shows the new warning in the preview and the confirm dialog.
