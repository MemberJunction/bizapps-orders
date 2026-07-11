# ERD — bizapps-orders TARGET schema (scope fence, post 2026-07-03)
**v1.2 (RECREATED 2026-07-06 — original lost with the `accounting-engine-work` instance)**

Companion to `2026-07-02-engine-meeting-amendment.md` §3-4. System-wide views:
`~/MJDev/instances/develop-accounting-engine/erd-orders-accounting-interface.md` + `erd-full-system.md`.
Authority: AM-1..7 > 07-02 transcript (¶). Review artifact — no orders schema exists yet (first build).

**Orders builds NO GL-mapping tables** — accounting's polymorphic `GLAccountLink` points AT these records
(shown dotted). Deferred domains (payments, subscriptions, tax, pricing, FX) have no schema yet.

## The scope-fence tables

```mermaid
erDiagram
    ProductType ||--o{ Product : ""
    ProductCategory ||--o{ ProductCategory : "ParentID hierarchy"
    ProductCategory ||--o{ Product : ""
    Order ||--|{ OrderLine : ""
    Product ||--o{ OrderLine : ""

    GLAccountLink }o..|| Product : "accounting-owned: product override"
    GLAccountLink }o..|| ProductCategory : "category override"
    GLAccountLink }o..|| Company : "company defaults"

    Order ||..o{ JournalEntry : "JournalEntry.OrderID soft ref (Confirmed → JEs)"
    OrderLine ||..o{ JournalEntryLine : "JournalEntryLine.OrderLineID soft ref"

    ProductType { uuid ID PK
                  string Name }
    ProductCategory { uuid ID PK
                      uuid ParentID FK "recursive"
                      string Name }
    Product { uuid ID PK
              uuid ProductTypeID FK
              uuid ProductCategoryID FK
              string Name
              enum RevenueRecognitionType "KEPT"
              string NOTE "NO GL-account columns (S3) — links replace them" }
    Order { uuid ID PK
            enum Status "Draft|Quoted|Confirmed|Posted|Fulfilled|Voided"
            string RULES "JEs once, on FIRST Confirmed (S4) · NO CompanyID (S5) · NO currency (FX deferred) · ONE batch (¶44)" }
    OrderLine { uuid ID PK
                uuid ProductID FK
                decimal Quantity
                decimal UnitPrice }
    GLAccountLink { string owner "accounting schema — see erd-accounting-target.md" }
    JournalEntry { string owner "accounting schema" }
    JournalEntryLine { string owner "accounting schema" }
    Company { string owner "__mj shared core" }
```

Lifecycle rules: Voided only from Draft/Quoted; post-Confirmed cancellation = a **cancelling order**
booking reverting JEs (`EntryType='Reversal'` + `ReversesJournalEntryID`), partial reverts supported (S9).

## Runtime flow — Order → Confirmed → JE

```mermaid
flowchart LR
    UI["order-entry UI<br/>(basic, step 5)"] -->|save: Status→Confirmed| OES["OrderEntityServer<br/>(first-flip detection)"]
    OES --> ORE["OrdersEngine (BaseEngine cache)<br/>ResolveAccount(product, role, orderDate):<br/>product → category tree ↑ → company default"]
    ORE -->|"per-record lookups via<br/>AccountingEngineBase.ResolveLinkedAccount"| AEB["accounting link cache"]
    OES -->|"Execute(draft: raw Dr/Cr lines)"| OP["remotable op<br/>'Accounting.CreateJournalEntry'"]
    OP --> AE["AccountingEngine<br/>validate → group → Dr-first → ATOMIC write"]
    AE -->|"EntryNumber | typed errors<br/>(failure alerts — never silently lost)"| OES
```

## Resolution example (Amith's Izzy scenario)

Izzy has three products. One company-level `GLAccountLink` (role **Sales** → account 40000) covers all
three by default. Jeremy wants t-shirt revenue tracked separately, so the t-shirt Product gets its own
link (role Sales → 40010). Resolution for an order line:

1. t-shirt → **product link found** → 40010 ✓
2. subscription → no product link → walk category tree → no category link → **company default** → 40000 ✓

Filters at every step: `Status='Active'` and StartedAt ≤ orderDate < EndedAt (null = open). Each resolved
link also surfaces its ordered `GLAccountLinkDimension` list (values from order context — ⚠ OQ-I).

## Deferred (no schema designed — S10)

Payments (cash JEs, payment-type→cash-account mapping) · Subscriptions/rev-rec (domain entity servers
generate SJEs, AM-6) · Tax calc (self-calc + jurisdictions/exemptions) · Pricing · FX · Intercompany (S11
— unaddressed, re-raise) · Approvals (later: MJ Tasks "Batch Review" task types + Flow Agent, ¶193-201).
