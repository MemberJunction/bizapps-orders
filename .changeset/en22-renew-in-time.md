---
'@mj-biz-apps/orders-integration-tests': patch
---

EN22 places its renewal in time, so confirm grants it Active, then moves the renewal's due date past the cutoff and checks that `Orders.CheckEntitlement` and `Orders.ListEntitlements` read it Suspended before the nightly job runs. It previously placed the renewal already past its cutoff, which confirm grants Suspended, so its "rows still read Active" precondition never held. EN25 covers that case: a renewal past its cutoff when confirmed starts Suspended for `PastDue`.
