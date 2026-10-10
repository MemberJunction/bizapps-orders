---
'@mj-biz-apps/orders-entities': patch
---

A save that replaces the bill-to or ship-to person, from any writer, now clears that side's organization when it is the previous person's employer, so the new person's employer is stamped instead (#542). This is the rule the order form already applied. The organization stays when the same save sets it, when the person is only cleared, or when the writer calls `OrderHeaderEntity.KeepPartyOrganization`; the form's undo of its cleared-employer notice keeps it the same way, through a new `KeptPartyOrganizations` companion.
