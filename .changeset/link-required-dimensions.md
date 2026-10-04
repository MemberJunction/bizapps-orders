---
"@mj-biz-apps/orders-core-entities-server": minor
---

Booking now obeys the dimensions a GL account link requires (`GLAccountLinkDimension`). Confirm, progress recognition and instalment billing refuse an order line whose journal entry lines lack a dimension their account's link lists, after Dimension Defaults, derived tags and the line's own tag are merged. The error names the line, the role, the account and the missing dimension codes, and nothing is posted.

**Upgrade note:** a host with dimensions listed on GL account links but no Dimension Defaults loaded will start refusing those bookings. Load Dimension Defaults (or remove link dimensions that are not meant to be enforced) before upgrading.
