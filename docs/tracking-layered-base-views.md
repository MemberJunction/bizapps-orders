# Tracking: `IsOverdue` waits on MJ layered base views

**Blocked on:** [MemberJunction/MJ#3419](https://github.com/MemberJunction/MJ/pull/3419) — *CodeGen: layered base views*
**Unblocks:** D32's computed `IsOverdue` surface (see `plans/bizapps-orders-master.md` §21)

## What is missing today

D32 says `IsOverdue` is "computed in the view/entity layer, never stored state". It is computed in
**neither**. `vwOrderHeaders` has no such column and neither does the entity layer — the only
`IsOverdue` in this repo is the one `InvoiceDisplay` derives for the invoice.

So every consumer re-derives `Balance > 0 AND DueDate < now` for itself. That is the same
multiple-surfaces-disagreeing problem D83 solved for `DueDate`, still open one layer up.

## Why it is not built yet

A computed **column** is out: it needs `GETUTCDATE()`, and PostgreSQL generated columns must be
immutable, so it would work on SQL Server and fail to port — exactly what D41 ruled out when it chose
trigger-maintained rollups over computed columns for cross-platform parity.

A custom **base view** ports fine and is the right answer. The obstacle is what it costs today:
`BaseViewGenerated = 0` makes CodeGen stop generating entirely, so this app would inherit all 81
lines of `vwOrderHeaders` — 13 related-entity display joins, a geo join keyed by a hardcoded entity
GUID, and an `OUTER APPLY` to a generated root-ID function — and hand-maintain them forever. Add a
foreign key to `OrderHeader` later and its display field silently never appears.

MJ#3419 removes that cost. With `Entity.GeneratedBaseViewName` set, CodeGen keeps writing the whole
view under an inner name and this app owns only:

```sql
CREATE VIEW [__mj_BizAppsOrders].[vwOrderHeaders] AS
SELECT g.*,
       CASE WHEN g.Balance > 0 AND g.DueDate < CAST(GETUTCDATE() AS date)
                 AND g.Status NOT IN ('Draft','Quoted','Voided')
            THEN 1 ELSE 0 END AS IsOverdue
FROM   [__mj_BizAppsOrders].[vwOrderHeadersGenerated] g;
```

Note the `Status` clause: without it a voided order reports as overdue. `GetOverdueWorklist` already
filters on exactly `DueDate < asOf AND Balance > 0 AND Status NOT IN ('Draft','Quoted','Voided')`, and
the point of this work is that those two definitions can never drift.

## Plan once MJ 5.52 (or later) is released

1. Upgrade this app to the MJ release carrying #3419.
2. Set `BaseViewGenerated = 0` and `GeneratedBaseViewName = 'vwOrderHeadersGenerated'` on
   `MJ_BizApps_Orders: Order Headers`.
3. Add the custom view in the baseline's post-CodeGen section — it selects from the generated view,
   so it must be created after it.
4. Rebuild → CodeGen → metadata push → CodeGen, so `IsOverdue` is discovered as a virtual
   `EntityField`.
5. Extract the predicate ONCE — a pure TS function for the entity/display layers and the same rule in
   the view — and have `GetOverdueWorklist` use it, so the SQL filter and the column cannot disagree.
6. Integration checks: `IsOverdue` agrees with `GetOverdueWorklist` on the same data; a voided order
   with a past due date and a balance is NOT overdue.

## Why this is a tracking document and not code

Nothing here is buildable until the MJ change ships. Writing the custom view against today's MJ would
mean taking on the 81-line inheritance this is specifically trying to avoid, and then unpicking it a
week later.
