# @mj-biz-apps/orders-core-entities-server

## 5.24.0

### Minor Changes

- 36b3869: The anonymous checkout now keeps the buyer's card when the order sells an auto-renewing subscription, so the renewal can be charged later. Before paying — when the order does not exist yet, so the decision is made from the products in the priced draft — it reuses or creates the buyer's gateway customer (found through their own wallet, never by e-mail; a first-time buyer with no person record yet gets a customer opened for the checkout session, and the card is filed under the person completion creates) and asks the gateway to keep the card (`setup_future_usage: off_session` on Stripe); after the capture books, it files the card in the buyer's wallet (`PaymentDetail` + `CustomerPaymentMethod`) and sets it as each new subscription's renewal card (new `Subscription.DefaultCustomerPaymentMethodID`). Keeping the card is fail-soft: a failure is logged and never blocks or reverses the sale.

  A widget can require an automatic-renewal agreement (`autoRenewConsentText`): the widget shows a required checkbox, the server refuses to open a payment intent without it, and the checkout session records the widget's own wording and the time (new `CheckoutSession.AutoRenewConsentAt` / `AutoRenewConsentText`).

  New on the payment driver seam: `BasePaymentProvider.EnsureCustomer` (with `CheckoutSessionID` as an owner for a buyer with no person yet), `CreateIntentRequest.SaveInstrumentForReuse`, and `RetrieveIntentResult.Instrument` (the paid card's token and display fields). Charging the kept card at renewal is not in this release.

- 4f68e25: Public checkout can apply a verified-member discount. A host sets `member-token` on `<mj-orders-checkout>`; `/draft` passes it to the `BaseCheckoutMemberDiscountResolver` the widget names in `Configuration.memberDiscountResolver`, which returns a promotion code priced through the promotion engine. The session keeps the code, never the token, and `/complete` re-prices and books with it. A rejected token prices at the standard rate with a message; a token sent to a widget that cannot verify one is refused. The checkout total now includes line discounts, which it previously omitted. It also now includes tax and charges, so a taxable product sold through the public checkout charges tax at checkout; before, the charge left tax out while the order still booked it. If a settled payment no longer covers the re-priced total at `/complete` (for example, the member promotion ended after the draft), no order is booked, the buyer gets a plain message, and a checkout alert is raised so staff can refund.
- 5c49cb5: A typed promotion code that belongs to a member promotion is refused at the public checkout, so a member price needs a verified token. `BaseCheckoutMemberDiscountResolver` gains `IsMemberPromotionCode`; `/draft` asks every registered resolver before pricing a typed code and refuses one any of them claims. The base implementation claims every code, so a host's resolver must override it to name its own codes, or typed codes stay off at every checkout.
- 297fe94: A posted progress observation can be superseded, so a mistyped date no longer freezes the line (bc-aidp-next-golive#260). `Orders.RecordProgress` takes an optional `SupersedesMeasurementID` naming the line's latest observation; for a user holding the new `MJ.BizApps.Orders.Progress.Supersede` authorization (shipped with an `Orders Revenue Supervisor` role, assigned alongside Engagement Lead because a supersede is itself an attestation and still needs `MJ.BizApps.Orders.Progress.Attest`), it reverses that observation's recognition on the observation's own date — or, when that month already has a Posted batch for the line's company, on day 1 of the first later month without one (returned as `ReversalDate`; a failed batch read refuses the supersede) — then posts the new observation's catch-up from the restored total, booked no earlier than that reversal date so nothing new posts into the closed month (returned as `CatchUpDate`; the observation keeps the date the supervisor chose) — all in one transaction, with no row edited. `OrderLineProgressMeasurement` gains `SupersedesMeasurementID` (at most one row per observation, by filtered unique index) and `ReversalJournalEntryID`; a superseded row stays Posted and immutable and stops counting as the line's last observation, in the ordering guard and on the worklist. `UQ_OLPM_Period` becomes a unique index filtered to observations that replace nothing, so a replacement may carry the replaced observation's date and a wrong percent is corrected on the day it was attested. A measurement date after the current business month's end now returns an advisory `FutureDateWarning` on preview and post; forward dating is still allowed. The attestation screen offers "Supersede last" to users with the grant and shows the new warning in the preview and the confirm dialog; the same users get "Show 100%", since the worklist omits completed lines and a mistyped 100% must stay reachable.

### Patch Changes

- 21ade73: Checkout account step: every `Created` account now gets the verification wording (#395). After the buyer sets a password the widget tells them to verify the e-mail before signing in, instead of saying they can sign in straight away when the host left out `VerificationRequired`. `/checkout/account` reports `VerificationRequired: true` for every `Created` account. `CheckoutAccountResult.VerificationRequired` is deprecated and ignored; hosts need not set it.
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

- 54d4e4a: Checkout: when a later draft changes the session's e-mail, the payer Person is resolved again for the new address (or left for completion to resolve or create), so pricing and the order's bill-to and ship-to follow the new e-mail. Booking the settled payment now restamps the payment intent's bill-to person with the order's when an earlier intent still names the previous payer (#393).
- 7126955: After a confirmed checkout, the redirect to `redirectUrl` carries the order number as `?order=<number>` (both the Angular element and the fallback host page), so the landing page knows which order completed. A widget can set `sendReceipt: true` to have the payment gateway e-mail its own receipt to the buyer: the intent carries a new `ReceiptEmail` (Stripe `receipt_email`). The e-mail is hashed into the intent's idempotency key, so a buyer who changes their e-mail can still reopen payment.
- 3b94fb5: The anonymous checkout takes a promotion code when the widget sets `allowCoupons: true`. The widget shows a promo-code field with Apply; `/draft` accepts `promotionCodes` (at most one, trimmed, up to 60 characters; refused when the widget doesn't take codes), prices it through the promotion engine and returns `AppliedPromotionCodes`, `UnusablePromotionCodes` (with the engine's reason) and `Discount`. An unusable code is priced without and not kept. The applied code rides the session snapshot, so `/complete` prices and books the order with the same code — the engine writes the adjustment and counts the redemption, and the total still equals the amount paid. If the server's total differs from what the buyer was shown, the first Pay press stops and shows the new total. Promotions on renewal orders are not in this release.
- 266995a: The order header Total now includes tax and charges when lines are priced in the browser (#405). Both pricing paths read a priced line back through one shared helper, `ReadPricedLineAmounts`, so the local path's gross is net plus charges plus tax, matching `Orders.PriceOrder`.
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

- 09e42d1: `Orders.CheckEntitlement` and `Orders.ListEntitlements` deny an `OnPaidInFull` grant, or an `OnFirstPayment` new purchase, from the day after its order's approved `WaivePaymentHold` ends unpaid, instead of granting until the nightly `EnforcePaymentGatedAccess` job suspends the grant (#404). The read path uses the job's `DecideGrantStatus` and `ApplyAccessOverrides` on the business-time-zone day, only ever tightens access, applies whether or not the renewal cutoff is on, and fails closed when the order's payment facts cannot be read. New pure helper `ReadTimeWaiverExpirySuspension`; the internal loader `LoadReadTimeCutoffSuspensions` is now `LoadReadTimePaymentSuspensions`.
- Updated dependencies [5939a65]
- Updated dependencies [fee2c37]
- Updated dependencies [36b3869]
- Updated dependencies [4f68e25]
- Updated dependencies [7126955]
- Updated dependencies [3b94fb5]
- Updated dependencies [266995a]
- Updated dependencies [59efbe7]
- Updated dependencies [297fe94]
- Updated dependencies [71ad081]
  - @mj-biz-apps/orders-entities@5.24.0

## 5.23.1

### Patch Changes

- Updated dependencies [b49eff4]
- Updated dependencies [529fe84]
  - @mj-biz-apps/orders-entities@5.23.1

## 5.23.0

### Minor Changes

- cd97084: Paid checkouts now record each post-payment step (Confirm, Capture) in `CheckoutSessionStep`: every attempt, its source (checkout, webhook or replay), and how it ended. A shared view, "Checkouts: Needs Review", lists failed steps and steps left running for more than 15 minutes. `Orders.ReplayCheckoutStep` lets a holder of `MJ.BizApps.Orders.Checkout.Replay` (the new Checkout Operator role) re-drive a failed Capture through the same idempotent CapturePayment. Replaying a succeeded step does nothing, and Confirm is not replayable. The terminal-capture Task is now raised once per terminal failure instead of once per replay.
- 8fe29eb: Route Pending concession approvals through the tasks app.

  A Pending concession held the order's confirm and document send, and nothing told an approver it was
  waiting.

  - Recording a Pending concession raises its own `APPROVAL_REQUEST` task in the tasks app, titled
    with the order, the concession and its amount (for example `SO-1042: 25% discount, 3,000.00`).
    The task links the order and that concession. `OrderHeader.ApprovalTaskID` points at the order's
    most recent open approval task.
  - The task is assigned to the active holders of the `ConcessionLimit` rule's role, other than the
    requester, through the active `MJ_BizApps_Common: People` record linked to each holder's user:
    the tasks app notifies and lists assignees by person. A holder with no such record is skipped and
    logged.
  - Recording a Pending concession is refused when the tasks app is not installed, or when no holder
    of the rule's role other than the requester has a linked person record.
  - A terminal decision recorded on the task approves or rejects only that task's concession, as the
    user who recorded it, with the decision's note. The concession's own role check still applies.
    When the concession refuses the decision, it stays Pending, a fresh task is raised for it under
    the same title, the order points at that task, and the reason is recorded on the refused task.
  - Withdrawing a Pending concession cancels its task and removes its link. Deciding it on its own
    record completes its task when approved and cancels it when rejected.
  - `@mj-biz-apps/tasks-entities` is a required peer dependency of
    `@mj-biz-apps/orders-core-entities-server`, `>=1.4.1 <2.0.0`.

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
- 498ce77: Payment intents carry a description, so a gateway dashboard shows what a charge was for: the first line's product, "+N more" for further lines, and the order number (#327). `CreateIntentRequest` and `OpenIntentRequest` take an optional `Description`; `OpenPaymentIntent` builds one from the order when a caller passes an `OrderHeaderID` and no description, which covers renewal and back-office charges. Drivers gain `UpdateIntent`, implemented for Stripe. A checkout opens its intent before the order exists, so it describes the products first and sends the order number and `OrderHeaderID` to the gateway once the order is committed. The `Orders.OpenPaymentIntent` action takes a `Description` input.
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
- a05a122: Outbound events: Orders tells registered `OrdersOutboundConsumer` subclasses when a sale confirms (renewals included; not returns, cancellations, amendments or credits) and when an entitlement grant is created or its status changes. Events are recorded in the same transaction as the change (a transactional outbox) and sent after it by the new `Orders — Dispatch Outbound Events` scheduled job and, for a completed checkout, right after `/complete`. Delivery is at least once with a stable event id, retried with backoff (a `Deliver` call is bounded at 30 seconds) and dead-lettered after 24 hours. A new `EntitlementGrantEntityServer` records grant changes whoever makes them. With no consumer registered, nothing is recorded. See `docs/outbound-events.md`.
- 78878b3: `Orders.DetectOverlappingSubscriptions` uses AccountingBridge's finance exception contract and operation lookup instead of its own copy, so every orders detector changes in one place when accounting's contract does. Behaviour is unchanged: a refused batch is still reported pair by pair and later batches still run.
- 7d375f5: An order line refuses a `ParentOrderLineID` unless bundle expansion wrote it. The concession confirm gate does not re-price a bundle component, so a parent set through the API would have let an ordinary line skip it. Clearing a parent is still allowed. Integration check BN13 covers the refusal.
- 69aff1b: Record a booked line priced below its engine price with no approved concession as a finance
  exception (golive #279).

  - The booking save raises `PRICE_BELOW_ENGINE_UNAPPROVED` through `Accounting.RaiseFinanceExceptions`,
    inside the booking transaction, for each line whose stated price is below its engine price by more
    than any Approved concession on it covers. The amount is the uncovered value; the exception is
    keyed on the order line and dated the business day of the confirm. Nothing is refused: this
    records the bookings the confirm gate lets through, such as a save with no context user.
  - The lines are judged by the confirm gate's own evaluation (`FindUncoveredLinePrices`), so bundle
    components, reversals, the engine's own price and a named list pick raise nothing.
  - The type's configuration is read through `Accounting.GetFinanceExceptionTypes`; a missing or
    inactive type raises nothing. Accounting is consulted only when a line needs raising.
  - A raise that fails fails the booking, so an exception is never silently lost.

- 399a517: `MaxTermExtensionDays` now limits any change to a term's dates, not only days added. A change is measured
  as the larger of how far the term's start and end move (`TermDateChangeDays`), so an extension, a
  shortening and a shift of N days each escalate at a limit of N. It is checked for every concession that
  changes a term's dates, whatever its form.
- Updated dependencies [319018d]
- Updated dependencies [cd97084]
- Updated dependencies [afbfd22]
- Updated dependencies [348b2ab]
- Updated dependencies [bf20bfa]
- Updated dependencies [43cb51e]
- Updated dependencies [69060ae]
- Updated dependencies [44ba79b]
- Updated dependencies [76053c0]
- Updated dependencies [dfa3dc8]
- Updated dependencies [399a517]
- Updated dependencies [b5e97d0]
  - @mj-biz-apps/orders-entities@5.23.0

## 5.22.0

### Minor Changes

- 2aca048: Finance exception review for percentage-of-completion progress (golive #279, types 1 and 2). Nothing is blocked: each flagged item still posts and also lands on accounting's review list through `Accounting.RaiseFinanceExceptions`, with thresholds read from `Accounting.GetFinanceExceptionTypes` (a missing or inactive type raises nothing). `Orders.RecordProgress` raises `PROGRESS_JUDGMENT_CALL` inside its own transaction, after the observation is written, when the catch-up is a backward slide, is the line's first posted observation, or exceeds `MaxSingleObservationAmount` — one exception per observation naming every reason, keyed on the observation; a failure to raise fails the attestation, and `Preview` raises nothing. New operation `Orders.DetectUnattestedProgress`, with a Custom Action of the same name and a daily scheduled job that ships Disabled, raises `PROGRESS_UNATTESTED` for every active, booked, not-complete POC line on the progress worklist whose last attestation, or whose booking when never attested, is more than `MaxDaysWithoutAttestation` days before the business day — one exception per line per month (`<OrderLineID>|<YYYY-MM>`), amount the value not yet recognised, creator the last attester; a failed raise fails the run. `Orders.GetProgressWorklist` rows gain `LastAttestedByUserID` and `ConfirmedAt`.

### Patch Changes

- Updated dependencies [2aca048]
  - @mj-biz-apps/orders-entities@5.22.0

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

### Patch Changes

- 854a137: Checkout can run a host's account step after payment. A host registers a `CheckoutAccountStep` subclass. `/complete` confirms the order without waiting on the host and answers `AccountStep: true`; the widget then calls `POST /checkout/account`, which calls the host's `EnsureAccount` (limited to `HostTimeoutSeconds`, default 10) and returns `Account: { Outcome, Message?, CanSetPassword, VerificationRequired }` (`Created`, `Exists` or `Failed`). For `Created` the public checkout shows a password form, and `POST /checkout/account/password` passes the password to the host's `SetPassword` — once, only for the account this checkout created, within `PasswordWindowMinutes` (default 5), never stored or logged. `Failed` offers "Try again". A host answers `NotApplicable` for a checkout it makes no logins for, which then has no account step. The seam requires the host to keep a created account unable to sign in, and unlinked from the Person, until the e-mail is verified. With no step registered, checkout behaves as before.

  **Host obligations.** The checkout never proves the buyer owns the e-mail they typed. A host that registers a `CheckoutAccountStep` must keep an account it answers `Created` unable to sign in until it has verified the e-mail (for example with an e-mailed link), and must not link the new login to `PersonID` until then. It should answer `Created`, not `Exists`, for an account it already created for the same `SessionID`. Until #395 is fixed, also answer `VerificationRequired: true`: without it, the widget tells the buyer they can sign in straight away. Details are in "Account Step After Payment" in `docs/checkout-widget-and-session-architecture.md`.

- 6e5077d: `<mj-orders-checkout>` can be embedded inside another widget. New attributes: `email` prefills the e-mail field while it is empty; `source` and `source-ref` say where the checkout came from and are kept on the checkout session as `MetadataJSON.Attribution` (`NormalizeCheckoutAttribution`; an unreadable one is dropped, never refused). A host dispatches `checkout-reset` on the element to return it to a blank form; it is refused with `checkout-reset-refused` while a payment is in flight or the account step is unsettled, it always starts a new session, and it reads `email`, `source` and `source-ref` again for the next conversation.
- 61fb0e6: `Orders.CheckEntitlement` and `Orders.ListEntitlements` deny an `OnFirstPayment` renewal from the day its order reaches `RenewalAccessCutoffDaysPastDue`, instead of granting until the nightly `EnforcePaymentGatedAccess` job suspends the grant (#287). The read path uses the job's `DecideGrantStatus` and `ApplyAccessOverrides` on the business-time-zone day, only ever tightens access, and fails closed when the order's payment facts cannot be read. New pure helper `ReadTimeCutoffSuspension`.
- Updated dependencies [4d6f410]
- Updated dependencies [6e5077d]
- Updated dependencies [1901f73]
- Updated dependencies [53d6fd8]
- Updated dependencies [68402d5]
- Updated dependencies [18b10d7]
- Updated dependencies [497fc57]
- Updated dependencies [2831b2f]
- Updated dependencies [f263124]
- Updated dependencies [704eec2]
- Updated dependencies [fd0cfac]
- Updated dependencies [528b483]
- Updated dependencies [fa90781]
  - @mj-biz-apps/orders-entities@5.21.0

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

- 2ddd206: The three rules for reversing a scheduled order (D92 §6), as pure functions on `ContractBalance`.

  `InstalmentsToCancel` picks the instalments a reversal withdraws — live and never billed, tested on `DocumentNumber` rather than `Status` so a row the customer holds an invoice for is never quietly removed. `ProratedCreditMemo` gives a reversing line its share of the origin's billed-but-not-earned balance, prorated to the quantity still left, and counts staged releases dated before the reversal as earned, less what earlier reversals of the same line already mirrored back (`StagedEarnedThrough`); revenue already recognised stays recognised. `RefuseEarnedNotBilled` refuses a reversal that would strand an earned-but-unbilled balance in Unbilled Receivable, naming the lines, the amounts and the instalment due as of the reversal's date to issue first; on a staged line it counts the staged-earned figure, since stored `RecognizedToDate` does not. `RefuseEarlierThanPriorReversal` refuses a reversal dated before an already-confirmed reversal of the same line, naming that reversal's order and date.

  A reversal of an order billed by instalment books that memo or nothing, never the mirrored value entry; mirrors only the recognition releases dated after the reversal; reduces the origin line's `BilledToDate` by the memo; and withdraws unissued instalments only once the whole order is reversed. `Orders.CancelSubscription` refuses a term on an instalment-billed order for now.

- d71575a: Orders now record who confirmed them. `OrderHeader.ConfirmedByUserID` (FK to `__mj.User`) is written by the booking save from the save's context user, in the same write as `ConfirmedAt`, and is NULL when the booking has no context user. Orders booked before this release keep NULL: who confirmed them is not recorded anywhere, so nothing is backfilled. Once an order has a `ConfirmedAt` the column cannot change: `Validate()` refuses it with the other booked header fields, and trigger 51017 refuses it at the database. Migration `V202609281000` adds the column, the trigger and their CodeGen output.
- a67d0ef: Cash against a scheduled order is a customer deposit until the instalment is billed (golive #239 follow-up).

  A scheduled company books no value at confirm, so until an instalment is invoiced there is no receivable for cash to clear. `PaymentAllocationFactory` now credits Accounts Receivable only up to what that company has invoiced and not been paid, and credits the new `Customer Deposits` GL role for the rest. The role resolves per order line through the same product, category, product type, company walk as every other role, and a payment that needs it with no account linked is refused, naming the role and the company. An order with no schedule rows books the single AR credit it always did. Unnamed cash beyond what the schedule's rows can still hold is not a deposit: it credits AR as a customer credit, as on an unscheduled order.

  Issuing an instalment posts the invoice at full value and then clears whatever the customer had prepaid with a separate `Dr Customer Deposits / Cr AR` pair, sized from how much the rows' held deposits fell when the row became billed. Each instalment's bill is sliced so it equals its schedule row to the cent, and each line's pieces still sum to the line. A refund mirrors what the payment booked: the part the refund takes out of held deposits debits Customer Deposits and the rest debits AR. Reversing lines keep the order line and the instalment each original line named, so a refund of cash that named an instalment comes off that instalment. The Pending-to-Captured webhook promotion reads the schedule before the header is saved, and two lines of one payment naming different instalments each consume their own row.

  `spRecalcOrderHeaderPaymentSchedule` cascades unnamed cash into invoiced instalments before merely scheduled ones, so the rollup and the ledger agree about which instalment the money settled (`V202609260100`).

  `OrderHeaderPaymentScheduleEntityServer` refuses a `Scheduled` row reaching `Invoiced`, or acquiring a `DocumentNumber` or `InvoicedAt`, unless `Orders.IssueInstalmentInvoice` is the caller.

  Needs the `Customer Deposits` role from bizapps-accounting #194 on the target database.

- 102ea17: Percentage-of-completion revenue recognition (golive #241, plan Part F / D90, W10/W11). `RevenueRecognitionType.ScheduleBasis` (`AtBooking` | `OnMeasurement`; defaults to `AtBooking`, so the three existing types are unchanged) and the new `OrderLineProgressMeasurement` table — one attested observation of cumulative percent complete per line per period, immutable once posted. A `ProgressRecognitionDriver` family alongside the booking drivers, with `ManualAttestation` shipped. New operation `Orders.RecordProgress` posts the cumulative catch-up (`LineTotalNet × percent − the line's RecognizedToDate`) as a `RevenueRecognition` entry crediting Sales, debiting Deferred Revenue up to the line's deferred balance and Unbilled Receivable beyond it (D92 rule 2); a backward slide mirrors the same entry; a zero delta succeeds and writes nothing; `Preview` computes without writing. The operation advances the line's `RecognizedToDate` in the same transaction as the entry, and is gated on the order being confirmed rather than on the line carrying a booking entry, since a POC line on a company with a payment schedule books no value entry at confirm. `Orders.GetProgressWorklist` lists open POC lines with their last observation. Metadata: the Percentage of Completion rev-rec type and the Project / Implementation product type. Receivables rail gains a Progress attestation page.

### Patch Changes

- 22ee8ec: Spending a gift card now reduces its balance: capturing a gift-card payment passes the card to the stored-value driver, writes a Redeem StoredValueTransaction and lowers CurrentBalance in the payment's transaction (Depleted at zero). An overdraw is refused with nothing spent. Refunding it writes a Refund transaction and restores the balance. Closes #302.
- d0c5fcd: A gift card spent as a tender now debits the issuing company's Gift Card Liability (Deferred Revenue when none is linked, with a warning) instead of Cash. Credit AR is unchanged and a refund mirrors it. Account credit and every other tender book exactly as before. Closes #300.
- 8d3df77: A deferred line that neither an event nor a subscription dates can now be given its service period on the order screen, and Confirm stays disabled, naming the line, until both dates are set. `OrdersEngine.ServicePeriodSource(productID)` says where a line's window comes from (`NotRequired`, `Event`, `Subscription` or `Line`); `OrderHeaderEntity.LinesMissingServicePeriod()` lists the lines still without one. A refused Confirm, Void or Reopen now puts the previous status back (`OrderHeaderEntity.SaveStatus`) and shows the reason, instead of leaving the order reading the new status with every later save failing.
- ada18e6: Spawned renewals now carry a one-row payment schedule per company, due on the day the renewal pass runs plus the customer's payment terms (never later than the new term's start), so under D92 the renewal is invoiced (with an invoice number) inside its confirm and AR is dated the invoice day rather than the new term's first day. Instalment invoice entries (automatic and manual) are now dated by the business day rather than the UTC day. Removes the unused `SCHEDULE_DEFAULTS.RenewalLeadDays` constant.
- Updated dependencies [a1114ed]
- Updated dependencies [7af7a46]
- Updated dependencies [41d32be]
- Updated dependencies [0bcafbd]
- Updated dependencies [d71575a]
- Updated dependencies [3a8b6b2]
- Updated dependencies [e131f07]
- Updated dependencies [102ea17]
- Updated dependencies [8d3df77]
  - @mj-biz-apps/orders-entities@5.20.0

## 5.19.0

### Minor Changes

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

### Patch Changes

- Updated dependencies [8ee3f8d]
- Updated dependencies [e7680ea]
  - @mj-biz-apps/orders-entities@5.19.0

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

- c8ad04a: An invalid `Date` passed as a caller-supplied day is refused rather than read as today (#272).

  `Orders.PreviewPrice` (`AsOf`), `Orders.SpawnRenewals` (`AsOfDate`) and `Orders.CancelSubscription` (`RequestDate`) accept `Date | string`, but only the string form was validated. `new Date('garbage')` reached `CalendarDayOrToday`, which reads it as no day and falls back to today — a quote, a renewal pass or a cancellation for a day the caller never named. Each now refuses it with `Success: false` and "`<field>` is not a valid date." before any provider work.

  The three sites share one boundary check, `RequireOptionalDay` in `sql-guards.ts`, which validates both forms: an empty value is `null`, a string goes through `RequireDate`, and a `Date` is accepted only when it names an instant. `Orders.CancelSubscription` now returns a malformed `RequestDate` as its own refusal instead of throwing.

- Updated dependencies [b3ef9d2]
- Updated dependencies [5b5ebef]
  - @mj-biz-apps/orders-entities@5.18.0

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

- Updated dependencies [d0489c4]
- Updated dependencies [acb0405]
- Updated dependencies [5630121]
- Updated dependencies [b550e40]
- Updated dependencies [19983f5]
  - @mj-biz-apps/orders-entities@5.17.0

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

### Patch Changes

- Updated dependencies [2e9e3dd]
  - @mj-biz-apps/orders-entities@5.16.0

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

- Updated dependencies [09624cb]
- Updated dependencies [426e730]
- Updated dependencies [21167e2]
- Updated dependencies [7ec08da]
- Updated dependencies [5293c47]
- Updated dependencies [c869137]
  - @mj-biz-apps/orders-entities@5.15.0

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

- 49217aa: Give the renewal operation a scheduler, and a schedule that ships disabled.

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

### Patch Changes

- 56eb169: Fold the dimension CodeGen output into the migration that caused it, per the repo convention.

  `V202609191200` added `OrderLine.DimensionID` / `DimensionValueID` and its CodeGen output shipped as
  a second file, `V202609191205__..._Metadata.sql`. The convention everywhere in this repo is that
  CodeGen output is appended to the migration that caused it, below a run of blank lines and a
  do-not-hand-edit banner — the shape the baseline migration carries and `scripts/append-codegen.sh`
  produces. The separate file is removed and its contents now sit below that banner.

  The appended block also gains the two foreign-key indexes,
  `IDX_AUTO_MJ_FKEY_OrderLine_DimensionID` and `IDX_AUTO_MJ_FKEY_OrderLine_DimensionValueID`. CodeGen
  creates these on a dev loop, but a host never runs it for this schema — `mj.config.cjs` carries the
  app's schema in `excludeSchemas` — so like the view and the procedures they have to ship in the
  migration.

  Adds unit coverage for the both-or-neither rule on `OrderLineEntityServer.ValidateAsync`. The data
  was never at risk, since `CK_OrderLine_DimensionPair` refuses a half-set row; what the check buys is
  a refusal that names the missing half on the line that is missing it, rather than a CHECK-constraint
  violation raised from inside the order's transaction after every other line has been written.

  Note for anyone who has already applied `V202609191200`: editing it changes its Flyway checksum, so
  that database needs a repair before its next `mj migrate`.

- f652c6f: Carry dimensions onto payment journal entry lines.

  No journal entry line produced by a payment carried a dimension — not the intercompany legs, not
  cash, not AR. Accounting had accepted them since its contract was written: `JournalEntryLineDraft`
  declares `Dimensions?`, the pipeline validates them and the engine writes
  `JournalEntryLineDimension` rows. The orders side simply had nowhere to put them —
  `PaymentJELine` had no field — so the values were resolved and then dropped
  (MemberJunction/bc-aidp-next-golive#238).

  Two sources now reach the ledger.

  The **counterparty** pinned per leg on the `IntercompanyAccountMatch`: the collector's Due To names
  the owning company, the owner's Due From names the collector. `ResolveIntercompanyAccounts` had
  always returned these; both callers kept the two GL account IDs and discarded the rest. Today the
  per-entity Due To / Due From accounts are what tell the two legs apart, so the omission reads as a
  reporting gap. Under a chart of accounts with one shared receivable and one shared payable it stops
  being one: accounting merges same-side lines on (account, dimension set), so two owners' credits
  would collapse into a single netted line that cannot be split, matched or eliminated.

  The **settled order line's own tags**, onto the cash, AR and intercompany lines alike. Booking
  debits AR under those tags; clearing the receivable untagged leaves every dimension permanently out
  of balance on an account that nets to zero in total. A company's share is split by distinct tag set
  and pro-rated by line amount, with the largest slice absorbing the residue — the rule
  `AllocateByCompany` already used, rather than a second one that could drift from it.

  A pin with no value is skipped rather than defaulted or refused. `IntercompanyAccountMatchDimension`
  makes `DimensionValueID` nullable to mean "take it from context", and its own definition says an
  intercompany leg has no context to take one from. Refusing to book would turn a legal configuration
  into an outage.

  An order whose lines carry no dimensions produces exactly the entries it produced before, line for
  line.

  Also shared what the two booking paths had been duplicating — the intercompany lookup and the
  order-line loader — since keeping one copy each is how this came to need the same fix in two files.

  The pipeline is only half of it: the counterparty values and the per-pair pins are configuration. A
  match with nothing pinned books exactly as it does today.

- Updated dependencies [bc6588e]
- Updated dependencies [2ce84d1]
- Updated dependencies [e1f4e15]
  - @mj-biz-apps/orders-entities@5.14.0

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

### Patch Changes

- Updated dependencies [92f7e68]
  - @mj-biz-apps/orders-entities@5.13.0

## 5.12.2

### Patch Changes

- 24c8436: Delete removed order lines when the order save takes line persistence over from MJ's standard companion pass.

  `OrderEntityServer.Save()` passes `SkipRelatedCollections` so that lines can be expanded, priced and taxed before they are written, and `savePendingLines()` stands in for the pass it skipped. That stand-in only ever inserted and updated — `Lines.Removed` was never drained — so a line removed from a draft stayed in the database. With a replacement added, the orphan still held `LineNumber 1`, the replacement was re-sequenced to `1`, and the insert failed on `UQ_OrderLine_OrderHeader_LineNumber`. With nothing added there was no error at all: the save reported success and the row remained.

  Removals are now issued at the top of the save transaction, before anything renumbers or writes a line — the order MJ's own collection pass uses, and for the same reason. A removed line's price components, charge and adjustment allocations, adjustments and dimensions come out with it, because the generated `spDeleteOrderLine` does not cascade.

  The delete fires `trg_OrderLine_RollupTotals`, so the header's totals are re-read from the row before the header itself is written. Without that, the save puts the caller's pre-delete figures back — invisible when a replacement line is added, because its insert fires the trigger again, but a removal that empties an order left it reading a total for lines it no longer had.

  - @mj-biz-apps/orders-entities@5.12.2

## 5.12.1

### Patch Changes

- @mj-biz-apps/orders-entities@5.12.1

## 5.12.0

### Minor Changes

- b8b2131: Fix PaymentLines query to use vwPaymentLines view with user permissions, expose \_mj**Latitude / \_mj**Longitude in GraphQL schema, and forward-heal Event Products IS-A parent fields.
- ecbfe69: Support prospective subtype resolution with SubtypeSelector and EnsureISAChild for OrderLine extension entities.

### Patch Changes

- 888983a: Name the price rule that actually won on the order line instead of labelling every resolved price "base price". The winning rule's name already reached the browser as the resolution walk's `Base`/`Rule` component label and was being discarded, so a line priced off a member list read as base-priced. Also fixes both component mappers, which read a field named `Kind` where the resolver emits `ComponentType`, and names the rule (with a currency symbol) in the override picker's `Default` row.
- 9b63bf1: Honor a term start stated on a subscription order line instead of always deriving it from the order date (#121). `OrderDate` remains the booking date and still dates the booking journal entry; a `ServicePeriodStart` set on the line now starts the term on that date, with the subscription type's rules computing the end (and any anchored-period proration) from it. An extension continues existing coverage as before, and reports a stated start only when the term genuinely begins on a different date. The order line editor gains a "Term start" field on subscription lines that shows the order date as its default and offers a reset back to it; on a line renewing live coverage the field is read-only and shows the date the term will actually begin, since a renewal continues where existing coverage ends.
- Updated dependencies [b8b2131]
- Updated dependencies [e9bf1f9]
- Updated dependencies [ecbfe69]
  - @mj-biz-apps/orders-entities@5.12.0

## 5.11.0

### Patch Changes

- Updated dependencies [a6ad8c5]
  - @mj-biz-apps/orders-entities@5.11.0

## 5.10.0

### Patch Changes

- Updated dependencies [76b3d3e]
  - @mj-biz-apps/orders-entities@5.10.0

## 5.9.0

### Patch Changes

- Updated dependencies [e121d98]
  - @mj-biz-apps/orders-entities@5.9.0

## 5.8.0

### Patch Changes

- Updated dependencies [2981938]
  - @mj-biz-apps/orders-entities@5.8.0

## 5.7.0

### Minor Changes

- bbb5171: OrdersEngine now caches Products, Product Prices, Product Categories, Product Types, Subscription Types, and Revenue Recognition Types (@RegisterForStartup). Confirm, pricing, checkout, fulfilment, and the catalog picker read those arrays instead of per-call RunView. Confirm looks up rev-rec types by normalized ID and inherits ProductType.DefaultRevenueRecognitionTypeID when the product left it blank. GL Account Roles stay on AccountingEngineBase; booking no longer force-refreshes that cache. Confirm also inherits ProductType.DefaultSubscriptionTypeID when the product left SubscriptionTypeID blank. `@mj-biz-apps/accounting-engine-base` is a real dependency of orders-core-entities-server (static import, declared in package.json), not a peer. Local filter-eval helpers are PascalCase (`EvaluateFilter`, `IsCompositeFilter`, `ParseFilterField`). Order-line price override is a pencil that expands a named-price picker (custom amount only when Custom is selected) plus Override Explanation when the price diverges from default. OrderLine gains PriceOverridden and PriceOverrideReason. Ship/bill addresses bind AddressID from the party; custom addresses can be linked onto the person/org profile.

### Patch Changes

- a436049: License declarations now agree on BUSL-1.1 everywhere.

  The manifest was corrected earlier; the README badge still advertised ISC, which is the
  first license statement a reader meets and outranked `LICENSE`, `package.json`,
  `mj-app.json` and every workspace package in practice. The badge now reads BUSL-1.1 and
  links to `LICENSE`.

- Updated dependencies [a436049]
- Updated dependencies [bbb5171]
- Updated dependencies [bb9a5f2]
- Updated dependencies [4dfa35c]
  - @mj-biz-apps/orders-entities@5.7.0

## 5.6.0

### Minor Changes

- e48bc43: Stop the order Balance rendering as a dash, and stop it erasing itself (bc-aidp-next-golive#186).

  `TotalGross`, `AmountPaid`, `Balance` and `FulfillmentStatus` on `OrderHeader` are maintained by
  `spRecalcOrderHeaderTotals`, which the OrderLine and PaymentLine triggers fire. On a
  create-and-confirm the header is written before any line exists, so `Balance` is legitimately NULL
  at that moment — and `OrderEntityServer.Save()` never read the refreshed row back onto the entity.
  `SaveEntityGraphOperation` returns `root.GetAll()`, so the browser adopted that NULL, and
  `FormatMoney` renders NULL as an em-dash. A confirmed, unpaid $895 order therefore reported its
  balance as `—`, which in that formatter means "not computed", not "nothing owed".

  The stored value did not survive either. Every SP-parameter field is sent on the next update
  regardless of dirty state, and a nullable column carrying NULL emits `@<Col>_Clear=1`, which
  `spUpdateOrderHeader` obeys by writing NULL over the trigger's value; a stale `AmountPaid = 0` needs
  no flag at all to overwrite a captured payment. So editing anything on a confirmed order erased its
  totals — the figures payment allocation and the aging report read.

  - `OrderEntityServer` now adopts the row's rollups before `Save()` returns, on the full path (after
    lines, payments, entitlements, inside the transaction) and on the header-only shortcut, where the
    refresh exists to overwrite whatever the caller believed about those four columns before the
    update is sent.
  - The merge rule moved to `OrderRollupBehavior` and is explicit that the ROW wins, including when it
    reports NULL: a row saying "not computed yet" is more current than an entity's leftover figure.
  - The order form's Balance and Paid tiles no longer return a bare dash for a record that exists.
    `AmountPaid` is NOT NULL, and the balance falls back to the pricing preview's total less anything
    paid, so an unsaved draft shows real figures instead of two dashes.
  - `V202609021530__v0.1.x__Repair_OrderHeader_Rollups.sql` re-derives `TotalGross`, `AmountPaid` and
    `Balance` from lines and captured payments for the rows that disagree with them, repairing orders
    already erased. It deliberately leaves `FulfillmentStatus` alone: that column has unrelated drift
    from never being backfilled when it was added, and correcting it inside a money repair would
    quietly change what the fulfilment queue shows.

### Patch Changes

- @mj-biz-apps/orders-entities@5.6.0

## 5.5.0

### Patch Changes

- Updated dependencies [24f8625]
  - @mj-biz-apps/orders-entities@5.5.0

## 5.4.0

### Patch Changes

- Updated dependencies [d29cc6c]
  - @mj-biz-apps/orders-entities@5.4.0

## 5.3.0

### Patch Changes

- Updated dependencies [4fcc102]
- Updated dependencies [406bcaa]
  - @mj-biz-apps/orders-entities@5.3.0

## 5.2.1

### Patch Changes

- @mj-biz-apps/orders-entities@5.2.1

## 5.2.0

### Minor Changes

- c724132: Add CheckoutWidget, CheckoutWidgetDistribution, and CheckoutSession entities, embedded checkout widget component, and session management with atomic Compare-and-Swap state transitions and identity claiming.
- 44944fd: Add the entitlement read contract: `Orders.CheckEntitlement` and `Orders.ListEntitlements` evaluate in-force access (status + window + subscription access-through) instead of polling `EntitlementGrant.Status`. Cancel now revokes standing grants when access-through has already passed.

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

- 844f85d: Public checkout URL is `GET /checkout/:slug` on the existing `OrdersCheckoutEdge` (vanilla HTML talking to the POST edge). The server package publishes `MJ_SERVER_EXTENSIONS` (and `package.json` `memberjunction.serverExtensions`) so a host that lists `@mj-biz-apps/orders-server` in `dynamicPackages.server[]` auto-loads the webhook and checkout edge. Initialize writes a SKU-resolved `productId` onto Configuration so that page can draft a line.
- c490929: Checkout follow-up from the #115/#116 security review: fail-closed open catalog without widget CompanyID; do not serve the element source map on the public payment route unless opted in; book CapturePayment from payment_intent.succeeded (including AlreadyApplied retries); require a CSP nonce on the host page renderer.
- d8d94c7: Declare `@mj-biz-apps/tasks-entities` as a type-only optional peer (devDependency + optional peerDependency). The import is `import type`, so hosts without bizapps-tasks must not be forced to install it.
- ce76550: Type the checkout-capture terminal Task through `@mj-biz-apps/tasks-entities` (typed `TypeID`/`Name`/`Status` setters and TaskType.ID getter) instead of untyped `.Set()` / `.Get()`.
- cf88598: Resolve the GENERAL TaskType by Code before raising a checkout-capture terminal Task, so TypeID is set and the row can save.
- f426462: Classify checkout CapturePayment webhook failures: terminal refusals (and events older than 12h) return 200 plus a `[CHECKOUT-CAPTURE-TERMINAL]` marker so Stripe does not retry for three days; transient failures still 500. Stripe `created` is carried as `WebhookEvent.OccurredAt`.
- 8ad33a8: Route `Orders.PreviewPrice` through `OrderPricingService` (the same walk save and `Orders.PriceOrder` use) instead of calling `ResolvePrice` directly. Price resolution now loads rules from every in-force list assigned to the customer, so a member list cannot lose to catalog `BCP-STD` when both assignments are Priority 0.
- 6367347: Restore local definitions of the identity-claim driver contracts so the repo builds against
  published MemberJunction again.

  `orders-core-entities-server` imported `BaseIdentityClaimDriver`, `ClaimContext`,
  `ClaimRedeemContext` and `ClaimResult` from `@memberjunction/core-entities`, and
  `EscapeSQLString` from `@memberjunction/global`. None of those five symbols exist in any
  published MJ package — verified against `6.1.0-edge.3`, the newest published edge and the version
  the lockfile pins, whose tarballs contain no occurrence of any of them (`@memberjunction/global`
  ships `Escape` and `EscapeHTML`). The imports resolved only for developers dev-linked to an MJ
  working tree, so CI failed with ten TS2305 errors, the package did not compile, and three test
  suites could not load at all — `EntitlementGrantClaimDriver`, `GuestOrderClaimDriver`, and
  `registry-parity`, the last of which imports the package by name and takes its 76 checks down with
  it. `Class extends value undefined` was the `@RegisterClass`/`extends` on an undefined import.

  The contracts now live in `identityClaimContracts.ts` and `EscapeSQLString` in `sql-guards.ts`,
  both marked as fallbacks with the deletion steps in their headers. Keeping the contracts in one
  module rather than inline per driver means the eventual swap back is a specifier change at four
  import sites, and any drift between this shape and the published one surfaces as a compile error
  at exactly those sites.

  `CLAUDE.md`'s SQL-safety rule mandated the `@memberjunction/global` import that caused half of
  this, so it now points at `sql-guards.ts` and says why.

  No behaviour change: 1235 unit tests pass, up from 989 running with 3 suites dead.

- Updated dependencies [e21ad46]
- Updated dependencies [07e0b10]
- Updated dependencies [c490929]
- Updated dependencies [2daf9b9]
- Updated dependencies [94af4e5]
- Updated dependencies [d0e5450]
- Updated dependencies [8ad33a8]
  - @mj-biz-apps/orders-entities@5.2.0

## 5.1.0

### Minor Changes

- c094b64: Add `CustomerPaymentTerms` — the terms a particular buyer negotiated

  Date-effective and optionally scoped to one selling company, keyed on organization or person the way
  `CustomerTaxExemption` and `CustomerPaymentMethod` already are. Not an IS-A extension of
  `AccountingCompanyProfile`: that profile IS-A `Company` and describes the SELLER, whereas a buyer
  here is an Organization or a Person — there is nothing to extend.

  Seeds the six standard `PaymentTermsType` rows the walk resolves against; the table had none.

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

- 3c2b404: Move payment allocations onto a related-record collection, and let the graph write them.

  `Payment Headers → Payment Lines` is declared as `RelatedRecordCollection` metadata, so `Lines`
  exists on both tiers. `PaymentHeaderEntityServer` drops its `_lines` array and its `savePendingLines`
  loop entirely: a payment's allocations are complete when they arrive — the caller supplies them,
  whether that is manual entry, an order's initial payment or a reversal — and the gateway has already
  settled by then, so there is nothing left to decide and no reason to keep ownership of the write.

  The graph does it better than the loop it replaces: removals run before inserts, and the foreign key
  is stamped at execution time, so it is correct even though the header's key is minted by that same
  save.

  No `Sequence` policy, unlike order lines: an allocation is identified by which order line it pays,
  not by position, and `PaymentLine` has no line-number column.

  `AllocatedAt` is now defaulted before the header save rather than during the line loop. It is
  `NOT NULL` and no caller is required to author it, so companion validation — which runs from the
  parent's save, before any line's own `Save()` — would otherwise reject allocations from every caller
  that relied on the fallback.

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

### Patch Changes

- 319f76e: A booked order can no longer add, remove, or reprice lines, or restate the initial tender. Validate refuses those edits, the form hides the catalog picker, and the unused Fast Entry page is removed.
- c094b64: Correct CI's stale figures and stop claiming changesets are enforced

  The workflow described 217 integration checks and 250 unit tests; there are 366 and 999.
  `migrations/_README.md` said a changeset was required "(CI enforces)" — there was no changeset
  tooling in the repo at all, and the claim sat unenforced through several schema changes. The rule
  above it claimed migration timestamps were CI-enforced too; no such check has ever existed either.
  Both now state what is true, which is that they are review items.

  Adds `@changesets/cli` configured against this repo's `next` trunk, and an ADVISORY warning
  annotation on pull requests. Advisory rather than a gate on purpose: a red X on a documentation PR
  with no version impact is a check people learn to ignore.

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
- 1d23637: A new Draft with no lines now mints OrderNumber instead of failing the insert. Subscriptions consume accounting-ng's deferred-revenue waterfall (the 3-column stub is gone) and label the rail Terms. Event-line extensions reload CompanyID/UnitPrice from the saved parent after the graph returns.
- 5b379d1: Fix four money and subscription defects found by stressing the UI

  Twenty-six adversarial orders were designed with their expected results written BEFORE running them,
  then driven through the real UI and checked against the database. Four defects survived that, and
  none would have been found by reading the code.

  **A flat price billed the wrong amount.** A `Flat` rule's total was reconstructed as
  `quantity × derived_rate`, so three of a 100.00 flat pack billed **99.99** — a flat amount that
  cannot be represented as a unit rate loses money on every sale. `LineGross` is now the single
  definition of a line's gross, shared by all six consumers, and takes the exact extended amount the
  pricing pass computed rather than re-deriving it. Booked lines short-circuit entirely, because their
  money is frozen by trigger 51003 and any figure that cannot be reproduced from stored state alone
  would fail the confirm.

  **Two lines for one subscription created two subscriptions** instead of extending one — duplicate
  billing and a customer holding two overlapping terms.

  **Subscriptions booked to the order header's company**, not the line's, putting the wrong company on
  the ledger for any multi-company order.

  **`OrderLine.SubscriptionID` was never written back**, so the link existed in one direction only —
  which is also what hid the duplicate-subscription bug from the first validator, which reported "no
  subscriptions" and passed a broken order.

  Also refuses products that are discontinued or outside their sale window at confirm, tested against
  the ORDER's date rather than today's.

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

- 65ebe2c: GL account resolution now walks product → category → product type → company, and
  ORD-WORLD seeds the accounts, dimensions, and company-level AR links a confirm needs.

  Booking also force-refreshes the accounting engine so MJAPI sees links written by
  ORD-00 in another process, instead of reporting "No GL account is linked for role
  Accounts Receivable" against a company that already has the link.

- f4cce15: State the overdue rule once, in `overdue.ts`, and have `GetOverdueWorklist` read it. Three surfaces
  derived it independently and only one excluded a voided order — so a voided order with a stale
  balance appeared on collections lists as money owed.
- 65b60a9: Default price/tax/secret resolvers are intentionally registered with no ClassFactory key. Mark those registrations so Explorer/MJAPI stop warning at boot, and probe for a plugin key before CreateInstance so the walk does not fall back (and warn) on every Product/Category/Company miss.
- 75b331e: Stamp JournalEntryID on the Order Line parent and skip re-saving a clean IS-A line extension. Confirming an event order no longer fails with Field OrderHeader does not exist on Event Order Lines.
- Updated dependencies [933075e]
- Updated dependencies [319f76e]
- Updated dependencies [b32c32a]
- Updated dependencies [c094b64]
- Updated dependencies [4cbd90e]
- Updated dependencies [fad54cb]
- Updated dependencies [e468e73]
- Updated dependencies [a09b96c]
- Updated dependencies [be5005a]
- Updated dependencies [0ff52d7]
- Updated dependencies [5b379d1]
- Updated dependencies [0db0276]
- Updated dependencies [79bb2b3]
- Updated dependencies [25c6b24]
- Updated dependencies [7d04b06]
- Updated dependencies [797303e]
- Updated dependencies [be5bcde]
- Updated dependencies [c094b64]
- Updated dependencies [54b33f0]
- Updated dependencies [f4df491]
- Updated dependencies [f59a6fb]
- Updated dependencies [78ae16a]
- Updated dependencies [c094b64]
- Updated dependencies [f4cce15]
- Updated dependencies [6e50c38]
- Updated dependencies [6e6ec69]
- Updated dependencies [49d9ef3]
- Updated dependencies [6e8eba0]
- Updated dependencies [65b60a9]
- Updated dependencies [389a381]
- Updated dependencies [b6031e2]
- Updated dependencies [c094b64]
- Updated dependencies [72e0e8e]
  - @mj-biz-apps/orders-entities@5.1.0
