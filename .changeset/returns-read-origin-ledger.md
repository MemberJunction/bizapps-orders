---
"@mj-biz-apps/orders-core-entities-server": patch
---

A return or cancellation of a deferred line mirrors the recognition entries its origin actually staged, read from the ledger, instead of a schedule rebuilt from the product's recognition type as it is today. An on-completion line returned after its product moved to straight-line now takes back its one release, not twelve monthly ones. Earlier reversals' mirrors and term amendments are netted per date and account; a partial return takes its share of what is left. An instalment-billed origin's earned-to-date figure for the credit memo is read the same way. An origin with nothing staged keeps today's behavior (golive #495).
