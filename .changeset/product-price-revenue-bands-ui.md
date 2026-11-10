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
  gaps and overlaps in the ladder. A banded product opens on this view. A proposed name carries the
  price list's name on a list tab and a "(2)" suffix when the product already has a price of that name,
  so the same ladder can exist on Standard and a list and a band can be re-added beside a deactivated
  one (`UX_ProductPrice_Product_Name` is unique per product whatever the list or status). Emptying a
  price field and clicking away keeps the old amount; it no longer saves $0.00.
- **Deactivate instead of delete.** Every price shows whether it is active, expires on a date, or has
  expired; inactive prices are hidden until asked for. Deactivate sets the price inactive, so lines
  already priced keep their price and new lines no longer get it; Activate undoes it. Status and
  expiration date are editable on the card, and the card links to the full record.
- **Conditions.** The When builder is labelled "Conditions" and lists the handful of fields a price rule
  tests (status, type, region, revenue) instead of every column of five entities; "Show all fields" shows
  them all. A revenue band's conditions read as "Customer annual revenue $2M – $5M".
- **Currency fields.** Every price input shows and accepts money (`$12,500.00`), not a bare number
  (`mjoCurrency`, exported from orders-ng). The parser reads a currency sign, thousands commas, one
  decimal point, a minus sign or accounting parentheses, and refuses anything else (`12k`, `1.250,00`)
  rather than guessing.
- **Simulate price** takes the sample customer's annual revenue, applies the resolver's own status, date
  and quantity checks, reports a priority tie as the conflict it would be, and says why each price was
  not applied; blank revenue shows what any price that tests revenue does when no figure is on file. On
  a price-list tab it prices the way the resolver prices a customer on that list: the list's rows at one
  priority higher, then the Standard rows, so a list that does not price the line shows the Standard
  price it would fall back to.
- **Price lists.** The base tab is "Standard" (prices every customer can receive); a price list's tab
  appears only when it prices this product, or in Edit. The grid shows the selected tab's rows, like the
  other two views, and prices at one priority list lowest revenue band first.
- **One order everywhere.** The cards, the grid, the simulation and the product's Overview list prices
  highest priority first, revenue bands lowest band first within a priority, then by name: one
  comparator, `ComparePriceRows` in orders-entities. The Overview shows "Active prices" (name, who it
  applies to, amount) from every price row of the product, not the first page of them, and counts the
  inactive ones; its cards use plain labels (Sales summary, Entitlements, Event details).
- **Accounting tab.** Three cards with one look: Accounting setup (the product's own columns),
  Accounts used when an order is confirmed (a Role / GL account / Assigned on table from the server's walk, with a
  one-line warning naming only the roles confirm requires: Accounts Receivable and Sales, plus Deferred
  Revenue for a deferred recognition type, re-read when the type or company changes on the form) and
  Accounts assigned directly to this product (role, account, effective window, status, with Add
  assignment, Edit, End and Delete as labelled forms rather than icon rows). Assignment statuses read
  Active / Scheduled / Superseded.
- **Product form layout.** The header strip carries list price, type, category, availability, revenue
  recognition and tax, with the selling company as a chip beside the status. A Details panel directly
  under the header holds Company, Status, Sellable to new customers and the availability dates; it
  replaces the Lifecycle panel and the empty generated Details section. The Overview's Active prices
  table is full width with a right-aligned Amount column.
- **Server.** `ProductPriceEntityServer` reads both rows' Applicability through `ParseRevenueBand` and
  lets two revenue bands with disjoint ranges share a priority; two bands that overlap are refused with a
  message naming the other band. `pricing/revenueBands.ts` holds the band contract (parse, build, name,
  overlap, ladder gaps) for both tiers.
