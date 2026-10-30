# The Orders API and UI architecture

How a browser composes an order, which parts of that are MJ's job and which are ours, and where every
piece lives. Companion to [`HOW_THE_SYSTEM_WORKS.md`](HOW_THE_SYSTEM_WORKS.md) (the running system),
[`ui-architecture.md`](ui-architecture.md) (the binding rules for new UI work), and
[`/mockups`](../mockups/index.html) (the approved visual). Historical UX thesis:
[`plans/archive/orders-ux.md`](../plans/archive/orders-ux.md).

This doc is the reference for the remote operations ([§2](#remote-operations)) and the Explorer tabs
and their rails ([§5](#tabs-and-section-rails)).

---

## 1. The problem this architecture used to have

A browser could not compose an order with `entity.Save()`: the lines were transient collections on
the server subclass rather than part of the entity, so the app carried a hand-maintained mirror
(`OrderDraft`) and a remote operation per write.
[`ui-architecture.md`](ui-architecture.md#what-changed-in-mj-61-and-why-the-old-pattern-existed-at-all)
tells that history and why it ended.

**MJ 6.1 removed the constraint.** `DeclareRelatedRecords` makes a child collection part of the
entity: `Lines` is declared in metadata, CodeGen emits the accessor onto the generated class, and
`MJ.SaveEntityGraph` writes the header and its lines in ONE transaction from a plain `Save()`.
`Orders.SaveOrder`, `Orders.ConfirmOrder`, `Orders.PreviewOrder` and `Orders.PreviewConfirm` went
with the mirror.

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

### Remote operations

An operation earns its place when it is an **act** the entity cannot express: something that decides
over a set of rows, talks to a third party, or must be atomic with a write.

The source of truth is [`metadata/remote-operations/`](../metadata/remote-operations/): each row in
an `.orders-*remote-operations.json` file gives the key, scope, mode and description, and CodeGen
emits its typed base into `packages/Entities/src/generated/remote_operations.ts`. Each implementation
is `packages/CoreEntitiesServer/src/<Name>Operation.ts`; the two access-override operations share
`AccessOverrideOperations.ts`. The table below lists every row. Where it and the metadata disagree
on key, scope or mode, the metadata is right; for behaviour, the implementing class is, since some
metadata descriptions predate the code.

| Operation | Scope | Mode | What it does, and why it is not a save |
|---|---|---|---|
| **Pricing** | | | |
| `Orders.PriceOrder` | `orders:read` | Sync | Answers "what does this come to" without writing. Runs the real `OrderPricingService`, so the screen and the ledger cannot disagree. |
| `Orders.PreviewPrice` | `orders:read` | Sync | One product's price and how it resolved. Explicitly advisory — promotions stack against order totals, so a per-line answer cannot be final. |
| **Order lifecycle and fulfillment** | | | |
| `Orders.AdvanceOrderState` | `orders:write` | Sync | Back-office entry of something already done (a counter sale, a shipment made before anyone opened the system, a migration): marks a Confirmed order's fulfillable lines, then sets its `FulfillmentStatus` to Fulfilled. The caller decides whether it may move with lines still Pending. Refuses an order that is not Confirmed; books nothing. |
| `Orders.FulfillOrderLines` | `orders:write` | Sync | Marks lines Fulfilled and sets the order's `FulfillmentStatus` once nothing is left to ship, in one act. |
| `Orders.GetFulfillmentQueue` | `orders:read` | Sync | The shipping backlog is computed, not stored. |
| `Orders.CheckOrderLinesEditable` | `orders:read` | Sync | Whether the order-line veto another app registered on the server (Sales, while the deal behind the order is closed) would refuse adding, changing or removing a line, with its refusal. Asks the veto the line save asks, so the order editor shows the lines read-only before anyone types a change the save refuses. A vetoer that fails counts as a refusal. |
| `Orders.GetPriorReturns` | `orders:read` | Sync | How much of each line has been returned and how much may still come back, from the same cap confirm enforces. |
| **Payments and credits** | | | |
| `Orders.CapturePayment` | `orders:write` | Sync | Settles with the provider before the money is recorded, recognises a re-submitted capture as the same payment, turns over-payment into credit. |
| `Orders.RefundPayment` | `orders:payments:refund` | Sync | A reversal payment, un-applied proportionally across what it paid. |
| `Orders.ApplyAccountCredit` | `orders:payments:write` | Sync | Spend a credit — a zero-amount payment with two offsetting lines. |
| `Orders.ReplayCheckoutStep` | `orders:write` | Sync | An operator re-drives one failed post-payment checkout step (Capture; Confirm is refused). Needs the replay authorization. |
| `Orders.ReconcilePaymentProviderCharges` | `orders:write` | LongRunning | Matches a gateway's charges and refunds to captured payments over a window of days and reports the mismatches; outside Preview, raises each as a finance exception. Corrects nothing. |
| **External invoicing (Bill.com)** | | | |
| `Orders.GetExternalInvoicingWorklist` | `orders:read` | Sync | Billing units invoiceable on a company's rail and not yet sent. Computed per request. |
| `Orders.IssueExternalInvoice` | `orders:write` | Sync | One billing unit, one invoice on the rail, once; a repeat returns the existing reference. No ledger effect. |
| `Orders.SendExternalInvoices` | `orders:write` | LongRunning | The scheduled sweep: works the worklist through `IssueExternalInvoice`, capped by `MaxCount`. |
| `Orders.CancelExternalInvoice` | `orders:write` | Sync | Withdraws an unpaid invoice from the rail; refused once any payment is applied. No accounting event. |
| `Orders.AdoptExternalInvoice` | `orders:write` | Sync | Attaches an invoice the rail already holds to a unit whose send timed out, after checking that its total ties to the unit. |
| `Orders.PollExternalPayments` | `orders:write` | LongRunning | Captures each cleared rail payment exactly once through `Orders.CapturePayment`. Bill.com sends no payment webhook, so the poll is the source. |
| **Receivables** | | | |
| `Orders.GetOverdueWorklist` | `orders:read` | Sync | The collections worklist. Overdue changes with the clock, so it is computed, not stored. |
| `Orders.GetBillingWorklist` | `orders:read` | Sync | Scheduled instalments inside their billing window with no invoice behind them. |
| `Orders.IssueInstalmentInvoice` | `orders:write` | Sync | Issues one Scheduled instalment: freezes its document number, stamps `InvoicedAt`, moves it to Invoiced and books its billing entry, in one transaction. Issuing twice changes nothing. |
| `Orders.ReplacePaymentSchedule` | `orders:write` | Sync | Sets an order's payment schedule to a supplied list of rows. Instalments already invoiced must be in the list unchanged and are kept; the rest replace the Scheduled rows, numbered by due date, and must tie to the order's lines. Refuses adding a schedule to an order confirmed without one, and removing one from a confirmed order. All or none; Sales calls it at Close Won and when a won deal's schedule changes. |
| **Progress (percentage of completion)** | | | |
| `Orders.RecordProgress` | `orders:write` | Sync | Records one attested percent-complete observation on a line and posts the cumulative revenue catch-up. Preview writes nothing. |
| `Orders.GetProgressWorklist` | `orders:read` | Sync | The monthly attestation list: each booked percentage-of-completion line with its last observation and revenue recognised to date. |
| `Orders.DetectUnattestedProgress` | `orders:write` | LongRunning | The nightly pass that puts lines left unattested too long on accounting's finance-exception list. |
| **Subscriptions** | | | |
| `Orders.CancelSubscription` | `orders:subscriptions:write` | Sync | Policy in, reversal out. Revokes standing grants when access-through has already passed. |
| `Orders.SpawnRenewals` | `orders:subscriptions:write` | LongRunning | Places renewal orders at lead time. |
| `Orders.AmendArrangement` | `orders:subscriptions:write` | Sync | Extends a booked term at no charge, moves its start and end together (a shift, reviewed by finance at or above `TermShiftReviewDays`), or changes a confirmed order's payment terms, through an approved concession. Finance can escalate a shift under review to the ConcessionLimit approver. Preview writes nothing. Shortening a term is refused for now. |
| `Orders.CheckCoverageOverlap` | `orders:read` | Sync | Whether confirm will refuse, ask to acknowledge, or allow each subscription line's overlap with coverage the holder already has. Runs the check confirm runs. |
| `Orders.DetectOverlappingSubscriptions` | `orders:subscriptions:write` | LongRunning | Raises a finance exception for each pair of one holder's live subscriptions whose terms overlap. |
| **Entitlements and access** | | | |
| `Orders.CheckEntitlement` | `orders:entitlement-check` | Sync | Does this person currently have this capability? Asked by Code, evaluated, fail closed. |
| `Orders.ListEntitlements` | `orders:entitlement-read` | Sync | The person's library, one row per Code, same evaluator. Not a second source of truth. |
| `Orders.RequestAccessOverride` | `orders:write` | Sync | Requests an exception to payment-gated access on one order and raises its Tasks approval; access changes only once it is approved. |
| `Orders.RecordAccessOverrideDecision` | `orders:write` | Sync | Approves or rejects a requested override; an approval re-decides the order's grants at once. |

Scopes are per functional area rather than one blanket scope, so a reporting integration can read
without being able to write.

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

**Why the Entities package:** it is browser-safe, and both the Angular package and every server
package already depend on it. A client imports an operation and calls `.Execute()`
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

**The key's namespace picks the schema.** Operations have no schema column, so CodeGen infers one
from the namespace in the key: `Orders.` resolves to `__mj_BizAppsOrders`, `Accounting.` to
`__mj_BizAppsAccounting`, and MJ's own operations to core. CodeGen then applies `includeSchemas`
(`['__mj_BizAppsOrders']` in `mj.config.cjs`), so `remote_operations.ts` holds only this app's
operations. Keep every key in the `Orders.` namespace; a namespace CodeGen cannot match to an app
schema is treated as MJ core and is not written here.

### Adding an operation

1. Write `metadata/remote-operations/types/orders-<kebab-name>.input.ts` and `.output.ts` — self-contained, no imports.
2. Add a row to `.orders-remote-operations.json` (or another `.orders-*remote-operations.json` file in
   the folder), keyed `Orders.<Name>`. Valid enum values, all of which abort the push if wrong:
   - `ExecutionMode`: `Sync` | `LongRunning`
   - `GenerationType`: `Manual` | `AI` | `Default`
   - `CodeApprovalStatus`: `Approved` | `Pending` | `Rejected`
   - `Status`: `Active` | `Disabled` | `Pending`
3. **Avoid `&` in any name referenced by `@lookup`** — the resolver splits on it like a query string.
4. `pnpm exec mj sync push --dir metadata`, then `pnpm exec mj codegen --skipdb`, then build
   `packages/Entities` so the `.d.ts` is available to the server package.
5. Write the server subclass in `packages/CoreEntitiesServer/src/`: extend the generated base,
   `@RegisterClass(BaseRemotableOperation, '<key>')`, implement `InternalExecute`. Export a `Load*`
   function from that package and call it from `LoadBizAppsOrdersServer` in
   `packages/Server/src/index.ts` — tree-shaking removes a class nobody imports, and the decorator
   only runs if the module is loaded.
6. Add the row to the table in [Remote operations](#remote-operations).

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
confirm was GATED on it. Extracting the pricing walk into a service is what makes a preview that runs
the real rules cheap: the decide step without the write.

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

### Tabs and section rails

The app is a first-class MJ `Application`.
[`metadata/applications/.orders-application.json`](../metadata/applications/.orders-application.json)
declares four `DefaultNavItems`, each naming a `DriverClass`. Explorer reads the metadata, asks the
class factory, and mounts the tab — no host-side wiring. Each section's left rail is declared in
[`section-nav.model.ts`](../packages/Angular/src/lib/sections/section-nav.model.ts), the source of
truth for the Rail column.

| Tab | DriverClass | Rail |
|---|---|---|
| Orders | `OrdersSectionResource` | Dashboard · All orders \| Work: Fulfillment queue · Returns |
| Payments | `PaymentsSectionResource` | Dashboard · All payments \| Work: Refunds · Account credits |
| Receivables | `ReceivablesSectionResource` | Customer A/R · Overdue worklist · Billing worklist · Invoicing queue · Progress attestation · Subscriptions |
| Catalog | `CatalogSectionResource` | Products & categories · Pricing · Promotions · Charges & tax |

The mockups also show Fast entry, an order editor and Take a payment as rail pages. In the shipped
app, the sections' New order and New payment buttons open the Order Header and Payment Header record
forms instead.

Sections are organised by **job, not entity**: one destination per table would leave the user to
assemble the workflow themselves. Top nav across sections, left nav within one — MJ's rule.

**Record forms.** Order Headers, Payment Headers and Event Order Lines have custom forms registered
over the generated ones. The Order Header form is the compose form and sets
`ShowRelatedEntities: false` — leftover related grids do not belong under Lines. Products,
Subscriptions, Subscription Terms, Price Lists and Promotions use the generated form plus panel
contributions and `Layout: left-nav`; the Products form adds a save-time confirmation
(`product-save-guard-form.component.ts`). The reversing-payment self-join on Payment Headers is
`inclusion: None`, matching `Order Headers.ReversesOrderHeaderID`.

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
`render-after-load.test.ts` enforces this by reading every component under `pages/`, `sections/` and
`panels/`; its header lists the instances of this bug that shipped and the blind spot each exposed.

### Component standards

Follows `@memberjunction/ng-ui-components` and `@memberjunction/ng-conversations`:

- **PascalCase public API** (`@Input() Title`, `@Output() PageSelected`); camelCase private members
- `standalone: true` for new leaf components; `mj-` / `mjo-` selectors
- Class-level JSDoc with a runnable `## Example` block, and a stated reason for every non-obvious decision
- Named `ng-content select="[slot]"` projection, mirroring `<mj-page-header>`'s `[meta]`/`[actions]`/`[toolbar]`
- Before/After **cancelable** event args (`Cancel: boolean`) for vetoable actions; single emitters for informational ones
- Feature-toggle inputs that **remove** an affordance rather than disabling it
- `--mj-<widget>-*` custom properties for theming, defaulting to semantic `--mj-*`
- Tests in `__tests__/` folders, named `*.test.ts`

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
| Unit | entity rules, pure logic, the IA, the render guard | `packages/*/src/**/*.test.ts` | `pnpm run test:unit` |
| Integration | engine + operations against a real database | `packages/IntegrationTests` | `pnpm run test:integration` |
| Mockup fidelity | the screens it lists render; the ones with logic are driven | `mockups/verify.mjs` | `node mockups/verify.mjs` |

Integration checks are grouped into **bundles**, each mirrored by an `MJ: Tests` metadata record in
[`metadata-tests/`](../metadata-tests/). `registry-parity.test.ts` fails when the two disagree,
because a bundle nothing dispatches is not an error — it is silently absent coverage.

`mockups/verify.mjs` is worth knowing about: it mounts the screens it lists in jsdom and drives the
affordances on the ones with logic. It caught three defects that reading would not have: unguarded `localStorage` that
throws on a `file://` origin and blanked every page, an `id` on a slot wrapper the shell consumes at
mount, and template literals left in static HTML.

### The check that matters most

**`advance-order-state.ADV8` — an unbooked order is refused outright.** The tempting implementation of
back-office entry is a single UPDATE setting `FulfillmentStatus = 'Fulfilled'`. It is faster, it
passes any assertion that reads the order's own fields, and applied to an order that never confirmed
it produces something that looks complete with **no ledger behind it** — the failure nothing
downstream can detect, because the order reconciles perfectly against itself and the revenue simply
never existed. `Orders.AdvanceOrderState` refuses any order whose `Status` is not Confirmed; ADV8
asserts that a Draft order is refused with `NOT_CONFIRMED`, stays Draft, and has no journal entry.

---

## 7. Running it in MJ Explorer

This repo has no Explorer app of its own; a host loads `@mj-biz-apps/orders-ng` through the client
bootstrap [`mj-app.json`](../mj-app.json) names, `LoadBizAppsOrdersClient`, which references the four
section classes and `CLASS_REGISTRATIONS` so none is tree-shaken. The `Application` row with its four
`DefaultNavItems` is in metadata.

**The component kit has to ship.** `ngc` compiles TypeScript; a standalone `orders-kit.css`
referenced by no `styleUrls` is invisible to it. The package's `build:styles` script copies it into
`dist`, and the package exports it as `@mj-biz-apps/orders-ng/styles/orders-kit.css`. The host's
global stylesheet has to import that path. Nothing in this repo can check that it does;
`stylesheet-wiring.test.ts` checks the copy and the export.

## 8. Order Header form — parties and New from a party

The Order Header form is two party cards plus lines. **Ship To** sits on the
left and starts expanded. **Bill To** is a slim rail on the right; selecting
it expands that card and collapses Ship To (exclusive expand). Same person or
org can be both parties.

**New** from a Person or Organization Orders grid prefills every join field
that filters the grid (`NewRecordValuesForJoinFields`), not only the first
FK. Explorer puts those values on
`/record/MJ_BizApps_Orders: Order Headers/new?NewRecordValues=BillToPersonID|<id>||ShipToPersonID|<id>`
(org fields equivalently), so refresh and share still open an order linked
back to that party.

---

## 9. Still owed

- **Screens that read but do not yet write.** The catalog screens (products, pricing, promotions,
  charges) list and explain; editing goes through the generated entity forms until a reason appears
  to build bespoke editors.
- **Empty and first-run states**, beyond the per-screen empty text: a fresh install with no catalog,
  a customer with no history.
- **Accessibility audit.** Interactive elements carry labels, but focus management in overlays has not
  been reviewed end to end.
- **Mobile.** Basic responsive behaviour is in every screen (stated breakpoints, declared column-drop
  order); a full optimisation pass is a later phase by agreement.
