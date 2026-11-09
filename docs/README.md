# Orders docs

The files in this folder describe the system as it is built. Plans for work not yet started go in
[`../plans/`](../plans/README.md). When the system changes, update the doc that describes it.

## Start here

| Doc | What it covers |
|---|---|
| [HOW_THE_SYSTEM_WORKS.md](HOW_THE_SYSTEM_WORKS.md) | The running system: packages, the path an order takes, booking and the ledger, pricing, payments, subscriptions, reversals, the UI, tests, local setup, and where to change what. |

## Binding rules

| Doc | What it covers |
|---|---|
| [ui-architecture.md](ui-architecture.md) | No data-access service layer: components bind to entity classes and remote operations directly. |
| [database-migrations.md](database-migrations.md) | Schema changes are new migrations; merged migrations are locked; how metadata reaches a host. |

## Reference

| Doc | What it covers |
|---|---|
| [ERD.md](ERD.md) | Every table, column, relationship, value list and trigger, generated from a database built by the migrations. |
| [orders-api-and-ui-architecture.md](orders-api-and-ui-architecture.md) | How the browser composes an order, every remote operation, and the section rails and tabs. |
| [checkout-widget-and-session-architecture.md](checkout-widget-and-session-architecture.md) | The embeddable checkout: widgets, distributions, sessions, the public endpoints and configuration keys. |
| [workflows.md](workflows.md) | For business users and administrators: the moments in Orders worth automating, the conditions that catch them, the invoice-on-confirmation automation Orders ships, and the rules Orders adds. Builds on MemberJunction's workflow guides. |
| [outbound-events.md](outbound-events.md) | Events Orders sends to registered consumers when a sale confirms or a grant changes. |
| [billcom-invoice-rail.md](billcom-invoice-rail.md) | Sending invoices to Bill.com and recording the payments made there. |
| [hubspot-payments.md](hubspot-payments.md) | Reading the payments a company's HubSpot portal collects, before the payout. |
| [overdue-and-layered-base-views.md](overdue-and-layered-base-views.md) | How overdue is decided, and the CodeGen steps for the layered `vwOrderHeaders` view. |
| [dependency-on-accounting.md](dependency-on-accounting.md) | Why Orders cannot book without BizApps Accounting, and how each package declares it. |
| [../plans/entitlement-read-contract.md](../plans/entitlement-read-contract.md) | The design that `Orders.CheckEntitlement` and `Orders.ListEntitlements` implement; its status line says which parts were not built. It is in `plans/` because code and a released migration cite that path. |

## Data and testing

| Doc | What it covers |
|---|---|
| [reviewing-the-data.md](reviewing-the-data.md) | The two committed datasets and the queries to inspect them. |
| [adversarial-order-cases.md](adversarial-order-cases.md) | Edge cases tried against booking, with each bug's status and the integration check that covers it. |
| [../packages/IntegrationTests/README.md](../packages/IntegrationTests/README.md) | How to run the integration suite and add a bundle. |

## Records

[`superpowers/`](superpowers/) holds the Bill.com design, spike results and implementation plan. They
record the decisions behind [billcom-invoice-rail.md](billcom-invoice-rail.md). They stay at these paths
because code and metadata cite them. Do not add new files there.

## Elsewhere in the repo

- [`../README.md`](../README.md): what the app is, installing it, and the repo layout.
- [`../CLAUDE.md`](../CLAUDE.md): rules for anyone, person or agent, changing the code.
- [`../migrations/_README.md`](../migrations/_README.md): migration naming and the CI checks on migrations.
- Each package's `README.md` under [`../packages/`](../packages/): what the package holds and how it is built.
- [`../plans/README.md`](../plans/README.md): open plans, and the archive with the decision log (D-numbers) that code cites.
- [`../mockups/PROVENANCE.md`](../mockups/PROVENANCE.md): where the mockups come from and how they map to MJ components.
