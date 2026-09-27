---
"@mj-biz-apps/orders-core-entities-server": patch
---

Spawned renewals now carry a one-row payment schedule per company, due on the day the renewal pass runs, so under D92 the renewal is invoiced (with an invoice number) inside its confirm and AR is dated the invoice day rather than the new term's first day. Removes the unused `SCHEDULE_DEFAULTS.RenewalLeadDays` constant.
