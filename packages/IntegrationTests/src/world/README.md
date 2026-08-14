# ORD-WORLD

Committed integration-test catalog. **Not** app metadata.

Types (Product Type, Charge Type, Rev Rec, Subscription, Payment, Organization Type, Relationship Type, GL Account Role) live in `metadata/` and are **looked up**. Missing metadata fails the load loudly.

Everything else in this folder is tenant/world data: selling companies, GL, people, organizations, catalog, prices, tax geography. The suite and Explorer share it.

## How it loads

`LoadWorld()` reads the CSVs and upserts through `BaseEntity.Save()`. No raw SQL. Natural keys (`CompanyCode`, `SKU`, `Email`, …). Re-running is idempotent.

- **ORD-00 / `catalog-world`** — the first bundle. One check (`CW1`) loads the world and asserts referential integrity.
- **Later bundles** call `CreateOrdersFixture()`, which remaps this world onto the existing `Fx()` shape (`CoA` = Blue Cypress Press, `CoB` = Harbor House, `CoC` = Orphan Ledger; `WidgetA` = Style Handbook, …). Mutations run inside rolled-back transactions.

## The companies

| Code   | Name                | Role                                      |
| ------ | ------------------- | ----------------------------------------- |
| BCP     | Blue Cypress Press  | Home seller — fully GL-linked             |
| HH      | Harbor House        | Second company — multi-company / interco  |
| DEMO    | DEMO Publishing Co  | Demo seller still in the catalog          |
| PARTNER | DEMO Partner Press  | Second demo seller                        |
| ORPHAN  | Orphan Ledger       | Accounts exist, **no** GL links — refuse  |

## GL hierarchy

Most specific wins: **product → category tree → product type → company**.

`gl-links.csv` rows name a `Level` (`Company` / `ProductType` / `Category` / `Product`). AR is
linked at each selling company so a confirm can book without per-product wiring. Sales is also
linked at the product-type level (and a couple of category / product overrides) so the walk has
something to inherit.

Dimensions (`DEPT`, `LOC`) and their values are world data. They are **not** attached to the links
yet — attaching a required dimension without a matching order-line tag would refuse the confirm.

Intercompany pairs are declared in `intercompany-matches.csv` and saved through BaseEntity.
Orphan Ledger is not in that file, so the missing-pair refuse path stays real.

## Adding a product

1. A row in `data/products.csv` (and `event-products.csv` if it is an Event).
2. A price in `data/product-prices.csv`.
3. A `Mnemonic` if existing checks refer to it (`WidgetA`, `SubRolling`, …).
4. Rebuild (`pnpm run build` in this package copies CSVs into `dist/`).
