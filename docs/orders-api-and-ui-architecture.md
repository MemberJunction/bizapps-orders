# The Orders API and UI architecture

How a browser composes an order, which parts of that are MJ's job and which are ours, and where every
piece lives. Companion to [`docs/ui-architecture.md`](ui-architecture.md) (the binding rules for new
UI work), [`plans/orders-ux.md`](../plans/orders-ux.md) (the design) and
[`/mockups`](../mockups/index.html) (the approved visual).

---

## 1. The problem this architecture used to have

For most of this app's life, `OrderEntityServer.Save()` composed an order from **transient
collections** — `Lines`, `PromotionCodes`, `ManualDiscounts`, `Charges` — none of which was a column.
An entity save marshals scalar fields, so none of them could cross the wire. A browser calling
`entity.Save()` could create an order *header* and nothing else.

The answer at the time was a remote operation per write, and a hand-maintained mirror of the entity
(`OrderDraft`) plus several hundred lines of hydrator to turn it back into entities on the far side.
It worked, and it cost: a parallel model that drifted from the entity silently, in both directions.

**MJ 6.1 removed the constraint.** `DeclareRelatedRecords` makes a child collection part of the
entity: `Lines` is declared in metadata, CodeGen emits the accessor onto the generated class, and
`MJ.SaveEntityGraph` writes the header and its lines in ONE transaction from a plain `Save()`. The
mirror and the hydrator are gone, and so are `Orders.SaveOrder`, `Orders.ConfirmOrder`,
`Orders.PreviewOrder` and `Orders.PreviewConfirm`.

---

## 2. The path an order takes now

```
BROWSER                                    SERVER
───────                                    ──────
OrderHeaderEntity              (packages/Entities — runs on BOTH tiers)
   │  · the shared Validate(): payer rule, has-lines rule
   │  · SectionForField / SectionsWithErrors — which part of the form is wrong
   │
   │  order.Lines.Create() / .Remove()      ← a related-record collection, not an array
   │  order.Status = 'Confirmed'
   │  order.Save()
   ▼
MJ.SaveEntityGraph ───────────────────────► OrderEntityServer.Save()
                                                │  (extends OrderHeaderEntity — same rules, plus
                                                │   everything that needs a database)
                                                │
                                          expands bundles · decides subscriptions
                                          OrderPricingService: price · promote · charge · tax
                                          books one JE per line · grants entitlements
```

Two subclasses, one chain. `OrderHeaderEntity` holds every rule that needs nothing but the record
itself, so the browser refuses a bad order before a round trip and the server refuses the same order
for the same reason. `OrderEntityServer` extends it and adds persistence — the part a browser cannot
be trusted with and could not perform anyway.

### What is still a remote operation, and why

An operation earns its place when it is an **act** the entity cannot express: something that decides
over a set of rows, talks to a third party, or must be atomic with a write.

| Operation | Scope | Mode | Why it is not a save |
|---|---|---|---|
| `Orders.PriceOrder` | `orders:read` | Sync | Answers "what does this come to" without writing. Runs the real `OrderPricingService`, so the screen and the ledger cannot disagree. |
| `Orders.PreviewPrice` | `orders:read` | Sync | One product's price and how it resolved. Explicitly advisory — promotions stack against order totals, so a per-line answer cannot be final. |
| `Orders.AdvanceOrderState` | `orders:write` | Sync | Climbs the ladder above Confirmed. Marks a SET of lines fulfilled and decides whether the header may move with some still Pending. |
| `Orders.CapturePayment` | `payments:write` | Sync | Settles with the provider before the money is recorded, recognises a re-submitted capture as the same payment, turns over-payment into credit. |
| `Orders.RefundPayment` | `payments:refund` | Sync | A reversal payment, un-applied proportionally across what it paid. |
| `Orders.ApplyAccountCredit` | `payments:write` | Sync | Spend a credit — a zero-amount payment with two offsetting lines. |
| `Orders.FulfillOrderLines` | `orders:write` | Sync | Flip lines AND close the order, one act. |
| `Orders.GetFulfillmentQueue` | `orders:read` | Sync | The shipping backlog is computed, not stored. |
| `Orders.GetOverdueWorklist` | `orders:read` | Sync | So is overdue. |
| `Orders.CancelSubscription` | `subscriptions:write` | Sync | Policy in, reversal out. |
| `Orders.SpawnRenewals` | `subscriptions:write` | LongRunning | Places renewal orders at lead time. |

Scopes are per functional area rather than one blanket scope, so a reporting integration can read
without being able to confirm.

**The test to apply before adding one:** if a plain `entity.Save()` could do it, it is not an
operation. That test is what removed four of them.

### The one rule about prices that carries real risk

