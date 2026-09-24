---
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-core-entities-server": minor
"@mj-biz-apps/orders-server": minor
---

Payment-gated access (bc-aidp-next-golive#223). Adds a grant timing, `OnFirstPayment`, set on a
product, category or product type like the other timings:

- A new purchase's grants are written `Suspended` (`AwaitingPayment`) and become `Active` when the
  first amount due is paid: the first instalment of each company's schedule, or the whole order when
  there is no schedule.
- A renewal's grants are `Active` at confirm and are suspended (`PastDue`) once the renewal order is
  `RenewalAccessCutoffDaysPastDue` days past due. The setting defaults to 14, and `off` disables it.

Grants are re-decided inside every payment capture and reversal, so card, settled ACH, check,
refunds and returned debits all resolve through the order's `AmountPaid`. A new nightly job,
`Orders — Enforce Payment-Gated Access (daily)`, applies the renewal cutoff. It ships `Disabled` and
set to Preview. `OnPaidInFull` grants now also become `Active` when the balance clears after confirm.

Schema: `EntitlementGrant` gains `GrantTimingApplied`, `SuspendedAt` and `SuspensionReason`, and the
three grant-timing columns accept `OnFirstPayment`. The overdue worklist fills `GraceThroughDate`
for renewals that still have access. Identity claims no longer lift a payment hold.
