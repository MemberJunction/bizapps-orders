# The Orders API and UI architecture

How a browser composes an order, why it cannot do so through `BaseEntity`, and where every piece
lives. Companion to [`plans/orders-ux.md`](../plans/orders-ux.md) (the design) and
[`/mockups`](../mockups/index.html) (the approved visual).

---

## 1. The problem this architecture exists to solve

`OrderEntityServer.Save()` composes an order from **transient collections on the server entity**:

| Property | What it holds |
|---|---|
| `Lines` | unsaved `OrderLine` entities to persist with the header |
| `PromotionCodes` | codes the customer presented, resolved after the lines are priced |
| `ManualDiscounts` | ad-hoc discounts, each gated by the applying user's sales authority |
| `Charges` | shipping, handling and tax layers, computed after promotions |

**None of them is a column.** An entity save marshals scalar fields, so none of these can cross that
boundary — which means a browser calling `entity.Save()` can create an order *header* and nothing
else. There is no arrangement of CRUD calls that composes an order correctly, and doing it as N
sequential saves would also break the one-transaction rule that keeps a confirmed order from
existing without its journal entries.

That is the whole reason the Orders API is a set of **remote operations** rather than CRUD.

---

## 2. The path a draft takes

```
BROWSER                                    SERVER
───────                                    ──────
OrderDraft                    (pure TS, no Angular, no DOM)
   │
   │ .ToInput()               → plain JSON
   ▼
Orders.SaveOrder ─────────────────────────► HydrateOrderDraft()
Orders.PreviewOrder                             │  header entity
Orders.ConfirmOrder                             │  + unsaved line entities
                                                │  + PromotionCodes / ManualDiscounts / Charges
                                                ▼
                                          OrderEntityServer.Save()
                                                │
                                          prices · promotes · charges · taxes
                                          books one JE per line · subscriptions · grants
```

One hydration path, shared by every operation that writes an order. Four operations each assembling
entities themselves would be four places for the mapping to drift from what the engine expects.

### The two rules that carry real risk

**1. An unstated `UnitPrice` is OMITTED — never sent, never assigned as `0`.**

The engine treats a stated price as direct entry that **wins outright** over every resolved price,
and `0` is a legitimate free line. So assigning `0` for "the user didn't type one" suppresses price
resolution and books a free order. This is enforced in two places and asserted in both:

- `OrderDraft.ToInput()` omits the key unless `UnitPriceWasStated`
- `HydrateOrderDraft()` only assigns the field when the payload actually carried it

**2. Line numbers come from ARRAY ORDER**, assigned at hydration rather than sent. Removing the
second of three lines therefore leaves 1-2-3 rather than 1-3.

Because array positions renumber, they cannot identify a row across a round trip — so every line
carries a **`ClientKey`**, generated client-side, never persisted, echoed back on the priced result.
That is what lets a preview result be matched to the row that produced it.

---

## 3. The API surface is metadata

Ten `MJ: Remote Operations` rows in [`metadata/remote-operations/`](../metadata/remote-operations/),
each with its I/O declared as a `@file:` TypeScript definition. CodeGen emits one typed base per row
into `packages/Entities/src/generated/remote_operations.ts`.

**Why the Entities package:** it is the app's only browser-safe package (its sole dependency is
`zod`), and both the Angular package and every server package already depend on it. A client imports
an operation and calls `.Execute()` without pulling the server engine — which is the entire point of
reaching the engine through operations.

| Operation | Scope | Mode | What it does |
|---|---|---|---|
| `Orders.SaveOrder` | `orders:write` | Sync | Create/update a draft + lines in one transaction |
| `Orders.PreviewOrder` | `orders:read` | Sync | Price a draft without writing |
| `Orders.PreviewConfirm` | `orders:read` | Sync | Dry-run the confirm: accounts, subscriptions, grants, approvals |
| `Orders.ConfirmOrder` | `orders:confirm` | Sync | The irreversible step |
| `Orders.PreviewPrice` | `orders:read` | Sync | One product's price, and how it resolved |
| `Orders.RefundPayment` | `payments:refund` | Sync | A reversal payment, un-applied proportionally |
| `Orders.ApplyAccountCredit` | `payments:write` | Sync | Spend a credit — a zero-amount payment, two offsetting lines |
| `Orders.CancelSubscription` | `subscriptions:write` | Sync | Policy in, reversal out |
| `Orders.SpawnRenewals` | `subscriptions:write` | LongRunning | Place renewal orders at lead time |
| `Orders.GetOverdueWorklist` | `orders:read` | Sync | Assemble collections work |

Scopes are per functional area rather than one blanket scope, so a reporting integration can read
without being able to confirm.

