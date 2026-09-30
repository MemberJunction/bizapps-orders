# @mj-biz-apps/orders-server

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
- fa90781: Migration `V202609291308` adds the OutboundEvent and OutboundDelivery tables: a transactional outbox of `OrderConfirmed` and `GrantStatusChanged` events, and one delivery row per event per registered consumer with its status (`Pending`, `Delivered`, `DeadLettered`), attempts, next attempt, deadline and lease. Includes its CodeGen output: the generated entity classes, GraphQL types, forms, and the Outbound Events sections on the Order Header and Entitlement Grant forms.

### Patch Changes

- 854a137: Checkout can run a host's account step after payment. A host registers a `CheckoutAccountStep` subclass. `/complete` confirms the order without waiting on the host and answers `AccountStep: true`; the widget then calls `POST /checkout/account`, which calls the host's `EnsureAccount` (limited to `HostTimeoutSeconds`, default 10) and returns `Account: { Outcome, Message?, CanSetPassword, VerificationRequired }` (`Created`, `Exists` or `Failed`). For `Created` the public checkout shows a password form, and `POST /checkout/account/password` passes the password to the host's `SetPassword` — once, only for the account this checkout created, within `PasswordWindowMinutes` (default 5), never stored or logged. `Failed` offers "Try again". A host answers `NotApplicable` for a checkout it makes no logins for, which then has no account step. The seam requires the host to keep a created account unable to sign in, and unlinked from the Person, until the e-mail is verified. With no step registered, checkout behaves as before.

  **Host obligations.** The checkout never proves the buyer owns the e-mail they typed. A host that registers a `CheckoutAccountStep` must keep an account it answers `Created` unable to sign in until it has verified the e-mail (for example with an e-mailed link), and must not link the new login to `PersonID` until then. It should answer `Created`, not `Exists`, for an account it already created for the same `SessionID`. Until #395 is fixed, also answer `VerificationRequired: true`: without it, the widget tells the buyer they can sign in straight away. Details are in "Account Step After Payment" in `docs/checkout-widget-and-session-architecture.md`.

- 6e5077d: `<mj-orders-checkout>` can be embedded inside another widget. New attributes: `email` prefills the e-mail field while it is empty; `source` and `source-ref` say where the checkout came from and are kept on the checkout session as `MetadataJSON.Attribution` (`NormalizeCheckoutAttribution`; an unreadable one is dropped, never refused). A host dispatches `checkout-reset` on the element to return it to a blank form; it is refused with `checkout-reset-refused` while a payment is in flight or the account step is unsettled, it always starts a new session, and it reads `email`, `source` and `source-ref` again for the next conversation.
- Updated dependencies [4d6f410]
- Updated dependencies [854a137]
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
- Updated dependencies [61fb0e6]
  - @mj-biz-apps/orders-entities@5.21.0
  - @mj-biz-apps/orders-core-entities-server@5.21.0
  - @mj-biz-apps/orders-actions@5.21.0

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

