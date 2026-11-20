# `@mj-biz-apps/orders-core-entities-server`

**The server half of the rules that decide money.** Entity subclasses that override `Save()` or
validation, the engines behind booking, GL resolution, payments and subscriptions, and the remote
operations that expose multi-step work.

The pricing engine — price resolution, promotions, charges and tax — is not here. It lives in
`@mj-biz-apps/orders-entities` (`packages/Entities/src/pricing/`), so the browser can price an order
with the same code that books it, and this package re-exports it for server callers.

This package is server-only. Import it from the server bootstrap so its `@RegisterClass` decorators
fire — nothing here is reachable until they do.

---

## The shape: pure core, database shell

Each domain is split in two, and the split is deliberate rather than tidy.

| Pure (no DB, no entities) | Needs a database | Package |
|---|---|---|
| `PricingBehavior` | `PriceResolver` | orders-entities |
| `PromotionBehavior` | `PromotionEngine` | orders-entities |
| `ChargeBehavior` | `ChargeEngine` | orders-entities |
| `TaxResolver` *(the walk)* | `TaxResolver` *(the lookups)* | orders-entities |
| `SubscriptionBehavior` | `OrderEntityServer` | this package |

**Why:** the arithmetic is where the money is, and money should be provable without a database. Two
10% promotions are 19% or 20% depending on one setting; a Volume band and a Tiered band give 800 and
900 for identical inputs. Those facts are asserted in unit tests that run in milliseconds, and the
database half is then only responsible for finding the right rows. `OrderPricingService` runs the
four pricing stages in order, for `Save()` and for `Orders.PriceOrder` alike.

## The order confirm, end to end

`OrderEntityServer.Save()` is the spine. Everything happens in ONE transaction. In outline (the
method has the full sequence):

```
BeginTransaction
  delete lines the caller removed
  expand bundles into their component lines
  decide subscriptions
  ── per line, IN MEMORY ─────────────────────────────
     proration (subscription terms)
     event service period
  OrderPricingService: price → promotions → charges → tax
                                 → UnitPrice, DiscountAmount, ChargeAmount, LineTax
  ── persist ─────────────────────────────────────────
     save the header (a new order gets its OrderNumber here)
     save lines
     write adjustment + charge + component rows
  check the total the caller was shown, if it sent one
  materialize subscriptions
  book journal entries
  issue instalments already due
  create the initial payment
  grant entitlements
  record the OrderConfirmed outbound event (sales only)
CommitTransaction
```

**Everything that changes a line's money happens BEFORE the insert.** That ordering is forced, not
stylistic: a Confirmed line is frozen by trigger 51003, and because MJ's CRUD procs run under
`INSERT-EXEC`, a trigger rollback surfaces as *"Cannot use the ROLLBACK statement within an
INSERT-EXEC statement"* — an error naming neither the line nor the rule it broke. Correcting a line
after insert is not an option, so nothing may need correcting. A draft being confirmed already has
its lines, so they are rewritten while the header is still Draft, before the status change that
freezes them.

## Resolution walks

The resolvers follow the **same path** up the product's category tree, on purpose — anyone who
understands one understands the others, and they cannot drift into disagreeing about what "the
product's category tree" means:

```
product → its category → that category's ancestors → …
```

They differ in where the walk ends:

- **`GLAccountResolver`** — role → GL account, continuing to the product type, then the company.
  Nothing resolving is a hard failure; a guessed account still balances, so the misposting would be
  invisible.
- **`PriceResolver`** — product → price, continuing to the company, then the default resolver, with a
  `BasePriceResolver` plugin possible at the product, category and company levels.
- **`TaxResolver`** — taxability, continuing to the product type, a NOT NULL backstop so the walk
  always terminates.

## Refusals are a feature

This package refuses more than it computes, and each refusal exists because the alternative is a
plausible wrong answer:

