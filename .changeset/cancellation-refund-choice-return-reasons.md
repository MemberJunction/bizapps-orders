---
"@mj-biz-apps/orders-core-entities-server": patch
"@mj-biz-apps/orders-entities": patch
"@mj-biz-apps/orders-ng": patch
---

`Orders.CancelSubscription`, called on the server, accepts a `Refund` choice for one cancellation: `Full` reverses the whole of the term being cut short and `ProrateUnused` the part after coverage ends, whatever the subscription type's own refund mode says; a later term is reversed in full under either. Absent, the type decides as before. The choice is recorded on the cancellation's lifecycle event. The remote contract and the cancel screen do not offer it yet.

The return reasons are now a shared list, `RETURN_REASONS` in `@mj-biz-apps/orders-entities`, and gain "Contract terminated early", "Customer cancellation" and "Billing correction" for reversals where nothing was shipped. The Returns page reads the list.
