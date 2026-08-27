# The Explorer cannot open a Product on the joined dev host

**Measured 2026-08-27**, MJ `v6.1.0-edge.4`, Explorer at `localhost:4341`, API at `4143`, all six Open
Apps wired into one workspace at `C:\v6`. Re-measured after merging orders' latest `next`, rebuilding
all six packages and restarting the API — **it did not fix it.**

This is why bizapps-orders#113's panel has no browser evidence, and it may be part of what #113 is
actually reporting.

## The finding, in one line

The CodeGen-generated **sales** app renders fine in this Explorer; the generated **orders** app does
not. So this is neither the route class, nor the Explorer, nor a missing test harness — it is specific
to reaching orders' entities.

| route | result |
|---|---|
| `/app/sales/Deals` (hand-built) | renders |
| `/app/mjbizappssales` (GENERATED) | **renders fully** — 19KB of shell, favourites, recents |
| `/app/mjbizappsorders` | never finishes: "Loading workspace… / Setting up your environment… / Almost there…" |
| `/app/mjbizappsorders/Products` | same |
| `/app/mjbizappsorders/Products/<id>` | same |
| `/resource/record/<id>?entity=…`, `/record/<entity>/<id>` | never leave "Loading workspace…" |

## What the shell says

```
TypeError: Cannot read properties of undefined (reading 'push')
Nav item Products not found in app mjbizappsorders
Error: Entity MJ: Identity Claim Types not found in metadata
```

The `TypeError` is the interesting one: an unhandled throw during shell load is consistent with a
loading state that never resolves, and with the nav then having no `Products` item to route to.

## What was tried, and what each ruled out

1. **Merged orders `origin/next`** (4 commits, including `fix(claims): restore local identity-claim
   contracts` and `chore(release): edge.4 floor and app dep floors at latest`), rebuilt all six
   packages, **restarted the API** so the new `CoreEntitiesServer` was actually loaded.
   → No change. The `Identity Claim Types not found` error survives the restart, so that entity is
   genuinely absent from this database's metadata rather than stale in a process.
   *(Worth keeping: the merge did fix one pre-existing unit failure — `registry-parity` no longer flags
   entity-name literals. Orders' unit suite is now 1381 passed / 1 failed, the remaining one being
   `render-after-load`, which is unrelated.)*

2. **`__mj_BizAppsOrders` was missing from the user's profile.** Explorer kept offering an "Add
   Application?" dialog underneath a `shell-loading` overlay that swallowed the click. The row was
   added directly (`__mj.UserApplication`, sequence 11).
   → The dialog is gone. The hang is not.

3. **`UserApplicationEntity` is NOT the mechanism.** The obvious next theory was that the per-user nav
   list was empty for orders. It is — and it is *also* empty for every other app on this profile,
   including the sales app that renders perfectly. Checked before inserting anything; the theory was
   wrong.

## The difference that remains, and the open hypothesis

| app | ApplicationEntity rows | `DefaultForNewUser` |
|---|---|---|
| `__mj_BizAppsSales` (works) | 20 | **20 of 20** |
| `__mj_BizAppsOrders` (hangs) | 49 | **22 of 49** |

`MJ_BizApps_Orders: Products` itself is `DefaultForNewUser = true` at sequence 7, so it *should* appear.
The untested hypothesis is that one entity among orders' larger set throws while the nav is being
built, aborting the whole build — which would explain both the `push` TypeError and why a
legitimately-flagged `Products` is then "not found". Confirming that means stepping through the
Explorer's nav construction, which is MJ-side work.

## What this is NOT

- **Not a missing test harness.** That was my first explanation and it was wrong on the cost as well as
  the cause. This repo already has `playwright`, `mssql` and `dotenv`; only `@playwright/test` is
  absent, and the session the sales harness captures is reusable against the same Explorer. A harness
  here is a config file and a small db helper — an hour. The blocker is upstream of it: there is no
  Product screen to point it at.
- **Not general Explorer breakage.** Sales renders through both its hand-built page and its generated
  app, in the same browser session, in the same run.
- **Not evidence about the GL panel.** The panel is never reached, so nothing here says whether it works.

## Why it matters beyond testing

#113 is *"No practical way of viewing and establishing Product GL Accounts."* The fix for it puts those
accounts on a Product form — which assumes the Product form can be opened. On this host it cannot, by
anyone. Worth confirming against Andrew's environment before treating the panel as sufficient: if his
Explorer does the same thing, the panel is necessary but not enough, and the nav failure is the more
urgent bug.

## Reproducing

```sql
INSERT INTO __mj_BizAppsAccounting.GLAccountLink
    (GLAccountID, GLAccountRoleID, EntityID, RecordID, Status, StartedAt)
VALUES (<accountA>, <role>, 'B35DD5C3-9A6B-42D1-9049-297EE45ED2D5', '<productID>', 'Active', '2020-01-01'),
       (<accountB>, <role>, 'B35DD5C3-9A6B-42D1-9049-297EE45ED2D5', '<productID>', 'Active', '2026-01-01');
```

Two links on one role, so the in-force/superseded behaviour would be visible if the screen rendered.
Delete them afterwards — nothing else does.

To undo the profile change from step 2:

```sql
DELETE FROM __mj.UserApplication
 WHERE ApplicationID = (SELECT ID FROM __mj.Application WHERE Name = '__mj_BizAppsOrders');
```
