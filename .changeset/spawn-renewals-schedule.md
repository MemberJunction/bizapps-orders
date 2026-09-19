---
'@mj-biz-apps/orders-server': minor
'@mj-biz-apps/orders-core-entities-server': minor
---

Give the renewal operation a scheduler, and a schedule that ships disabled.

`Orders.SpawnRenewals` has been correct and uncalled since it was written. It is a remote operation,
which is the API a browser calls, and renewals have no browser — a term expires whether or not
anyone opens the app that week. UAT found the symptom while ordering a subscription product: every
subscription sat at term 1 and nothing ever generated the next one
(MemberJunction/bc-aidp-next-golive#243).

MJ's scheduler dispatches Actions and Agents, and no driver takes an operation key, so the missing
piece is an adapter. `Orders: Spawn Renewals` is that Action and holds no renewal logic of its own:
it reads parameters, routes through the provider — which runs the operation's `Authorize` hook — and
reports what came back. Selection, the booking path and both idempotency guards stay in the
operation, where the check suite already holds them.

The trap the adapter exists to survive: a `ScheduledJob` stores every parameter as text, so a job
configured for preview hands the Action the string `"false"`, and `"false"` is truthy. Read as a
plain boolean, a job set to preview bills real customers on the one run nobody expected to write
anything. Both spellings are read explicitly and anything else is refused rather than guessed.

The daily job ships `Disabled` **and** set to `Preview`, which guard different mistakes: the status
keeps a lower environment from scheduling live billing the moment this metadata lands in it, and the
preview flag means even an enabled job reports its list and stops. Going live is therefore two named
acts — enable, read the candidates, confirm, then turn preview off — and only the second one bills
anybody. `MaxCount` caps a single pass at 25 so a mis-set lead time invoices a handful of customers
and gets noticed rather than invoicing the book; the remainder is not lost, since those
subscriptions are still due tomorrow.

Three checks cover the wiring (SR12–SR14): the Action reaches the operation, preview survives the
scheduler's string encoding in both directions, and the schedule's configuration names an ActionID
that exists while shipping disabled and set to preview. That last one catches the expensive failure
— a job whose configuration points at nothing runs every night, fails every night, and renews
nobody, which looks exactly like the subscriptions not being due yet.

`MaxCount` now bounds a preview as well as a live pass. It was keyed on orders PLACED, which stays
zero on a preview, so the cap never bound there: the list a person confirmed at the gate was every
subscription in the window, and the pass that followed stopped at 25. The gate is only a gate if the
two are the same list.

A pass that leaves a due subscription unrenewed now reports `PARTIAL` and `Success: false`. The
operation catches each booking failure so one bad row cannot stop the batch, and it reports success
regardless — which meant a night on which every renewal threw wrote a green run, and a job that
notifies only on failure told nobody. That is indistinguishable from nothing having been due, which
is the symptom this whole change exists to end.
