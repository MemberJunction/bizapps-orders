# `@mj-biz-apps/orders-core-entities-server`

**Every rule that decides money lives here.** Entity subclasses that override `Save()`, the pure
engines they call, and the remotable operations that expose multi-step work.

This package is server-only. Import it from the server bootstrap so its `@RegisterClass` decorators
fire — nothing here is reachable until they do.

---

## The shape: pure core, server shell

Each domain is split in two, and the split is deliberate rather than tidy.

| Pure (no DB, no entities) | Server (needs a database) |
|---|---|
| `PricingBehavior` | `PriceResolver` |
| `PromotionBehavior` | `PromotionEngine` |
| `ChargeBehavior` | `ChargeEngine` |
| `SubscriptionBehavior` | `OrderEntityServer` |
| `TaxResolver` *(the walk)* | `TaxResolver` *(the lookups)* |

**Why:** the arithmetic is where the money is, and money should be provable without a database. Two
10% promotions are 19% or 20% depending on one setting; a Volume band and a Tiered band give 800 and
900 for identical inputs. Those facts are asserted in unit tests that run in milliseconds, and the
server half is then only responsible for finding the right rows.

## The order confirm, end to end

`OrderEntityServer.Save()` is the spine. Everything happens in ONE transaction:

```
BeginTransaction
  assign OrderNumber
  save the header
  ── per line, IN MEMORY ─────────────────────────────
     proration (subscription terms)
     event service period
     price resolution            → UnitPrice, ProductPriceID
  decide promotions              → DiscountAmount
  decide charges + resolve tax   → LineTax, ChargeAmount
  ── persist ─────────────────────────────────────────
     save lines
     write adjustment + charge + component rows
  materialize subscriptions
  book journal entries
  create the initial payment
CommitTransaction
```

**Everything that changes a line's money happens BEFORE the insert.** That ordering is forced, not
stylistic: a Confirmed line is frozen by trigger 51003, and because MJ's CRUD procs run under
`INSERT-EXEC`, a trigger rollback surfaces as *"Cannot use the ROLLBACK statement within an
INSERT-EXEC statement"* — an error naming neither the line nor the rule it broke. Correcting a line
after insert is not an option, so nothing may need correcting.

## Resolution walks

Two resolvers walk the **same path**, on purpose — anyone who understands one understands the other,
and they cannot drift into disagreeing about what "the product's category tree" means:

```
product → its category → that category's ancestors → the company → default
```

- **`GLAccountResolver`** — role → GL account. Nothing resolving is a hard failure; a guessed account
  still balances, so the misposting would be invisible.
- **`PriceResolver`** — product → price, with `BasePriceResolver` pluggable at any level.

`TaxResolver` uses the same chain for taxability (product → category → ancestors → type), with the
type as a NOT NULL backstop so the walk always terminates.

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

| Operation | Does |
|---|---|
| `Orders.PreviewPrice` | Dry-run pricing. **Runs the real pipeline** — a preview that diverges from what is charged is worse than none |
| `Orders.ApplyAccountCredit` | Spends an order's negative balance on another order. Zero-amount payment, two offsetting lines |
| `Orders.RefundPayment` | Mirrors a capture (D53), proportionally across the orders it settled |
| `Orders.CancelSubscription` | Cancels with the term's own rules. Revokes standing grants when access-through has already passed |
| `Orders.SpawnRenewals` | Spawns renewal orders as Drafts |
| `Orders.CheckEntitlement` | Does this person currently have this capability? Evaluated, not a poll of `Status`. Fail closed |
| `Orders.ListEntitlements` | The person's library, one row per Code, same evaluator |

## Accounting boundary

`AccountingBridge` is the only place that knows about bizapps-accounting. Orders resolves accounts
and submits balanced drafts; accounting owns the ledger.

Two constraints that shape everything: accounting derives an entry's company **from its accounts**,
so a cross-company entry cannot be booked at all — which is why intercompany legs are per company
rather than one spanning entry. And it rejects negative amounts, so a reversal is the **mirror** of
an entry (sides swapped, positive amounts), never a negation.

## Testing

- **Unit** (`src/__tests__`, vitest, no DB) — the pure engines. Volume vs Tiered, stacking
  arithmetic, charge basis, the taxability walk, allocation.
- **Integration** — `@mj-biz-apps/orders-integration-tests`, transaction-per-check with rollback.

Both suites are mutation-tested: break the code deliberately, confirm the checks catch it. Worth the
effort here because every wrong answer in this domain produces a plausible number *and* a balanced
entry.

## Adding behaviour

Prefer a plugin over an edit:

```ts
@RegisterClass(BasePriceResolver, `Company:${companyId}`)
export class AcmePricing extends BasePriceResolver { /* return null to decline */ }

@RegisterClass(BasePromotionQualifier, 'LOYALTY-2YR')
export class TwoYearMember extends BasePromotionQualifier { /* ... */ }

@RegisterClass(BaseTaxJurisdictionResolver)
export class RooftopResolver extends BaseTaxJurisdictionResolver { /* ... */ }
```

If you must edit an engine: put the arithmetic in the pure half with a unit test, and keep the
server half to finding rows.