### All ten are `GenerationType: Manual` — deliberately

AI authoring is available and unused here. These bodies orchestrate the booking transaction, the GL
resolution walk and the subscription decision — the places where being subtly wrong produces a
**balanced** journal entry for the wrong amount, which nothing downstream can catch.

### Two emitter behaviours that shaped the files

**Definitions emit verbatim, de-duped by exact text, with no import resolution.** A definition file
therefore cannot `import` a sibling — every name it uses must appear in some definition that is also
emitted. So the family's shared shapes (`OrderDraftInput`, `OrderLineResult`, `OrderTotalsResult`, …)
are declared **once**, in the definition of the operation whose input they are: `SaveOrder`.
TypeScript hoists interfaces, so emission order is irrelevant. **Never put an `import` in a
definition file** — it would be emitted verbatim and break the generated module.

**Operations carry no schema**, so CodeGen has no core/non-core partition for them the way it does
for entities (which key on `SchemaName`). Every configured target receives the full set, so our
generated file also contains MJ's 16 core operations. Harmless: all are `Manual`, which emits an
unregistered type shell — dead exported interfaces, no `@RegisterClass`, no duplicate factory
registration. Upstream names a per-op core/non-core marker as the open decision that would remove
the noise.

### Adding an operation

1. Write `metadata/remote-operations/types/<key>.input.ts` and `.output.ts` — self-contained, no imports.
2. Add a row to `.orders-remote-operations.json`. Valid enum values, all of which abort the push if wrong:
   - `ExecutionMode`: `Sync` | `LongRunning`
   - `GenerationType`: `Manual` | `AI` | `Default`
   - `CodeApprovalStatus`: `Approved` | `Pending` | `Rejected`
   - `Status`: `Active` | `Disabled` | `Pending`
3. **Avoid `&` in any name referenced by `@lookup`** — the resolver splits on it like a query string.
4. Push, from the `metadata` directory (that is where `.mj-sync.json` lives), with the repo root's env:
   ```bash
   cd metadata
   node --env-file=../.env ../node_modules/@memberjunction/cli/bin/run.js sync push --include=remote-operations --ci
   ```
5. `npm run mj:codegen`, then build `packages/Entities` so the `.d.ts` is available to the server package.
6. Write the server subclass: extend the generated base, `@RegisterClass(BaseRemotableOperation, '<key>')`,
   implement `InternalExecute`. Register its `Load*` in `packages/Server/src/index.ts`.

> Dispatch is **by key**, not by base class. A server subclass that does not extend the generated
> base still receives calls — extending it is for type alignment and to avoid duplicating the I/O
> types, not for wiring.

---

## 4. Why preview runs the real save

`Orders.PreviewOrder` performs the **actual save inside a transaction that always rolls back**, then
reads the computed values off the entities before they vanish.

A preview that reimplemented pricing would be a second copy of the rules living beside the engine,
and the two would eventually disagree. So preview cannot drift from what confirming will do, because
it *is* what confirming will do. This is the same isolation primitive the integration suite is built
on, for the same reason.

Three details in the implementation matter:

- The rollback is in `finally`, so a failed save is still undone. A preview that left a half-written
  order behind would be worse than no preview.
- The draft is hydrated with `OrderHeaderID: null` even when the client is editing a saved order, so
  previewing can never touch the persisted row. The rollback should not be the only thing standing
  between a preview and a mutation.
- A `transaction has been aborted` error on rollback is swallowed: SQL Server dooms a transaction on
  a severity-16 trigger error, so by the time we ask there is nothing left to roll back. Isolation
  still held.

### The `ExpectedGrossTotal` guard

Between reading a total and pressing Confirm, a promotion can expire or a rate can change. Passing
`ExpectedGrossTotal` makes `ConfirmOrder` refuse when the number moved, rather than booking a
different amount silently. `OrderDraft.ConfirmableGrossTotal` supplies it — and deliberately returns
`undefined` when the stored preview is stale, so the guard can never authorise the very amount it
exists to catch.

---

## 5. The UI layer

### The app is a first-class MJ `Application`

[`metadata/applications/.orders-application.json`](../metadata/applications/.orders-application.json)
declares four `DefaultNavItems`, each naming a `DriverClass`. Explorer reads the metadata, asks the
class factory, and mounts the tab — no host-side wiring.

| Tab | DriverClass | Rail |
|---|---|---|
| Orders | `OrdersSectionResource` | Dashboard · All orders · Fast entry · Order editor \| Work: Fulfillment · Returns |
| Payments | `PaymentsSectionResource` | Dashboard · All payments · Take a payment \| Work: Refunds · Credits |
| Receivables | `ReceivablesSectionResource` | Customer A/R · Overdue worklist · Subscriptions |
| Catalog | `CatalogSectionResource` | Products · Pricing · Promotions · Charges & tax |