| Situation | Refused because |
|---|---|
| Two price rules of equal priority | The winner would be whatever the database returned first — arbitrary, stable in test, liable to flip in production |
| No GL account for a role or charge | A guessed account still balances; the entry would post and be wrong |
| A manual discount with no `SalesAuthority` | Absence of an authority is not permission |
| A captured payment whose lines ≠ its amount | The remainder would have no home in the ledger |
| An intercompany pair with no mapping | Cash collected by A against B's line would credit A's receivable |

**The recurring shape: the wrong answer still looks like a right one.** A wrong price is still a
price; a mis-oriented intercompany pair still balances. Where a zero is a legitimate outcome, the
REASON is recorded — tax writes a zero-amount `OrderLinePriceComponent` saying which of the four
reasons applied.

## Remotable operations

Multi-step work with guards, exposed through `BaseRemotableOperation`. Logical refusals come back
**inside** the output as `Success: false` with a reason; only genuine faults throw.

Each operation is a row in [`metadata/remote-operations/`](../../metadata/remote-operations/), the
source of truth; CodeGen emits its typed base into `@mj-biz-apps/orders-entities`, and this package
holds the implementations. The full list, with scopes and why each one is an operation rather than a
save, is in [`docs/orders-api-and-ui-architecture.md`](../../docs/orders-api-and-ui-architecture.md) §2.

## Accounting boundary

Orders resolves accounts — `GLAccountResolver`, wired to accounting's engine by `AccountingBridge` —
and submits balanced drafts to `Accounting.CreateJournalEntries`; accounting owns the ledger.

Two constraints that shape everything: accounting derives an entry's company **from its accounts**,
so a cross-company entry cannot be booked at all — which is why intercompany legs are per company
rather than one spanning entry. And it rejects negative amounts, so a reversal is the **mirror** of
an entry (sides swapped, positive amounts), never a negation.

## Testing

- **Unit** (vitest, no DB) — the pure engines. Volume vs Tiered, stacking arithmetic, charge basis
  and the taxability walk are in `packages/Entities/src/__tests__`, beside the pricing engine;
  subscriptions, allocation and the rest of this package are in `src/__tests__`. `pnpm run test:unit`
  at the root runs every package's.
- **Integration** — `@mj-biz-apps/orders-integration-tests`, transaction-per-check with rollback.

Both suites are mutation-tested: break the code deliberately, confirm the checks catch it. Worth the
effort here because every wrong answer in this domain produces a plausible number *and* a balanced
entry.

## Adding behaviour

Prefer a plugin over an edit. The three base classes come from `@mj-biz-apps/orders-entities` (this
package re-exports them):

```ts
@RegisterClass(BasePriceResolver, `Company:${companyId}`)
export class AcmePricing extends BasePriceResolver { /* return null to decline */ }

@RegisterClass(BasePromotionQualifier, 'LOYALTY-2YR')
export class TwoYearMember extends BasePromotionQualifier { /* ... */ }

@RegisterClass(BaseTaxJurisdictionResolver)
export class RooftopResolver extends BaseTaxJurisdictionResolver { /* ... */ }
```

A price plugin is server code, so the browser cannot run it. Set `PricingDriverClass` to the plugin's
key on the product, the category (inherited by child categories), the product type, or the company's
`OrderCompanyPolicy`; the most specific non-empty level wins. `ResolvePrice` invokes the resolver
registered under that key first, then falls back to the `Product:<id>`, `Category:<id>` and
`Company:<id>` keys. A key with no registered resolver refuses the line with a `PriceResolutionError`
naming the key, rather than pricing it by the default. `CanPriceOrderLocally` reads the same walk and
reports that the order cannot be priced locally, and `MJOPricingScheduler`, the pricing service
behind the order screens, sends it to `Orders.PriceOrder` instead, as it does for any order carrying
a promotion code.

If you must edit an engine: put the arithmetic in the pure half with a unit test, and keep the
database half to finding rows.