**An unstated `UnitPrice` is OMITTED — never sent, never assigned as `0`.** The engine treats a
stated price as direct entry that **wins outright** over every resolved price, and `0` is a
legitimate free line. Assigning `0` for "the user didn't type one" suppresses resolution and books a
free order. `PriceOrderOperation` leaves the field untouched when the caller omits it, and says so at
the assignment.

---

## 3. The API surface is metadata

Each operation is a row in [`metadata/remote-operations/`](../metadata/remote-operations/) with its
I/O declared as a `@file:` TypeScript definition. CodeGen emits one typed base per row into
`packages/Entities/src/generated/remote_operations.ts`.

**Why the Entities package:** it is the app's only browser-safe package, and both the Angular package
and every server package already depend on it. A client imports an operation and calls `.Execute()`
without pulling the server engine.

### They are all `GenerationType: Manual` — deliberately

AI authoring is available and unused here. These bodies orchestrate the booking transaction, the GL
resolution walk and the subscription decision — the places where being subtly wrong produces a
**balanced** journal entry for the wrong amount, which nothing downstream can catch.

### Two emitter behaviours that shaped the files

**Definitions emit verbatim, de-duped by exact text, with no import resolution.** A definition file
therefore cannot `import` a sibling — every name it uses must appear in some definition that is also
emitted. The family's shared shapes are declared **once**, in the definition of an operation that
uses them: `BlockerResult` and `OrderStateTransition` in `orders-advance-order-state.output.ts`,
`JournalEntryPreview` in `orders-capture-payment.output.ts`. TypeScript hoists interfaces, so
emission order is irrelevant. **Never put an `import` in a definition file** — it would be emitted
verbatim and break the generated module.

> Those shapes used to live in `orders-save-order.output.ts`. When that operation was deleted, the
> generated module stopped compiling — which is the correct failure: a shared type whose home was an
> operation nobody calls has to move to one somebody does.

**Operations carry no schema**, so CodeGen has no core/non-core partition for them the way it does
for entities (which key on `SchemaName`). Every configured target receives the full set, so our
generated file also contains MJ's core operations. Harmless: all are `Manual`, which emits an
unregistered type shell — dead exported interfaces, no `@RegisterClass`, no duplicate factory
registration.

### Adding an operation

1. Write `metadata/remote-operations/types/<key>.input.ts` and `.output.ts` — self-contained, no imports.
2. Add a row to `.orders-remote-operations.json`. Valid enum values, all of which abort the push if wrong:
   - `ExecutionMode`: `Sync` | `LongRunning`
   - `GenerationType`: `Manual` | `AI` | `Default`
   - `CodeApprovalStatus`: `Approved` | `Pending` | `Rejected`
   - `Status`: `Active` | `Disabled` | `Pending`
3. **Avoid `&` in any name referenced by `@lookup`** — the resolver splits on it like a query string.
4. `npm run mj -- sync push --dir metadata`, then `npm run mj -- codegen --skipdb`, then build
   `packages/Entities` so the `.d.ts` is available to the server package.
5. Write the server subclass: extend the generated base, `@RegisterClass(BaseRemotableOperation, '<key>')`,
   implement `InternalExecute`. Export a `Load*` function and call it from `packages/Server/src/index.ts` —
   tree-shaking removes a class nobody imports, and the decorator only runs if the module is loaded.

> Dispatch is **by key**, not by base class. A server subclass that does not extend the generated
> base still receives calls — extending it is for type alignment and to avoid duplicating the I/O
> types, not for wiring.

### Removing one

Deleting the row from the JSON is not enough: `mj sync push` reconciles the rows it is GIVEN, so a
row it is never told about sits in every existing database as an Active operation with no code behind
it. Calling one then fails at class resolution, which is the least useful moment to find out. Delete
it with a migration — see
[`V202608091500__v0.1.x__Retire_draft_operations.sql`](../migrations/V202608091500__v0.1.x__Retire_draft_operations.sql).

---

## 4. Pricing without writing

`Orders.PriceOrder` runs `OrderPricingService` — precisely what `OrderEntityServer.Save()` calls
before it books — over line entities that are created and never saved. There is no second
implementation to drift, which is the only way the number on the screen and the number in the ledger
stay the same.

**What it replaced.** `Orders.PreviewOrder` ran the REAL save inside a transaction that always rolled
back, then read the computed values off the entities before they vanished. The reasoning was sound —
a preview that reimplements pricing is a second copy of the rules — but the cost was not: it fired on
every keystroke, so composing one order ran the full booking walk (journal entries, subscription
decisions, entitlement grants, sequence numbers) dozens of times and discarded all of it, and the
confirm was GATED on it. Extracting the pricing walk into a service is what makes the honest version
cheap: the decide step without the write.

### The `ExpectedGrossTotal` guard

