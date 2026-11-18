# Workflows and automations in Orders

For the people who run order-to-cash on Orders and the administrators who automate it. It builds on
MemberJunction's [Workflows for Business Users](https://github.com/MemberJunction/MJ/blob/next/guides/WORKFLOWS_FOR_BUSINESS_USERS.md)
guide; read that first for what a workflow is, how one starts, and why a condition should say
**becomes**, not **is**. This page covers what is specific to Orders: the moments worth automating,
the conditions that catch them, the automation Orders ships, and the rules Orders adds.

Developers: the record-change trigger mechanics are in MemberJunction's
[Workflows and Task Graphs Guide](https://github.com/MemberJunction/MJ/blob/next/guides/WORKFLOW_AND_TASK_GRAPH_GUIDE.md)
("Triggers: when a workflow runs").

## Moments worth automating

**These are ideas to build from, not features.** Orders ships no workflows, and only one record-change
automation, which ships switched off ([below](#the-automation-orders-ships-send-the-invoice-on-confirmation)).
Each row is a record change an automation *could* listen for. An administrator builds the ones an
installation wants, and the condition column is what they would enter as the trigger's filter.

| Moment | Record and event | Condition | Example automation |
|---|---|---|---|
| An order is confirmed | `MJ_BizApps_Orders: Order Headers`, updated | `DidFieldChangeToValue('Status', 'Confirmed')` | Send the customer their invoice; notify the account manager; start an onboarding workflow |
| An order is voided | Order Headers, updated | `DidFieldChangeToValue('Status', 'Voided')` | Tell the customer, and whoever is preparing fulfilment |
| An order is fulfilled | Order Headers, updated | `DidFieldChangeToValue('FulfillmentStatus', 'Fulfilled')` | A delivery confirmation, or a satisfaction survey a week later |
| A payment is captured | `MJ_BizApps_Orders: Payment Headers`, updated | `DidFieldChangeToValue('Status', 'Captured')` | A receipt; a thank-you |
| A payment fails | Payment Headers, updated | `DidFieldChangeToValue('Status', 'Failed')` | Ask the customer to update their card; open a task for collections |
| A payment is refunded | Payment Headers, updated | `DidFieldChangeToValue('Status', 'Refunded')` | Confirm the refund to the customer |
| Auto-renew is turned off | `MJ_BizApps_Orders: Subscriptions`, updated | `DidFieldChangeToValue('AutoRenew', false)` | Retention outreach while there is time to act |
| A subscription is canceled | Subscriptions, updated | `DidFieldChangeToValue('Status', 'Canceled')` | Exit survey; win-back sequence |
| Access is granted | `MJ_BizApps_Orders: Entitlement Grants`, created | `NewValues.Status === 'Active'` | Welcome email with how to get started |
| Access is suspended, expires or is revoked | Entitlement Grants, updated | `DidFieldChange('Status')`, then branch on the new status | Tell the person why, and what to do next |

Notes on the table:

- **A created record has no "before".** That is why the grant row tests `NewValues` rather than a
  change. An update trigger never sees a record's creation.
- **Orders confirms an order by saving it as `Confirmed`.** If something in your installation creates
  orders already confirmed (a custom import, for example), add a *created* trigger testing
  `NewValues.Status === 'Confirmed'` beside the updated one.
- **The values a condition can name** are fixed by Orders: an order's `Status` is `Draft`, `Quoted`,
  `Confirmed` or `Voided`; `FulfillmentStatus` is `Pending`, `PartiallyFulfilled`, `Fulfilled`,
  `Returned` or `NotApplicable`; a payment's `Status` is `Pending`, `Captured`, `Failed`, `Refunded` or
  `Disputed`; a subscription's `Status` is `Trialing`, `Active`, `Paused`, `Canceled` or `Migrated`; a
  grant's `Status` is `Active`, `Suspended`, `Expired` or `Revoked`. [ERD.md](ERD.md) lists every field.

## Moments that need a schedule instead

Some things become true without anyone saving a record, so no record-change trigger can catch them.
These are ideas too: a workflow you build, run on a schedule, can find them.

- **An invoice becomes overdue.** Overdue is worked out when an order is read, from its due date and
  balance; nothing is saved on the day it happens ([overdue-and-layered-base-views.md](overdue-and-layered-base-views.md)).
  A daily workflow over overdue orders can send reminders.
- **A subscription term is about to end.** A daily or weekly workflow over terms ending in the next
  N days can warn the customer or the account owner.
- **A term lapses without renewal.** This changes nothing on the access grant, so no grant trigger
  fires; find lapsed terms on a schedule.

## The automation Orders ships: send the invoice on confirmation

Orders ships one record-change automation, in `metadata/entity-actions/.orders-entity-actions.json`.
When an order changes, it runs the **Send Document** action, which renders the order as the
customer-facing bill and sends it to the billing contacts the order names. It refuses anything that is
not a bill.

**It ships switched off (`Status` = `Pending`), and with no condition.** An order is saved many times
after it is confirmed: posting stamps its journal entries, fulfilment moves its fulfilment status,
payments move its balance. Without a condition, the automation would send the invoice again on every
one of those saves.

To turn it on in an installation, an administrator:

1. adds an Action Filter to the binding with the condition `DidFieldChangeToValue('Status', 'Confirmed')`;
2. sets the binding's `RunMode` to `Durable` (see below);
3. optionally narrows it to one company, with the binding's `ScopeEntityID` and `ScopeRecordID`;
4. sets its `Status` to `Active`.

Do not activate it without step 1.

## Rules Orders adds

- **Make anything outward-facing durable.** Confirming an order is one transaction: booking, tax, the
  journal entries. An automation runs only after that transaction commits. A binding whose `RunMode`
  is `Durable` is tied to that transaction, so it never fires for a confirmation that rolled back, and
  it survives a server restart. The default, `Inline`, has neither guarantee. Use `Durable` for every
  automation that emails, messages or calls another system.
- **Write transitions, always.** Orders saves orders, payments and subscriptions often, for reasons a
  person never sees (rollups, posting, payment application, renewal bookkeeping). A condition that
  describes a state (`NewValues.Status === 'Confirmed'`) on an *updated* trigger fires on all of them.
- **A confirmed order is frozen.** Its money, parties, company and date cannot change. An automation
  that tries to edit them fails. Changes go through Orders' own operations: returns, cancellations,
  amendments, concessions.
- **Orders computes every amount.** An automation that needs a number reads it from the order (its
  totals and balance), never recomputes price, discount or tax.
- **Integrations use outbound events, not workflows.** For another *system* to learn that a sale
  confirmed or access changed, register a consumer for [outbound events](outbound-events.md): it is
  retried, deduplicated, and dead-lettered with an alert. Workflows suit people-facing work: messages,
  tasks, reviews.

## Shipping an automation with Orders

An automation is metadata: an `MJ: Entity Actions` row with its invocation, filter and parameters. One
that every Orders installation should get goes in `metadata/entity-actions/`, and reaches an
installation only through a release's metadata migration ([database-migrations.md](database-migrations.md)).
An automation one installation wants for itself is created in that installation.

## Learn more

- [Workflows for Business Users](https://github.com/MemberJunction/MJ/blob/next/guides/WORKFLOWS_FOR_BUSINESS_USERS.md):
  the concepts, for everyone
- [Workflows and Task Graphs Guide](https://github.com/MemberJunction/MJ/blob/next/guides/WORKFLOW_AND_TASK_GRAPH_GUIDE.md):
  the mechanics, for developers
- [Sales workflows](https://github.com/MemberJunction/bizapps-sales/blob/next/docs/WORKFLOWS.md): deals
  that create and confirm Orders orders
- [HOW_THE_SYSTEM_WORKS.md](HOW_THE_SYSTEM_WORKS.md): how orders, payments and subscriptions behave
