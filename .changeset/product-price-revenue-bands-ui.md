---
'@mj-biz-apps/orders-entities': minor
'@mj-biz-apps/orders-ng': minor
'@mj-biz-apps/orders-core-entities-server': patch
---

Revenue-band pricing can be set up and maintained from the product's Pricing panel, and two bands with
disjoint revenue ranges no longer collide (#1004).

- **Band editor.** The Pricing panel gains a "Revenue bands" view: one row per band of the bill-to
  organization's annual revenue, with the edges in $M, the price, and the band's status. Edit an edge or
  a price in place; add a band; start a whole ladder from a list of edges (ten bands from "Under $2M" to
  "$250M+" proposed). The editor writes the band's `Applicability` and proposes its name, and reports
  gaps and overlaps in the ladder. A banded product opens on this view.
- **Deactivate instead of delete.** Every price shows whether it is active, expires on a date, or has
  expired; inactive prices are hidden until asked for. Deactivate sets the price inactive, so lines
  already priced keep their price and new lines no longer get it; Activate undoes it. Status and
  expiration date are editable on the card, and the card links to the full record.
- **Conditions.** The When builder is labelled "Conditions" and lists the handful of fields a price rule
  tests (status, type, region, revenue) instead of every column of five entities; "Show all fields" shows
  them all. A revenue band's conditions read as "Customer annual revenue $2M – $5M".
- **Currency fields.** Every price input shows and accepts money (`$12,500.00`), not a bare number
  (`mjoCurrency`, exported from orders-ng).
- **Simulate price** takes the sample customer's annual revenue, applies the resolver's own status, date
  and quantity checks, reports a priority tie as the conflict it would be, and says why each price was
  not applied; blank revenue shows what a band does when no tax return is on file.
- **Price lists.** The base tab is "Standard" (prices every customer can receive); a price list's tab
  appears only when it prices this product, or in Edit. The grid shows the selected tab's rows, like the
  other two views, and prices at one priority list lowest revenue band first.
- **One order everywhere.** The cards, the grid and the simulation list prices highest priority first,
  revenue bands lowest band first within a priority, then by name. The product's Overview shows
  "Active prices" (name, who it applies to, amount) in that order and counts the inactive ones, and its
  cards use plain labels (Product details, Sales summary, Revenue recognition).
- **Accounting tab.** Three cards with one look: Accounting setup (the product's own columns),
  Accounts in use (a Role / GL account / Source table from the server's walk, with the resolution chain
  behind a "How it resolves" toggle and a one-line warning for roles with no account) and Account links
  on this product (role, account, effective window, status, with Add link, Edit, End and Delete as
  labelled forms rather than icon rows). Link statuses read Active / Scheduled / Superseded.
- **Product form layout.** The header strip carries list price, type, category, availability, revenue
  recognition and tax, with the selling company as a chip beside the status. A Details panel directly
  under the header holds Company, Status, Sellable to new customers and the availability dates; it
  replaces the Lifecycle panel and the empty generated Details section. The Overview's Active prices
  table is full width with a right-aligned Amount column.
- **Server.** `ProductPriceEntityServer` reads both rows' Applicability through `ParseRevenueBand` and
  lets two revenue bands with disjoint ranges share a priority; two bands that overlap are refused with a
  message naming the other band. `pricing/revenueBands.ts` holds the band contract (parse, build, name,
  overlap, ladder gaps) for both tiers.
