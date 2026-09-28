---
'@mj-biz-apps/orders-entities': minor
'@mj-biz-apps/orders-core-entities-server': minor
'@mj-biz-apps/orders-server': minor
'@mj-biz-apps/orders-ng': minor
---

Bill.com integration: invoices out, payments in (golive #146, #147, #148, #242).

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
