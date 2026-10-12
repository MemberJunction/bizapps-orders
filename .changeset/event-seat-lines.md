---
'@mj-biz-apps/orders-entities': patch
'@mj-biz-apps/orders-ng': patch
---

Order form: an event that requires attendee information is sold one seat per line. Its quantity stays at 1, "Add seat" adds a line with its own attendee block, and a draft line already selling several seats offers "Split into N lines". The shared order class gains `AddSeatLine` and `SplitIntoSeatLines`.
