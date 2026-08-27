# The Explorer cannot open a Product on the joined dev host

**Measured 2026-08-27**, MJ `v6.1.0-edge.4`, Explorer at `localhost:4341`, all six Open Apps wired into
one workspace at `C:\v6`. This is why bizapps-orders#113's panel has no browser evidence, and it may be
part of what #113 is actually reporting.

## What happens

Every route that should reach an orders **Product** record fails, in four different ways:

| route | result |
|---|---|
| `/app/mjbizappsorders` | renders an "Add Application?" dialog for `__mj_BizAppsOrders`, underneath a `shell-loading` overlay that intercepts pointer events. Forcing the click past the overlay leaves the shell at *"Loading your favorites… Taking longer than expected"* and the dialog still open. |
| `/app/orders/Products` | never leaves *"Loading workspace…"* |
| `/app/mjbizappsorders/Products/<id>` | *"Almost ready to go… 🏁"*, then the same Add-Application dialog |
| `/resource/record/<id>?entity=…` and `/record/<entity>/<id>` | never leave *"Loading workspace…"* |

Taking the shell's own **Reset** affordance ("This can happen after updates or due to cached data
issues") three times, waiting 45s each, does not clear it.

## What the shell says while it hangs

```
TypeError: Cannot read properties of undefined (reading 'push')
Nav item Products not found in app orders
Error: Entity MJ: Identity Claim Types not found in metadata
```

The `TypeError` is the interesting one — an unhandled throw during shell load is consistent with a
loading state that never resolves. `Nav item Products not found in app orders` says the hand-built
`Orders` application does not expose Products at all; the entity is exposed by the CodeGen-generated
`__mj_BizAppsOrders` application, which is the one whose route hangs.

## What this is NOT

- **Not a missing test harness.** That was the first assumption and it was wrong. bizapps-orders already
  carries `playwright`, `mssql` and `dotenv`; only `@playwright/test` is absent, and the session state
  the sales harness captures is reusable against the same Explorer. A working harness here is roughly a
  config file and a small db helper — an hour, not a project. The blocker is upstream of that: there is
  no Product screen to point it at.
- **Not general Explorer breakage.** The sales workspace at `/app/sales/Deals` loads and drives fine in
  the same browser session, in the same run — spec 82 in bizapps-sales exercises it end to end.
- **Not the GL panel.** The panel is never reached, so nothing here is evidence about it either way.

## Why it matters beyond testing

bizapps-orders#113 is *"No practical way of viewing and establishing Product GL Accounts."* The panel
added on that issue puts the accounts on the Product form — which assumes the Product form can be
opened. On this host it cannot, by anyone. Worth confirming against Andrew's own environment before
concluding the panel solves what he reported: if his Explorer has the same problem, the panel is
necessary but not sufficient.

## Reproducing

Seed two links on one product and one role so the in-force/superseded behaviour would be visible if the
screen rendered, then try the routes above:

```sql
INSERT INTO __mj_BizAppsAccounting.GLAccountLink
    (GLAccountID, GLAccountRoleID, EntityID, RecordID, Status, StartedAt)
VALUES (<accountA>, <role>, <the Products entity id>, '<productID>', 'Active', '2020-01-01'),
       (<accountB>, <role>, <the Products entity id>, '<productID>', 'Active', '2026-01-01');
```

The Products entity id on this host is `B35DD5C3-9A6B-42D1-9049-297EE45ED2D5`. Remember to delete the
rows afterwards — nothing else cleans them up.