Sections are organised by **job, not entity**: fifty-one tables would otherwise be fifty-one
destinations, leaving the user to assemble the workflow themselves. Top nav across sections, left nav
within one — MJ's rule.

`@RegisterClass` decorators only run if the module is in the bundle, so `public-api.ts` both imports
**and references** the four classes. A tree-shaken section is a blank tab.

### Composition, not inheritance, for the frame

`<mjo-section-shell>` is one presentational component the four sections hand a rail to. Angular does
not inherit templates, so a base *class* would have meant four copies of the frame — four places for
it to drift. The shared behaviour that *is* inheritable (rail construction, active-page state,
per-user persistence, cached mounting) lives in `MJOSectionBaseComponent`, a `@Directive()` so
Angular accepts the inherited `@ViewChild`.

Sub-pages are created once and **cached**. That is not an optimisation: an order taker who loses a
half-entered order to a mis-click stops trusting the tool.

### Component standards

Follows `@memberjunction/ng-ui-components` and `@memberjunction/ng-conversations`:

- **PascalCase public API** (`@Input() Title`, `@Output() PageSelected`); camelCase private members
- `standalone: true` for new leaf components; `mj-` / `mjo-` selectors
- Class-level JSDoc with a runnable `## Example` block, and a stated reason for every non-obvious decision
- Named `ng-content select="[slot]"` projection, mirroring `<mj-page-header>`'s `[meta]`/`[actions]`/`[toolbar]`
- Before/After **cancelable** event args (`Cancel: boolean`) for vetoable actions; single emitters for informational ones
- Feature-toggle inputs that **remove** an affordance rather than disabling it
- `--mj-<widget>-*` custom properties for theming, defaulting to semantic `--mj-*`
- Colocated `.dom.test.ts`; `models/` for interfaces, `events/` for event args, `services/` for state

### Pixel fidelity is structural

[`packages/Angular/src/lib/styles/orders-kit.css`](../packages/Angular/src/lib/styles/orders-kit.css)
is the **canonical source** for this app's own component CSS, and `mockups/assets/app.css` `@import`s
it. The mockups and the shipped UI cannot drift because they read the same file.

Only classes MJ does **not** ship live there. Page chrome, buttons, inputs, chips, collapsible panels,
overlays and tab navigation come from `ng-ui-components` / `ng-base-forms` at runtime; the mockups
shim those separately, having no Angular to provide them. Every value resolves through MJ's semantic
tokens — no literal colours, with one documented exception (the deepest aging step, chosen by running
the palette validator; see [`mockups/PROVENANCE.md`](../mockups/PROVENANCE.md)).

---

## 6. Tests

| Tier | What | Where | Run |
|---|---|---|---|
| Unit | `OrderDraft`, the IA | `packages/*/src/**/*.test.ts` | `npx vitest run` |
| Integration | engine + operations against a real DB | `packages/IntegrationTests` | `npm run test:integration` |
| Mockup fidelity | all 20 screens render + interact | `mockups/verify.mjs` | `node mockups/verify.mjs` |

`mockups/verify.mjs` is worth knowing about: it mounts every screen in jsdom and drives the real
affordances — 52 assertions. It caught three defects that reading would not have: unguarded
`localStorage` that throws on a `file://` origin and blanked every page, an `id` on a slot wrapper the
shell consumes at mount, and template literals left in static HTML.

### The integration check that matters most

**`Orders.PreviewConfirm` must predict what `Orders.ConfirmOrder` actually does.** A preview that can
disagree with reality is worse than no preview, because it is trusted. This check is owed and not yet
written.

---

## 7. What is not built yet

| Piece | State |
|---|---|
| `Orders.SaveOrder` / `PreviewOrder` / `ConfirmOrder` | **Built**, typecheck clean, untested against a DB |
| `Orders.PreviewConfirm` / `GetOverdueWorklist` | Metadata + typed base emitted; body owed |
| The five pre-existing operations | Working; their bodies predate the generated bases, so their I/O types are still declared server-side (duplication, not a defect — dispatch is by key) |
| `OrderHeader.OriginChannel` | Schema wave owed. `HydrateOrderDraft` already sets it defensively if the column exists |
| `BaseFormPanel` library | Owed — money strip, stepper, charge ladder, JE preview, recognition waterfall, allocation grid |
| The 19 sub-pages | Owed. Sections currently render *"<page> is not built yet"* rather than a blank pane |
| Integration checks for the operations | Owed, including the preview/confirm parity check above |
