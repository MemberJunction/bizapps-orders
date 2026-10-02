---
"@mj-biz-apps/orders-entities": patch
"@mj-biz-apps/orders-core-entities-server": patch
---

`MaxTermExtensionDays` now limits any change to a term's dates, not only days added. A change is measured
as the larger of how far the term's start and end move (`TermDateChangeDays`), so an extension, a
shortening and a shift of N days each escalate at a limit of N. It is checked for every concession that
changes a term's dates, whatever its form.
