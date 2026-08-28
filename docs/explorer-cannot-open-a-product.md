# The Explorer cannot open a Product on the joined dev host

> ## ROOT CAUSE — `MJ_V6_Host` HAS DRIFTED. The repo is not stale.
>
> Every client builds its GraphQL query from `__mj.EntityField`. On `MJ_V6_Host` that metadata lists
> **eight** `Root*ID` virtual fields for orders entities; orders' generated resolvers know **two**. The
> schema rejects the query before the database is touched. Measured live, three queries, one session:
>
> | query | result |
> |---|---|
> | `mjBizAppsOrdersProduct { ID Name }` | **200 OK** |
> | `mjBizAppsOrdersProduct { ID Name RootSuccessorProductID }` | **400** — `Cannot query field` |
> | `mjBizAppsOrdersOrderHeader { ID RootReversesOrderHeaderID }` | **400** — `Cannot query field` |
>
> So Products, Order Headers, Order Lines, Payment Headers and Subscriptions cannot be read by any
> client on that host. That is why the Product form never renders — it is not a UI problem.
>
> ### Which side is wrong — corrected 2026-08-27
>
> My first reading was that orders' generated code was behind its own migrations. **That was wrong**, and
> a scratch database settled it. Built from orders' migrations alone, on MJ v6.1.0-edge.4:
>
> | | `Root*` columns in orders views | `Root*` EntityField rows |
> |---|---|---|
> | scratch, from empty | **2** | **2** |
> | `MJ_V6_Host` | **9** | **8** |
>
> Two is exactly what the generated code carries. A from-empty install is SELF-CONSISTENT. The extra six
> on `MJ_V6_Host` were produced by an older MJ CodeGen and were never committed anywhere — the database
> drifted ahead of every repo, which is the KI-24 baseline-drift class one repo over.
>
> ### And CodeGen REMOVES them rather than adding them
>
> Running `mj codegen` against the scratch database (`DB_DATABASE=MJ_V6_PinCheck`, 492 entities, 52s)
> took orders' views from **2 `Root*` columns to 0**, and the regenerated resolvers from two to one. So
> the remedy for a drifted host is NORMALIZATION, not regenerating code to match the extra fields.
>
> ### ⚠️ But do not run it against `MJ_V6_Host` yet
>
> CodeGen's own output was not fully self-consistent on the scratch run: it left
> `RootParentProductCategoryID` in `EntityField` **and** in the resolvers while dropping it from
> `vwProductCategories`. That is the same shape of mismatch, just smaller and one layer down — a field
> the API will ask the view for and not find. Running CodeGen on the working host could trade a
> GraphQL-validation failure for a SQL one. Worth raising with whoever owns MJ CodeGen before touching a
> database anyone is using.
>
> The 109 regenerated files from that run were reverted; `generated.ts` is byte-identical to before.
>
> ### ⚠️ AND DELETING THE DRIFTED METADATA IS NOT THE FIX EITHER — tried 2026-08-27, reverted
>
> The obvious small remedy was to delete just the six `EntityField` rows the resolvers do not know,
> leaving the view columns alone: the client would stop asking for them and loads would succeed. It was
> tried on `MJ_V6_Host` with every row backed up first.
>
> **It breaks saving.** `save-deal` went from 36/36 to **2 passed / 34 failed** immediately, and a
> browser deal save stopped landing at all — the failure moved from "the deal saved but its lines are
> missing" to "no row appeared in 30s, so the save itself never landed". Removing a field from an
> entity's declared shape evidently disagrees with the generated CRUD path that still writes it.
>
> The six rows were restored from backup and the API restarted: `save-deal` 36/36, full suite back to
> 132 passed / 1 failed (CD24 only, pre-existing). No residue.
>
> One thing the experiment DID establish: with the six rows gone, `mjBizAppsOrdersProduct` answered
> **200** and no `Cannot query field` error appeared anywhere — so the drifted metadata really is what
> produces the 400s. It is the cause; deleting it is just not a safe cure.
>
> ### THE FULL EXPERIMENT, on a clone — 2026-08-27
>
> `MJ_V6_DriftTest` was restored from a backup of `MJ_V6_Host`, reproducing the drift exactly (8
> `EntityField` rows / 9 view columns) and baselining at **save-deal 36/36**. Then:
>
> **1. CodeGen could not run at all.** It failed on the metadata-heal procedures:
>
> ```
> spUpdateExistingEntitiesFromSchema has too many arguments specified
> @IncludedSchemaNames is not a parameter for spUpdateExistingEntityFieldsFromSchema
> ```
>
> The host's core was last migrated **2026-08-19**; its heal procs take 1 / 1 / 2 parameters while the
> edge.4 CLI passes more. The DATABASE's core is older than the CLI. That is why the drift could never
> self-heal: the tool that would normalize it cannot execute.
>
> **2. Upgrading the core fixed that.** `mj migrate -t v6.1.0-edge.4` applied 11 migrations and the heal
> procs went to 2 / 2 / 3. The argument errors disappeared.
>
> **3. CodeGen then normalized the drift, exactly as hoped.**
>
> | | before | after |
> |---|---|---|
> | `Root*` EntityField rows | 8 | **2** |
> | `Root*` view columns | 9 | **2** |
>
> And the regenerated source was **byte-identical to what is committed** — which is the proof that the
> repo was right all along and the database was the thing out of step.
>
> **4. But it broke writes, and this is the part that matters.** `save-deal` went 36/36 -> 0/36 with
> `Failed to save order header: Error executing SQL`. Cause, from CodeGen's own log:
>
> ```
> Error generating field validator function from check constraint for entity
> MJ_BizApps_Orders: Order Headers and field InitialPaymentAmount. LLM returned invalid result.
> ```
>
> CodeGen DROPS the CRUD procedures and then regenerates them. Generating Order Headers' procs needs a
> CHECK constraint parsed by an LLM, no API credentials are configured locally, so generation fails
> AFTER the drop. Measured directly: orders went from 146 procedures to 144, and the two missing are
> exactly **`spCreateOrderHeader` and `spUpdateOrderHeader`**. Nothing was created to replace them.
>
> ### ✅ SOLVED — and no LLM is needed. Proven end to end on the clone, 2026-08-27
>
> The LLM was never required; the feature was simply switched on and could not work. Orders'
> `mj.config.cjs` had `{ name: 'ParseCheckConstraints', enabled: true }` with no provider key. Turning
> it off is the whole fix (committed separately on `fix/codegen-check-constraints-no-llm`).
>
> The full sequence, run against `MJ_V6_DriftTest`:
>
> | step | result |
> |---|---|
> | 1. `ParseCheckConstraints: false` | no LLM is called at all |
> | 2. `mj migrate -t v6.1.0-edge.4` | 11 core migrations; heal procs 1/1/2 -> 2/2/3 |
> | 3. `mj codegen` | **exit 0**, CRUD validation passed (516 entities) |
> | drift | `Root*` EntityFields **8 -> 2**, view columns **9 -> 2** |
> | `spCreateOrderHeader` / `spUpdateOrderHeader` | **restored** |
> | `save-deal` | **36 / 36** |
> | full integration suite | **132 passed / 1 failed** — CD24 only, matching the host's own baseline |
>
> The database now matches the code that is ALREADY COMMITTED — the normalized state has the same two
> `Root*` fields the generated code carries. So the fix is database-side only; no code change is
> required for it.
>
> ### One caveat to settle before applying it to the host
>
> That CodeGen run also rewrote 109 files in the repo — including ~2,900 lines removed from
> `entity_subclasses.ts` (230 `Validate` blocks) and several whole form components such as
> `CheckoutWidget`. Those were NOT committed. The stored validator source is intact — `__mj.GeneratedCode`
> holds 211 rows on both the host and the clone, identical — so nothing was destroyed; the regenerated
> OUTPUT simply differs from what is committed, for reasons unrelated to the `Root*` drift.
>
> That difference deserves its own look before anyone commits regenerated code. It does not block the
> database fix, because the fix is the normalization and the committed code already matches the
> normalized shape.

