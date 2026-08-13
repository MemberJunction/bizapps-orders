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
| BCP    | Blue Cypress Press  | Home seller — fully GL-linked             |
| HH     | Harbor House        | Second company — multi-company / interco  |
| ORPHAN | Orphan Ledger       | Accounts exist, **no** GL links — refuse  |

## Adding a product

1. A row in `data/products.csv` (and `event-products.csv` if it is an Event).
2. A price in `data/product-prices.csv`.
3. A `Mnemonic` if existing checks refer to it (`WidgetA`, `SubRolling`, …).
4. Rebuild (`pnpm run build` in this package copies CSVs into `dist/`).