Between reading a total and pressing Confirm, a promotion can expire or a rate can change.
`OrderEntityServer.ExpectedGrossTotal` makes the save refuse when the number moved, inside the same
transaction that would have booked it, rather than booking a different amount silently. It is
asserted by `order-booking.OB13`, which also checks that a refusal leaves no ledger behind — a guard
that stopped the status but kept the entries would be worse than no guard.

---

## 5. The UI layer

The binding rules for new work are in [`docs/ui-architecture.md`](ui-architecture.md). In short:
pages bind to `BaseEntity` subclasses directly, there is no data-access service layer, and logic that
needs only metadata belongs on the shared entity subclass so both tiers run it.

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

### Rendering after an await

The app is zoneless. Anything assigned to `this.*` after an `await` needs `this.cdr.detectChanges()`
**in that body** — a tick elsewhere in the component does not repaint this assignment. Without it the
view freezes on its pre-load render and shows empty states that read as real "no data".
`render-after-load.test.ts` enforces this by parsing every async body in the library; it is the guard
for a bug that shipped three times before it existed.

### Component standards

Follows `@memberjunction/ng-ui-components` and `@memberjunction/ng-conversations`:

- **PascalCase public API** (`@Input() Title`, `@Output() PageSelected`); camelCase private members
- `standalone: true` for new leaf components; `mj-` / `mjo-` selectors
- Class-level JSDoc with a runnable `## Example` block, and a stated reason for every non-obvious decision
- Named `ng-content select="[slot]"` projection, mirroring `<mj-page-header>`'s `[meta]`/`[actions]`/`[toolbar]`
- Before/After **cancelable** event args (`Cancel: boolean`) for vetoable actions; single emitters for informational ones
- Feature-toggle inputs that **remove** an affordance rather than disabling it
- `--mj-<widget>-*` custom properties for theming, defaulting to semantic `--mj-*`
- Colocated `.dom.test.ts`; `models/` for interfaces, `events/` for event args

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
| Unit | entity rules, pure logic, the IA, the render guard | `packages/*/src/**/*.test.ts` | `npm run test:unit` |
| Integration | engine + operations against a real database | `packages/IntegrationTests` | `npm run test:integration` |
| Mockup fidelity | all 20 screens render + interact | `mockups/verify.mjs` | `node mockups/verify.mjs` |

Integration checks are grouped into **bundles**, each mirrored by an `MJ: Tests` metadata record in
[`metadata-tests/`](../metadata-tests/). `registry-parity.test.ts` fails when the two disagree,
because a bundle nothing dispatches is not an error — it is silently absent coverage.

`mockups/verify.mjs` is worth knowing about: it mounts every screen in jsdom and drives the real
affordances. It caught three defects that reading would not have: unguarded `localStorage` that
throws on a `file://` origin and blanked every page, an `id` on a slot wrapper the shell consumes at
mount, and template literals left in static HTML.

### The check that matters most

**`advance-order-state.ADV8` — an unbooked order is refused outright.** The tempting implementation of
back-office entry is a single UPDATE setting `Status = 'Fulfilled'`. It is faster, it passes any
assertion that reads the order's own fields, and applied to an order that never confirmed it produces
something that looks complete with **no ledger behind it** — the failure nothing downstream can
detect, because the order reconciles perfectly against itself and the revenue simply never existed.

---

## 7. Running it in MJ Explorer

The four sections register through `CLASS_REGISTRATIONS`, which `app.module.ts` already merges into
Explorer's class list, and the `Application` row with its four `DefaultNavItems` is in metadata. Two
things had to be wired for it to actually work:

- **The component kit has to ship.** `ngc` compiles TypeScript; a standalone `orders-kit.css`
  referenced by no `styleUrls` is invisible to it. The package's `build` copies it into `dist`, and
  `styles.scss` in Explorer loads it. Note it is loaded there rather than in `angular.json`'s `styles`
  array, because entries there resolve from the workspace root and the package is hoisted — sass's
  node importer walks up and finds it, which is how the neighbouring `ng-explorer-app` import already
  works.
- **The package must be BUILT, not linked.** `.mj-links.json` deliberately does not symlink client
  packages: a second copy of `@angular/*` breaks DI in ways that surface as unrelated runtime errors.

## 8. Still owed

- **Screens that read but do not yet write.** The catalog screens (products, pricing, promotions,
  charges) list and explain; editing goes through the generated entity forms until a reason appears
  to build bespoke editors.
- **The approvals inbox.** The pre-flight names the approver role a sales rule will escalate to, and
  there is no surface anywhere for that approver — it is a task in bizapps-tasks with no UI.
- **Empty and first-run states**, beyond the per-screen empty text: a fresh install with no catalog,
  a customer with no history.
- **Accessibility audit.** Fast entry's keyboard model is designed and every interactive element
  carries a label, but focus management in overlays has not been reviewed end to end.
- **Mobile.** Basic responsive behaviour is in every screen (stated breakpoints, declared column-drop
  order); a full optimisation pass is a later phase by agreement.
