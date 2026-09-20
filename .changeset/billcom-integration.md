---
'@mj-biz-apps/orders-entities': minor
'@mj-biz-apps/orders-core-entities-server': minor
'@mj-biz-apps/orders-server': minor
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
`Orders.CancelExternalInvoice` archives an unpaid invoice and is blocked when money has been applied.
Native email delivery refuses a unit that is invoiced through the rail.

**Payments are polled, once.** Bill.com publishes no payment-received webhook, so
`Orders.PollExternalPayments` reads receivable payments since a stored watermark, matches
`invoicePayments[]` to `ExternalInvoice` rows by the rail's invoice id (all or nothing), and captures
each cleared payment through `Orders.CapturePayment` with `IdempotencyKey = 'billcom:<id>'`. Unknown
statuses are held, unmatched invoices capture nothing, reversals are flagged for a person. A verified
Bill.com invoice webhook (`POST /webhooks/billcom/:providerId`, HMAC-SHA256) only nudges that poll to
run now.

**Schema.** New tables `ExternalInvoice`, `ExternalCustomer`, `ExternalPayment`,
`PaymentProviderSyncState`; new nullable `PaymentProvider.CompanyIntegrationID`. Three new `V`
migrations, idempotent; the FK to `OrderHeaderPaymentSchedule` is added only where that table exists.
CodeGen output is not yet folded — the migrations have not been applied to a development database
from this branch, and the server addresses the new entities by name through `RunView`/`GetEntityObject`.

**Scheduling.** Two Actions and two `MJ: Scheduled Jobs` rows (half-hourly send in business hours,
hourly poll), both shipped **Disabled and set to Preview**, like the renewal job. The metadata rows
reach a host only through a release `*__Metadata_Sync.sql`, which this change does not yet include.