> ### ⚠️ CONCLUSION: SUPERSEDED — the earlier conclusion, kept for the reasoning
>
> It would drop order creation and updating and not put them back. The working host was verified
> untouched throughout (save-deal 36/36 after every step) precisely because all of this ran on a clone.
>
> The sequence that WOULD work, in order: configure CodeGen's LLM credentials, upgrade the core to
> edge.4, run CodeGen, rebuild, re-test writes. Step one is not optional — without it CodeGen is
> destructive on any entity whose CHECK constraints it cannot parse. Worth raising with MJ separately:
> dropping a CRUD procedure before knowing it can be regenerated is a bad failure mode regardless of
> credentials.

> ### Where that leaves the fix
>
> Both cheap options are now ruled out by measurement: regenerating code to match the drift (CodeGen
> removes these fields rather than adding them) and deleting the drifted metadata (breaks writes). What
> is left is making the database, its views and the generated code agree in ONE operation rather than
> patching one layer — i.e. a full CodeGen against a host someone is willing to have rewritten, with
> the write path re-tested afterwards. That is a decision about `MJ_V6_Host`, not a fix to apply
> casually.
>
> Worth knowing: MJ `next` now carries `887ba9cc79 fix(codegen): catch entity fields the base view
> cannot produce`, which adds `validateEntityFieldsResolve()` — a non-fatal detector for exactly this
> drift class. It reports; it does not repair, and it checks fields against the base VIEW, whereas the
> 400s here are metadata-versus-RESOLVER. It would not have fixed this host, but it would have named it.
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
