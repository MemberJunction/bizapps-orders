---
'@mj-biz-apps/orders-entities': minor
'@mj-biz-apps/orders-core-entities-server': minor
'@mj-biz-apps/orders-ng': minor
---

Progress attestation warns on the date entered instead of on posted batches (bc-aidp-next-golive#316). `Orders.RecordProgress` no longer returns `ClosedPeriodWarning`: a Posted journal-entry batch in the month said nothing about whether finance had closed it once batches are built daily, so every past month warned. It now returns an advisory `BackDatedWarning` when `MeasurementDate` is two or more months before the current business month, and `FutureDateWarning` now fires for any date after today rather than after the current month's end. The prior month and earlier in the current month do not warn. Both are advisory on preview and post, supersede included. The supersede's reversal and catch-up dating is unchanged. The attestation screen shows the new warning in the preview, the confirm dialog and the notice after posting.
