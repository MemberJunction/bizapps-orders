# @mj-biz-apps/orders-entities

## 5.40.0

### Minor Changes

- fb48fbb: A product that names no subscription type of its own but inherits one from its product type is now a subscription everywhere confirm treats it as one. `FindUnansweredHeldLines` asks the extend-or-new question for it, the order line screen shows its term start (and a bundle containing it shows one too), `OrdersEngine.ServicePeriodSource` takes its service period from the term, a bundle component of it inherits the start and subscription answer, and a checkout selling it saves the instrument for renewals. `orders-entities` exports `ResolveSubscriptionTypeID` (the product's own type, else its product type's default) and `OrdersEngine.ResolveSubscriptionTypeID(productID)`; `orders-core-entities-server` re-exports the function from there.
- 78b298a: The order form now lists, under "Before this can be confirmed", each concession that still needs approval before confirm will go through: a concession awaiting a decision, or a line priced or discounted below catalog with no approved concession behind it. Confirm stays off until the list is empty. Before, Confirm looked available and the server then refused it. The list comes from a new read-only remote operation, `Orders.ConfirmReadiness`, which runs the same check confirm runs.
- ce26b74: Orders now hears what a gateway that bills a subscription did, and books it (option E, E3 + E4 + E6).

  - **The sync.** `SyncProviderSubscription` reads the gateway subscription and its invoices since the latest term
    began, plans with the pure `PlanProviderSubscriptionSync`, and brings Orders in line, reporting every difference.
    Events only trigger a re-read; the gateway's records are the truth.
  - **Renewals booked (E4).** A renewal the gateway charged becomes a confirmed renewal order on the subscription's own
    product at what was charged, its payment captured keyed by the gateway charge (only for a period Orders has not
    booked: an imported subscriber's current year is never booked again; a taxed renewal goes to a person), `PaymentSucceeded` and
    `RenewalOrderSpawned` events, and the next term; any refund the gateway already made is booked after the capture.
    Only this order may renew a gateway-billed subscription (`SanctionGatewayRenewal`); a cancelled one is reactivated,
    keeping its gateway id, with a Task for support. A $0 renewal is booked at the last price, 100% off.
  - **A gateway refund of a renewal (D20)** is a money-only credit order applied to the renewal (`Orders.ApplyAccountCredit`),
    so the renewal owes nothing, full refund or partial; access is unchanged; a Task per credit. The refund door and a
    cancel decide under one subscription lock and never credit one refund twice. **A cancel follows the same per-term
    figure for every renewal the gateway charged and has refunded any of** (what it refunded less what Orders already
    credited, applied to the renewal), on every path: a recorded gateway end, the term D19 skips, an `Immediate` cancel
    and a backdated request alike; the type's refund rule no longer credits such a renewal on top of the gateway's refund.
    A renewal the gateway refunded nothing of, and every term Orders billed, follow the type's rule as before. A $0
    renewal (100% off) is never read as refunded in full.
  - **Spending a return's credit.** An order's applied total may go below zero by the credit the order itself carries
    (a return or cancellation), never by cash; `Orders.ApplyAccountCredit` now settles only the credit's own customer's
    orders, only between CONFIRMED orders (a Draft, Quoted or Voided order holds no credit and owes nothing), and locks
    both orders, so one credit is spent once. The Account Credit page lists the same (orders-ng: Credits Held and the
    targets leave out Draft, Quoted and Voided orders).
  - **End of term on a subscription the gateway still bills (D19)** ends with the latest booked term the gateway had
    charged by the request day and has not refunded in full: a cancel on the renewal day keeps the paid year; a
    request dated before the renewal (recorded later) and a fully refunded renewal keep the term covering the request,
    the refunded term reversing what the gateway refunded. Terms ridden past are stamped Completed at their own end.
  - **Failures and the end state.** Each failed attempt is a `PaymentFailed` event; no order until paid; access is kept
    to the end of the gateway's next retry day (capped at 45 days past coverage). A portal cancel turns automatic renewal
    off (and back on when withdrawn); a subscription the gateway ended is cancelled in Orders.
  - **The webhook endpoint check** (at every server start, and the hourly job) now judges the subscription event kinds
    too, so an endpoint that predates this release reports `Drift` with the ten kinds it does not send.
  - **The webhook** routes the driver's subscription event kinds to the sync (500 on failure so the gateway redelivers);
    a gateway subscription no Orders subscription records is classified (`not_ours`, `unknown_subscription` with one
    Task); the third failed delivery for one subscription raises an urgent `GatewaySyncFailed` Task. The account's
    `BillsSubscriptions` switch gates new hand-overs only; subscriptions the gateway already bills are always followed.
  - **New actions:** `Orders.SyncProviderSubscriptions` (nightly job, ships Disabled and in Preview) and
    `Orders.LinkProviderSubscription` (checked link of an existing subscription, then a sync: the account must be the
    subscription's company's, the gateway subscription must not name another Orders subscription, an existing
    provider is never overwritten, a customer e-mail that differs refuses and one that cannot be compared needs a person's `CustomerConfirmed`,
    and an older price is linked with `AllowPriceOfAnotherProduct`).
  - **Entity (orders-entities):** `Linking` now covers a NEW subscription created already carrying a gateway id (the
    same write and the same guess as a saved one gaining it), so that too is refused from any form or API unless a
    server door sanctioned it.
  - **Driver:** `HandledSubscriptionEventKinds`, `ListProviderSubscriptionInvoices` and a richer
    `DescribeProviderSubscription` (price, quantity, customer, e-mail, metadata, `EndedAt`); Stripe implements them.

  No migration. Integration checks SR75–SR98-OT (subscription-renewal) and AC-OT1 (account-credit).

### Patch Changes

- 135f01f: The order form's Payment tab lists the order's payment schedule: each instalment's due date, amount, status, invoice number and when its AR was raised, linked to the journal entry. An order with no schedule says its full value is raised to AR at confirm. `OrderHeaderEntity.LoadPaymentSchedule()` reads the rows, and the form's Refresh reads them again, so rows added elsewhere appear without reopening the order.

## 5.39.0

### Minor Changes

- 1e2a5c6: Product, Price List and Product Entitlement now match a name by any part of it rather than only from the start, so a catalog filter box finds a record from a word in the middle of its name.
- 117cd8a: Once a payment gateway bills a subscription, no Orders door changes it unseen (option E, E2b). `Orders.CancelSubscription` now reads a gateway-billed subscription at the gateway first (new driver method `DescribeProviderSubscription`, refusing by default; Stripe reads `GET /v1/subscriptions/:id`): a cancel after the gateway started a billing period Orders has not booked (its renewal at 00:00 on the term's last day) is refused with nothing changed, so the renewal it charged is refunded at the gateway rather than kept, and a cancel the gateway already completed is recorded, after the term too. Otherwise it cancels at the gateway first, before its transaction, and locks the subscription row so two simultaneous cancels cannot book two credit memos: the gateway must charge nothing after coverage ends (now, at its period end, or at that instant), and if it does not confirm nothing is written. New driver method `CancelProviderSubscription` refuses by default; Stripe implements it (reads the subscription, then `DELETE` or `cancel_at_period_end` / `cancel_at` with `proration_behavior=none`, verifying the answer; its stub refuses). The cancel output gains `Gateway`, the cancel panel says the gateway bills the subscription and previews what it will do, and the `Canceled` event records what the gateway did. A cancel is refused while an E2 alert says a gateway subscription may be billing unrecorded, when those alerts cannot be read for a gateway-billed subscription, and when no open term covers the request day. The new shared `SubscriptionEntity` refuses any other change to a gateway-billed subscription's billing columns on every tier (`PROVIDER_BILLED_FIELDS`), and refuses a gateway id typed onto an existing subscription (creating one with its id stays open, for importers), sanctioned server-side for the writes that told the gateway. An order can no longer extend, renew or reactivate a gateway-billed subscription; a cancelled one bought again starts fresh with a new gateway subscription, found by the checkout through its new term and created under a new idempotency key. A return of its sale and a Duration, Shift, Seats or amount-change concession on its term are refused. The hand-over stops a gateway subscription made for one cancelled meanwhile, never records one the subscription already cancelled, and searches again after every create (two live raise an urgent `AmbiguousAtGateway`). The checkout's returning-buyer refusal includes Paused subscriptions, and the daily job's preview now searches the gateway read-only.
- 29af2af: Second part of the 5.39 release seed: `V202610300700__v5.39.x__Metadata_Sync_AlertTaskRole.sql` and its PostgreSQL counterpart carry the `AlertTaskRole` Orders setting (#987) to hosts, which install by migration and never read `metadata/`. It is created empty, so alert Tasks stay unassigned until a host names a role. The create is guarded on ID or app and name, so a host that already pushed this metadata is unchanged.
- 06897c1: Release seed for 5.39: `V202610300200__v5.39.x__Metadata_Sync.sql` and its PostgreSQL counterpart carry this release's metadata to hosts, which install by migration and never read `metadata/`: the Replace Payment Schedule remote operation, the Create Provider Subscriptions action with its nine params and its daily job (created Disabled), Cancel Subscription's new description, name search by any part of the name on Products, Price Lists and Product Entitlements, and the Referral Programs grid columns. Creates are guarded on ID or their unique key, so a host that already pushed this metadata is unchanged. Also adds the PostgreSQL counterpart of `V202610230200__v5.39.x__Provider_Billed_Subscriptions`.
- adb8e61: Orders UI/UX fixes.

  - Order lines: subscription lines show their Term end, read-only; the "Before this can be confirmed" list notes a line whose stated length differs from its type's term; held-product choices and the after-confirm notice name the end that is kept. Bundle lines whose bundle contains a subscription take a Term start.
  - A rep can enter a manual discount above their Sales Authority cap: it is saved held and marked "Needs approval", and confirm waits for an approved concession. A line charged nothing once its concession is taken off is a Scope concession. A deferred line books its discount as revenue is earned: booking credits Deferred Revenue with the net, and each revenue release (or progress catch-up) debits its share to Sales Discounts and credits Sales with the gross, so nothing is left in Deferred. A fully discounted deferred line books nothing. A price typed as 0 suggests a 100% discount instead. A saved order adjustment's authority, approver, amount, line and promotion cannot be changed, and the row can only be deleted by the order's own save, so a held discount cannot be hidden from confirm.
  - A refused booking says in plain words which line to change; accounting's codes go to the server log.
  - Send to Bill.com shows on every order using the Bill.com rail and is enabled only on a saved, confirmed order; otherwise it is greyed out with the reason as its tooltip. The reason is recomputed after a save or refresh.
  - A captured payment shows what it was applied to instead of the allocation workbench; By Journal Entry renders; overdue days count business days; the open-orders Date column shows the order date.
  - The fulfilment queue, the external invoicing worklist and the invoice rail report a failed read as an error instead of an empty list; an invoice unit whose history cannot be read is not sent.
  - The subscription Overview lists read newest first, and a stale reload no longer overwrites newer cards; Cancel subscription is disabled while the form is in edit mode.
  - The Override Explanation box shows only on an overridden line price.
  - The checkout element stops sending events, polling and redirecting once its host removes it; payment and completion calls already started still finish.
  - Styles read only `--mj-*` tokens MemberJunction 6.1.5 defines, checked by a unit test. The kit's print rules, filter chip, select and timeline rules no longer restyle MemberJunction pages outside Orders; loaders and empty states use MemberJunction's components; app chips take the `mjo-` prefix.
  - A migration puts the Event Order Line Attendance Status values in CodeGen's order on databases built from migrations. The Referral Programs list shows Company and Is Active by default.

  The order form's notes on subscription lengths other than the type's term, which do not block confirm, show under their own "When this is confirmed" heading instead of "Before this can be confirmed".

- d6a280d: Subscriptions a payment gateway bills itself (option E, E1). A subscription whose `ProviderSubscriptionID` is set (Stripe's `sub_...`) is billed by the gateway named in its `PaymentProviderID`, so Spawn Renewals no longer places a renewal order for it and Charge Renewals no longer charges or captures one. Both jobs share one rule, `NotProviderBilledSql`, keyed on that marker alone. Orders itself has never written a gateway id, so on a host that hasn't imported any nothing renews differently today; the migration header has a two-line pre-flight for hosts that have.

  The migration adds the columns the next change reads to create gateway subscriptions: `PaymentProviderType.SupportsSubscriptionBilling` (the gateway can bill subscriptions; set for Stripe), `PaymentProvider.BillsSubscriptions` (this account does; off everywhere), and `PaymentProviderPrice.UseForNewSubscriptions` (the one price a new gateway subscription to a product uses). It also adds `UQ_Subscription_ProviderSubscriptionID` (one Orders subscription per provider and gateway id), `CK_Subscription_ProviderSubscriptionHasProvider` (an id needs its provider and may not be empty) and `UQ_PaymentProviderPrice_NewSubscriptionProduct` (one flagged active price per provider and product).

- f129713: Self-serve checkout refuses another subscription purchase from a buyer who already holds a subscription their payment gateway bills (option E). When the draft sells a subscription product and the Person the e-mail resolves to holds an Active or Trialing subscription in the widget's company with `ProviderSubscriptionID` set, the draft and the payment-intent step refuse the purchase, whatever the plan, with the new refusal code `ProviderBilledSubscription`: Orders would extend or add a term the gateway knows nothing about while the gateway still charged at its own renewal. A purchase with no subscription product is not refused. The message is the new widget setting `providerBilledSubscriptionMessage` (a neutral default otherwise), with `{renewalDate}` replaced by the day the gateway next charges.
- 756afe7: New remote operation `Orders.ReplacePaymentSchedule` sets an order's payment schedule from a supplied list of rows (due date, amount, description). Instalments already invoiced, paid or written off must appear in the list with the same due date and amount and are kept unchanged; a list that changes or drops one is refused, naming the instalment. The other rows replace the order's Scheduled rows in place, numbered by due date, and must tie to the order's lines by the same check confirm and invoicing use. An order confirmed without a schedule (billed in full) cannot be given one, and a confirmed order billed by its schedule cannot have it removed. An instalment not yet invoiced that a payment names cannot be removed, re-dated or lowered below what is paid on it (`PAID_ROW_CHANGED`). The order's status is re-read under a lock inside the transaction, so a confirm that lands between the read and the write is honoured. All or none, and the same list sent twice writes nothing. Sales calls it to put a deal's schedule on its order at Close Won and when a won deal's schedule changes.

### Patch Changes

- 4104f24: A hand-entered order with a line at a unit price of 0 can no longer be confirmed. The order form's "Before this can be confirmed" list names the line once and asks for the negotiated price, or the price with a 100% discount to give it away; the confirm save refuses with the same message before anything books. Checkout and payment-created orders, bundle components and return lines are exempt. So is a renewal line the renewal job priced at zero (a product now listed at zero) while its price is unchanged, so a $0 renewal books instead of failing the job on every run; the same line edited to zero by hand is refused. When accounting refuses an order's booking, the message now gives each distinct error once, naming the order lines it applies to, instead of once per draft.

## 5.38.0

### Minor Changes

- 5fe872a: Release seed for 5.38: `V202610230130__v5.38.x__Metadata_Sync.sql` and its PostgreSQL counterpart carry `EntityIDFieldName` on the three polymorphic RecordID fields (#946) to hosts, which install by migration and never read `metadata/`.
- 0baf0fd: Populate `EntityField.EntityIDFieldName` metadata on polymorphic foreign-key record-ID fields so MemberJunction forms, grids, cards, and detail panels resolve target record names and render smart clickable record links.
- 68f8cc1: `metadata/entities/.polymorphic-fk-entity-fields.json` gives every `MJ: Entity Fields` entry a `primaryKey` lookup (`@lookup:MJ: Entity Fields.EntityID=@lookup:MJ: Entities.Name=<entity>&Name=<field>`). The entries had none, and `mj sync push` creates a new row for any record without a `primaryKey`, so on a fresh database it tried to insert a second field row with a NULL `EntityID` and the app's whole metadata push rolled back. With the lookup, push updates the field row CodeGen created and sets its `EntityIDFieldName`.

## 5.37.0

### Minor Changes

- 336603c: The 5.37 Metadata_Sync ships the one setting metadata/ added since 5.36: `ConcessionSelfApprovalEscalation` (#913). A host that upgrades by migration gets the same row as one that ran `mj sync push`, created empty, so a holder of a ConcessionLimit rule's role still approves their own concession until the setting is filled in. It has a Postgres counterpart.

### Patch Changes

- 1cf9fa1: `FindExistingHolding` and `FindUnansweredHeldLines` count every subscription that has not ended (Active, Trialing, Paused) as held, so the extend-or-new question is asked for a paused subscription too. The status set is exported as `EXISTING_HOLDING_STATUSES`.

  The order screen's "extend" choice now says what confirm will do: a next term for an active holding, or the subscription type's reactivation rule (reactivate, or a separate subscription) for a paused one. `ExtendOutcomeFor` and `ExtendChoiceTextFor` give the same wording to other screens.

## 5.36.1

## 5.36.0

### Minor Changes

- db3aef7: Order review by trigger (bc-aidp-next-golive#320 §5). A Direct order that hits a switched-on trigger (`NoDeal`, `PriceVariance`, `ChangedAfterDealOrReview`, `OverThreshold`, `ServicePeriod`) cannot confirm until the reviewer role approves its `ORDERS_ORDER_REVIEW` task; an order a reviewer created goes to the escalation role. Routing is to the role holders' linked Persons, never the order's creator. Configured by the new `OrderReview*` settings, all off by default, so hosts that set nothing are unaffected. Adds the `RegisterOrderDealLink` seam for the sales app to say which deal created an order; the `ORDERS_ORDER_REVIEW` task type and the settings rows ship in metadata. An approval counts only when the user who wrote the decision (from `MJ: Record Changes`) holds the routed role and is not the creator, the task was linked to this order alone before it was decided, and nothing reviewed on the order was written since. `OrderHeader.Origin` can now be written only by the process that creates the order (checkout, provider payment); any other write of it is refused on save.
- 4a7fbb0: Build and run on MemberJunction 6.1.6, the current 6.1 LTS release. Every `@memberjunction/*` peer, devDependency and the `@memberjunction/core` / `@memberjunction/global` overrides move from `^6.1.5` to `^6.1.6`, and `mj-app.json` requires a host at `>=6.1.6 <7.0.0`. `scripts/rebuild-db.sh` and the PostgreSQL parity workflow install MJ core `v6.1.6`. One copy of `@memberjunction/core` and `@memberjunction/global` resolves.
- eeb9cd5: The 5.36 Metadata_Sync ships the eight settings and the task type that metadata/ added since 5.35: the order review settings (`OrderReviewTriggers`, `OrderReviewTotalThreshold`, `OrderReviewServiceStartMonths`, `OrderReviewLineTermMonths`, `OrderReviewerRole`, `OrderReviewEscalationRole`), the refund approval settings (`RefundApprovalThreshold`, `RefundApproverRole`) and the `ORDERS_ORDER_REVIEW` task type. A host that upgrades by migration gets the same rows as one that ran `mj sync push`, with the checks off until the settings are filled in. It has a Postgres counterpart.

## 5.35.1

## 5.35.0

### Minor Changes

- 8a9d2f9: `Orders.CancelSubscription` takes an optional `Timing` (#702). `Immediate` ends coverage and access on the request day; `EndOfTerm` ends them on the term's last day. A chosen timing drops the type's grace period, so access ends on the day chosen. Without it the type's `CancellationMode` decides, as before. The refund mode always comes from the type. The policy is `SubscriptionBehavior.RulesForTiming` and can be overridden; an unknown timing is refused before anything is written, and the lifecycle event records the timing chosen.
- 48ea049: The 5.35 Metadata_Sync ships the Cancel Subscription input contract that metadata/ changed since 5.34, so a host that upgrades by migration describes the operation's new cancellation-timing input the same way as one that ran `mj sync push`. It has a Postgres counterpart.

## 5.34.1

## 5.34.0

### Minor Changes

- 59236a8: The PostgreSQL counterpart of the guard-trigger migration (`V202610091200`) now runs. It quoted the `${flyway:defaultSchema}` placeholder, which on PostgreSQL resolves to the mixed-case `__mj_BizAppsOrders`; quoted, that names a different schema from the lowercase one the orders tables live in, so the migration failed with `relation "__mj_BizAppsOrders.OrderHeader" does not exist`. The placeholder is now unquoted. No SQL Server change.

## 5.33.0

### Minor Changes

- e384e15: An amount change that needs a credit memo is no longer refused (#662). The approved change is the credit memo: it carries the memo's amount and number (`<order number>-CM<n>`), posts its entry dated the effective day (deferred revenue and tax debited, the receivable credited), credits the invoice named in `AppliesToInvoiceID` up to its open amount, and lowers the line's `BilledToDate` by the memo's net. What no invoice takes stays on the order's balance as the customer's credit. `RefundRequested` against a paid invoice records the credit on that invoice; the acknowledgment task asks finance to pay it with `Orders.RefundPayment`. Payments landing on a credited invoice settle only what it still owes. Integration bundle `amount-change` gains AC8 and AC9, and AC7 now applies a credit on an invoice already sent.
- 9a78b8e: `Orders.AmendArrangement` previews a lower amount on a booked term (#506). With `NewAmount` and `Preview`, it returns the reduction and its tax, the catch-up on revenue already earned, the staged recognition entries it would offset and the new schedule, the uninvoiced instalments it would reduce or cancel, and the credit memo with where it is applied (`AppliesToInvoiceID`, `RefundRequested`). It writes nothing. Recording a change of amount is still refused until its application exists. New integration bundle `amount-change` (AC1 to AC4).
- 67e1dbd: `Orders.AmendArrangement` records a lower amount on a booked term (#506). Without `Preview`, it records a Price concession carrying `NewAmount`, routed through the ConcessionLimit rule like any other. When approved, in the same transaction: the catch-up and the re-cut recognition entries are posted, the term's amount and the instalments not yet invoiced are lowered, an `AmountChanged` subscription event is logged, and accounting's acknowledgment task is raised. Later instalment invoices bill the lowered line, and the schedule check subtracts approved reductions. A change that needs a credit memo (a credit on an invoice already sent, an order billed as a whole, or a refund) is still refused. `ReasonCategory` accepts `Dispute`. Integration bundle `amount-change` gains AC5 to AC7.
- 3bbd5d6: The collected migrations for term dates, overlap reasons, amount changes, VAT location evidence and seat counts carry CodeGen output regenerated against a database built from migrations, so each later migration's views and procedures keep the columns earlier ones added. A new heal migration ships the Order Headers geo-embed view and the CHECK-constraint validators no migration installed; the regenerated validators have new names.
- 3c16360: Schema for concession follow-ups (golive #281, #268). `RequiresSaleApproval` (nullable bit) on Product Types, Product Categories and Products, for products that always need an approver's sign-off; NULL inherits Product -> category chain -> type. `OrderConcession.SignedAmendmentReference` records where a concession's signed contract amendment is kept. Schema only; the behaviour ships separately.
- 1a69590: Schema for concession approval tiers (#308). `SalesRule` gains, for ConcessionLimit rules only: `ConcessionTier` (rank), the thresholds `MinConcessionValue`, `MinConcessionPctOfContract` and `MinTermExtensionDays`, and `RequiresDecisionWithinAuthority` (bit, default 0). A CHECK keeps them empty on other rule types. Existing rules keep no tier, no thresholds and no sign-off. Schema only; the behaviour ships separately.
- d3ba6b5: Concession approval tiers (#308). Several active ConcessionLimit rules are approval tiers: a concession goes to the highest-ranked one (`ConcessionTier`, NULL as 0) whose thresholds it meets (`MinConcessionValue`, `MinConcessionPctOfContract`, `MinTermExtensionDays`; any one set threshold, at or above), and only that tier's role decides it; `OrderConcession.SalesRuleID` names the tier. A rule with no thresholds takes every concession, so a single untiered rule behaves as before. A tier with `RequiresDecisionWithinAuthority` holds a concession routed to it Pending even when the requester's SalesAuthority covers it (recording that authority too), and the requester cannot decide it even holding the role. Two met tiers of one rank refuse the concession with a message naming them. `orders-entities` exports `PickConcessionTier` and `ConcessionTierMet`; `orders-core-entities-server` replaces `FindConcessionLimitRule` with `LoadConcessionTiers` and `FindConcessionTier`.
- df7ff8d: Migration `V202610131506` adds the value lists for External Invoices `Status` (Sending, Sent, Canceled, Failed) and External Payments `Disposition` (Captured, Held, Unmatched, Refused, Ignored, Reapplied, ReversalNeeded). A database built from migrations had neither, so it disagreed with the entity classes until CodeGen ran on it.
- 77050bc: The payment poll reads HubSpot Payments (#482). A `HubSpotPayments` provider row per company, pointing at that company's HubSpot portal, makes `Orders.PollExternalPayments` record every payment the portal collects in `ExternalPayment` when it is made, ahead of the payout.

  - Payments collected through the company's own Stripe account, or only recorded in HubSpot, are set aside (`Ignored`) so they are not booked twice.
  - A succeeded HubSpot-collected payment is `Unmatched`, with its gross, fee, net and buyer, until order matching by deal is possible; processing ones are held.
  - Payment statuses are classified per rail (`PaymentStatusVocabularyFor`). A refund or dispute against a captured payment is reported for a person instead of read as already captured. Bill.com's behaviour is unchanged.
  - New provider type `HubSpotPayments` in `metadata/payment-provider-types` (driver `HubSpotPaymentsProvider`, which refuses every checkout verb). It reaches hosts with the release's metadata sync.

- 968549b: New entity `Instalment Line Billings` (#681): what each instalment invoice billed each order line, part by part (the net, the tax and charges no charge allocation covers, and each allocated charge type). Written by the server when an instalment is invoiced, so later invoices can take earlier ones as billed instead of slicing them again against lines an amount change or a return has lowered.
- 3f2f22a: Order Concessions gain the fields of a change to a booked term's amount (#506): `NewAmount`, `AppliesToPaymentScheduleID` (the invoiced instalment the reduction is about) and `ScheduleReduction` (what an approved change took off the instalments not yet invoiced). An order's `Balance` subtracts its approved schedule reductions. `ReasonCategory` gains `Dispute`, and Subscription Events gain the `AmountChanged` event type.
- c0d0b84: Order Concessions gain the credit memo an amount change issues (#662): `CreditMemoAmount`, `CreditMemoNumber` (unique) and `RefundRequested`. Order Header Payment Schedules gain `AmountCredited`, what credit memos credited on an invoiced instalment; its `Balance` and the cash cascade net it out. An order's `Balance` subtracts approved credit memos as well as schedule reductions.
- 60f4ef3: The order form splits a line of an event that requires attendee information into one line per seat (#615).

  - Raising quantity above 1 on such a line turns it into that many quantity-1 lines, each opening on its own attendee block, with a notice saying so. Confirm books that event only in this shape.
  - The new lines copy the product, price (including an override and its reason), dimension, ship-to and service period. A manual discount stays on the first line; the notice says so when there was one.
  - `OrderHeaderEntity.SplitLineIntoSeats` and the `attendee-seats` helpers (`RequiresAttendeePerSeat`, `ExtraSeatLinesNeeded`, `SplitIntoSeatLines`) hold the rule, so any order editor can use it.

- 4f1f89a: `OrderLine.CoverageOverlapReason` (migration `V202610131509`): why a line marked to run alongside existing coverage in its subscription family should be billed as well (bizapps-orders#511). Nullable, with no constraint; confirm is what requires it.
- 4ba919b: Order Lines gain two fields for a return against an order billed by instalment (#661): `ScheduleReduction` (the returned units' share of what the origin's instalments had not yet invoiced) and `CreditMemoAmount` (the credit memo the return booked). An origin order's `Balance` subtracts what its returns took off its instalments, and a return order's `Balance` counts each such line at its credit memo rather than its full value.
- 465980d: Orders gain two columns for VAT location evidence from self-serve checkout: `IPCountry`, the country of the buyer's IP address, and `CardIssuingCountry`, the country of the issuer of the card that paid. Both are ISO 3166-1 alpha-2 codes and nullable; the IP address itself is never stored.
- 49c52df: `OrderLine.ExtendedAmount` (nullable): the amount the price rule set for the line before discount, so a Flat price that does not divide by the quantity can be read back exactly (#579). Collected migration with its CodeGen output; the code that writes and reads it ships separately.
- 313f19f: The 5.33 Metadata_Sync ships what metadata/ changed since 5.32: renewal charging (the Charge Renewals action and its daily job, created Disabled, the retry-days and payment-link settings and the renewal payment-link email templates), the charge-exception operations Resolve Charge Exception and Create Order From Provider Payment, the Concession Approval task type, the run-alongside coverage authorization, the approved-without-signed-amendment concessions view, the HubSpot Payments provider type, and form layout and default list columns on 44 fields. Orders now requires bizapps-tasks 1.8 or later, the first release that seeds the Teams assignment action its approval task types post through. It has a Postgres counterpart.
- e51a86a: The seventeen schema migrations in this release (V202610131500 through V202610131516) gain PostgreSQL counterparts: tables, columns, constraints, indexes, views, data and grants converted by `mj sql-convert`, and the order-total rollups, payment-schedule allocation, concession and order-line rollup triggers and the order-line guard written by hand in PL/pgSQL. CodeGen's CRUD procedures, timestamp triggers and hierarchy functions are not included; a PostgreSQL host generates them with `mj codegen`.
- a33ca5a: `Promotion.AppliesToRenewals` marks a promotion whose discount continues on the subscription's automatic renewals (#289). Off by default, so existing promotions keep discounting the first term only.
- 3388b7e: Schema for referral programs (golive #268). New `ReferralProgram` entity (company, name, `DaysPerReferral`, active) and `OrderConcession.ReferralProgramID`.
- 59a2c13: Running a band alongside existing coverage now needs a permission and a reason (bizapps-orders#511).

  - At confirm, a line whose overlap passes only because it is marked to run alongside (`ExtendExisting`) is refused unless the confirming user holds the new `MJ.BizApps.Orders.Coverage.RunAlongside` authorization and the line's `CoverageOverlapReason` is not blank. The check fails closed: without the authorization row, no line can run alongside. The Account Director role holds it.
  - The order lines editor shows a required reason box once the box is ticked, and disables the tick for a user without the grant. Unticking clears the reason.
  - A bundle line's reason reaches the band lines it expands to, as its acknowledgment does.
  - The "Overlapping Subscriptions" query returns `LaterOverlapReason`.
  - New shared helpers: `COVERAGE_RUN_ALONGSIDE_AUTH`, `CoverageOverlapReasonMissing`, `UserCanRunAlongside`, `RunAlongsideRefusal`.

- 4c28b84: Products that always need approval (golive #281). The confirm gate holds a draft order while a line whose product requires sale approval (`RequiresSaleApproval`, inherited Product -> category chain -> type) has no Approved Price or Scope concession decided under the ConcessionLimit rule. Such a concession is valued at zero when nothing is given away against an engine price, always goes to the ConcessionLimit role whatever the requester's authority, and cannot be decided by its requester. Renewal lines, bundle components and reversals are not held. New exports: `ResolveRequiresSaleApproval`, `SaleApprovalFacts`, `ProductsRequiringSaleApproval`.
- 01f209b: `SubscriptionTerm.Quantity` records how many seats a term covers (#589). Existing terms are backfilled from the order line that bought them, with proration undone and rounded to whole seats.
- 55343b7: Schema for shifting or shortening a booked term (#507). Order Concessions gain two delivery forms, `Shift` (start and end moved by the same number of days) and `Shorten` (a later start or an earlier end), and four date fields, `PriorStartDate`, `PriorEndDate`, `NewStartDate` and `NewEndDate`, recorded only on those forms; `CK_OrderConcession_TermDates` holds the rules for each. Subscription Events gain the `Rescheduled` and `Shortened` event types. `ConcessionDeliveryForm` follows the new forms. The code that records and applies a shift lands separately.
- 920b008: A booked term's start and end can be moved together, at the same price (#507). `Orders.AmendArrangement` takes a `NewStartDate`; the end follows it unless given. It records a Shift `OrderConcession` valued at zero, which goes through under the `TermShiftReviewDays` setting and at or above it waits for the finance acknowledgment role (`AmendmentAcknowledgmentRole`); the requester cannot decide it. A holder of that role can escalate it to the ConcessionLimit tier it meets with `EscalateOrderConcessionID` (or `OrderConcessionEntityServer.EscalateShift`). An approved shift moves the term, the selling line's service period, the subscription's start when it started with the term, access, and the instalments not yet invoiced when the term's line is all the order bills. Recognition offsets every staged entry dated on or after the effective day, re-spreads the term's whole amount from the new start with a full first period, and corrects periods already behind the effective day with one catch-up or reversal dated that day (`PlanTermShift`). A `Rescheduled` subscription event and the re-cut acknowledgment task record it. A shortening, and a shift combined with an extension, are refused. New check bundle `term-shift` (TS1–TS6).

### Patch Changes

- The `@mj-biz-apps/common-*` pins and floors move to 5.53.0, the release with the Organization form's Staff section, so one copy of each common package installs.
- 49a6d65: A Flat-priced line whose price does not divide by the quantity (Flat 100.00 at quantity 3, unit price 33.33) is now worth the flat amount everywhere, not 3 × 33.33 = 99.99 (#579). Pricing stores the rule's figure on the line, `OrderLine.ExtendedAmount`, and the line total, the charge, tax and promotion bases, the journal entry's discount split and the invoice's list amount read it. The invoice no longer prints a one-cent Adjustment or Discount row for such a line, and a draft line saved again or confirmed later keeps 100.00. Changing the quantity or unit price without re-pricing clears the figure, so the line goes back to quantity × unit price. Lines written before the column existed have no figure; the invoice lists one at its net when the gap to quantity × unit price is within rounding (half a cent per unit) and no discount is recorded.
- f3ff9c4: A product that is not `Active`, or an order dated outside the product's `AvailableFrom` / `AvailableTo`, is now refused when the line states its own `UnitPrice`, not only when the engine prices it (#578). The check also reaches lines saved earlier, which reload with a price and used to skip it on every later save. Reversal lines are still exempt, so a retired product can be returned.
- 8525cc2: A card payment that matched no order or invoice can become a paid order. The `Orders.CreateOrderFromProviderPayment` remote operation reads a charge from the payment gateway and, in the payment provider's company, creates and confirms an order with one line of the product the caller names, at the charge's gross amount, billed to the buyer the caller names. It records the gateway intent and captures the charge against the order, so the gateway's fee is booked and the bank deposit that follows, net of that fee, matches. It refuses a charge that has not succeeded, has any refund, has no gateway intent, is in another currency, or belongs to an intent Orders opened. The order confirms through the ordinary path, so a charge below the product's price waits on an approved concession, and an order that would total more than the charge (tax or charges) is refused. One order per charge: a repeat call returns the first order and finishes its capture if that had failed. These orders carry `Origin = 'ProviderPayment'`.
- dfcc809: The charge reconciliation turns a card charge that matched no order into a paid order (#481). On a real run (not Preview), a charge without a payment, on a gateway intent Orders did not open, becomes an order when every gateway price its hosted checkout or payment link sold maps to one product in the provider's price map (`Payment Provider Prices`) and its buyer e-mail finds a person, or carries a name to create one with. The order is created through `Orders.CreateOrderFromProviderPayment`'s path, so the same checks apply. Created orders come back in the output's `OrdersCreated` (and the Action's `OrdersCreated` output) and are not raised; a charge the rules cannot decide is raised as before, with the reason added. A provider with no mapped price is not read and behaves as before.
- 32aa1b2: New table `PaymentProviderPrice` (entity `Payment Provider Prices`): which Orders product a payment gateway's price sells, per payment provider. The charge reconciliation reads it to choose the product of an order created from a card payment that matched no order (#481). A price with no active row creates no order, so an empty table changes nothing.
- 55dd0ca: The Payment Webhook Deliveries list shows its useful columns by default: first and last received time, outcome, reason code, event kind, and the Stripe event, intent and charge ids. Every field had `DefaultInView` off, because CodeGen's AI picks default columns only for an entity it creates, and on a database built from migrations this entity already exists. The flags are set in `metadata/entity-fields/.default-in-view.json` and ship in the release metadata migration.
- 7cc1751: Review fixes. An order created automatically from an unmatched charge books the units the checkout bought, at the charge divided by them; a charge that does not divide into a unit price at the line's four decimals, or a checkout line with a quantity that is not a whole number, is left to finance. Applying an amount change on an order billed as a whole plans against the balance before its own credit memo, so the refund or credit it reports matches the preview (integration check AC11). A return against an instalment-billed order renders a document that asks for the credit memo only, with the part taken off the origin's uninvoiced instalments shown on its own row. A reconciliation run that creates an order for a charge clears the exception an earlier run raised for it. HubSpot payments, which are recorded Unmatched until their deal can be read, no longer fail the poll run on their own. The generated spawn-renewals output type carries the renewal promotion codes.
- 21f2d6e: Pricing filters escape charge codes, promotion codes and fee types with `EscapeSQLString` from `@memberjunction/global`, and refuse price list, category, product and row IDs that are not UUIDs. The UUID guards now live in `orders-entities` and are re-exported from the server package's `sql-guards`, which also re-exports MJ's `EscapeSQLString` in place of its local copy.
- 6f50258: Promotion redemption limits count orders instead of adjustment rows, and a code a limit stops is reported (#561).

  - An order-level promotion writes one adjustment row per line its amount is allocated to, and a line-level one a row per line it discounts. Both counts (the promotion's limit and the per-customer limit) now count each order once, so a two-line order no longer spends two uses.
  - A code stopped by its promotion's limit, or by the customer's share of it, is listed in `UnusablePromotionCodes` with the reason, once per code, instead of giving no discount and no reason.
  - A promotion code's own `MaxRedemptions` is enforced, counted in orders, and reported the same way. It was read but never checked.
  - A promotion that is not running is now reported against the code that named it; with several codes it could be reported against the first one typed.

- 37f31ea: A typed promotion code that applied nowhere is reported in `UnusablePromotionCodes` with the reason, whatever stopped it (#686). Only redemption limits were reported before.

  - Below the promotion's minimum order amount or minimum quantity.
  - Beaten by a better promotion, or blocked by the company's no-stacking policy. The reason names the promotion that applied instead.
  - Aimed at nothing on the order (its targets match no line).
  - A code that missed on one line and applied on another is not reported. Promotions nobody typed are never reported.

- e43db9f: `Orders.SpawnRenewals` carries promotions flagged `AppliesToRenewals` into automatic renewals. It reads the codes recorded on the line that bought the expiring term, presents the flagged ones on the renewal order, and lets the pricing engine decide whether each still applies. Each candidate reports `RenewalPromotionCodes` (carried) and `UnusableRenewalPromotionCodes` (with the reason); the order notes and the `RenewalOrderSpawned` event record the same. A code that no longer applies leaves the renewal at the undiscounted price. Preview runs the same engine without saving.
- a20dbf0: A finance reviewer can turn a charge-without-payment finance exception into a paid order without leaving the app. On accounting's Finance Exception form, an open `PROVIDER_CHARGE_MISMATCH` exception for a gateway charge Orders holds nothing for shows a panel that asks for the product, the buyer and an optional organization. It calls the new `Orders.ResolveChargeException` remote operation, which reads the payment provider and charge from the exception, books the order through `Orders.CreateOrderFromProviderPayment`, then clears the exception as Corrected with a note naming the order and payment. The caller must hold the authorization to clear finance exceptions; that is checked before anything is booked. Other kinds of mismatch, and charges Orders opened itself, are refused and the panel does not show on them. If the clear fails after the order is booked, running it again clears the exception without booking a second order.
- 500e533: The nine training pipelines in `metadata/ml-training-pipelines` are retired with `deleteRecord`. Each selects feature and target columns that no shipped schema has, and no release seed carried them. The developer scripts that trained and scored the LTV models from them, and wrote their output back into `metadata/`, are removed. `scripts/check-release-seed-coverage.mjs` now passes.
- 44a267d: A save that replaces the bill-to or ship-to person, from any writer, now clears that side's organization when it is the previous person's employer, so the new person's employer is stamped instead (#542). This is the rule the order form already applied. The organization stays when the same save sets it, when the person is only cleared, or when the writer calls `OrderHeaderEntity.KeepPartyOrganization`; the form's undo of its cleared-employer notice keeps it the same way, through a new `KeptPartyOrganizations` companion.
- 72f235c: An order created by a writer other than the order form (an API call, a GraphQL create, a workflow) now gets the bill-to person copied into an empty ship-to and the person's employer stamped, as the server save's party defaults intend (#657). MemberJunction records the first value set on a new record's field as its old value, so the person field did not count as changed and the defaults were skipped.
- 0ab95c6: A stated tax charge is recognised by its charge type's `Category = 'Tax'` instead of by its code containing "tax" (#562). A stated `VAT` now replaces the tax resolved from the ship-to address, as a stated `SalesTax` does, instead of being charged on top of it. A non-tax charge whose code contains "tax" no longer turns tax resolution off. The tax-type lookup is one exported helper, `ReadTaxChargeTypes`, shared by the walk, `ReadStatedTaxCharges` and `DeleteTaxCharges`.
- 3f8c3a0: A change to a term's dates is split by kind instead of measured as one number (#307, #507). `SplitTermDateChange` replaces `TermDateChangeDays` and returns the shift (start and end moving together), the days added and the days removed. `MaxTermExtensionDays` again limits days added only, as its column description says: a shift is a term change, not a sales concession, and a shortening is an early termination that is always an exception. `AssessConcession` takes the days added; `ConcessionTierMeasure.TermDateChangeDays` becomes `TermLengthChangeDays`, the days added or removed, so a shift meets no tier's day threshold. New pure rules for the amendment path: `RouteTermShortening` (the ConcessionLimit tier whose thresholds a shortening meets, else finance review; the threshold-free floor tier does not count) and `ShiftNeedsFinanceReview`. A new Orders setting, `TermShiftReviewDays`, is the day count at or above which a shift goes to finance review; empty, the shipped value, reviews every shift. A Duration concession is always a pure extension, so its checks and routing are unchanged.

## 5.32.1

## 5.32.0

## 5.31.0

### Minor Changes

- 1f5d3f6: `Orders.CapturePayment` now returns each order effect's `PaymentStatus` (`Unpaid`, `PartiallyPaid` or `Paid`), derived from the order's totals. It was read from a column the order no longer has, so it was always missing. The invoice builder no longer carries the same dead field.
- f8b53d9: Guard triggers report their own rule again when a write goes through MemberJunction. The order, payment, payment schedule, progress measurement and access override guards refused a write with `ROLLBACK TRANSACTION` before `THROW`; under the `INSERT ... EXEC` that every MemberJunction save and tracked delete uses, SQL Server rejects that `ROLLBACK` with error 3915, so the caller saw "Cannot use the ROLLBACK statement within an INSERT-EXEC statement" instead of the rule. A new migration recreates the eight triggers with `THROW` alone, which still rolls the whole transaction back.
- e98b880: The 5.31 Metadata_Sync ships what metadata/ changed since the 5.29 seed, since 5.30 shipped without one: payment reconciliation (the Orders.ReconcilePaymentProviderCharges operation, the Reconcile Payment Provider Charges and Check Payment Webhook Endpoints actions, and their daily and hourly jobs, created Disabled), the AccessOverrideFallbackApproverRole setting, Account Director and Finance on the access-override authorization, the Payment Webhook Deliveries "Not Applied" view, form sections on 287 fields, the Party Order Lifetime and Party Orders Overview SQL, and the updated Capture Payment, Check Entitlement, List Entitlements and Amend Arrangement contracts. It has a Postgres counterpart. The seed is idempotent and safe on a host that already ran `mj sync push`. The ML training pipelines under metadata/ are not included.
- 50de8dc: The guard-trigger migration `V202610091200` gains its Postgres counterpart. The eight guards (order header and line, payment header, line and detail, payment schedule, progress measurement and access override) refuse the same writes on Postgres with the same messages, as statement-level triggers that raise an exception; the T-SQL error number is in the exception's DETAIL.

### Patch Changes

- 8f105ee: `Orders.PollExternalPayments` follows the scheduled poll job's state on every run that would write, whoever calls it (#583): with no job installed or the job not Active it refuses and records nothing; with the job in Preview it runs as a preview and says so; only an Active job out of Preview records cash. The rule moved from the Bill.com webhook into `orders-entities` (`ClassifyPollJob`, `ClassifyPollJobs`, `LoadPollJobState`), and the webhook reads it from there. On the External Invoicing queue page, "Check for payments now" is disabled while the job is off, runs as a labelled preview while the job previews, and asks for confirmation before a live run.
- 1ea0ecf: The peer ranges for `@mj-biz-apps/common-entities` and `@mj-biz-apps/common-ng` start at 5.52.0 instead of 5.49.0. `@mj-biz-apps/common-server` 5.52.0, which accounting's server package needs, pins `common-entities` 5.52.0 exactly, so a host that resolved orders' floor got a second copy of the common entity classes. With the floor at 5.52.0 the workspace resolves one copy.
- 52e3762: Days now display and compare correctly in every browser zone (golive #168).

  - **Date columns** (`date` in SQL: order, due, payment, term and price-list dates) read as their own day. A payment dated Oct 1 showed "Sep 30" in its own header, and in the subscription, term, price list, product and pricing-widget forms and the party orders overview, for anyone west of UTC. `FormatDate` and `DaysSince` read a `Date` by its UTC day and a string by its leading `YYYY-MM-DD`.
  - **Timestamps** (`datetimeoffset`: an event's start and end, a promotion's schedule, entitlement validity, subscription and stored-value events, an external invoice's sent date) display as the business-zone day they fell on, through the new `FormatInstantDate`, `FormatShortInstantDate` and `FormatInstantWindow`. Nothing infers which kind a value is from its time of day. A promotion starting at 7:00 PM Central now reads Oct 1, not Oct 2.
  - The orders dashboard's "days past due", the pricing page's list windows, and the customer AR, charges and tax, and subscriptions page dates no longer read "0 days" or "—" when a cell is a `Date`.
  - The party orders overview files orders by the month their date names and ends its six-month window at the business month. Its query and the party lifetime query count from the business day instead of the UTC clock.
  - "Today" comes from the business calendar instead of the UTC day, which is already tomorrow for the whole American evening. This covers the orders dashboard, overdue, customer AR, order document, product and party stats, a new or retired product GL link, revenue-recognition release on the subscriptions page, and `ResolveActiveEmployerOrganization`'s default as-of day.

- bcdb1dc: `mj-app.json` now lists `@mj-biz-apps/orders-actions` under `server` instead of `shared`. They use server-only code (Node built-ins, or MemberJunction's actions, AI engine, storage or server packages), and `shared` installs a package into MJExplorer too. The Open App client bootstrap imports every `shared` package, so Explorer's browser build failed on a host with this app installed (`Could not resolve "node:crypto"`, `"node:net"`, `"stream"`). The server still loads them exactly as before.
- 0feb8d2: The payment poll gate is per provider (#608). A scheduled poll job that sets `PaymentProviderID` governs only that provider; jobs that set none govern every provider without a job of its own. `Orders.PollExternalPayments` gates each provider in the run separately: a provider whose job is off is skipped, one in Preview runs as a preview, and the run fails only when every provider was skipped. The Bill.com webhook checks the notified provider's jobs. Adds `ClassifyPollJobsFor`, `ClassifyPollJobGroups`, `PollJobProviderID` and `LoadPollJobs` to `orders-entities`; `LoadPollJobState` takes an optional provider ID.
- d462e77: `ResolvePrice` now invokes the `BasePriceResolver` named by `PricingDriverClass` (product, category chain, product type, company policy; most specific first, through the same `ResolvePricingDriver` walk the browser uses) before the `Product:`/`Category:`/`Company:` ID keys. A named key with no registered resolver, or a driver lookup that cannot be read, refuses the line with a `PriceResolutionError`. The final fallback now picks the no-key registration explicitly, so a keyed plugin can no longer stand in as the default for products it was not named for.
- cb861ae: The three scoring record processes in `metadata/record-processes` are retired with `deleteRecord`. Each scored with one of the ML models already retired, and no release seed carried them. `scripts/check-release-seed-coverage.mjs` no longer counts a retired record that no migration ever created, since no host has it.
- 06ee0ac: Both built-in checkout clients now complete Cloudflare Turnstile, so a widget can set `requireTurnstile` (#592). Before, neither `<mj-orders-checkout>` nor the fallback page sent a token, and every initialize and complete answered 403. The edge's 403 now names the site key (new `TurnstileSiteKey` edge setting, paired with `TurnstileSecretEnvVar`); the clients render the challenge, retry once, and get a fresh token for each later initialize or complete. The checkout page's CSP allows `https://challenges.cloudflare.com`. An edge that requires Turnstile without a site key fails closed with a 503.

## 5.30.0

### Minor Changes

- 7fe01d1: `Orders.CheckEntitlement` and `Orders.ListEntitlements` say why access is held and when a past-due renewal loses it (#269). A `Suspended` answer now carries `SuspensionReason`: `AwaitingPayment` (a new purchase waiting for its first payment), `PastDue` (a renewal past the cutoff) or `AwaitingActivation`, or null for a suspension with no recorded reason. While a renewal is past due but still has access, `AccessCutoffDate` is the last day it keeps it, the overdue worklist's `GraceThroughDate`, or an approved cutoff deferral's last day when later. `Decision` is unchanged, so callers matching `Suspended` keep working.
- de9be4d: `orders-entities` exports the "customer already holds this product" lookup behind a subscription line's extend-or-new question: `FindExistingHolding`, `HoldingSubscriberFor` and `FindUnansweredHeldLines`. It uses `RunView` only, so another app's server can refuse a confirm or a close while a line for a held product has no `SubscriptionAction`, using the same rule the order screen asks with. A failed read throws instead of reporting no holding. `orders-ng`'s `GetExistingHolding` and the order line editor now call it.
- d8efa9f: Another app can now refuse an order's confirm, through a seam beside the one that refuses a line edit.

  Confirming is where an order stops being a proposal: journal entries are written, a subscription may be created, recognition follows. Orders enforces its own rules — a legal status, a bill-to party, at least one line, a service period where one is needed — but it cannot know that an app upstream has a reason to say "not yet".

  The case this exists for (bc-aidp-next-golive#323): Sales closes a deal Won, which mints the order; the deal is then reopened to Open; the order is confirmed from the order screen and books anyway, leaving an Open deal sitting on a booked order. Sales already refuses the reverse.

  Nothing registers into this on the day it ships, and it cannot: Sales resolves this package from the registry and cannot call a function that has not been published. `HostOrderConfirmVeto()` returns null until something registers, the check returns early, and no host behaves differently.

- 330c0e5: Migration `V202610081700` adds `PaymentWebhookDelivery`: one row per verified payment-gateway webhook event, with what Orders did with it (`Outcome`: Applied, AlreadyApplied, Ignored, Rejected, Failed), a `ReasonCode`, the intent and charge ids, and when it happened and arrived. Unique per provider and gateway event id. The entity class, GraphQL type and generated form carry it.

### Patch Changes

- 557b6b3: The order form's access overrides panel offers Approve and Reject only to an assignee of the approval task who is not the requester, and Approve only on or before the override's last day (bizapps-orders#517). Everyone else sees whom the request is waiting on. The decision rule (`AccessOverrideDecisionRefusal`) and the assignee read (`LoadAccessOverrideAssignees`) move to `@mj-biz-apps/orders-entities` so the browser and the server share them.
- 573ff96: `Orders.AmendArrangement`'s generated input and output types now match the operation: `OrderHeaderID` and `NewPaymentTermsTypeID` for a change of payment terms, `SubscriptionTermID` and `NewEndDate` optional, and the payment-terms fields of the output. The input interface is declared once, and the server operation uses the generated types.
- 9647922: On a saved order, clearing or replacing the bill-to or ship-to person also clears an organization that is that person's employer (#356). Which organization a default filled in is remembered only while the order is open, so on a reopened order the previous person's employer stayed as the payer. The order form says what it removed and offers Undo, for an order that should keep billing that organization. `ClearPersonParty` is now async and returns the organizations it cleared this way; `RestorePartyOrganizations` puts them back.
- 0db962e: MemberJunction and other BizApps packages are peer dependencies with caret ranges (`^6.1.5` for
  MemberJunction, `^5.49.0` for common, `>=0.21.0` for accounting; no `~`, nothing in
  `dependencies`), so a 6.2 host keeps one copy of each instead of installing a second tree. MemberJunction
  devDependencies and the root `pnpm.overrides` use the same `^6.1.5` floor. Adds `check-dependency-model` to CI.
- 0c4815c: Confirming a saved draft that carries a promotion code records the promotion once. The code rides the order, so the confirm re-decides it, and it used to write a second set of adjustment rows beside the draft's. A save that re-decides a saved order's promotions now removes the earlier promotion rows for those lines first and keeps each line's manual discount. A requested manual discount is consumed by the save that applies it, so saving the same order object again no longer grants it twice, and a single-use code a draft already took is no longer counted against the same order at confirm.
- 036923f: A tax rate, amount or override stated on a draft is kept when the draft is confirmed. The request lived only in memory, so a confirm from a reloaded draft resolved tax from the ship-to address and replaced the stated rows. The walk now reads a saved order's stated tax charges back as requests, and a restated override keeps its reason and the user who made it. A re-price also removes the order's zero-amount tax rows, which have no allocation to reach them by. Requested charges are consumed once the save commits, so confirming the same order object no longer writes them a second time.
- 5d531bf: Confirming a saved draft with taxed lines books balanced entries. Each pricing save re-resolves tax, and the confirm used to add its tax charge rows beside the draft's, so booking credited the tax twice and refused the entry as unbalanced. A save of an unbooked order now removes the earlier tax rows for the lines it re-priced before writing the new ones, and a line re-priced to no tax has its `LineTax` cleared.
- ba20d3e: The `OrderConfirmed` outbound event carries the buyer's checkout answers as `CheckoutAnswers[]` (`QuestionKey`, `QuestionLabel`, `Answer`, `OtherText`), empty when the checkout asked nothing (#322). Confirming an order now writes the answers attached to it: the booking save skipped the order's related collections so it could price the lines first, and that skip also left the answers unwritten. The "Other" text of a select question is capped at the question's own `maxLength`, as the answer is.
- a1810fd: Changing the Receiving Company or the tender on a saved draft payment that already has instrument details (a reference number, card or bank fields) no longer fails with "Cannot use the ROLLBACK statement within an INSERT-EXEC statement". A saved payment detail is a snapshot the database refuses to edit; the payment now gets a new detail carrying the same instrument fields with the corrected company and tender, and the saved detail is left unchanged.
- f22d329: The three ML models shipped in `metadata/ml-models` and their scoring bindings are retired with `deleteRecord`. They were trained on sample data and had no artifact file on any install. The training pipelines still ship; an install trains its own model from one. `scripts/rebuild-db.sh` now pushes the whole `metadata/` folder.
- d0c3fa6: Two checks of Orders against the payment gateway. A webhook endpoint drift check finds each live provider's endpoint at the gateway (the one whose URL ends in the provider's id) and reports one that is missing, disabled, or does not send every event kind the driver handles; it runs once at server start and as the `Orders.CheckPaymentWebhookEndpoints` Action, and drift is logged as an error and fails the run. A charge reconciliation, the `Orders.ReconcilePaymentProviderCharges` remote operation and Action, matches the gateway's charges and refunds for a window of business days to Orders' intents and captured payments and reports a charge with no payment, a payment with no charge, and a refunded charge whose payment carries fewer refunds; with `Preview` false each is raised as a `PROVIDER_CHARGE_MISMATCH` finance exception. It corrects nothing. Both scheduled jobs ship disabled, the reconciliation in preview. New driver calls: `ListCharges`, `RetrieveCharge`, `ListWebhookEndpoints`, `ListsCharges`. A restricted gateway key needs read access to webhook endpoints, charges and refunds.

## 5.29.0

### Minor Changes

- 9d0e76d: The 5.29 Metadata_Sync ships what metadata/ changed since 5.28: the API scopes orders:read, orders:write, orders:payments:refund, orders:payments:write and orders:subscriptions:write, an MJAPI application scope (`*`, Include) for each, and the `orders:`-prefixed RequiredScope on Refund Payment, Apply Account Credit, Cancel Subscription, Spawn Renewals, Amend Arrangement and Detect Overlapping Subscriptions. The seed is idempotent and safe on a host that already ran `mj sync push`. The ML bench output under metadata/ is not included.

### Patch Changes

- 41efacb: Thirteen Orders operation classes now extend their generated base and so carry its `RequiredScope`: Advance Order State, Amend Arrangement, Apply Account Credit, Cancel Subscription, Check Entitlement, Detect Overlapping Subscriptions, List Entitlements, Preview Price, Price Order, Record Access Override Decision, Refund Payment, Request Access Override and Spawn Renewals. Before this, MJAPI skipped the API-key scope check for them and any valid key could call them. The generated base for Amend Arrangement now carries `orders:subscriptions:write`, the scope its metadata declares. Cancel Subscription's `Decision` dates are typed as ISO strings, the form they already took on the wire.
- 2cec5c3: Orders now ships an API scope for every remote operation that declares one. New scopes under `orders`: `orders:read`, `orders:write`, `orders:payments:refund`, `orders:payments:write` and `orders:subscriptions:write`, each allowed at the MJAPI application ceiling (`*`, Include). The payment and subscription operations' `RequiredScope` moves from `payments:refund`, `payments:write` and `subscriptions:write` to the `orders:` names; those old scopes were never created, so no API key could carry them. Before this, API-key calls to these operations were refused on every host. The rows are in `metadata/` and reach hosts through the release's metadata sync migration.

## 5.28.0

### Minor Changes

- c5ea664: The 5.28 Metadata_Sync ships what metadata/ changed since 5.27: the Orders.CheckCoverageOverlap remote operation, the Spawn Renewals output contract, the Overlapping Subscriptions query (SQL, description and its new LaterOverlapAcknowledged field), the Subscription and Project / Implementation product types' default entitlement grant timing, and the renewal-pricing field categories. The seed is idempotent and safe on a host that already ran `mj sync push`. The ML bench output under metadata/ is not included.
- d9d9413: Migration `V202610060656` adds `RenewalIncreasePercent` to `OrderCompanyPolicy`, `ProductCategory`, `Product` and `Subscription`, and `Subscription.CarryDiscountOnRenewal` (default off), the inputs the renewal pass uses to reprice a renewal. Includes its CodeGen output: entity fields, the Event Products IS-A field, the affected views and CRUD procs, and the generated entity, GraphQL and form fields.
- d3b9c7d: The renewal pass reprices each renewal instead of copying the prior line: a first-term discount lapses unless the subscription carries it, a price typed below list lapses to the prior list price, a product with an Active successor renews as the successor at its list price, and an annual increase (subscription, product, category chain, then company) applies when the new term crosses an anniversary of the subscription's start. Every candidate, preview included, reports its base price, increase and final price; the order notes and renewal event record them. A line the pass priced is exempt from the concession gate while its price is unchanged. New field categories place the renewal inputs with each entity's renewal and default settings.
- 93213ea: A different band of the same subscription offering no longer books a second, overlapping subscription without anyone noticing (golive #276).

  Confirm found an existing subscription by product, so a holder with coverage under one band who ordered another band got a new subscription for the same dates, billed and recognized alongside the first.

  - A product joins a subscription family (the `SubscriptionFamily` table, one per selling company) through `Product.SubscriptionFamilyID`, picked on the product form's Subscription section. A product can only join a family of its own company, and not a family marked inactive; a family's company cannot change once saved.
  - At confirm, a subscription line whose term overlaps the holder's coverage under another band of its family, within the product's company, follows the stricter `ConcurrencyMode` of the two bands' types (`RejectDuplicate`, then `ExtendExisting`, then `AllowMultiple`): `AllowMultiple` proceeds, `RejectDuplicate` refuses, and `ExtendExisting` refuses unless the line sets `OrderLine.AcknowledgesCoverageOverlap`. The refusal names the family, the subscription and the overlapping dates, and says to start the band after the existing coverage ends or to mark the line to run alongside it. Two bands on one order are checked against each other.
  - A cancelled subscription still counts until its coverage ends: its terms that are not Canceled or Lapsed count in full, and a Canceled term counts through `Subscription.EndDate`.
  - `Orders.CheckCoverageOverlap` (new, read-only): runs the same check over a saved draft. The order lines editor calls it after each save and shows the result on the line, with the acknowledgment checkbox ("Run alongside the existing coverage. Both will be billed.") where it applies.

  Products with no family behave as before.

  An organization-held subscription bought with a contact person is now found again at confirm (#317). The subscription stores that person, and the lookup required it to be empty, so a re-order of the same product booked a second subscription without `ConcurrencyMode` running. Under `Organization`, and under `Holder` when no person was resolved, the lookup now matches the organization whatever person is stored. Under `Holder` when a person was resolved, and for seats under `Individual`, it matches the exact organization and person, so a coworker's purchase at the same organization does not extend another person's subscription. Under `Holder`, when the organization was stated on the line or the order rather than inferred from the person's employer, the lookup also matches that organization's subscription stored with no person, so a re-order naming a contact extends a subscription first bought with none. The same rule applies to the family check above. Among several matches, an Active or Trialing subscription is chosen first, then a Paused one, then a Canceled one, and among equals the one stored for the ordered person, then the newest.

  A product created on the server takes its product type's defaults again (golive #277). The server's product class extended the generated class instead of `ProductEntity`, and replaced it, so a product saved there with only a type failed for lack of a revenue recognition type and left the subscription type and taxability empty.

- 6777eb5: Migration `V202610060655` adds `SubscriptionFamily`: the products that are bands of one subscription offering, owned by one selling company, with `Code` unique within that company (golive #276). `Product.SubscriptionFamilyID` (nullable) puts a product in a family, and `OrderLine.AcknowledgesCoverageOverlap` (default false) marks a line meant to run alongside coverage the holder already has in the same family. The entity classes, GraphQL types and generated forms carry the new entity and both columns.

### Patch Changes

- a2dc752: Build and run on MemberJunction's 6.1 LTS line (`~6.1.5`), the version AIDP Next runs, with one copy of each MJ package. Generated code is regenerated by MJ 6.1.5 CodeGen from a database built from migrations: Order Lines load over GraphQL again (`OrderHeader` has its `@Field`), every entity reports field-level security, and every non-trivial CHECK constraint has a matching `Validate*()` method.

## 5.27.0

### Minor Changes

- 148b74c: The 5.27 Metadata_Sync brings the Generate Invoice action's description and its CompanyID, HTML and DocumentCount parameter descriptions up to date on hosts: an order produces one document, from the order's company, and naming any other company is refused with NOT_ORDER_COMPANY. The seed is idempotent and safe on a host that already ran `mj sync push`. The ML bench output under metadata/ is not included.
- d1cfdcf: Migration: payment schedule rows move to the order's company. On an order with no issued instalment and no payment line or external invoice naming one of its rows, the Scheduled rows that share a due date become one row for the order's company, for their combined amount, numbered after any cancelled row that company already holds. Orders with an issued instalment keep their rows and finish on them. The ledger is untouched; the schedule rollup recalculates AmountPaid and Balance.

### Patch Changes

- b9900b7: An order line for a product written outside the API process after it started (a catalog loader, raw SQL, another replica) no longer fails with "CompanyID: Company cannot be null". `OrdersEngine.EnsureProducts` / `RequireProduct` reload the product catalog once on a cache miss; the company stamp, subscription term and service period, journal-entry and progress recognition lookups use them, and fail naming the product when it is still missing.

## 5.26.0

### Minor Changes

- 8dd30b8: Migration `V202610032230` adds `OrderLine.SubscriptionAction` (`ExtendExisting` | `CreateNew` | NULL), the line's answer to what confirm should do when the subscriber already holds an active subscription to the product, with its CodeGen output: entity field and value list, the Event Order Lines IS-A field, the Order Line and Event Order Line views and CRUD procs, and the generated entity, GraphQL and form fields.
- 25b0dd1: The 5.26 Metadata_Sync brings three remote-operation contracts on hosts up to date: Orders.CancelSubscription's output type, Orders.CheckEntitlement's description and input type (an email resolves to one Person by the checkout's rule), and Orders.RecordProgress's description and output type (the date warnings). The seed is idempotent and safe on a host that already ran `mj sync push`. The ML bench output under metadata/ is not included.
- d1fd2e0: Progress attestation warns on the date entered instead of on posted batches (bc-aidp-next-golive#316). `Orders.RecordProgress` no longer returns `ClosedPeriodWarning`: a Posted journal-entry batch in the month said nothing about whether finance had closed it once batches are built daily, so every past month warned. It now returns an advisory `BackDatedWarning` when `MeasurementDate` is two or more months before the current business month, and `FutureDateWarning` now fires for any date after today rather than after the current month's end. The prior month and earlier in the current month do not warn. Both are advisory on preview and post, supersede included. The supersede's reversal and catch-up dating is unchanged. The attestation screen shows the new warning in the preview, the confirm dialog and the notice after posting.
- aab09c1: Migration `V202610032200` makes `trg_OrderLineProgressMeasurement_Immutable` skip the nested UPDATE issued by the `__mj_UpdatedAt` trigger. When that trigger fired first, promoting a Draft progress observation to Posted raised 51030 (posted rows are immutable) instead of 51031 (Draft cannot be promoted). It now raises 51031 whichever trigger fires first.

### Patch Changes

- bf3ed93: `Orders.CancelSubscription` now cancels the subscription's later terms too (#406). A term that starts after coverage ends, such as a renewal booked ahead, is stamped Canceled and reversed in full on the same reversal order, whatever the type's refund mode; the policy is `SubscriptionBehavior.DecideLaterTermCancellation` and can be overridden. The output, preview included, gains `LaterTerms` and `TotalRefundAmount`, and the lifecycle event records the later terms. A request that falls before every term now acts on the next term to start rather than the latest. A whole term sold on an instalment-billed order, which every automatic renewal is, is reversed as an order-line return is: booking credits what was invoiced and withdraws the instalments not yet invoiced. Only part of a term on such an order still refuses the cancel. The reversal order points at the order that sold the first reversed term, so it takes that order's addresses.
- 8df4d53: Confirm now says when it moves a subscription line's service dates. A line for a product the subscriber already holds extends that subscription and starts the day after current coverage ends; the stated start used to disappear with only a server log line. The confirm records the stated and settled dates on the subscription's `Extended` event, `OrderHeaderEntity.Confirm()` reloads the lines and returns the moved lines, `OrderHeaderEntity.LoadDisplacedTermStarts()` reads them back for a booked order, and the order form shows a notice after Confirm and whenever the order is opened.

## 5.25.0

### Minor Changes

- 00f6713: The 5.25 Metadata_Sync ships the metadata 5.22 through 5.24 added without a migration, so hosts get it and not only a developer's own database. It covers four remote operations (Detect Overlapping Subscriptions, Replay Checkout Step, Detect Unattested Progress, Amend Arrangement), the Dispatch Outbound Events, Detect Overlapping Subscriptions and Detect Unattested Progress actions with their scheduled jobs (outbound dispatch every minute and Active; the two detectors daily and Disabled), the Overlapping Subscriptions query, the Checkout Replay and Progress Supersede authorizations with the Checkout Operator and Orders Revenue Supervisor roles, the AmendmentAcknowledgmentRole setting and the Checkouts: Needs Review view. It also updates the Record Progress and Get Progress Worklist operation contracts, the concession-limit fields' category and the Choices related-record collection. The seed is idempotent and safe on a host that already ran `mj sync push`. The ML bench output under metadata/ is not included.

## 5.24.0

### Minor Changes

- 36b3869: The anonymous checkout now keeps the buyer's card when the order sells an auto-renewing subscription, so the renewal can be charged later. Before paying — when the order does not exist yet, so the decision is made from the products in the priced draft — it reuses or creates the buyer's gateway customer (found through their own wallet, never by e-mail; a first-time buyer with no person record yet gets a customer opened for the checkout session, and the card is filed under the person completion creates) and asks the gateway to keep the card (`setup_future_usage: off_session` on Stripe); after the capture books, it files the card in the buyer's wallet (`PaymentDetail` + `CustomerPaymentMethod`) and sets it as each new subscription's renewal card (new `Subscription.DefaultCustomerPaymentMethodID`). Keeping the card is fail-soft: a failure is logged and never blocks or reverses the sale.

  A widget can require an automatic-renewal agreement (`autoRenewConsentText`): the widget shows a required checkbox, the server refuses to open a payment intent without it, and the checkout session records the widget's own wording and the time (new `CheckoutSession.AutoRenewConsentAt` / `AutoRenewConsentText`).

  New on the payment driver seam: `BasePaymentProvider.EnsureCustomer` (with `CheckoutSessionID` as an owner for a buyer with no person yet), `CreateIntentRequest.SaveInstrumentForReuse`, and `RetrieveIntentResult.Instrument` (the paid card's token and display fields). Charging the kept card at renewal is not in this release.

- 4f68e25: Public checkout can apply a verified-member discount. A host sets `member-token` on `<mj-orders-checkout>`; `/draft` passes it to the `BaseCheckoutMemberDiscountResolver` the widget names in `Configuration.memberDiscountResolver`, which returns a promotion code priced through the promotion engine. The session keeps the code, never the token, and `/complete` re-prices and books with it. A rejected token prices at the standard rate with a message; a token sent to a widget that cannot verify one is refused. The checkout total now includes line discounts, which it previously omitted. It also now includes tax and charges, so a taxable product sold through the public checkout charges tax at checkout; before, the charge left tax out while the order still booked it. If a settled payment no longer covers the re-priced total at `/complete` (for example, the member promotion ended after the draft), no order is booked, the buyer gets a plain message, and a checkout alert is raised so staff can refund.
- 297fe94: A posted progress observation can be superseded, so a mistyped date no longer freezes the line (bc-aidp-next-golive#260). `Orders.RecordProgress` takes an optional `SupersedesMeasurementID` naming the line's latest observation; for a user holding the new `MJ.BizApps.Orders.Progress.Supersede` authorization (shipped with an `Orders Revenue Supervisor` role, assigned alongside Engagement Lead because a supersede is itself an attestation and still needs `MJ.BizApps.Orders.Progress.Attest`), it reverses that observation's recognition on the observation's own date — or, when that month already has a Posted batch for the line's company, on day 1 of the first later month without one (returned as `ReversalDate`; a failed batch read refuses the supersede) — then posts the new observation's catch-up from the restored total, booked no earlier than that reversal date so nothing new posts into the closed month (returned as `CatchUpDate`; the observation keeps the date the supervisor chose) — all in one transaction, with no row edited. `OrderLineProgressMeasurement` gains `SupersedesMeasurementID` (at most one row per observation, by filtered unique index) and `ReversalJournalEntryID`; a superseded row stays Posted and immutable and stops counting as the line's last observation, in the ordering guard and on the worklist. `UQ_OLPM_Period` becomes a unique index filtered to observations that replace nothing, so a replacement may carry the replaced observation's date and a wrong percent is corrected on the day it was attested. A measurement date after the current business month's end now returns an advisory `FutureDateWarning` on preview and post; forward dating is still allowed. The attestation screen offers "Supersede last" to users with the grant and shows the new warning in the preview and the confirm dialog; the same users get "Show 100%", since the worklist omits completed lines and a mistyped 100% must stay reachable.

### Patch Changes

- 5939a65: The public checkout's success screen says whether the buyer's access is ready. `POST /checkout/access-status` reduces the order's outbound deliveries from consumers that declare `GatesAccess` to `Ready`, `Pending`, `Failed` or `NotTracked`; the success screen polls it for up to a minute, in a rate-limit window of its own so polling cannot use up the buyer's allowance for the password step, shows copy the widget can override in `accessMessages`, dispatches `checkout-access-state`, and follows `redirectUrl` once the state settles. With no gating consumer nothing changes.
- fee2c37: Self-serve checkout collects the buyer's billing location and refuses payment without it, and payment
  intents refuse any currency but USD.

  - The checkout widget asks for billing country, state or province (US, CA and AU) and postal code, from
    ISO 3166 lists. `CheckBillingLocation` and the lists are exported from `orders-entities`.
  - `CheckoutSessionService.UpdateDraft` takes the location as a new argument before `contextUser`,
    prices tax from it, and returns the tax in `Tax`. A draft, payment intent or completion without a
    valid location is refused.
  - `CompleteCheckout` records the location as a Common `Address`, links it to the buyer as their Billing
    address, and sets it as the order's bill-to and ship-to address.
  - `OpenPaymentIntent` refuses a currency other than USD (`SUPPORTED_PAYMENT_CURRENCY`), since orders do
    not record a currency. A widget with no configured currency opens in USD.
  - `OrderPricingContext.ShipToAddress` lets a caller price tax for a location that has no Address row yet.

- 7126955: After a confirmed checkout, the redirect to `redirectUrl` carries the order number as `?order=<number>` (both the Angular element and the fallback host page), so the landing page knows which order completed. A widget can set `sendReceipt: true` to have the payment gateway e-mail its own receipt to the buyer: the intent carries a new `ReceiptEmail` (Stripe `receipt_email`). The e-mail is hashed into the intent's idempotency key, so a buyer who changes their e-mail can still reopen payment.
- 3b94fb5: The anonymous checkout takes a promotion code when the widget sets `allowCoupons: true`. The widget shows a promo-code field with Apply; `/draft` accepts `promotionCodes` (at most one, trimmed, up to 60 characters; refused when the widget doesn't take codes), prices it through the promotion engine and returns `AppliedPromotionCodes`, `UnusablePromotionCodes` (with the engine's reason) and `Discount`. An unusable code is priced without and not kept. The applied code rides the session snapshot, so `/complete` prices and books the order with the same code — the engine writes the adjustment and counts the redemption, and the total still equals the amount paid. If the server's total differs from what the buyer was shown, the first Pay press stops and shows the new total. Promotions on renewal orders are not in this release.
- 266995a: The order header Total now includes tax and charges when lines are priced in the browser (#405). Both pricing paths read a priced line back through one shared helper, `ReadPricedLineAmounts`, so the local path's gross is net plus charges plus tax, matching `Orders.PriceOrder`.
- 59efbe7: `mj sync push --dir metadata` now succeeds on a fresh database.

  - `metadata/.mj-sync.json` lists every metadata folder in `directoryOrder`, ending with `record-processes`, `ml-training-pipelines`, `ml-models` and `ml-model-scoring-bindings`. Folders left out of the list are pushed afterwards in alphabetical order, so `ml-model-scoring-bindings` was pushed before the model and record process it references and the push rolled back on `FK_MLModelScoringBinding_MLModel`.
  - The shipped ML models no longer carry `ArtifactFileID`. It pointed at a `__mj.File` row nothing ships, so the push failed on `FK_MLModel_ArtifactFile`. The trained artifact's bytes live on the machine that trained it (MemberJunction/MJ#4991), so these models score only after they are trained on the host; until then each scheduled scoring run fails with `has no ArtifactFileID` (MemberJunction/MJ#4829).

- 71ad081: A return refunds the tax its sale collected, in the jurisdictions that collected it.

  A reversal line's tax is no longer resolved from the return's own ship-to address and date. It is
  the origin line's tax charges, per jurisdiction, scaled by the quantity returned and negated, with
  cumulative rounding so a series of partial returns refunds exactly what was collected. Before this, a
  return that named no address refunded no tax, and one that named an address refunded at that
  address's current rate.

  A return of a line billed by instalment refunds no tax: its tax reaches the ledger one instalment
  at a time, so a share of the line's tax would debit Sales Tax Payable for tax never invoiced. The
  test is the one the credit memo uses, so the two cannot disagree about a line.

  A reversal order that states no address now takes its bill-to and ship-to from the order it
  reverses, and a reversal line its origin line's ship-to; confirm copies the origin's address
  snapshot rather than re-reading the Address row. A subscription cancellation now records the order
  it reverses.

## 5.23.1

### Patch Changes

- b49eff4: The order screen shows a saved line's stored price as the line total and header Total.

  Once a line was saved and the order reopened, the pricing pass re-resolved it from today's rules
  unless its price was being edited, so the line total and the header Total could show list price
  while the unit price, Balance and the stored line carried the stored one. `StatedLineUnitPrice` now
  holds a line's price when it is being edited or is a positive stored price, the same test the save
  walk applies, and both pricing paths use it. The rules' price is still offered as the picker's
  Default, and a held line not overridden by hand keeps its rule's name on the price badge.

- 529fe84: A product now takes its product type's defaults when the type is chosen: revenue recognition type, subscription type and taxability (taxability resolves through the category chain first, then the type). Values the user sets are kept; a type switch replaces only values the previous type supplied. New products that reach save without them get the same defaults. The product header's type and rev-rec now follow edits instead of showing the values from when the form opened.

## 5.23.0

### Minor Changes

- cd97084: Paid checkouts now record each post-payment step (Confirm, Capture) in `CheckoutSessionStep`: every attempt, its source (checkout, webhook or replay), and how it ended. A shared view, "Checkouts: Needs Review", lists failed steps and steps left running for more than 15 minutes. `Orders.ReplayCheckoutStep` lets a holder of `MJ.BizApps.Orders.Checkout.Replay` (the new Checkout Operator role) re-drive a failed Capture through the same idempotent CapturePayment. Replaying a succeeded step does nothing, and Confirm is not replayable. The terminal-capture Task is now raised once per terminal failure instead of once per replay.
- 348b2ab: Value a concession however it is delivered, and approve it before the customer sees it.

  The sales guardrails valued a concession only as a percentage off price, so a term extended at no
  charge, seats added at no charge or a product added at no charge computed to 0% and cleared every
  check.

  - New `OrderConcession` entity. A concession is valued on save at the arrangement's own rate: a term
    extension at the term's amount over its length, a typed price at its reduction from the engine
    price, added seats at the line's unit price. Within the requester's `SalesAuthority` it is Approved
    on save; outside it, it is Pending until a holder of the `ConcessionLimit` rule's role approves or
    rejects it. Each records the delivery form and a reason category (Retention, Referral, Other).
  - `SalesAuthority` gains `MaxConcessionValue` and `MaxTermExtensionDays`. An extension at or above
    `MaxTermExtensionDays` needs approval, so a limit of 30 escalates a 30-day extension. A manual discount now
    escalates on either its percentage or its absolute value. For Duration and Seats concessions an
    unset limit grants no authority.
  - `SalesRule.RuleType` gains `ConcessionLimit`.
  - An order cannot be confirmed, and its documents cannot be sent, while a concession on it is Pending,
    or while a line on an unconfirmed order carries a stated price below its engine price with no
    approved concession covering it. Every line with a stated price is checked, whether it was typed in
    the editor or set through the API, except a bundle component, priced at its share of the bundle,
    and a reversal, priced from the line it unwinds. The order itself still saves.
  - A removed draft line takes its concessions with it, including decided ones.
  - A saved `SubscriptionTerm`'s `StartDate`, `EndDate` and `Amount` can no longer be edited. Extend a
    term by recording a Duration concession.

- 43cb51e: Limit concessions as a share of the order's net total, in every delivery form (#306).

  - `SalesAuthority` gains `MaxConcessionPctOfContract`. Every concession on an order that is not
    Rejected, together, is measured as a share of the order's net total (its lines after discounts,
    before tax and charges, reversal lines left out). At or above the limit, a concession needs
    approval, whatever its delivery form. With the limit set, an order with no net total needs
    approval too.
  - Each `OrderConcession` records the `OrderNetTotal` and `CumulativeShare` it was measured against.
  - An unconfirmed order whose share has since reached the limit of a concession approved on the
    requester's own authority cannot be confirmed until that concession is withdrawn and recorded
    again. Such a concession can now be withdrawn while its order is not confirmed.

- 69060ae: A nightly check raises a finance exception for each pair of live subscriptions for one holder whose terms overlap (finance exception type `OVERLAPPING_SUBSCRIPTION`). The new remote operation `Orders.DetectOverlappingSubscriptions` reads the type's settings through `Accounting.GetFinanceExceptionTypes` and does nothing when the type is missing or inactive, runs the saved query "Overlapping Subscriptions", leaves out same-category pairs when `IncludeSameCategory` is false, and raises through `Accounting.RaiseFinanceExceptions`: one exception per pair against the later subscription, dated to the business day, attributed to whoever confirmed the later order, with no creator restriction when that is not recorded (a booked order's confirmer cannot be filled in later, so an unresolved row could never be cleared). A re-run raises nothing new. A pair that could not be raised is reported and fails the run. The `Orders.DetectOverlappingSubscriptions` Action is the scheduler's way in, and the daily job "Orders — Detect Overlapping Subscriptions (daily)" ships disabled. Requires the BizApps Accounting release that provides the finance exception operations.
- dfa3dc8: A confirmed order's payment terms change only through an approved Terms concession.

  `OrderConcession` gains a `Terms` delivery form carrying the prior and new payment terms; its value is the
  change in days to payment. It always goes to approval and the requester cannot decide it. Approving it moves
  the order's terms and its due date to the order date plus the new terms' days. The order entity and trigger
  51018 refuse a direct edit. `Orders.AmendArrangement` takes `OrderHeaderID` and `NewPaymentTermsTypeID` to
  preview or record the change. The due date stays correctable without approval.

- b5e97d0: An approved Duration concession now extends its term (bc-aidp-next-golive#221, case B).

  Approving the concession applies the extension in the same transaction:

  - The term's `EndDate` and its line's `ServicePeriodEnd` move to the new end.
  - Every staged `RevenueRecognition` entry dated on or after the effective date is mirrored on its own date, and what those entries were going to recognise is spread again from the first of them to the new end, using the term's own driver and cadence. There is no catch-up and no receivable entry.
  - Access grants that follow the term run to the new end.
  - An `Extended` subscription event names the concession and pairs each offset with the entry it offsets.
  - A task is assigned to every active holder of the acknowledgment role except the requester, carrying the old and new schedules.

  The renewal follows the new end because `SpawnRenewals` reads the latest term.

  An extension is refused, both when it is recorded and when it is approved, if:

  - the term's renewal is already placed;
  - an entry it would offset is already in a journal-entry batch;
  - no acknowledgment role is configured (the new `AmendmentAcknowledgmentRole` setting, empty by default); or
  - nobody but the requester holds that role.

  `Orders.AmendArrangement` previews an extension without writing anything, or records it. A change of amount is refused for now.

  A booked term's dates can still be changed only through this path. The server subclass `SubscriptionTermEntityServer` admits the amendment's own write and no other.

### Patch Changes

- 319018d: Checkout widgets can offer choice groups ("choose N of M") in `Configuration.choiceGroups`: options, `min` and `max`. The widget renders them as checkboxes and keeps Pay disabled until each group has its minimum. `/draft` accepts `choices`. The payment intent and completion refuse picks outside `min`..`max` or options not in the list. `CompleteCheckout` records each pick on the order line as an Order Line Choice before `Confirm()`. A Product Entitlement with `ChoiceGroupKey` / `ChoiceOptionValue` set is granted only on a line carrying that pick, and `Orders.SpawnRenewals` copies the picks onto the renewal line so those entitlements renew. The shared check is `CheckCheckoutChoices` (`checkout-choices.ts`).
- afbfd22: A cleared Bill To Person stays cleared. The server save fills party defaults only from what changed in that save, and never copies the ship-to person into an empty bill-to, so a cleared party field is not refilled by that save or a later one. Clearing or replacing a person takes the ship-to person and employer organizations that were filled in from them along with it, and a replacement person brings their own ship-to copy. Values the user set are kept. The order form no longer shows the name of a party that was cleared.
- bf20bfa: A concession's `OrderNetTotal` and `CumulativeShare` are measured again when it is decided, not only when it is recorded. The record shows the share the decision was made at, not the one the draft had when the concession was recorded.
- 44ba79b: Move to MemberJunction 6.1.4 (the 6.1 LTS line) from 6.1.0-edge.5, and require BizApps Accounting 0.17.0 or later, the first release with the finance exception operations that progress posting, the overlap check and the below-engine check call. `mjVersionRange` is now `>=6.1.4 <7.0.0`.
- 76053c0: Ship the `Overlapping Subscriptions` query for finance's month-end exception review (golive #279,
  type 5): pairs of live subscriptions for one holder whose terms overlap, for the same product or a
  band of it (same category and subscription type). Each overlap is billed and recognized twice
  unless one is cancelled. Metadata only; no schema change.
- 399a517: `MaxTermExtensionDays` now limits any change to a term's dates, not only days added. A change is measured
  as the larger of how far the term's start and end move (`TermDateChangeDays`), so an extension, a
  shortening and a shift of N days each escalate at a limit of N. It is checked for every concession that
  changes a term's dates, whatever its form.

## 5.22.0

### Minor Changes

- 2aca048: Finance exception review for percentage-of-completion progress (golive #279, types 1 and 2). Nothing is blocked: each flagged item still posts and also lands on accounting's review list through `Accounting.RaiseFinanceExceptions`, with thresholds read from `Accounting.GetFinanceExceptionTypes` (a missing or inactive type raises nothing). `Orders.RecordProgress` raises `PROGRESS_JUDGMENT_CALL` inside its own transaction, after the observation is written, when the catch-up is a backward slide, is the line's first posted observation, or exceeds `MaxSingleObservationAmount` — one exception per observation naming every reason, keyed on the observation; a failure to raise fails the attestation, and `Preview` raises nothing. New operation `Orders.DetectUnattestedProgress`, with a Custom Action of the same name and a daily scheduled job that ships Disabled, raises `PROGRESS_UNATTESTED` for every active, booked, not-complete POC line on the progress worklist whose last attestation, or whose booking when never attested, is more than `MaxDaysWithoutAttestation` days before the business day — one exception per line per month (`<OrderLineID>|<YYYY-MM>`), amount the value not yet recognised, creator the last attester; a failed raise fails the run. `Orders.GetProgressWorklist` rows gain `LastAttestedByUserID` and `ConfirmedAt`.

## 5.21.0

### Minor Changes

- 4d6f410: Approved exceptions to payment-gated access (#268). An `EntitlementAccessOverride` on one order
  keeps its grants `Active` past the rule that would suspend them:

  - `WaivePaymentHold` lifts the hold on grants awaiting payment (`AwaitingPayment`).
  - `DeferCutoff` lifts the renewal cutoff (`PastDue`).

  Every override carries a reason and a last day (`EffectiveThrough`), and applies only to the order
  it names; a later renewal or a revised order is a different order. `Orders.RequestAccessOverride`
  needs the authorization for the override type (`MJ.BizApps.Orders.Access.Override.WaivePaymentHold`
  or `.DeferCutoff`, or their parent). No role holds them yet. The request raises an
  `ORDERS_ACCESS_OVERRIDE` approval task, unassigned: who approves is #360.

  An override takes effect only once approved, through `Orders.RecordAccessOverrideDecision` or by
  closing the task in the Tasks inbox. An approval re-decides the order's grants at once. The payment
  path and the nightly pass honour an approved override through its last day. After that day, the
  nightly pass re-decides the grants without the override and marks it `Expired`.

  The order form gains an Access Overrides section listing the order's overrides, with a request form
  and approve / reject on open requests.

  `@mj-biz-apps/orders-core-entities-server` now peers on `@mj-biz-apps/tasks-core`.

- 1901f73: Checkout widgets can ask the buyer questions before payment (#322). `CheckoutWidgetConfiguration.questions` defines `select` or `text` questions, with `required` and an `otherOptionKey` whose choice requires a free-text answer. The widget renders them and keeps Pay disabled until required ones are answered. `/draft` stores the answers; `/payment-intent` and `/complete` refuse a missing required answer, before any intent opens or Person is created. The confirmed order records each answer as an Order Checkout Answer, saved in the booking transaction through the new `OrderHeader.CheckoutAnswers` collection. The check is shared: `CheckCheckoutAnswers` in `@mj-biz-apps/orders-entities`.
- 53d6fd8: Migration `V202609291300` adds the CheckoutSessionStep table: one row per checkout session per post-payment step (Confirm, Capture), with status, attempts, last error, whether that error is retryable, what started the last attempt and when. Includes its CodeGen output: the generated entity class, GraphQL type and form.
- 68402d5: Migration `V202609291306` adds the EntitlementAccessOverride table: a recorded exception to payment-gated access on one order (`WaivePaymentHold` or `DeferCutoff`), with a required reason and last day, its Tasks approval, and who decided it and when. A trigger stops the request and the decision being rewritten and limits the status moves. Includes its CodeGen output: the generated entity class, GraphQL type and form.
- 18b10d7: Migration `V202609291304` adds the OrderCheckoutAnswer table: one row per order per question a checkout widget asked the buyer, with the question's key, its label as the buyer saw it, the answer, and the free-text answer given after choosing "Other". Includes its CodeGen output: the generated entity class, GraphQL type and form.
- 497fc57: Migration `V202609291302` merges the confirmed-order guard triggers into one per table. `trg_OrderHeader_ImmutableAfterConfirm` now runs 51014, 51013, 51015 and 51017, and `trg_OrderLine_ImmutableAfterConfirm` runs 51002, 51003, 51016 and 51008. `trg_OrderHeader_AddressFrozenAfterConfirm`, `trg_OrderHeader_ConfirmedByFrozenAfterBooking` and `trg_OrderLine_AddressFrozenAfterConfirm` are dropped. Error numbers and messages are unchanged. When one write breaks two rules, the error returned now follows that order.
- 2831b2f: Migration `V202609291307` adds the OrderLineChoice table: one row per option a buyer chose from a checkout choice group ("choose N of M"), recorded on the order line. It adds `ChoiceGroupKey` and `ChoiceOptionValue` to ProductEntitlement, set together or not at all; set, the entitlement is granted only on a line that carries that choice. Includes its CodeGen output: the generated entity class, GraphQL type and form, and the regenerated Product Entitlement view and procs.
- f263124: Migration `V202609291301` restores trigger check 51008: once an order line's `JournalEntryID` is set it cannot be cleared or replaced. Two earlier redefinitions of `trg_OrderLine_ImmutableAfterConfirm` had dropped it.
- 528b483: The 5.21 Metadata_Sync ships the entitlement access override to hosts: its authorizations, the Apply Access Override Decision action and the Access Override Approval task type. It also ships the `orders` API scopes granted to MJAPI and two new remote operations. The ML bench output is not included.
- fa90781: Migration `V202609291308` adds the OutboundEvent and OutboundDelivery tables: a transactional outbox of `OrderConfirmed` and `GrantStatusChanged` events, and one delivery row per event per registered consumer with its status (`Pending`, `Delivered`, `DeadLettered`), attempts, next attempt, deadline and lease. Includes its CodeGen output: the generated entity classes, GraphQL types, forms, and the Outbound Events sections on the Order Header and Entitlement Grant forms.

### Patch Changes

- 6e5077d: `<mj-orders-checkout>` can be embedded inside another widget. New attributes: `email` prefills the e-mail field while it is empty; `source` and `source-ref` say where the checkout came from and are kept on the checkout session as `MetadataJSON.Attribution` (`NormalizeCheckoutAttribution`; an unreadable one is dropped, never refused). A host dispatches `checkout-reset` on the element to return it to a blank form; it is refused with `checkout-reset-refused` while a payment is in flight or the account step is unsettled, it always starts a new session, and it reads `email`, `source` and `source-ref` again for the next conversation.
- 704eec2: Migration `V202609291303` adds `FK_OrderLine_ShipToAddress`, so an Address that an order line names as its ship-to can no longer be deleted, and adds the Addresses → Order Lines entity relationship so a dependency check on an Address finds those lines. `OrderLine.ShipToAddressID` is now documented as relating to Addresses.
- fd0cfac: Orders now ships the API scopes its entitlement operations require: a parent `orders` scope with `orders:entitlement-check` (`Orders.CheckEntitlement`) and `orders:entitlement-read` (`Orders.ListEntitlements`), both allowed at the MJAPI application ceiling (`*`, Include). Before this, every API-key call to either operation was refused on a host that installed Orders until the scopes were created by hand. The rows are in `metadata/` and reach hosts through the release's metadata sync migration.

## 5.20.0

### Minor Changes

- 7af7a46: Two attestation controls from Jeremy's review of golive #241. `Orders.RecordProgress` returns a `ClosedPeriodWarning` when the measurement date falls in a month accounting has already posted a journal-entry batch for — advisory on both the preview and the live path, never blocking, since the batch build stays the control and attestation must not be gated on a state the attester cannot change. The screen shows it above the table, in the confirm dialog, and on the notice after a post made anyway. And the immutability trigger now looks forward as well as back: promoting an observation from Draft to Posted is refused outright by the trigger (51031), and inserting a row already Posted is refused by a new `OrderLineProgressMeasurement` server subclass unless `Orders.RecordProgress` is the one saving it. A posted observation carries a recognition amount and a journal entry id, and the only thing making those true is that the entry was written in the same transaction.
- 41d32be: Bill.com integration: invoices out, payments in (golive #146, #147, #148, #242).

  **The seam.** `BaseInvoiceRail` is the outbound-invoice counterpart of `BasePaymentProvider`: a
  class-factory base keyed by `PaymentProviderType.Code`, with one implementation, `BillComInvoiceRail`,
  over the published `@memberjunction/connector-bill-com` through a stubbable `BillComGateway`. Per-company
  configuration is a `PaymentProvider` row of the new type `BillCom` whose new `CompanyIntegrationID`
  column points at the `MJ: Company Integrations` row the connector resolves credentials from — a
  pointer, never a secret.

  **Billing units, not orders.** One Bill.com invoice per `(order, selling company, instalment | none)`.
  An order billed as a whole is invoiceable at Confirmed; an instalment (PR #220) once its number is
  frozen. The send is decoupled from both events: `Orders.SendExternalInvoices` works a computed worklist
  (`Orders.GetExternalInvoicingWorklist`) through `Orders.IssueExternalInvoice`, which claims the unit
  with a `Sending` row before the rail is called so a double send fails here rather than at Bill.com.
  `Orders.CancelExternalInvoice` archives an unpaid invoice and is blocked when money has been applied;
  on an instalment it leaves the rail facts as history, because Craig ruled that an issued instalment is
  never re-issued — the replacement carries the next number. A send that times out leaves the unit
  claimed on purpose, and `Orders.AdoptExternalInvoice` is the other half of resolving that: it records
  the reference the rail already holds, after reading the invoice back and refusing a total that does not
  tie. Native email delivery refuses a unit that is invoiced through the rail.

  **Payments are polled, once.** Bill.com publishes no payment-received webhook, so
  `Orders.PollExternalPayments` reads receivable payments since a stored watermark, matches
  `invoicePayments[]` to `ExternalInvoice` rows by the rail's invoice id (all or nothing), and captures
  each cleared payment through `Orders.CapturePayment` with `IdempotencyKey = 'billcom:<id>'`. Unknown
  statuses are held, unmatched invoices capture nothing, reversals are flagged for a person. A verified
  Bill.com invoice webhook (`POST /webhooks/billcom/:providerId`, HMAC-SHA256) only nudges that poll to
  run now.

  **Schema.** New tables `ExternalInvoice`, `ExternalCustomer`, `ExternalPayment`,
  `PaymentProviderSyncState`; new nullable `PaymentProvider.CompanyIntegrationID`. Three new `V`
  migrations, plain DDL per the convention set on PR #220; the FK to `OrderHeaderPaymentSchedule` is added
  only where that table exists. Applied to a development database, with the CodeGen output folded under
  each migration's banner. A fourth migration, `BillCom_Metadata_Sync`, carries the declarative metadata —
  the `BillCom` provider type, the six remote operations, the two Actions with their 22 params and the two
  scheduled jobs — because `metadata/` is a dev-time source no host installs. It was generated from a
  database that did not hold those rows, so every statement is an `spCreate`, and each is guarded on the
  primary key or the row's natural key so a host that already has the row is left alone.

  **Verified live against the BILL sandbox**, not only in unit tests: customer and invoice create,
  archive, duplicate-number refusal, payment polling, and the full capture chain — a confirmed order
  issued to Bill.com, a payment recorded there, and the poll capturing it, with the order balance going
  to zero and accounting booking DR Cash / CR Accounts Receivable against the confirm entry's DR AR /
  CR Sales. Re-polling from an earlier watermark captured nothing further.

  Two defects in `@memberjunction/connector-bill-com` 0.3.1 surfaced and were filed upstream
  (MemberJunction/Integrations #390 and #391, fixed in PR #392): every generic request repeated the API
  version and 404'd, and invoice archive had no connector verb. Both are released in 0.3.2, which this
  change depends on; the local workarounds are gone and archive goes through the connector's own verb.

  **The screens.** An **External invoicing** panel on the order form lists what the rail holds for that
  order and carries the two acts a person may take; it hides itself entirely for a company with no rail,
  so orders invoiced natively look untouched. An **Invoicing queue** page under Receivables shows what is
  waiting to send and what the payment poll could not finish, and can run either job by hand — which
  matters because both ship disabled and somebody has to prove them first. The billing worklist gains a
  column naming the rail a company invoices through, so issuing an instalment tells the truth about what
  happens next.

  Every label is read from the `PaymentProvider` row: no screen says Bill.com. The rule that decides when
  Send may be offered lives in a pure module (`external-invoice-view.ts`) and is unit-tested, because
  offering it against a unit already live — or one whose last send was never confirmed — is how one
  billing unit becomes two invoices in a customer's inbox.

  **Scheduling.** Two Actions and two `MJ: Scheduled Jobs` rows (half-hourly send in business hours,
  hourly poll), both shipped **Disabled and set to Preview**, like the renewal job, and installed by the
  metadata migration above. Enabling them is a deliberate act, and the webhook follows the poll job rather
  than overriding it.

  **Host setup.** Nothing runs until a host configures it: with no `BillCom` provider row, the rail is
  inert. To use Bill.com, a host needs:

  1. **The connector, loaded in MJAPI.** Add `@memberjunction/connector-bill-com` 0.3.2 or later to
     MJAPI's dependencies and to `dynamicPackages` in its `mj.config.cjs`, with
     `StartupExport: 'registerConnector'`, the way other MJ connectors are loaded. No orders package
     depends on it; without it, every Bill.com call fails with "No connector registered".
  2. **The integration rows, per company.** An `MJ: Credentials` row for the Bill.com session, with its
     `environment`; an `MJ: Company Integrations` row that uses it, on the Bill.com `MJ: Integrations`
     row; and a `PaymentProvider` of type `BillCom` whose `CompanyIntegrationID` points at that Company
     Integration. Orders creates none of these, and refuses a live provider pointed at a sandbox
     credential.
  3. **The jobs, enabled deliberately.** Enable a job, read one Preview run, then turn Preview off.
  4. **Optionally, the webhook.** The receiver mounts itself at `POST /webhooks/billcom/:providerId` from
     `@mj-biz-apps/orders-server`'s package manifest; no host config is needed. To use it, create the
     Bill.com subscription and set `<CredentialsRef>_WEBHOOK_SECRET` to its `securityKey`, where
     `CredentialsRef` is the value on the `BillCom` provider row. Without the key, every delivery is
     refused, and the hourly poll still captures payments.

- d71575a: Orders now record who confirmed them. `OrderHeader.ConfirmedByUserID` (FK to `__mj.User`) is written by the booking save from the save's context user, in the same write as `ConfirmedAt`, and is NULL when the booking has no context user. Orders booked before this release keep NULL: who confirmed them is not recorded anywhere, so nothing is backfilled. Once an order has a `ConfirmedAt` the column cannot change: `Validate()` refuses it with the other booked header fields, and trigger 51017 refuses it at the database. Migration `V202609281000` adds the column, the trigger and their CodeGen output.
- 3a8b6b2: The 5.20 Metadata_Sync ships the metadata that releases since 5.3 declared but never seeded, so it now reaches every host rather than only a developer's own database: the payment-gated-access and renewal actions with their daily jobs (installed Disabled), the Party Customer Roster query, the renewal access cutoff setting, the Instalment Invoice journal entry type, the progress-attestation remote operations, the Percentage of Completion recognition type and Project product type, the Engagement Lead role with its grant and permissions, and Account Director on the price-override grant. It also applies the curated user-search settings on 19 entities. The seed is idempotent and attaches to rows a host already created under its own IDs. It needs bizapps-common 5.47.0 or later, because the roster query sits in common's Party Signals category; mj-app.json now requires it. The ML models, training pipelines, scoring bindings and scoring record processes under metadata/ are not included.
- 102ea17: Percentage-of-completion revenue recognition (golive #241, plan Part F / D90, W10/W11). `RevenueRecognitionType.ScheduleBasis` (`AtBooking` | `OnMeasurement`; defaults to `AtBooking`, so the three existing types are unchanged) and the new `OrderLineProgressMeasurement` table — one attested observation of cumulative percent complete per line per period, immutable once posted. A `ProgressRecognitionDriver` family alongside the booking drivers, with `ManualAttestation` shipped. New operation `Orders.RecordProgress` posts the cumulative catch-up (`LineTotalNet × percent − the line's RecognizedToDate`) as a `RevenueRecognition` entry crediting Sales, debiting Deferred Revenue up to the line's deferred balance and Unbilled Receivable beyond it (D92 rule 2); a backward slide mirrors the same entry; a zero delta succeeds and writes nothing; `Preview` computes without writing. The operation advances the line's `RecognizedToDate` in the same transaction as the entry, and is gated on the order being confirmed rather than on the line carrying a booking entry, since a POC line on a company with a payment schedule books no value entry at confirm. `Orders.GetProgressWorklist` lists open POC lines with their last observation. Metadata: the Percentage of Completion rev-rec type and the Project / Implementation product type. Receivables rail gains a Progress attestation page.

### Patch Changes

- a1114ed: Requires bizapps-accounting 0.16.0 or later, the release that seeds the Customer Deposits and Unbilled Receivable GL account roles. Without Customer Deposits, a host on an older accounting refuses scheduled-order payments that need that leg. The higher floor stops orders 5.20 from installing there.
- 0bcafbd: An event-type product with no Event Products row now shows the service-period fields on its order line, and Confirm names the line until both dates are set, instead of offering no fields while the server refuses every confirm. `OrdersEngine` caches Event Products (`EventProducts`, `EventProductByID`), and `ServicePeriodSource` returns `Event` only when the row exists — the same test the order save uses to stamp event dates. An order line whose service period ends before it starts is now refused by the line's own validation with a plain message, and the line editor shows it as the dates are typed.
- e131f07: A new payment can be captured from the Payments screen again. Receiving Company is filled from the allocated orders when they all belong to one company; when they span companies, capture is refused until one is chosen, with a message saying so. The payment detail now takes its company and tender from the header at every save (`PaymentHeaderEntity.SyncPaymentDetailFromHeader`), so a reference typed before the company was set no longer fails the save. A refused capture puts the previous status back (`PaymentHeaderEntity.SaveStatus`) instead of reading Captured with nothing saved. Wire and Internal Transfer show a reference field instead of the check panel, ACH shows its bank fields instead of the card panel, and an over-applied order shows its negative balance and the credit it creates instead of $0.00.
- 8d3df77: A deferred line that neither an event nor a subscription dates can now be given its service period on the order screen, and Confirm stays disabled, naming the line, until both dates are set. `OrdersEngine.ServicePeriodSource(productID)` says where a line's window comes from (`NotRequired`, `Event`, `Subscription` or `Line`); `OrderHeaderEntity.LinesMissingServicePeriod()` lists the lines still without one. A refused Confirm, Void or Reopen now puts the previous status back (`OrderHeaderEntity.SaveStatus`) and shows the reason, instead of leaving the order reading the new status with every later save failing.

## 5.19.0

### Minor Changes

- 8ee3f8d: Register the metadata `V202609221500` left behind for `DimensionDefault`'s name fields (golive #236 follow-up).

  `V202609221500` created `vwDimensionDefaults` with three denormalized name columns — `Entity`, `Dimension` and `DimensionValue` — but registered `EntityField` rows for the table's eleven columns only. On any database built from migrations alone the view has 14 columns against 11 registered fields, and every `DimensionDefault` INSERT fails with `Column name or number of supplied values does not match table definition`, so no product can carry a default dimension. `V202609252100` inserts the three rows, guarded on `(EntityID, Name)` and sequenced with the apply-time `MAX + 1` expression. Data only — no schema change and no CodeGen output.

- e7680ea: Keep each order's customer address as it was at the time of sale.

  Confirming an order now copies its bill-to and ship-to addresses, and each line's own ship-to, onto
  the order as JSON (`OrderHeader.BillToAddressSnapshot`, `ShipToAddressSnapshot`,
  `OrderLine.ShipToAddressSnapshot`). The invoice, the order form and the order document read the
  snapshot on a confirmed order, so editing a customer's address no longer moves their earlier sales.

  Once an order is confirmed, an address it names cannot be replaced or cleared; an empty one can be
  filled once, and the server snapshots it on that save. The entity refuses the edit, and triggers
  51015 (header) and 51016 (line) refuse it at the database. Draft and Quoted orders keep following
  the live address. The migration backfills snapshots for orders that are already Confirmed, from
  their current Address rows.

## 5.18.0

### Minor Changes

- b3ef9d2: Payment-gated access (bc-aidp-next-golive#223). Adds a grant timing, `OnFirstPayment`, set on a
  product, category or product type like the other timings:

  - A new purchase's grants are written `Suspended` (`AwaitingPayment`) and become `Active` when the
    first amount due is paid: the first instalment of each company's schedule, or the whole order when
    there is no schedule.
  - A renewal's grants are `Active` at confirm and are suspended (`PastDue`) once the renewal order is
    `RenewalAccessCutoffDaysPastDue` days past due. The setting defaults to 14, and `off` disables it.

  Grants are re-decided inside every payment capture and reversal, so card, settled ACH, check,
  refunds and returned debits all resolve through the order's `AmountPaid`. A refund the seller issues
  is added back before deciding, so it never takes access away; only a returned debit does. A renewal
  counts days past due from its next unpaid due date, so a part-payment that leaves that date unpaid
  does not delay the cutoff. A new nightly job,
  `Orders — Enforce Payment-Gated Access (daily)`, applies the renewal cutoff. It ships `Disabled` and
  set to Preview. `OnPaidInFull` grants now also become `Active` when the balance clears after confirm.

  Schema: `EntitlementGrant` gains `GrantTimingApplied`, `SuspendedAt` and `SuspensionReason`, and the
  three grant-timing columns accept `OnFirstPayment`. `PaymentHeader` gains `ReversalSource`
  (`Refund` or `BankReturn`), required on every reversal and backfilled on existing ones. The overdue worklist fills `GraceThroughDate`
  for renewals that still have access. Identity claims no longer lift a payment hold.

### Patch Changes

- 5b5ebef: Share the order-line price picker. The rules behind it (`IsLinePriceOverridden`, `NamedPricesBesideDefault`, `RestoreLineDefault`, `PinLineToNamedPrice`, `PinLineToAmount` and the override-reason helpers) move to `@mj-biz-apps/orders-entities`, and the control becomes `<mjo-line-price-picker>` in `@mj-biz-apps/orders-ng`, with an `AllowCustomAmount` input for screens that offer named prices only. The order lines editor uses it with no change in behaviour, except that a line already on a typed amount now shows a disabled "Custom amount" row to a user who may not type one, instead of reading "Default".

## 5.17.0

### Minor Changes

- d0489c4: Freeze the selling company, order date and parties on a confirmed order.

  - A line on a Confirmed order keeps the company it was sold under. `OrderLineEntityServer` no
    longer re-stamps `CompanyID` from the product once the order is booked, and trigger 51003 now
    refuses a change to it. Draft and Quoted orders still re-stamp from the product.
  - A booked header refuses changes to `OrderDate`, `OrderType` and `ReversesOrderHeaderID` (added to
    `ORDER_HEADER_MONEY_FIELDS` alongside `CompanyID`) and to a bill-to party that is already set
    (new `ORDER_HEADER_SET_ONCE_FIELDS`), from `Validate()`, with a message naming the field.
  - New trigger `trg_OrderHeader_ImmutableAfterConfirm` backs that at the database: the same columns
    (51013), and `Status` cannot leave Confirmed (51014).
  - The order form shows Order Date and the bill-to party read-only on a booked order, as it already
    did Company and Order Type, with a note saying why.
  - The guest-order claim no longer re-points a booked order's bill-to. It fills an empty one, and
    moves the ship-to on its own, so the claim succeeds.

  Direct SQL that rewrote these columns on booked orders is now refused; stand the trigger down the
  way the existing immutability triggers are for a data reset.

- acb0405: Register the metadata `V202609191200` left behind for `OrderLine`'s dimension columns (golive #256).

  `V202609191200` regenerated `vwOrderLines` with the two denormalized dimension name columns but registered `EntityField` rows for `DimensionID` and `DimensionValueID` only. On any database built from migrations alone the view has 51 columns against 49 registered fields, MJ's save-capture falls back to view column order, and every OrderLine INSERT fails with `Column name or number of supplied values does not match table definition`. `V202609230300` inserts the two rows, guarded on `(EntityID, Name)` and sequenced with the apply-time `MAX + 1` expression. Data only — no schema change and no CodeGen output.

  The same run also left two `EntityRelationship` rows unregistered, `Dimension` and `DimensionValue` to Order Lines, so on a host built from migrations the accounting vocabulary is not reachable from an order line in the API or on its form. Both are healed in the same file, guarded on id and on their natural key.

- b550e40: Every value that names a calendar day is derived from the business day rather than the clock instant
  (#209).

  A SQL `DATE` is a calendar day with no time. `new Date()` is an instant, and an instant serialises in
  UTC — so a record stamped at 9 PM Eastern was dated tomorrow. A reversal fell in a different period
  from the capture it reverses, a credit settled an order on a day that had not started, an invoice was
  printed with tomorrow's date beside a due date counted from a different calendar, and the journal
  entries followed the wrong day with them. Same defect shape as the order-date case
  (bc-aidp-next-golive#168), fixed the same way.

  Two helpers hold the rule so it is stated once rather than re-derived per site. `AsDateValue(cell)`
  (orders-entities) gives the calendar day a value names, pinned to midnight UTC — which also stops a
  supplied instant carrying its time into a `date` column. `CalendarDayOrToday(cell, provider, user)`
  (core-entities-server) adds the fallback: today's business day when the value names no day, warming
  `BusinessTimeZoneEngine` only on that path, so a metadata read never runs inside a write transaction
  to compute a day that was supplied anyway. Where no provider exists — the browser, the entity layer —
  the pairing is `AsDateValue(x) ?? TodayAsDateValue()`.

  Converted, twenty-eight sites: the reversal factory and the applied-account-credit operation, the
  capture operation, the initial payment, the entitlement grant's validity start, the subscription
  booking day and the cancellation request day, the allocation and processing-fee journal entries, the
  payment line's allocation entry, the order journal entry's effective date, the affiliation as-of day
  on both sides, `PreviewPrice` and `SpawnRenewals`, the checkout service's pricing as-of day, the
  pricing service's four `AsOf` values and the order-line and order-header ones, the order-lines
  editor's dimension catalog and pricing context, the Angular payment form's cleared date field, the
  invoice document's printed date and days-until-due countdown, and the integration harness's own
  fixtures — a test suite that dates its rows from the clock cannot measure this defect.

  Caller-supplied days are refused rather than absorbed. `AsDateValue` answers `null` for a well-formed
  day that does not exist (`2026-02-30`) instead of throwing a `RangeError` its callers cannot defend
  against; `RequireDate` rejects such a day rather than letting `Date.parse` roll it forward to another
  one; and `Orders.CapturePayment`, `Orders.PreviewPrice`, `Orders.SpawnRenewals`,
  `Orders.CancelSubscription` and the invoice render boundary that `Orders.GenerateInvoice` and
  `Orders.SendDocument` share each refuse it, because a quote, a renewal pass, an invoice or a payment
  silently answered for today is wrong with nothing to notice. A day given as a real `Date` rather
  than a string is still accepted everywhere the interface promises one: only text is validated.

  Two source guards cover all five packages — core-entities-server, entities, orders-ng, orders-server
  and the integration harness. One fails if any file stamps a column the migrations declare as `DATE`
  from a bare `new Date()`; the other fails on "a day in hand, else the clock" under any binding name,
  which is the spelling that twice reached a date column through a differently-named variable. Sites
  that cannot be driven in a unit test are pinned positively to the expression they must use.

  No schema change: a `DATE` column is read from UTC parts and written as UTC midnight. The business
  time zone decides only what "today" is.

- 19983f5: A scheduled order books only what it has invoiced (D92, golive #240).

  Confirming an order used to raise the whole contract value on the balance sheet the day it was signed. For a three-year contract billed annually that put three years of receivable there before anyone had billed a penny, and it made Deferred Revenue mean "contract value" rather than "billing ahead of performance". Now the order and its schedule stay in the subledger and the GL records what happened: billed, collected, earned.

  A company billed by instalment books no value at confirm except the instalments already due on the order date, which confirm issues through the same act a person triggers later — `IssueInstalment`, one function, so the document number, the stamps and the entry are identical whichever route raised them. Each remaining instalment is booked when it is invoiced.

  Every order line now carries `BilledToDate` and `RecognizedToDate` (migration `V202609230400`, with this app's CodeGen output folded below the banner). The gap between them is the line's balance-sheet position, and two ordering rules follow from it: invoicing credits **Unbilled Receivable first**, up to the line's `max(0, R − B)`, then Deferred; recognising debits **Deferred first**, up to `max(0, B − R)`, then Unbilled. That is `SplitContraLegs` in `ContractBalance.ts`, and its test walks all nine steps of Andrew's Scenario 4 including the backward slide from 45% to 40%. The totals are stored signed, so an origin line and its reversals net to zero, and they are advanced by the same transactions that book the entries — a separate writer is how a total drifts from the ledger it summarises.

  Unbilled Receivable now means what the standard means by a contract asset: service delivered that the contract does not yet let us bill. That is a different thing from the future instalments the superseded D89 revision parked in the same account.

  An order with no payment schedule — dues, events, and everything the go-live conversion brings in — books exactly what it booked before, asserted on the entry's shape rather than its totals. A gift card sold to a company billed by instalment is refused with an explanation rather than guessed at. An entry that needs an Unbilled Receivable leg is refused when the company has no Unbilled Receivable account linked, rather than posted to Deferred Revenue (golive #261), so a company billed by instalment cannot confirm an order with an up-front line, or issue an instalment against earned-but-unbilled revenue, until that link exists. And a cancelled instalment no longer gives its document number back (golive #242): Bill.com 422s on a duplicate and archiving keeps the number reserved, so the count includes cancelled rows and issuing refuses a number already held by a sibling.

### Patch Changes

- 5630121: Keep the order-line edit veto registry in MJ's global object store instead of a module-scoped
  variable, so every copy of `orders-entities` loaded in one process shares one registry.

  Before this, a host that resolved two copies of the package could register the veto into one and
  look it up in the other, and the veto would never run. That forced cross-repo consumers to pin this
  package exactly. They can now depend on it with a range. `RegisterOrderLineEditVeto` and
  `HostOrderLineEditVeto` keep their signatures.

## 5.16.0

### Minor Changes

- 2e9e3dd: `V202609221500__DimensionDefault` could not apply on any host but the one it was generated from.

  It seeds five `EntityFieldValue` rows for `OrderLine.FulfillmentStatus` against the hardcoded
  `EntityFieldID` `F04330BA-4A37-4674-A2FE-237CE04E2C52`. CodeGen mints EntityField IDs per host, so that
  GUID exists only on the authoring database. Everywhere else:

                                                                The INSERT statement conflicted with the FOREIGN KEY constraint
                                                                "FK_EntityFieldValue_EntityField"

  which aborts the entire migration. On AIDP Next stage it killed the 5.15.0 upgrade at batch 19 of 30
  and left the app registered `Error`.

  **This is a regression of the 5.11.0 fix** — same GUID, same five values — which corrected the identical
  defect in `V202609061900`. Regenerating a migration from the authoring database re-emitted the hardcoded
  ID, and nothing in CI catches it.

  The field is now resolved by natural key (`Entity.BaseTable = 'OrderLine'` + `EntityField.Name =
'FulfillmentStatus'`), with a `THROW` if genuinely absent rather than a silent no-op. Each value is
  guarded independently on `(EntityFieldID, Value)` and on its own row ID, so a host carrying some of them
  already — which includes every host that ran the 5.11.0 fix — keeps its rows and gains only what is
  missing.

  Edited in place rather than superseded, because a later migration cannot rescue this one: it aborts the
  run before anything after it executes. No host carries a checksum for it, since it cannot have applied
  successfully anywhere but the authoring database.

## 5.15.0

### Minor Changes

- 09624cb: Derive an order line's GL dimensions instead of waiting for someone to type them.

  An order line could already state ONE dimension tag by hand. The chart-of-accounts design needs five
  axes on a revenue line and needs them with no human in the loop, which is what
  MemberJunction/bc-aidp-next-golive#236 actually asks for. This adds the derivation.

  `DimensionDefault` is the product half of the mapping: polymorphic over Product, ProductCategory,
  ProductType and Company and date-effective, so it is resolved by the same precedence
  `GLAccountResolver` already walks for accounts — product, its category and that category's
  ancestors, its product type, then the line's company. Most specific wins **per dimension** rather
  than per walk, so a category can supply Venture while the product supplies Product and both land on
  the line. That is what lets a venture be stated once instead of copied onto every product.

  Two axes cannot come from a mapping table, because they are facts about the line rather than the
  product. ARR-Type reads the subscription decision the save already carries — `CreateNew` is New,
  `ExtendExisting` and `Reactivate` are Renewal — rather than `SubscriptionTerm.TermNumber`, which is
  not written until later in the same save. Vintage reads the event's own year, in UTC, so an event
  starting just after midnight is not filed under the previous year by a server west of the venue.
  Both resolve by CODE, because the ids are minted per environment by whatever pulls the dimensions
  out of Business Central; a missing dimension or value yields no tag rather than a guess.

  The derived values are written as `OrderLineDimension` child rows, so a line can carry all five
  axes. `OrderLine.DimensionID` / `DimensionValueID` become the **human override**: `MergeLineDimensions`
  already gives the column precedence over a child row naming the same axis, so setting a tag by hand
  overrules what was derived for that one axis and nothing else. Where the product mapping and a
  line-level rule name the same axis, the rule wins — it was computed from this line.

  Stamping is diffed rather than delete-and-reinsert, so saving an unchanged order writes nothing to
  the change log, and booked lines are skipped because their tags are what the journal entry already
  carries. The whole pass leaves early when no `Dimension` rows exist at all, which is every
  environment until the ERP sync has run — so this ships inert and starts working when the dimensions
  arrive.

  Nothing here refuses a booking. An unmapped product yields no tags and books untagged, which is the
  state every line was in before this existed; refusing would turn a half-configured mapping into an
  outage across every order.

- 21167e2: Order Headers: stop emitting the geocoding columns, so the view and the generated types agree again.

  `Entity.SupportsGeoCoding` was set on Order Headers at some point, so CodeGen emitted `__mj_Latitude` /
  `__mj_Longitude` into `vwOrderHeadersGenerated` along with a join to `[__mj].[vwRecordGeoCodes]`. The
  generated TypeScript was later regenerated with the flag off, dropping both fields from the entity and
  GraphQL types — but **CodeGen only adds geo columns, it never removes them**, so the view kept them.

  Between 5.13.0 and 5.14.0 the two halves diverged:

  |                         | `__mj_Latitude` |
  | ----------------------- | --------------- |
  | 5.13.0 generated code   | present         |
  | 5.14.0 generated code   | **gone**        |
  | the view, both releases | present         |

  A client builds its query from live `__mj.EntityField` metadata, which reflects the **view**, so it asks
  for `_mj__Latitude` (GraphQL reserves a leading `__`). The API type, built from the generated code, has
  no such field:

      Cannot query field "_mj__Latitude" on type "mjBizAppsOrdersOrderHeader_"

  Single-record load and save on Order Headers both fail. Grids keep working, because views do not go
  through the generated type — which is what made it look like a deployment problem rather than a
  packaging one. Reported as MemberJunction/bc-aidp-next-golive#251; root cause in #238.

  **The view loses the columns rather than the generated code regaining them.** Order Headers has no use
  for geocoding and the columns have never carried a value — 120 rows on the reporting host, none with a
  latitude.

  Both statements in the migration are required, and neither is sufficient alone: clearing the flag leaves
  the existing columns in place, and recreating the view without also clearing the flag lets the next
  CodeGen run add them straight back. `AutoUpdateSupportsGeoCoding` is cleared too, so the flag is not
  re-derived.

  The recreated view is the CodeGen output from `V202609061900` minus exactly the two select expressions
  and the `vwRecordGeoCodes` join, so a later regeneration against a host with the flag off is a no-op.
  `CREATE OR ALTER` because the view exists on every installed host.

- 7ec08da: Payment schedules on the order header (golive #239, plan D85–D88, W1/W4–W8). New `OrderHeaderPaymentSchedule` table: one row per instalment with a stamped `CompanyID`, its own `AmountPaid`/`Balance` rollup, and invoice identity (`DocumentNumber`, `InvoicedAt`, `InvoicedByUserID`, `JournalEntryID`) frozen at invoicing; `ExternalSystem`/`ExternalInvoiceRef`/`SentAt` for the outbound integration to write. `PaymentLine.OrderHeaderPaymentScheduleID` aims a payment at one instalment; unnamed payments cascade oldest-due-first. `vwOrderHeaders` gains `NextDueDate` and `IsOverdue` ages on it. New operations `Orders.IssueInstalmentInvoice` (freeze number, stamp, advance; idempotent; calls the AR-reclass seam AIDP-25 fills) and `Orders.GetBillingWorklist` (instalments due with no invoice), with a Billing worklist page on the Receivables rail. Confirm refuses a schedule that does not tie to the lines, naming the shortfall. Per-instalment invoice documents via `PaymentScheduleID` on `Orders.GenerateInvoice`. An order with no schedule behaves exactly as before.
- 5293c47: Make the order line price picker mean what it says, and require a reason for an override.

  The picker behind the pencil had three faults in one control (MemberJunction/bc-aidp-next-golive#253).
  Its Default row did nothing: the option's value was the empty string, and the `<select>`'s bound
  value was applied before its conditional options existed, so the browser fell back to the first row
  — Default — while the component still believed the line was on a custom amount. Choosing Default was
  then choosing what the DOM already had, and no change event fired. Selection is now bound per option
  and Default carries a real sentinel value.

  The "overridden" badge stuck after a return to list price, because every named-rule pick set
  `PriceOverridden` whether or not the pick differed from the default. The flag is now derived: a pick
  or a typed amount that lands on the engine default restores the default and clears the flag, the
  reason and any custom amount; only a price that actually deviates is flagged. A saved line put back
  on Default is stamped with the rules' answer rather than its stored baseline, which may itself have
  been the override.

  To make that comparison exact, `Orders.PriceOrder` now reports, per line, the rule that produced the
  price (`ProductPriceID`) and the engine's default (`Default`: unit price, rule id, rule name) — for
  a pinned line too. `OrderPricingService` gains `IncludeDefaultsForStatedLines`, an opt-in that
  resolves the rules for a stated line without stamping it and reports the answer in `EngineDefaults`;
  the save path does not set it. With the default known by id, the picker no longer lists the rule the
  engine already chose: Default is that rule, named and priced, and a product with one applicable rule
  offers Default and Custom amount alone.

  `PriceOverrideReason` is now required when `PriceOverridden` is set. The order line's `ValidateAsync`
  refuses the save with "Enter a reason for the price override", and the panel marks the explanation
  required and keeps Done disabled until it has text. The rule fires only when the override itself is
  being written — a new line, or a saved one whose price or override fields changed — so lines
  converted from the previous system, which carry overridden prices with no reason, stay loadable and
  editable for everything else. No database constraint; the field's metadata description now says it
  is required when the price is overridden.

### Patch Changes

- 426e730: A discount can be recorded on an order line.

  `OrderLine` has carried `DiscountPct` and `DiscountAmount` since the baseline, the booking entry has
  had a Sales Discounts leg driven by both since the baseline, and `SalesAuthority` has existed to gate
  who may grant one. Nothing in the product could reach any of it: the only control on a line was the
  price picker, and a price override is different economics. An override says the price was different;
  a discount says the list price held and value was given away, and only the second is reportable as
  discounting. The Sales Discounts account could therefore only ever hold figures the Business Central
  conversion put there. That is MemberJunction/bc-aidp-next-golive#252.

  The control is a Discount block inside the price editor, drawn apart from the price picker on
  purpose. It takes a percentage or an amount — one concession expressed two ways, resolved to one
  number by `ManualDiscountAmount` before anything judges it — a mandatory reason, and it shows what is
  left to discount as you type. It writes no discount field. It stages an unsaved row on
  `Order.Adjustments`, which is the channel `OrderEntityServer` already drains at save time, so the
  concession goes through `AuthorizeManualDiscount` and leaves an adjustment row naming the line, the
  reason, the authority that permitted it and any approver. A discount written straight onto the line
  would produce the same number with none of that.

  Four defects in the engine had to be fixed for that channel to work, none of which could surface
  before something used it:

  A discount aimed at ONE line silently became an order-level one. The pricing walk keys lines
  positionally — an unsaved line has no key yet — so a caller naming a real `OrderLine.ID` matched
  nothing, and an unmatched target fell through to the order-level branch and was allocated pro-rata
  across every line on the order. `Orders.PriceOrder` had the same fault by a different route: its
  input names a target by `LineIndex` and passed it through under a field the engine reads as an id.
  Both spellings now resolve, and a line this order does not have is refused rather than widened.

  The preview ignored `DiscountPct` outright. Both pricing paths computed a line's net as
  `gross − DiscountAmount` while `OrderLineEntityServer` and the journal entry apply the percentage, so
  a line carrying one was quoted at a figure the ledger would never book. Converted orders carry that
  field today, so this was live before anything in the product could set it. Both paths now go through
  `NetAfterDiscount`, which is the function the line itself uses.

  A second discount replaced the first. The stamp assigns `DiscountAmount`, which is correct for a run
  that decided every discount on the line and wrong for a manual one that knows only about the new
  request — the stored figure was erased while the earlier adjustment rows survived describing money
  the line no longer showed. The running total is now seeded with what the line already carries, so
  concessions accumulate, and a second one is judged against what is LEFT rather than against the
  original line value. Stacking to a free line one authorized slice at a time is no longer possible.

  A discount larger than the thing it discounts was accepted. It floored the net at zero and, for a
  zero or negative amount, failed at `CK_OrderAdjustment_Amount` — a constraint name, to someone who
  had typed a number. Both are refused with a sentence now.

  A fifth was the header-only shortcut in `OrderEntityServer.Save`, which asks whether the LINES are
  dirty. Staging a request touches no line, so the flow a person actually runs — open a saved draft,
  discount a line, save — skipped the drain, the authorization and the stamp, and handed the staged row
  to the graph as an ordinary related record: an adjustment with no authority, no allocation and no
  change to the line. The shortcut now also asks whether anything is staged. Staged CHARGES had the
  same hole and are covered by the same clause; nothing caught either, because every existing check
  composes an order and confirms it in one go, which always takes the full walk.

  Two things are deliberately not here. Removing a discount that has already been saved needs reversal
  semantics on the adjustment rows and is not in this change — the control removes a staged request
  only. An over-cap discount is blocked on screen rather than escalated, because the approval routing
  it would escalate into is MemberJunction/bc-aidp-next-golive#222 and does not exist yet.

  **This ships inert without data.** `AuthorizeManualDiscount` refuses a user who holds no
  `SalesAuthority`, on the rule that absence is not permission, so the control tells such a user what is
  missing instead of offering a concession the save would refuse. Authority rows for the reps, and one
  `SalesRule` of type `DiscountLimit`, are configuration someone has to create.

- c869137: A confirmed order containing a subscription or membership line can be returned again.

  Service-period inheritance for reversal lines landed separately and is already on `next`; this
  carries the rest of what that defect needs.

  The recognition CADENCE is now inherited too. The window says which months a reversal covers; it
  does not say how they are cut, and that arrived separately through a map built only where terms are
  created — a path a reversal never takes — so it fell back to one month. A quarterly or annual
  subscription therefore unwound into more, smaller releases than it was sold with: the year netted to
  zero while every month inside it was wrong, which no balance check can see. The cadence now comes
  from the `SubscriptionTerm` the origin line bought rather than from the product's current rules, so
  re-pointing a product at a different subscription type cannot restate an outstanding return. This
  half also fixes `Orders.CancelSubscription`, whose reversal lines had the same gap.

  Two further defects on the Return page, both found while tracing the first:

  - Reversal lines were written with a POSITIVE quantity. The sign is the switch the journal entry
    factory reads to decide whether to mirror an entry, so a return booked the sale's entry — debiting
    the customer again for goods coming back — while the document was labelled a credit memo and the
    entitlements were revoked. Every other caller writes it negative.
  - The per-line maximum ignored prior returns, because the page hard-coded them to zero. It now asks
    the new read-only `Orders.GetPriorReturns` operation, which answers from the same rule the server
    refuses an over-return with: reversals sum across orders, and Draft and Voided returns do not
    count. The server always enforced the real cap, so this was a display fault, not a hole.

## 5.14.0

### Minor Changes

- bc6588e: Order Date defaults to today in the business time zone, "overdue" is judged against it, and the
  Orders/Payments dashboards' day bars no longer disagree with themselves (bc-aidp-next-golive#168).

  An order entered at 9 PM Eastern on the 27th was dated the 28th: `new Date()` is an instant and an
  instant serialises in UTC. `OrderDate` now defaults to `TodayAsDateValue()`, the business calendar
  day pinned to UTC midnight, on the entity, in checkout and in the overdue worklist's "as of" default.
  `Today()` and `LocalDay()` in `date-cell.ts` read the zone from bizapps-common's
  `BusinessTimeZoneEngine` instead of the browser. `vwOrderHeaders.IsOverdue` compares `DueDate`
  against `bt.Today` from `fnBusinessToday()` rather than `CAST(GETUTCDATE() AS date)`, and the view
  text is now emitted by `OverdueViewSQL()` with a test that the committed migration matches it.

  That same `LocalDay()` switch from the browser's zone to the business zone exposed a latent bug in
  the Orders and Payments dashboards: each "last 7 days" bar chart keyed its bars by business day but
  labelled them with the viewer's own local weekday, so a viewer sitting in a different zone than the
  business one saw a bar labelled with one day counting another day's rows. Both dashboards now build
  their bars with a shared `BuildDayBars` helper that derives the label from the same calendar-day key
  used to filter, so the two cannot diverge.

  Requires `@mj-biz-apps/common-entities` 5.43.0.

- 2ce84d1: Expands EventProduct with EventFormat and VirtualMeetingUrl, and expands EventOrderLine with AttendanceStatus, Badge tracking/overrides, TicketTier, TableAssignment, SpecialRequests, and CheckInNotes.
- e1f4e15: Let an order line state a GL dimension, and carry it down to the journal entry.

  `OrderJournalEntryFactory` has ridden dimension tags onto every journal entry line an order line
  produces since the baseline — the AR debit, the revenue or deferred credit, the discount debit, each
  charge and tax credit, and both legs of every recognition release. But nothing ever tagged an order
  line, so every order-originated entry reached the ledger carrying none, silently and permanently:
  the line freezes once `JournalEntryID` is stamped (MemberJunction/bc-aidp-next-golive#236).

  `OrderLine` gains nullable `DimensionID` and `DimensionValueID`, both foreign-keyed into
  `__mj_BizAppsAccounting`. Both, not one: a dimension names the axis and the value names the point on
  it, and a journal entry line's tag is the pair — so a dimension id alone could not be passed down.
  `CK_OrderLine_DimensionPair` makes "both or neither" a database rule, and
  `OrderLineEntityServer.ValidateAsync` reports it in words before the constraint has to.

  A details button on each line card opens a slide-in panel holding the two pickers, with values read
  from accounting as they stand on the order's own date — `DimensionValue` is effective-dated, and a
  back-dated order has to offer the values that were live when it was placed. Changing the dimension
  clears the value, because a value belongs to exactly one axis. A booked line shows its tag
  read-only.

  The factory now merges the line's column tag with any `OrderLineDimension` child rows, with the
  column winning on its own axis: accounting refuses a journal entry line tagged twice on one
  dimension, so a conflict would otherwise fail the whole booking rather than show itself.

  Three migrations, and none is optional: the columns, then the CodeGen output for them (EntityField
  registrations, the rebuilt `vwOrderLines`, `spCreateOrderLine` and `spUpdateOrderLine`, and the
  rebuilt `vwEventOrderLines` for the IS-A child). A host's `mj.config.cjs` carries this app's schema
  in `excludeSchemas`, so `mj codegen` on a host will register the fields in metadata but will not
  rebuild the view or the procedures — leaving an entity that declares fields its base view cannot
  produce, which reads as "no data" rather than an error.

  Note the shape this fixes and the shape it does not: one tag per line means a revenue line can be
  filed under Venture **or** Product **or** ARR-Type, not all of them. The chart-of-accounts design
  asks for five axes on a revenue line.

## 5.13.0

### Minor Changes

- 92f7e68: Order lines can now be frozen by the app that owns the record they were derived from.

  A line saved through a grid is validated by Orders' own rules and nothing else. Orders knows that a
  booked order takes corrections through reversal orders; what it cannot know is that some other app
  has a reason of its own to freeze the line.

  The case that prompted this (bc-aidp-next-golive#206 item 1): Sales closes a deal, the deal locks
  because a contract was derived from its terms, and the order's lines are exactly what that contract
  was derived from. A tester added a line to a Won deal through the "What's being sold" grid and it
  saved, because the deal's lock only runs when the DEAL is saved.

  **A seam rather than a lookup.** The obvious fix is for the order line to look up the deal. It is the
  wrong one: this package does not depend on Sales, and Sales depends on it. Reaching for
  `MJ_BizApps_Sales: Deals` here would invert the dependency chain and bake one consuming app's concept
  into the app every other consumer builds on. So Orders asks — `RegisterOrderLineEditVeto` — and the
  app with the stake answers.

  **Creates, updates AND deletes.** `refuseNewLineOnBookedOrder` returns early on `IsSaved`, because
  Orders' own booked rule is about adding to a booked order. A deal lock is not: a line that already
  exists is what the contract was derived from, so changing it after the close is the damaging case.
  `Delete()` never calls `ValidateAsync`, so it is overridden too — otherwise the grid's delete button
  would be the one way through a lock that refuses everything else, and deleting that line is the worst
  of the three, not the least.

  **A vetoer that throws has REFUSED.** Letting the exception escape would surface as an unhandled
  error on a grid; swallowing it and allowing the edit would let a frozen line change because the thing
  guarding it was briefly unreachable. Both paths resolve through one function so that case cannot be
  written correctly in one place and backwards in the other, and the refusal names the fault and says
  what did not happen.

  The registry is empty by default, so a host that does not run Sales pays nothing and refuses nothing.

  **Nothing registers into it yet, and that is why this merges first.** Sales resolves
  `orders-entities` from npm, so the Sales side cannot call `RegisterOrderLineEditVeto` until this has
  shipped. Inert on every host until it does; golive#206 item 1 is not closed until Sales registers one.

  **Orders own writes go past the check.** It is asked on every save of a line, and Orders saves lines
  constantly after a deal is won — fulfilment, the journal entry id once the order books, bundle
  quantity ripples, the reversal line on a subscription cancel. The vetoer is handed an order id, a
  line id and create/update/delete, so it cannot tell those from a person typing in a grid; the
  distinction is made where it is known, by `MarkAsOrdersOwnWrite`. The deal close itself was never
  affected, because the deal server confirms the order before writing the Won status — everything
  after the close would have been.

  **The WHOLE-ORDER path is scoped to booking, not exempted.** A line reaches the database two ways: on
  its own, which is what the deal form's grid does, and as part of the order graph, header and lines
  together, which is what the deal workspace does. An earlier revision set the bypass unconditionally in
  the graph loops, on the reasoning that it belongs wherever `BypassBookedCheck` is set. That put the
  reported defect back on a different screen: the grid refused a line on a Won deal while the workspace
  saved the whole order and was never asked. The two flags part company there — `BypassBookedCheck`
  means "the header already ran the booked rule", which is true, and `BypassExternalEditVeto` means
  "this write is Orders' own", which that loop cannot claim, since it runs on any header save with dirty
  lines. It is now `this.bookingInFlight`: booking is Orders confirming its own order, and nothing at the
  header level runs the external veto. `deleteRemovedLines` gets the same treatment — it set no bypass
  at all, so a veto during a booking-time removal would have refused the close that creates the record
  being protected.

  **THE VETO IS ASKED ONCE PER LINE, and a vetoer that reads the database has to expect that.**
  Every line save asks, so one order-graph save of a five-line order consults it six times (measured, not reasoned). A fifty-line order asks fifty times. That is the right shape — each
  line is a separate write and a vetoer is entitled to answer differently per line — but it means an
  implementation that looks a record up per call will issue one query per line. The context carries
  `OrderHeaderID`, which is the natural key to cache on for the life of a request. Written down here
  because it is an expectation on the CONSUMER that no signature expresses.

  **The vetoer is handed a user.** It has to read something to answer, and on the server that read
  needs one. It matters more than usual because the seam fails closed: a vetoer that throws for want of
  a user would refuse every line edit on every order.

  29 tests. Six of them drive `OrderLineEntityServer` itself rather than the registry, which is how a
  refused DELETE was found to throw instead of refusing: it assigned onto `LatestResult`, and core
  returns null from that getter on an entity that was loaded and never saved — while typing it
  non-null, so nothing caught it.

  All three graph loops are covered, not just the one the defect was reported on. The save loop and the
  removal loop are each driven for real, in both directions; the subscription loop is held by a
  structural check, because reaching it needs a provider, a user and a decisions map, which would test
  the harness rather than the rule. That check asserts the one property all three share and any fourth
  loop would inherit: the bypass is never assigned unconditionally, which is the exact shape of the
  defect found in review.

  Writing those turned up a write this description was already claiming: the journal entry id, stamped
  once the order books. `resolveOrderLineForStamp` walks UP the IS-A chain, so what gets saved is the
  parent Order Line of an Event or Subscription line — an object no graph loop has touched, as is a line
  loaded fresh because it was not in `this.Lines`. Nothing refuses it today, since Sales confirms the
  order before writing the Won status and the freeze is not yet in place, but that is an ordering in
  another repository and this write has no reason to depend on it. It is marked now, and driven.

  Each of the six mutants — one per loop, dropping and inverting the removal loop's assignment, and
  unmarking the stamp — fails the suite.

## 5.12.2

## 5.12.1

## 5.12.0

### Minor Changes

- b8b2131: Fix PaymentLines query to use vwPaymentLines view with user permissions, expose \_mj**Latitude / \_mj**Longitude in GraphQL schema, and forward-heal Event Products IS-A parent fields.
- e9bf1f9: Forward-heal missing EntityField registrations for Price Tiers (ProductPrice) and Product Categories (RootParentProductCategoryID, ParentProductCategoryIDDepth, ParentProductCategoryIDPath, ParentProductCategoryIDIsLeaf, ParentProductCategoryIDChildCount).
- ecbfe69: Support prospective subtype resolution with SubtypeSelector and EnsureISAChild for OrderLine extension entities.

## 5.11.0

### Minor Changes

- a6ad8c5: `V202609061900` could not apply on any host but the one it was generated from.

  The migration seeds five `EntityFieldValue` rows for `OrderLine.FulfillmentStatus` against a
  hardcoded `EntityFieldID` — `F04330BA-4A37-4674-A2FE-237CE04E2C52`. CodeGen mints EntityField
  IDs per host, so that GUID exists only on the authoring database. Everywhere else the insert
  hits `FK_EntityFieldValue_EntityField` and aborts the whole migration at batch 8 of 233,
  taking the rest of the 5.10.0 upgrade with it — and, because `mj app upgrade` resolves
  dependencies to latest, blocking every app that depends on orders too.

  The field is now resolved by natural key (`Entity.BaseTable = 'OrderLine'` +
  `EntityField.Name = 'FulfillmentStatus'`), with a `THROW` if it is genuinely absent rather
  than a silent no-op. Each of the five values is guarded independently on
  `(EntityFieldID, Value)`, so a host that already carries some of them keeps its own rows and
  IDs and only gains the missing ones — an install that had Fulfilled/Pending/Returned gains
  NotApplicable and PartiallyFulfilled and nothing else moves.

  The file is edited in place rather than superseded: it has never applied successfully
  anywhere except the authoring database, so no host carries a checksum for it.

## 5.10.0

### Minor Changes

- 76b3d3e: Forward CodeGen remainder for V202609031400 (ProductPrice.Name / ProductCategoryID / Applicability). That file added the columns and SPs but omitted EntityField inserts. Recaptured on a clean DB with includeSchemas limited to \_\_mj_BizAppsOrders; the migration is the full SQL log, not a subset.

## 5.9.0

### Minor Changes

- e121d98: Rebuild `vwEventOrderLines` so Event Order Lines can be read again.

  `EventOrderLine` IS-A `OrderLine`, and its base view lists every inherited column explicitly.
  5.7.0 added `PriceOverridden` / `PriceOverrideReason` to `OrderLine` and rebuilt `vwOrderLines`,
  but nothing rebuilt the **child** IS-A view — so it still carried the pre-5.7.0 parent column list.

  CodeGen cannot heal this: a host's `mj.config.cjs` carries this app's schema in `excludeSchemas`
  (written back on every `mj app install`/`upgrade`), because the BizApps apps own their own views.
  So CodeGen registers the inherited fields on the child entity and then reports them as unreadable.

  The failure is quiet, which is the dangerous part: every read of the entity fails with
  "column … does not exist", and a grid renders that as **"no data"** rather than an error — Event
  Order Lines looks empty while its table is full.

  `vwEventOrderLines` is the only IS-A child of `OrderLine` in this schema, verified against a live
  database where these were the only two unreadable fields across every `__mj_BizApps*` entity.

## 5.8.0

### Minor Changes

- 2981938: Stop the PriceOverride metadata seed hard-coding EntityField `Sequence`.

  `V202609041600` inserted `PriceOverridden` and `PriceOverrideReason` at Sequence **43** and **44** —
  whatever happened to be free on the authoring database. On AIDP stage 42/43/44 are held by
  `ParentOrderLineIDPath`, `ParentOrderLineIDIsLeaf` and `ParentOrderLineIDChildCount`: CodeGen
  hierarchy virtuals, which exist per host depending on schema shape. The insert hit
  `UQ_EntityField_EntityID_Sequence` and the 5.7.0 upgrade stopped at batch 1/10, taking sales down
  with it as a dependent.

  Both values are now `MAX(Sequence) + 1`, evaluated per host. The two inserts are separate
  statements, so the second sees the first.

## 5.7.0

### Minor Changes

- bbb5171: OrdersEngine now caches Products, Product Prices, Product Categories, Product Types, Subscription Types, and Revenue Recognition Types (@RegisterForStartup). Confirm, pricing, checkout, fulfilment, and the catalog picker read those arrays instead of per-call RunView. Confirm looks up rev-rec types by normalized ID and inherits ProductType.DefaultRevenueRecognitionTypeID when the product left it blank. GL Account Roles stay on AccountingEngineBase; booking no longer force-refreshes that cache. Confirm also inherits ProductType.DefaultSubscriptionTypeID when the product left SubscriptionTypeID blank. `@mj-biz-apps/accounting-engine-base` is a real dependency of orders-core-entities-server (static import, declared in package.json), not a peer. Local filter-eval helpers are PascalCase (`EvaluateFilter`, `IsCompositeFilter`, `ParseFilterField`). Order-line price override is a pencil that expands a named-price picker (custom amount only when Custom is selected) plus Override Explanation when the price diverges from default. OrderLine gains PriceOverridden and PriceOverrideReason. Ship/bill addresses bind AddressID from the party; custom addresses can be linked onto the person/org profile.
- bb9a5f2: Ship the three price-override Authorizations to hosts.

  `metadata/authorizations/.price-override.json` declares `MJ.BizApps.Orders.Price.Override` and its
  two children, but metadata is a dev-time source — the install engine never reads that directory, so
  records reach a host only through a migration. Without one the price-override permission checks
  would find no authorization to test against anywhere but the developer's own database, and
  `scripts/check-release-seed-coverage.mjs` blocked the release saying exactly that.

  The seed guards on **ID or Name**, because `__mj.Authorization` carries `UQ_Authorization` on
  `Name`: on a host that created these via `mj sync push`, MJ assigned its own IDs, so an ID-only
  guard passes and the insert then trips the unique constraint. The children resolve their parent by
  name rather than by the literal ID for the same reason.

### Patch Changes

- a436049: License declarations now agree on BUSL-1.1 everywhere.

  The manifest was corrected earlier; the README badge still advertised ISC, which is the
  first license statement a reader meets and outranked `LICENSE`, `package.json`,
  `mj-app.json` and every workspace package in practice. The badge now reads BUSL-1.1 and
  links to `LICENSE`.

- 4dfa35c: Unbreak the build: `FieldIsDirty` was called but never defined.

  `next` has not compiled since #155. Nine call sites across Entities and Angular call
  `BaseEntity.FieldIsDirty(...)`, which **does not exist in MemberJunction** — a code search across
  the whole MJ repo finds nothing, and 6.1.0-edge.5 is the newest edge. `orders-entities` failed to
  compile, which cascaded into `orders-core-entities-server` as dozens of "has no exported member"
  errors.

  Adds `anyFieldIsDirty(entity, names)` over MJ's real API (`GetFieldByName(name)?.Dirty`) and a
  `FieldIsDirty(...names)` method on `OrderLineEntity` and `OrderHeaderEntity`. Call sites holding a
  _generated_ entity type — `Lines.Items`, and the Angular services — go through the helper directly,
  since the generated class has no such method.

  Also fixes two unrelated breaks in the same run: `Products$`/`ProductPrices$` had no explicit
  return type, so TypeScript could not name the inferred `Observable` (TS2742) — `rxjs` is now a
  declared dependency rather than a transitive one — and `CreateEmptyFilter` was imported with the
  wrong casing (`createEmptyFilter`).

## 5.6.0

## 5.5.0

### Minor Changes

- 24f8625: Stop the Metadata_Sync seed from writing host-owned user rows, and guard the rest by natural key.

  The generated seed contained two `spCreateUserApplication` calls for specific developer accounts.
  `UserApplication` is not declared as metadata by this app — there is no `metadata/user-applications`
  directory and `metadata/applications/.mj-sync.json` declares no related entity for it. It was
  captured incidentally by the SQL log that generated the file, because the shared user views in
  `metadata/user-views/` hardcode an owning `UserID`. MJ creates `UserApplication` itself when a user
  is granted an application, so seeding it forced one deployment's user nav onto every other host and
  collided with the row the host had already made under its own ID. Those two statements are removed.

  The remaining creates are guarded on `[ID]` **or** the table's natural key, generated from the live
  unique-constraint definitions (including the filter predicate for the six filtered indexes). A host
  that acquired a row under a different ID is now skipped rather than colliding. No error is
  swallowed: a genuine failure still aborts the migration.

## 5.4.0

### Minor Changes

- d29cc6c: Make the Metadata_Sync migration idempotent — it cannot upgrade a host that ever ran `mj sync push`.

  `V202609020400__v5.3.x__Metadata_Sync.sql` fails on the first record against any database that already
  holds this app's metadata:

  ```
  Migration failed for schema '__mj_BizAppsOrders': Failed at batch 1/248 (lines 1-83):
  Violation of PRIMARY KEY constraint 'PK_RevenueRecognitionType'.
  The duplicate key value is (a1d4e7b0-3c62-4f85-9a17-2b3c4d5e6f01).
  ```

  That is not a hypothetical. It is what an upgrade hits on AIDP stage, where **78 of the 91 declared
  metadata primaryKeys already exist** because somebody ran `mj sync push` against that database
  directly — the stopgap `docs/database-migrations.md` explicitly sanctions ("If a consumer needs it
  sooner, a one-off `mj sync push` against the target environment bridges the gap"). The seed was
  generated against a clean database, so every `spCreate*` is an unguarded INSERT.

  Neither skipping nor deleting works: skipping leaves the 13 genuinely-missing rows uncreated, and the
  78 that exist include `ProductType` / `PaymentType` rows that live order data references by FK.

  All **154** `spCreate*` calls are now wrapped:

  ```sql
  IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[RevenueRecognitionType] WHERE [ID] = @ID_83a57164)
  EXEC [${flyway:defaultSchema}].spCreateRevenueRecognitionType @ID = @ID_83a57164, ...
  ```

  so the migration creates what is missing and steps over what is already there. The 93 `spUpdate*` calls
  are untouched — they target rows CodeGen already made and are naturally re-runnable.

  Verified both directions on SQL Server 2022 with MJ core v6.1.0-edge.5:

  - **Existing metadata** (the AIDP case, colliding ID present): applies cleanly, and twice more, with
    row counts unchanged.
  - **Fresh install** (core 69 + common 22 + tasks 7 + accounting 8 + orders 16): still seeds everything
    — Application 1, Remote Operations 44, ProductType 11, PaymentType 11, both party-order queries.
    Release seed coverage still passes.

  Minor, not patch: this repo requires a minor-or-higher bump for any change under `migrations/`
  (`changes_and_migrations` enforces it), and the rule holds here — on a host that took the sanctioned
  `mj sync push` shortcut this migration now _does_ something it previously could not, creating the rows
  that were missing. On a fresh install its effect is unchanged.

## 5.3.0

### Minor Changes

- 406bcaa: First `Metadata_Sync` migration for bizapps-orders — the app's seed metadata now actually ships.

  `bizapps-orders` has never had one. `plans/entitlement-read-contract.md` said so outright: *"There is
  no `*Metadata_Sync*.sql`in`migrations/`, and no migration inserts a `RemoteOperation` row."* Since
  `mj-app.json`'s `metadata.directory` is a dev-time pointer the install engine never reads, and
  `mj app install` applies migrations and nothing else, all 25 directories under `metadata/` shipped
  nowhere: a clean install produced every table, view and CRUD proc, and no Application row, no Actions,
  no Remote Operations, and none of the seeded lookups — with every install step reporting success.

  `V202609020400__v5.3.x__Metadata_Sync.sql` carries 279 records (134 created, 93 updated, 0 errors),
  generated by `mj sync push --dir metadata --ci` against a database built from migrations only —
  MJ core v6.1.0-edge.5, common, tasks, accounting, then this app.

  Also fixes `metadata/.mj-sync.json`'s `directoryOrder`, which omitted every category directory. With
  `queries` sorting before `query-categories`, the push aborted on
  `Lookup failed: No record found in 'MJ: Query Categories' where Name='Orders'` — so the seed could not
  be generated at all until the order was corrected.

  Minor, not patch: this release carries a migration.

### Patch Changes

- 4fcc102: Move to MJ `6.1.0-edge.5`, and raise the cross-repo dependency floors that were resolving to ancient releases.

  69 `@memberjunction/*` pins move `^6.1.0-edge.4` → `^6.1.0-edge.5`.

  **The floors are the real fix.** `@mj-biz-apps/accounting-*` was declared `>=0.1.0`, and as a _peer_
  dependency pnpm resolved it to the lowest satisfying version — `accounting-server@0.1.0`, whose own MJ
  dependencies are `edge.3`. So a tree that declared edge.5 everywhere still pulled **48** MJ packages at
  edge.2/3/4 through one ancient sibling. `@mj-biz-apps/tasks-entities` was worse: pinned **exactly** at
  `1.2.3`.

  Floors now match what is actually published, which is the convention this repo already stated when it
  moved to edge.4 ("app dependency floors to the latest releases, read from npm at cut time"):

  |                                 | was                       | now        |
  | ------------------------------- | ------------------------- | ---------- |
  | `accounting-*`                  | `>=0.1.0`                 | `>=0.5.0`  |
  | `common-entities` / `common-ng` | `>=0.1.0`, `>=5.35.0`     | `>=5.37.0` |
  | `tasks-entities`                | `1.2.3` (exact), `^1.2.3` | `>=1.4.1`  |

  Verified after a clean install: `accounting-actions` resolves 0.5.0 (was 0.1.0), a single
  `@memberjunction/core` at edge.5, build 6/6, and 1441 unit tests passing.

  Some MJ packages still resolve at edge.3/4 through `common-ng@5.37.0` and `accounting-*@0.5.0`, which
  are themselves published against older edges. That clears when those repos republish — their edge.5
  bumps are open alongside this one.

## 5.2.1

## 5.2.0

### Minor Changes

- 2daf9b9: Fold inspected CodeGen output into a new migration so CRUD procedures and EntityField rows match columns added by later V migrations (PricingDriverClass, ProductType.Configuration, and related). A clean install was failing mj sync push of product-types on a stale spCreateProductType signature.
- 94af4e5: Platform floor to MJ 6.1.0-edge.4 and app dependency floors to the latest
  releases, read from npm at cut time: bizapps-common >=5.36.0,
  bizapps-accounting >=0.4.0, bizapps-tasks >=1.4.0. Every @memberjunction/\*
  dependency now pins ^6.1.0-edge.4 — caret, never exact: orders-ng's exact
  ng-hierarchy-tree pin forced two MJ copies into consumers' Explorer trees and
  split the ClassFactory registry (consumers carried a root override to undo it).
- d0e5450: Scope CodeGen heal EXECs with authored excludeSchemas plus `@IncludedSchemaNames` for the Orders schema, instead of photographing sibling Open Apps. Strip Common Activity Types field inserts and the unscoped field-from-schema heal that broke from-scratch migrate.

### Patch Changes

- e21ad46: Host the Angular checkout widget as an Angular Element on `GET /checkout/:slug`, retrieve Stripe intent status on complete (localhost has no webhook), skip a second confirmCardPayment when the intent already succeeded, and book `Orders.CapturePayment` after confirm so AmountPaid / PaymentHeader land without waiting for Stripe to POST. Stripe Capture treats an already-captured automatic-capture intent as success.
- 07e0b10: Checkout hardening wave: fix the blocking defects and ship the anonymous edge.

  Defect fixes in CheckoutSessionService:

  - The payer Person is now resolved (find-or-create by the session's captured email) at
    completion and stamped onto the session and the order's BillTo/ShipTo — previously every
    widget order failed OrderHeaderEntity.Validate() with no customer.
  - A session acquires a payment intent through the new OpenPaymentIntentForSession (amount
    from the session's server-priced snapshot, provider from the widget's Configuration
    paymentProviderId); the completion gate now verifies the intent's STATE (Succeeded, as
    advanced by the signature-verified webhook) and that its amount covers the re-priced
    total — mere existence of an intent id no longer books an order.
  - The GuestOrder claim mint uses the real IdentityClaimEngineServer import (the previous
    MJGlobal.ClassRegistry duck-type was dead code) and passes the entity GUID.
  - EntitlementGrantClaimDriver.OnRevoke stamps RevokedAt + RevocationReason (the generated
    validation rule rejected Revoked-without-RevokedAt, so revocations silently no-oped) and
    failures are logged instead of swallowed; OnExpire logs failed saves.

  Session hardening:

  - ClientSessionKey is re-verified (constant-time) on every mutating call; ExpiresAt is
    enforced past initialization (expired sessions transition to Expired); completion is
    replay-safe (a Confirmed session returns its existing order) and never reverts to Open
    once the order has committed; server-side quantity/line caps apply when unconfigured;
    hand-rolled SQL escaping replaced with the sql-guards helpers; secret-shaped keys are
    stripped from the Configuration returned to anonymous callers; Person rows are no longer
    minted on the draft path; the platform-specific GETUTCDATE() filter is now portable.

  The anonymous checkout edge (new):

  - CheckoutServerExtension (DriverClass 'OrdersCheckoutEdge') mounts pre-auth REST routes
    POST /checkout/{initialize,draft,payment-intent,complete} via the serverExtensions
    mechanism, with fail-closed gates: body cap, per-IP(+slug) rate limiting, per-widget
    origin allowlist (Configuration.allowedOrigins) with scoped CORS grants, and optional
    Cloudflare Turnstile (Configuration.requireTurnstile + Settings.TurnstileSecretEnvVar).
    Writes run as the configured ServiceUserEmail principal (system-user fallback). The
    claim-driver Load anchors are now called from LoadBizAppsOrdersServer so the drivers
    survive tree-shaking.

- c490929: Checkout follow-up from the #115/#116 security review: fail-closed open catalog without widget CompanyID; do not serve the element source map on the public payment route unless opted in; book CapturePayment from payment_intent.succeeded (including AlreadyApplied retries); require a CSP nonce on the host page renderer.
- 8ad33a8: Route `Orders.PreviewPrice` through `OrderPricingService` (the same walk save and `Orders.PriceOrder` use) instead of calling `ResolvePrice` directly. Price resolution now loads rules from every in-force list assigned to the customer, so a member list cannot lose to catalog `BCP-STD` when both assignments are Priority 0.

## 5.1.0

### Minor Changes

- c094b64: Add `CustomerPaymentTerms` — the terms a particular buyer negotiated

  Date-effective and optionally scoped to one selling company, keyed on organization or person the way
  `CustomerTaxExemption` and `CustomerPaymentMethod` already are. Not an IS-A extension of
  `AccountingCompanyProfile`: that profile IS-A `Company` and describes the SELLER, whereas a buyer
  here is an Organization or a Person — there is nothing to extend.

  Seeds the six standard `PaymentTermsType` rows the walk resolves against; the table had none.

- e468e73: Event Order Line attendee is a required Person. Organizer notes, collapsed embeds, Confirm as a verb, Check/ACH reference on the Payment tab, and Product.MaxQuantityPerLine (event tickets seed to 1 — more people means more lines).
- a09b96c: Person and Organization Orders/Payments/Subscriptions use L1 inclusion. Orders is one section over Bill-To OR Ship-To. Stored payment methods sit in More; tax exemptions, entitlements, intents, price-list assignments, promo codes, and stored value are None.
- be5005a: Payment Headers reversing-payment self-join is None, matching Order Headers.ReversesOrderHeaderID. Payments and Subscriptions already use left-nav; Order Headers stay on the custom compose form.
- 0ff52d7: Punch Bill-To Orders, Bill-To Payments, and held/beneficiary Subscriptions as FormRole Primary on People and Organizations so those grids stay first-class when the parent form's smart ranker folds the rest into More. DisplayName is Orders / Payments. Line-level Order Lines and Event Order Lines are DisplayInForm=false on Person and Org forms.
- 7d04b06: Upgrade MemberJunction from 5.50 to 6.1.0-edge.1, and declare four dependencies that were resolving
  by accident.

  The upgrade itself is clean: none of the APIs removed in 6.x — `BeginISATransaction` /
  `CommitISATransaction` / `RollbackISATransaction`, `BaseEntity.ProviderTransaction`,
  `PropagateTransactionToParents()` — had a single call site here. The 21 `BeginTransaction()` sites
  use the depth-counted primitive that survives and is now what IS-A chains use too.

  All five repos move together because `BaseEntity` became generic in 6.x (`BaseEntity<unknown>`), so
  a package still on 5.x consuming an entity class built against 6.x fails to compile.

  **Four undeclared dependencies surfaced**, each previously satisfied by a stale repo-level
  `node_modules` left over from a pre-workspace `npm install`. Once that hoisting was removed they
  stopped resolving, which is the correct behaviour and would have broken any standalone consumer too:

  - `@memberjunction/actions`, `@memberjunction/actions-base` and `@memberjunction/templates` are
    imported by `packages/Server` (the invoice, payment-intent and send-document actions) and were
    declared nowhere. Added as peer dependencies, matching that package's convention for MJ packages.
  - `@angular/cdk` is imported by the workspace tab strip in `packages/Angular` and was declared
    nowhere. Added as a peer at the `>=21.0.0 <22.0.0` range the rest of the workspace uses.

  Also declares `vitest` at the repo root, where `vitest.config.ts` lives. It was declared only in
  individual packages, so the repo-wide suite could not be launched from the root.

  Verified: 31 packages build clean, and the full unit suite passes — 39 files, 1062 tests.

- be5bcde: Commit ORD-WORLD as the shared integration catalog, and seed Product Types as app metadata.

  The suite no longer fabricates `IT-ORD-*` companies, people, or products on every bundle. ORD-00
  loads a CSV world through BaseEntity (Blue Cypress Press, Harbor House, Orphan Ledger; eight
  customer orgs; ~33 people; priced catalog) and later bundles book against it inside rolled-back
  transactions. Types (Product Type, Charge Type, Rev Rec, Subscription, Payment) are looked up from
  `metadata/`, never created by the fixture. Fast Entry hides leftover `IT-ORD-*` rows so they cannot
  show up as unpriced picks.

- c094b64: Resolve and store `OrderHeader.DueDate` from payment terms (D83)

  Nothing derived a due date. `DueDate` was only ever what a caller passed, `PaymentTermsType` had no
  rows, and `Orders.GetOverdueWorklist` returned zero rows against 67 orders carrying an unpaid
  balance — a collections screen reporting a quiet afternoon because its only input was null on every
  row.

  Adds a resolution walk (the third of this shape after GL accounts and price): stated `DueDate` →
  stated `PaymentTermsTypeID` → the buyer's `CustomerPaymentTerms` → the selling company's
  `AccountingCompanyProfile.DefaultPaymentTermsTypeID` (which existed and nothing read) → due on
  receipt. Resolved once at confirm and STORED, so aging, the worklist and the invoice all read one
  date instead of deriving three.

  Terms are deliberately not per-product: they are a property of the deal, and an order carrying a
  Net 30 and a Net 60 product has no coherent answer.

- 54b33f0: The custom Order Header form can collapse to customer + date + money so a large order gives its lines the vertical space. The expanded/collapsed preference lives in UserInfoEngine and applies only when opening an existing order — a new record always starts expanded. Leftover related (charges, adjustments, payment intents/lines) are inclusion None because the custom form already owns those surfaces.
- f4df491: Ship-to and bill-to on the order header can both collapse. Street addresses are owner-held embeds of Common Address (orphan on clear) and edit inline instead of a bare FK textbox.
- 78ae16a: Lift the pricing walk out of `OrderEntityServer` into `OrderPricingService`, and expose it as
  `Orders.PriceOrder` so a whole order can be priced without saving it.

  The walk — resolve each line's price, then promotions, then charges, then tax — was private methods
  on the entity reading its own fields. That meant the UI could not ask what an order would cost
  without saving one, and `Orders.PreviewPrice` could only answer for a single line, which its own
  description admits is advisory: promotions stack against ORDER totals, charges apportion ACROSS
  lines, and tax computes on the discounted amount.

  Now one implementation with two callers. `OrderEntityServer.Save()` prices before it persists;
  `Orders.PriceOrder` prices and persists nothing. The operation's input mirrors the entity shape
  rather than being a DTO, so the object the client prices is the object it later saves.

  Also adds section mapping to `OrderHeaderEntity` — which editing section a validation failure belongs
  to. Metadata-only logic, so the browser gets it without a round trip.

- c094b64: Enforce the order lifecycle: guard illegal status transitions in `OrderEntityServer.Save`

  `CK_OrderHeader_Status` enforced the legal SET of statuses and nothing enforced the legal MOVES.
  `Fulfilled → Draft` saved. `Voided → Confirmed` saved — a voided order could come back to life,
  keep the journal entries its reversal had already unwound, and be shipped, with every row valid and
  the constraint satisfied.

  New `OrderStatusBehavior` owns the transition table and the predicates six modules previously spelled
  out as ad-hoc string sets that had drifted apart (one of them guarded against `Cancelled`/`Canceled`,
  which are not legal order statuses at all). The guard runs in `Save`, the one path every write goes
  through, and refuses with a reason rather than a bare `false`.

- 6e6ec69: `PricingDriverClass` on Product, ProductCategory, ProductType and OrderCompanyPolicy, plus `ResolvePricingDriver` — the four-level walk that answers whether a given product prices from metadata alone or needs a server-side `BasePriceResolver` plugin. This is the seam client-side pricing needs: the metadata walk can run in the browser, a plugin cannot, and the client has to know which it is facing WITHOUT asking the server or the round trip defeats the point. Every uncertain case — a read that fails, a product that does not exist, an id that is not a UUID — resolves to ESCALATE, because escalating costs a round trip nobody notices while guessing costs a wrong price on screen that corrects itself at confirm.
- 49d9ef3: Promotion codes, charges and manual discounts can reach the engine from a browser again. They were transient arrays only the server could fill, so when `OrderDraft` was deleted the wire went with it: a code or a charge entered on screen was priced into the preview and then silently dropped at confirm, and the customer was billed a number the screen never showed. Charges and adjustments are now related-record collections — a client stages the row it is asking for and the engine completes it — and promotion codes are an `EntityCompanion`, because a code has no child row of its own and only the engine can turn one into an `OrderAdjustment`. Also fixes `ORDER_ENTITY = 'MJ_BizApps_Orders: Orders'`, an entity name that does not exist, used by every new-order and open-order path in the workspace. `MJOOrderEntryService` is now `MJOPricingScheduler` and holds only the debounce and the out-of-order guard; `SaveOrThrow`, `Confirm` and `LoadWithLines` moved onto `OrderHeaderEntity` where a non-Angular host can reach them.
- 6e8eba0: The pricing engine moves into the browser-safe package and the price strip runs it locally. `OrderPricingService`, `PriceResolver`, `PromotionEngine`, `TaxResolver`, `ChargeEngine`, `OrdersEngine` and the three behaviour modules — 3,716 lines — always could run on either tier: they use `RunView`, `IMetadataProvider` and `MJGlobal` and nothing else. They sat in the server package by convention, and that convention was the only thing making a price preview cost a round trip. An order with no promotion code and no custom pricing plugin now prices with no server call at all, from the SAME code the booking walk runs. Anything a plugin decides, or any promotion code, escalates to `Orders.PriceOrder` — plugins are server-side code the browser's class factory does not have, and redemption caps change with orders other people are placing.
- 389a381: Move order lines onto an MJ 6.1 related-record collection, and split the order rules across the two
  tiers.

  `Lines` is now declared as `EntityRelationship.RelatedRecordCollection` metadata, so CodeGen emits a
  typed accessor onto the GENERATED entity class and both tiers have it. That replaces a `_lines`
  array with a getter/setter pair that existed only on the server, and it is what lets the browser
  compose an order and ship the whole graph in one call.

  Adds `OrderHeaderEntity`, a shared client+server subclass holding every rule decidable without the
  database — the status-transition guard, the must-have-a-payer rule and the must-have-something-to-book
  rule — so the browser refuses those before a round trip and every other caller still gets them.
  `OrderStatusBehavior` moved down to the entities package with it (it was pure, with zero imports).

  Also fixes a cross-repo break: `AccountingCompanyProfile.DefaultPaymentTermsTypeID` was removed by
  bizapps-accounting (their issue #22, on the correct grounds that payment terms are an orders
  concern), and orders kept reading it — so every order whose customer had no negotiated terms failed
  the company-default step of the due-date walk. The column now lives on `OrderCompanyPolicy`.

  `ExpectedGrossTotal` on `Orders.ConfirmOrder` is now enforced. It was accepted and read by nothing.

- b6031e2: Remove `OrderDraft` and the four remote operations that existed only to carry it. `Orders.SaveOrder`, `Orders.ConfirmOrder`, `Orders.PreviewOrder` and `Orders.PreviewConfirm` are gone — composing and booking an order is `order.Save()` through MJ 6.1's entity graph, and pricing without writing is `Orders.PriceOrder`. `Orders.CreateOrderInState` is renamed to `Orders.AdvanceOrderState` and now takes an `OrderHeaderID`: it starts where the save finishes, and refuses an order that never booked rather than producing one that reads Fulfilled with no ledger behind it. A migration deletes the retired operation rows, because `mj sync push` only reconciles rows it is given and would leave them Active with no code behind them.
- c094b64: Retire `RevenueRecognitionSchedule`, `RevRecScheduleLine` and `OrderLine.RevenueRecognitionScheduleID` (D84)

  Kept as "the computed envelope for MRR/ARR display and the computation trail", and never written by
  anything — 14 lines in the review seed carry a deferred recognition type and none had a schedule.

  Both purposes are already served by what recognition actually produces. The releases ARE a schedule:
  forward-dated, balanced and queryable in `JournalEntry`/`JournalEntryLine`, and the trail is those
  entries plus `OrderLinePriceComponent`. A second copy of the same facts is free to drift, and empty
  tables that look authoritative are worse than absent ones — a report writer finds them and assumes
  they are the source of truth. Forecasting belongs in an FP&A layer, not beside the ledger.

  Revenue recognition itself is unchanged; `RevenueRecognitionType` and the forward-dated entries stay.

- 72e0e8e: Subscription form rail: Terms (renamed from Coverage Terms) then Deferred Revenue then Entitlement Grants, via relationship and contribution sortKey.

### Patch Changes

- 933075e: Follow accounting's JournalEntryBatch rename in the seeded journal-entry types

  Accounting renamed `JournalEntryType.IsBatchSummary` to `IsJournalEntryBatchSummary` (Amith's
  ruling, accounting PR #46). Orders seeds four types of its own into that table — OrderBooking,
  RevenueRecognition, PaymentReceipt and Refund — and every one set the old field name, so
  `mj sync push` would have failed against the new schema.

  The failure mode is the awkward one: the migrations apply fine and the sync fails afterwards,
  so an install gets most of the way through before stopping on a field name.

  Worth recording WHY this was missed. The heads-up issue (#37) concluded "impact: NONE" after
  sweeping migrations, packages and test-harnesses — all three clean, because orders' own schema
  has never referenced accounting's batch columns. What it did not sweep was `metadata/`, and
  that is where the coupling actually lives: orders writes rows INTO accounting's tables through
  metadata sync, so accounting's column names are part of orders' contract even though orders'
  schema never mentions them. A cross-app rename check has to include seeded metadata.

- 319f76e: A booked order can no longer add, remove, or reprice lines, or restate the initial tender. Validate refuses those edits, the form hides the catalog picker, and the unused Fast Entry page is removed.
- b32c32a: Confirm-after-draft loads Lines and writes them before Status flips.

  A GraphQL form save reloads the header only. Changing Status to Confirmed then
  walked an empty collection, created no membership term, and EvenOverTime
  refused. Existing draft lines were then UPDATEd after the header was already
  Confirmed, so trigger 51003 rolled back inside INSERT-EXEC.

  `OrderHeaderEntity.EnsureLinesLoaded` is the shared read. The server persists
  prorated line money while the header is still Draft, then flips Status.

- 4cbd90e: Read date cells through `ToISODate` instead of `String(cell).slice(0, 10)`, which yields
  `'Thu Jul 30'` for a `Date` and compares as less than nothing. Fixes two all-zero dashboard charts,
  a year column reading `'Mon '`, and an expired tax-exemption certificate that never warned.
- fad54cb: PaymentDetail is an owner-held 1:1 embed on the wallet, payment header, and order intent FK. Booking and capture skip related collections so the detail persists with the header.
- 5b379d1: Realign the cross-app references so orders installs onto an empty database

  Orders could not be installed from zero at all, and it had never been noticed: an incrementally-built
  instance already carries the rows and views the baseline expects, so the defect is invisible until
  the database is wiped.

  Orders is downstream, and both breaks are ours — upstream moved deliberately and our generated tail
  kept pointing at where things used to be. Nothing in accounting or common is changed.

  The baseline writes EntityFields and an EntityRelationship against accounting's `Dimension Values`,
  `Dimensions` and `Journal Entries` entities but never creates them — it expects accounting to, by ID.
  Accounting re-minted those IDs when it re-baked, so the insert failed on
  `FK_EntityRelationship_EntityID`. Separately, our generated views joined
  `__mj_BizAppsCommon.vwPeopleExtended`, which common retired once `Person.DisplayName` became a
  computed column; the join target is now `vwPeople`, which carries it.

  All ten cross-app references were audited rather than only the one that failed — common's other three
  and MJ core's four are still valid and were left alone.

  **This will recur.** The tail hardcodes upstream entity IDs, so every upstream re-bake re-mints them
  and silently breaks the from-zero install again while every existing instance keeps working. The
  durable fix is to resolve cross-app entities by schema and table name instead of embedding a GUID.

- 0db0276: Archive the historical design plans and document how the running system actually works. README and code comments now point at `docs/HOW_THE_SYSTEM_WORKS.md` instead of treating the master plan as current schema.
- 79bb2b3: A check number typed on Fast Entry never reached confirm.

  `InitialPaymentTypeID` and `InitialPaymentAmount` are columns and already crossed
  the wire. The reference is not a column — it lives on `PaymentDetail` after
  confirm — so both screens kept it as page state. The server only looked at
  `InitialPaymentDetailID`, which Fast Entry never set, and refused with
  "Check payments need a reference number".

  The typed number now rides `Order.InitialPaymentReference` (a companion, like
  promotion codes). Confirm creates the `PaymentDetail` from it and attaches that
  to the payment.

- 25c6b24: Declare BUSL-1.1 in mj-app.json. The LICENSE file and every package
  already state BUSL-1.1; the app manifest still said ISC, so anything
  reading the manifest saw the wrong license.
- 797303e: Move to MemberJunction 6.1.0-edge.3, and make `orders-ng` loadable by Node.

  The workspace was on a half-applied edge.2 line: `@memberjunction/ng-hierarchy-tree` was pinned to
  `6.1.0-edge.2` while the peer ranges asked for `^6.1.0-edge.1`, and the two `@mj-biz-apps/common-*`
  dependencies were pinned to `5.33.2`, which predates the components this package imports. Both now
  point at versions that exist and agree: MJ at `6.1.0-edge.3`, common at `>=5.35.0`.

  `orders-ng` shipped ESM that only a bundler could load. It declares `"type": "module"`, but its
  build was `ngc` alone — and `tsconfig.angular.json` sets `"moduleResolution": "bundler"`, which
  permits extensionless relative specifiers and emits them verbatim. Node's ESM resolver rejects
  those, so `import('@mj-biz-apps/orders-ng')` failed with `ERR_MODULE_NOT_FOUND` naming a file that
  was present in the package. 274 of the 346 relative specifiers in `dist` were affected, 19 of them
  emitted by ngc itself for template component references, which no source-level change can reach.

  The fix is the one the rest of this workspace already used: run `tsc-alias -f`
  (`--resolveFullPaths`) after the build. The other five `orders-*` packages build with
  `tsc && tsc-alias -f` and have zero extensionless specifiers; the Angular package builds with `ngc`
  and was the only one that skipped it. Adding it takes `dist` to 0 extensionless and 0 unresolvable
  specifiers with no source changes.

  Test-side, eight Angular suites could not load at all, and had been invisible while CI was failing
  earlier in the job. Same root cause, in dependencies rather than here: every BizApps `*-ng` package
  has this defect (`accounting-ng` 218 specifiers, `common-ng` 81, `tasks-ng` 64). `vitest.config.ts`
  now inlines those so Vite resolves them instead of Node — the real modules stay in the graph, so
  unlike the `accounting-engine-base` alias beside it, nothing is stubbed and the class-registration
  assertions still test real registrations.

  Verified: 31 packages build clean; 64 test files, 1232 tests pass.

- f59a6fb: Stop treating save-populated fields as user errors on a new order.

  `Validate()` was refusing every unsaved draft with "Order Number cannot be null"
  (and the same for a new line's UnitPrice / CompanyID). Those values are minted
  or stamped by `OrderEntityServer.Save()`, so Fast Entry and the editor — both
  of which gate Confirm on `Validate()` — disabled the button on a complete order.
  A new header also defaults `OrderDate` to today so Fast Entry, which has no date
  control, can confirm.

- f4cce15: State the overdue rule once, in `overdue.ts`, and have `GetOverdueWorklist` read it. Three surfaces
  derived it independently and only one excluded a voided order — so a voided order with a stale
  balance appeared on collections lists as money owed.
- 6e50c38: Migrate the workspace from npm to pnpm and remove the MJAPI/MJExplorer dev harness,
  mirroring bizapps-tasks and bizapps-accounting. No published package's code, types,
  metadata or migrations change — build tooling only, hence a patch.

  `packageManager` moves to `pnpm@10.33.0`; npm-only files/keys are dropped; CI workflows
  move to pnpm; the load-bearing workspace settings mirror MJ core (`linkWorkspacePackages`,
  `onlyBuiltDependencies`). The npm `overrides` move to pnpm-workspace.yaml with the stale
  `@memberjunction/core|global ^5.50.0` pins corrected to `^6.1.0-edge.1` — those stale pins
  were orders#60's root cause, and the `apps/` tree they were holding together is deleted here.
  The npm-era `link:local` / `postinstall` / `.mj-links.json` local-linker is deleted: MJ 6.x
  workspace linking is how cross-app source dependencies resolve now. `mj:migrate` gains
  `--schema __mj_BizAppsOrders --dir ./migrations` (bare `mj migrate` silently applied
  nothing — same fix as tasks and accounting).

  **A real pnpm-lock.yaml is committed.** Two things previously made that impossible: the
  workspace root's devDependencies pinned the unpublished `@mj-biz-apps/accounting-*`
  packages (for the root integration harnesses), and pnpm 10's default
  `autoInstallPeers: true` turns even optional peer ranges into fatal registry 404s. The
  root no longer declares the unpublished packages — the harnesses resolve accounting
  through `packages/IntegrationTests` (which declares them as peers) via
  `test-harnesses/resolve-app-packages.mjs` — and `auto-install-peers=false` is set in
  `.npmrc` with the reasoning in-file. Accounting staying unpublished is accepted WIP:
  install-based CI now installs cleanly from a bare checkout; the build leg that needs
  accounting stays red until it publishes.

  **Accounting is declared as a MANDATORY peer** (the `optional: true` markings are gone) —
  it is a hard runtime requirement and the manifests now say so. With auto-install-peers
  off, an unmet mandatory peer is an install warning, not a registry 404, so this is safe
  pre-publish (see `docs/dependency-on-accounting.md`). The MJ floor moves to
  `6.1.0-edge.2`, the edge release carrying the MJ#3734 UserCache relocation this repo's
  imports were fixed for.

  Verified: all six packages build green as workspace members against MJ next
  alongside bizapps-common, bizapps-tasks and bizapps-accounting, and
  `pnpm install --frozen-lockfile` from the registry succeeds on a bare copy.

- 65b60a9: Default price/tax/secret resolvers are intentionally registered with no ClassFactory key. Mark those registrations so Explorer/MJAPI stop warning at boot, and probe for a plugin key before CreateInstance so the walk does not fall back (and warn) on every Product/Category/Company miss.