- d71575a: Orders now record who confirmed them. `OrderHeader.ConfirmedByUserID` (FK to `__mj.User`) is written by the booking save from the save's context user, in the same write as `ConfirmedAt`, and is NULL when the booking has no context user. Orders booked before this release keep NULL: who confirmed them is not recorded anywhere, so nothing is backfilled. Once an order has a `ConfirmedAt` the column cannot change: `Validate()` refuses it with the other booked header fields, and trigger 51017 refuses it at the database. Migration `V202609281000` adds the column, the trigger and their CodeGen output.
- 102ea17: Percentage-of-completion revenue recognition (golive #241, plan Part F / D90, W10/W11). `RevenueRecognitionType.ScheduleBasis` (`AtBooking` | `OnMeasurement`; defaults to `AtBooking`, so the three existing types are unchanged) and the new `OrderLineProgressMeasurement` table — one attested observation of cumulative percent complete per line per period, immutable once posted. A `ProgressRecognitionDriver` family alongside the booking drivers, with `ManualAttestation` shipped. New operation `Orders.RecordProgress` posts the cumulative catch-up (`LineTotalNet × percent − the line's RecognizedToDate`) as a `RevenueRecognition` entry crediting Sales, debiting Deferred Revenue up to the line's deferred balance and Unbilled Receivable beyond it (D92 rule 2); a backward slide mirrors the same entry; a zero delta succeeds and writes nothing; `Preview` computes without writing. The operation advances the line's `RecognizedToDate` in the same transaction as the entry, and is gated on the order being confirmed rather than on the line carrying a booking entry, since a POC line on a company with a payment schedule books no value entry at confirm. `Orders.GetProgressWorklist` lists open POC lines with their last observation. Metadata: the Percentage of Completion rev-rec type and the Project / Implementation product type. Receivables rail gains a Progress attestation page.

### Patch Changes

- 53efeb9: The checkout element bundle (`GET {RootPath}/element/main.js`, and its source map when served) now carries `Access-Control-Allow-Origin: *` and `Cross-Origin-Resource-Policy: cross-origin`, so a host on another origin can load it with `<script type="module">`. Before, the browser refused the cross-origin module and the widget never rendered. The bundle is public static code; the checkout POST routes keep applying each widget's `allowedOrigins`.
- Updated dependencies [a1114ed]
- Updated dependencies [7af7a46]
- Updated dependencies [41d32be]
- Updated dependencies [2ddd206]
- Updated dependencies [0bcafbd]
- Updated dependencies [22ee8ec]
- Updated dependencies [d0c5fcd]
- Updated dependencies [d71575a]
- Updated dependencies [3a8b6b2]
- Updated dependencies [e131f07]
- Updated dependencies [a67d0ef]
- Updated dependencies [102ea17]
- Updated dependencies [8d3df77]
- Updated dependencies [ada18e6]
  - @mj-biz-apps/orders-entities@5.20.0
  - @mj-biz-apps/orders-core-entities-server@5.20.0
  - @mj-biz-apps/orders-actions@5.20.0

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
  - @mj-biz-apps/orders-core-entities-server@5.19.0
  - @mj-biz-apps/orders-actions@5.19.0

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

- Updated dependencies [b3ef9d2]
- Updated dependencies [c8ad04a]
- Updated dependencies [5b5ebef]
  - @mj-biz-apps/orders-entities@5.18.0
  - @mj-biz-apps/orders-core-entities-server@5.18.0
  - @mj-biz-apps/orders-actions@5.18.0

## 5.17.0

### Minor Changes

- 19983f5: A scheduled order books only what it has invoiced (D92, golive #240).

  Confirming an order used to raise the whole contract value on the balance sheet the day it was signed. For a three-year contract billed annually that put three years of receivable there before anyone had billed a penny, and it made Deferred Revenue mean "contract value" rather than "billing ahead of performance". Now the order and its schedule stay in the subledger and the GL records what happened: billed, collected, earned.

  A company billed by instalment books no value at confirm except the instalments already due on the order date, which confirm issues through the same act a person triggers later — `IssueInstalment`, one function, so the document number, the stamps and the entry are identical whichever route raised them. Each remaining instalment is booked when it is invoiced.

  Every order line now carries `BilledToDate` and `RecognizedToDate` (migration `V202609230400`, with this app's CodeGen output folded below the banner). The gap between them is the line's balance-sheet position, and two ordering rules follow from it: invoicing credits **Unbilled Receivable first**, up to the line's `max(0, R − B)`, then Deferred; recognising debits **Deferred first**, up to `max(0, B − R)`, then Unbilled. That is `SplitContraLegs` in `ContractBalance.ts`, and its test walks all nine steps of Andrew's Scenario 4 including the backward slide from 45% to 40%. The totals are stored signed, so an origin line and its reversals net to zero, and they are advanced by the same transactions that book the entries — a separate writer is how a total drifts from the ledger it summarises.

  Unbilled Receivable now means what the standard means by a contract asset: service delivered that the contract does not yet let us bill. That is a different thing from the future instalments the superseded D89 revision parked in the same account.

  An order with no payment schedule — dues, events, and everything the go-live conversion brings in — books exactly what it booked before, asserted on the entry's shape rather than its totals. A gift card sold to a company billed by instalment is refused with an explanation rather than guessed at. An entry that needs an Unbilled Receivable leg is refused when the company has no Unbilled Receivable account linked, rather than posted to Deferred Revenue (golive #261), so a company billed by instalment cannot confirm an order with an up-front line, or issue an instalment against earned-but-unbilled revenue, until that link exists. And a cancelled instalment no longer gives its document number back (golive #242): Bill.com 422s on a duplicate and archiving keeps the number reserved, so the count includes cancelled rows and issuing refuses a number already held by a sibling.

### Patch Changes

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

- Updated dependencies [d0489c4]
- Updated dependencies [acb0405]
- Updated dependencies [5630121]
- Updated dependencies [b550e40]
- Updated dependencies [19983f5]
  - @mj-biz-apps/orders-core-entities-server@5.17.0
  - @mj-biz-apps/orders-entities@5.17.0
  - @mj-biz-apps/orders-actions@5.17.0

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
  - @mj-biz-apps/orders-core-entities-server@5.16.0
  - @mj-biz-apps/orders-actions@5.16.0

## 5.15.0

### Minor Changes

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

### Patch Changes

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
  - @mj-biz-apps/orders-core-entities-server@5.15.0
  - @mj-biz-apps/orders-entities@5.15.0
  - @mj-biz-apps/orders-actions@5.15.0

## 5.14.0

### Minor Changes

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

- Updated dependencies [bc6588e]
- Updated dependencies [2ce84d1]
- Updated dependencies [56eb169]
- Updated dependencies [e1f4e15]
- Updated dependencies [f652c6f]
- Updated dependencies [49217aa]
  - @mj-biz-apps/orders-entities@5.14.0
  - @mj-biz-apps/orders-core-entities-server@5.14.0
  - @mj-biz-apps/orders-actions@5.14.0

## 5.13.0

### Patch Changes

- Updated dependencies [92f7e68]
  - @mj-biz-apps/orders-entities@5.13.0
  - @mj-biz-apps/orders-core-entities-server@5.13.0
  - @mj-biz-apps/orders-actions@5.13.0

## 5.12.2

### Patch Changes

- Updated dependencies [24c8436]
  - @mj-biz-apps/orders-core-entities-server@5.12.2
  - @mj-biz-apps/orders-actions@5.12.2
  - @mj-biz-apps/orders-entities@5.12.2

## 5.12.1

### Patch Changes

- @mj-biz-apps/orders-actions@5.12.1
- @mj-biz-apps/orders-core-entities-server@5.12.1
- @mj-biz-apps/orders-entities@5.12.1

## 5.12.0

### Minor Changes

- b8b2131: Fix PaymentLines query to use vwPaymentLines view with user permissions, expose \_mj**Latitude / \_mj**Longitude in GraphQL schema, and forward-heal Event Products IS-A parent fields.
- ecbfe69: Support prospective subtype resolution with SubtypeSelector and EnsureISAChild for OrderLine extension entities.

### Patch Changes

- Updated dependencies [b8b2131]
- Updated dependencies [e9bf1f9]
- Updated dependencies [888983a]
- Updated dependencies [ecbfe69]
- Updated dependencies [9b63bf1]
  - @mj-biz-apps/orders-entities@5.12.0
  - @mj-biz-apps/orders-core-entities-server@5.12.0
  - @mj-biz-apps/orders-actions@5.12.0

## 5.11.0

### Patch Changes

- Updated dependencies [a6ad8c5]
  - @mj-biz-apps/orders-entities@5.11.0
  - @mj-biz-apps/orders-core-entities-server@5.11.0
  - @mj-biz-apps/orders-actions@5.11.0

## 5.10.0

### Patch Changes

- Updated dependencies [76b3d3e]
  - @mj-biz-apps/orders-entities@5.10.0
  - @mj-biz-apps/orders-core-entities-server@5.10.0
  - @mj-biz-apps/orders-actions@5.10.0

## 5.9.0

### Patch Changes

- Updated dependencies [e121d98]
  - @mj-biz-apps/orders-entities@5.9.0
  - @mj-biz-apps/orders-core-entities-server@5.9.0
  - @mj-biz-apps/orders-actions@5.9.0

## 5.8.0

### Patch Changes

- Updated dependencies [2981938]
  - @mj-biz-apps/orders-entities@5.8.0
  - @mj-biz-apps/orders-core-entities-server@5.8.0
  - @mj-biz-apps/orders-actions@5.8.0

## 5.7.0

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
  - @mj-biz-apps/orders-actions@5.7.0
  - @mj-biz-apps/orders-core-entities-server@5.7.0
  - @mj-biz-apps/orders-entities@5.7.0

## 5.6.0

### Patch Changes

- Updated dependencies [e48bc43]
  - @mj-biz-apps/orders-core-entities-server@5.6.0
  - @mj-biz-apps/orders-actions@5.6.0
  - @mj-biz-apps/orders-entities@5.6.0

## 5.5.0

### Patch Changes

- Updated dependencies [24f8625]
  - @mj-biz-apps/orders-entities@5.5.0
  - @mj-biz-apps/orders-core-entities-server@5.5.0
  - @mj-biz-apps/orders-actions@5.5.0

## 5.4.0

### Patch Changes

- Updated dependencies [d29cc6c]
  - @mj-biz-apps/orders-entities@5.4.0
  - @mj-biz-apps/orders-core-entities-server@5.4.0
  - @mj-biz-apps/orders-actions@5.4.0

## 5.3.0

### Patch Changes

- Updated dependencies [4fcc102]
- Updated dependencies [406bcaa]
  - @mj-biz-apps/orders-entities@5.3.0
  - @mj-biz-apps/orders-core-entities-server@5.3.0
  - @mj-biz-apps/orders-actions@5.3.0

## 5.2.1

### Patch Changes

- @mj-biz-apps/orders-actions@5.2.1
- @mj-biz-apps/orders-core-entities-server@5.2.1
- @mj-biz-apps/orders-entities@5.2.1

## 5.2.0

### Minor Changes

- 2daf9b9: Fold inspected CodeGen output into a new migration so CRUD procedures and EntityField rows match columns added by later V migrations (PricingDriverClass, ProductType.Configuration, and related). A clean install was failing mj sync push of product-types on a stale spCreateProductType signature.
- 44944fd: Add the entitlement read contract: `Orders.CheckEntitlement` and `Orders.ListEntitlements` evaluate in-force access (status + window + subscription access-through) instead of polling `EntitlementGrant.Status`. Cancel now revokes standing grants when access-through has already passed.
- d0e5450: Scope CodeGen heal EXECs with authored excludeSchemas plus `@IncludedSchemaNames` for the Orders schema, instead of photographing sibling Open Apps. Strip Common Activity Types field inserts and the unscoped field-from-schema heal that broke from-scratch migrate.

### Patch Changes

- 8e42a02: Split the release into a version step and a publish step, so neither writes to a protected branch.

  `version.yml` (new, on `next`) turns pending changesets into a reviewable "Version Packages" PR —
  bumps, CHANGELOGs, the mj-app.json version and range, and a refreshed lockfile.
  `release-readiness.yml` (new) gates the version PR and any PR to `main`. `publish.yml` keeps only
  the publish half and refuses to run while changesets are pending.

  Ported from bizapps-accounting, where the old flow published 0.2.0 to npm and then failed to write
  the version bump back: `ci/commit_push.mjs` pushes straight to `main`, the `main-next-protect`
  ruleset requires a pull request, and `github-actions[bot]` cannot be granted a bypass. This repo
  carries the identical ruleset and would fail the same way on its first release.

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
- Updated dependencies [e21ad46]
- Updated dependencies [07e0b10]
- Updated dependencies [844f85d]
- Updated dependencies [c490929]
- Updated dependencies [d8d94c7]
- Updated dependencies [ce76550]
- Updated dependencies [cf88598]
- Updated dependencies [f426462]
- Updated dependencies [c724132]
- Updated dependencies [2daf9b9]
- Updated dependencies [94af4e5]
- Updated dependencies [44944fd]
- Updated dependencies [d0e5450]
- Updated dependencies [8ad33a8]
- Updated dependencies [6367347]
  - @mj-biz-apps/orders-core-entities-server@5.2.0
  - @mj-biz-apps/orders-entities@5.2.0
  - @mj-biz-apps/orders-actions@5.2.0

## 5.1.0

### Minor Changes

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

- c094b64: Enforce the order lifecycle: guard illegal status transitions in `OrderEntityServer.Save`

  `CK_OrderHeader_Status` enforced the legal SET of statuses and nothing enforced the legal MOVES.
  `Fulfilled → Draft` saved. `Voided → Confirmed` saved — a voided order could come back to life,
  keep the journal entries its reversal had already unwound, and be shipped, with every row valid and
  the constraint satisfied.

  New `OrderStatusBehavior` owns the transition table and the predicates six modules previously spelled
  out as ad-hoc string sets that had drifted apart (one of them guarded against `Cancelled`/`Canceled`,
  which are not legal order statuses at all). The guard runs in `Save`, the one path every write goes
  through, and refuses with a reason rather than a bare `false`.

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

- 5b379d1: Move the invoice, payment-intent and document-send actions into the server package

  They lived in `orders-actions` but depend on server-side entity behaviour, so the order → journal
  entry path could not be reached end to end from a running instance. Relocating them alongside the
  code they call makes that path reachable; the action bodies are unchanged.

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

- Updated dependencies [933075e]
- Updated dependencies [319f76e]
- Updated dependencies [c094b64]
- Updated dependencies [b32c32a]
- Updated dependencies [c094b64]
- Updated dependencies [4cbd90e]
- Updated dependencies [fad54cb]
- Updated dependencies [1d23637]
- Updated dependencies [e468e73]
- Updated dependencies [5b379d1]
- Updated dependencies [a09b96c]
- Updated dependencies [be5005a]
- Updated dependencies [0ff52d7]
- Updated dependencies [5b379d1]
- Updated dependencies [0db0276]
- Updated dependencies [79bb2b3]
- Updated dependencies [5b379d1]
- Updated dependencies [25c6b24]
- Updated dependencies [7d04b06]
- Updated dependencies [797303e]
- Updated dependencies [be5bcde]
- Updated dependencies [65ebe2c]
- Updated dependencies [c094b64]
- Updated dependencies [54b33f0]
- Updated dependencies [f4df491]
- Updated dependencies [f59a6fb]
- Updated dependencies [78ae16a]
- Updated dependencies [c094b64]
- Updated dependencies [f4cce15]
- Updated dependencies [3c2b404]
- Updated dependencies [6e50c38]
- Updated dependencies [6e6ec69]
- Updated dependencies [49d9ef3]
- Updated dependencies [6e8eba0]
- Updated dependencies [65b60a9]
- Updated dependencies [389a381]
- Updated dependencies [b6031e2]
- Updated dependencies [c094b64]
- Updated dependencies [75b331e]
- Updated dependencies [72e0e8e]
  - @mj-biz-apps/orders-entities@5.1.0
  - @mj-biz-apps/orders-core-entities-server@5.1.0
  - @mj-biz-apps/orders-actions@5.1.0
