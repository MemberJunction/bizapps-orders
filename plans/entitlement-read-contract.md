# The Entitlement Read Contract

**Status:** implemented on `an-dev-13` (`Orders.CheckEntitlement`, `Orders.ListEntitlements`, cancel-path grant honesty). LXP consumption still later.  
**Source:** design input 2026-08-26 (static reading of `origin/next` @ `ef6bd85`); built 2026-08-27.  
**Supplements:** [`archive/bizapps-orders-master.md`](archive/bizapps-orders-master.md) D27, §13, §16, §18.

Orders can already **create** entitlements. It cannot **answer a question about one**. That gap was parked on purpose. The LXP going live is what forces the read contract.

> “Hey Orders API, does John Doe have access to Sidecar AI Learning Hub Premium?”

Not today, and not by adding an endpoint that merely queries `EntitlementGrant.Status`.

---

## 0. Do not rebuild the write path

The foundation is strong. Do not let the builder redo any of this.

| Piece | Where | State |
|---|---|---|
| `ProductEntitlement` — template: what a product confers (type, code, quantity, UoM, validity including `AccessLeadHours` / `AccessLagHours`) | schema | Built |
| `EntitlementGrant` — instance with beneficiary (Person or Organization), subscription + term linkage, `ValidityModeApplied`, timestamped revocation with reason | schema | Built |
| Policy walk (template → product → category → type), breadth-first, cycle-capped | `EntitlementBehavior.ts` | Built and pure |
| Grant creation on confirm, revocation on return (batched, fast-path when the order grants nothing, inside the booking transaction) | `EntitlementEngine.ts` | Built |
| Behaviour coverage: windows, PerUnit vs Flat, event-follows-event, subscription-follows-term, beneficiary designation, partial returns | `entitlements.checks.ts` EN1–EN15 | Built |
| Identity claim redemption (magic link → attach grant to Person) | `EntitlementGrantClaimDriver.ts` | Built |

The instinct throughout is right: **record the rule that applied, not just the outcome.** `ValidityModeApplied` exists so “why does my access end on the 30th?” is answerable. The read contract should extend that instinct, not replace it.

`EntitlementEngine` exports exactly two functions today, both **writes**, both called from order confirm/return. None of the eleven Remote Operations touch entitlements.

---

## 1. What D27 actually parked

D27 settled the **write** side and deferred the **read** side to a poll:

> Downstream apps poll grants (MJ Scheduled Job + Record-Set-Processing…) — no bespoke webhook/notification system. Provisioning/enforcement engine is later.

§13 froze grant **shape** pending Ethan's answers to Robert's four questions: grant granularity · lifecycle coupling · **read contract** · team beneficiary semantics.

§18 still lists “entitlement read/notify poll” as outstanding. The poll was never built. This is not fighting a bad decision; it is opening a decision that was left until a real consumer existed. **The LXP is that consumer.**

---

## 2. Two lifecycle gaps — `Status` is not trustworthy

Fix these regardless of poll vs ask. They are latent correctness bugs on the write path today, and they are the strongest argument against a poll of raw rows.

### 2.1 Cancelling a subscription does not touch its grants

There is no reference to `EntitlementGrant` in the subscription lifecycle. Cancel a subscription and its grants stay `Active`, with `ValidTo` still at the end of the paid term. The LXP flagship case is a subscription (“Learning Hub Premium”) — this is on the critical path.

### 2.2 Nothing expires a grant when `ValidTo` passes

No sweeper, no scheduled job, no write of `Status='Expired'` outside an unrelated claim-driver path. A grant whose window closed last month still reads `Active`. The status column records **what was decided**, never **what is currently true**.

### Design consequence

**Access must be evaluated, never read off a flag:**

`Status = 'Active'` **and** now within `[ValidFrom, ValidTo]` **and**, where `SubscriptionTermID` is set, that term still current.

Put that evaluation in **exactly one place**. If the LXP polls raw grant rows, it must reimplement all of it — a second “is this in force” will drift from the first. That failure has already bitten this codebase twice.

---

## 3. Decision: poll, or ask

| | Poll (what D27 assumed) | Ask / answer (recommended) |
|---|---|---|
| Shape | LXP syncs grant rows on a schedule, mirrors them, answers locally | LXP calls Orders at access time, gets a decision |
| Revocation latency | One poll interval. Refund / chargeback / cancel leaves paid content open until the next sync | Immediate |
| Who owns “is it in force” | Both systems. Two implementations, guaranteed to diverge | Orders, once |
| Runtime coupling | None. LXP serves content if Orders is down | Real. Needs caching + an explicit failure mode |
| Audit | No record of access decisions, only of state | Every decision loggable, with its reason |
| Fits §2 above | Inherits both bugs; LXP must work around them | Evaluation **is** the fix |

**Recommendation: ask/answer as the contract.** Keep a bulk read as an optimisation, not as the source of truth. Serving premium content after a refund is a revenue and support problem; the poll's staleness window is exactly that.

Mitigate coupling with a short-TTL cache keyed on the response's own `CacheUntil`, and a documented fail mode — **fail closed for paid content**, with a bounded grace only if the business explicitly asks for it.

This **supersedes D27's poll as the LXP source of truth**. D27's “no webhook system” still holds: the LXP asks; Orders does not push.

---

## 4. Proposed contract

Shaped to what Orders already models — mostly wiring, not new concepts.

### 4.1 Ask by capability, not product

`ProductEntitlement.Code` is the right key. Uniqueness is **per-product** (`UQ_ProductEntitlement_Product_Code`), so a bundle, an upgrade, a comp, and a grandfathered tier can all confer `LEARNING_HUB_PREMIUM` and the LXP never learns the catalogue. Asking by `ProductID` couples LXP to SKU churn.

**Gap:** codes are not globally namespaced and there is no registry table. Two teams can both mint `PREMIUM`. Recommend a convention (`APP_AREA_TIER`) plus, ideally, a lookup so codes are selectable rather than free text.

### 4.2 Person identity

Canonical key is `BeneficiaryPersonID`. The LXP likely knows an email. Accept either, but **PersonID is authoritative**; email is a documented convenience resolution (normalised, and **ambiguous-if-duplicate**, never first-match). An `ExternalUserID` mapping is the durable answer if the LXP has its own identity — ask whether it does before v1.

### 4.3 The call — `Orders.CheckEntitlement`

```
in:  { PersonID? | Email?, Code, AsOf?, CompanyID? }
out: {
  HasAccess:           boolean,
  Decision:            'Granted' | 'NoGrant' | 'NotYetValid' | 'Expired'
                     | 'Revoked' | 'Suspended' | 'SubscriptionInactive',
  ValidFrom?:          datetimeoffset,
  ValidTo?:            datetimeoffset,
  Quantity?:           decimal,          // ResourceQuantity — seats
  GrantID?:            uuid,             // audit handle
  ViaOrganizationID?:  uuid,             // if granted through a team/site licence
  EvaluatedAt:         datetimeoffset,
  CacheUntil:          datetimeoffset    // min(effective ValidTo, wall-clock now + 60s); never from AsOf
}
```

`Decision` earns its place: “expired on the 30th”, “your subscription lapsed”, and “you never bought this” are three screens and three support conversations. Orders already stores `ValidityModeApplied` and `RevocationReason` so this is answerable — surface them rather than collapsing everything to `false`.

### 4.4 Companions

- `Orders.ListEntitlements({ PersonID })` — “my library” without N calls.
- `Orders.ListBeneficiaries({ Code })` — cohort/reporting; heavier auth scope than the point check.

Bulk list is an optimisation for UI and sync, **not** a second source of truth for access.

### 4.5 Open question that blocks a full spec — team beneficiaries

`BeneficiaryOrganizationID` exists, so a site licence is expressible — but nothing says whether John Doe inherits access from his organisation's grant, and if so via what membership relation, with what seat accounting against `Quantity`. This is Robert's fourth question, still unanswered, and the check API cannot be fully specified without it.

**v1 default to propose:** if the LXP sells only to individuals at launch, **scope v1 to person grants**. That is a fine answer, but it must be a decision rather than a silence.

---

## 5. Security — this endpoint is an authorization oracle

A “does X have Y” endpoint answers questions about people. Answering them is itself a capability.

1. **Scope it narrowly.** An MJ API key restricted to entitlement checks, not general Orders read. The LXP must not enumerate orders because it can check access.
2. **Rate limit and log.** Repeated checks are a customer-list oracle. Every decision should be recorded — that log is the audit trail when someone disputes access.
3. **Don't leak existence.** Unknown person and known-person-without-access should be indistinguishable in response shape and, ideally, timing.
4. **Fail closed**, and make the failure mode explicit in the contract rather than incidental to a caught exception.
5. **Evaluate server-side only.** No client-supplied `AsOf` on the trust path beyond diagnostics — the same rule that keeps prices out of checkout request bodies. A future `AsOf` is rejected. `CacheUntil` is always issued from wall-clock now, never from `AsOf`, so a diagnostic query cannot mint a long-lived cache instruction. After cancel, reported `ValidTo` is the subscription access-through date, not the original grant window.

---

## 6. Build sequencing (when we start)

v1 shipped on `an-dev-13` (branch from `origin/next` @ #116; rebase after #117 merges):

1. ~~Single in-force evaluator~~ — `EvaluateGrantAccess` in `EntitlementBehavior.ts`.
2. ~~`Orders.CheckEntitlement`~~ — Remote Operation, scope `orders:entitlement-check`, `[ENTITLEMENT-CHECK]` log.
3. ~~Wire subscription cancel~~ — revoke standing grants when `AccessThroughDate` has already passed; grace leaves rows standing and the evaluator honours `subscription.EndDate`. No sweeper; elapsed `ValidTo` is an evaluation, not a write.
4. ~~`ListEntitlements`~~ — scope `orders:entitlement-read`.
5. Code registry / naming convention if LXP will mint more than one code.
6. Team/org inheritance only after the §4.5 decision. v1 is **person grants only**.

---

## 7. Open decisions before implementation

| # | Question | v1 strawman |
|---|---|---|
| 1 | Poll vs ask as source of truth | Ask. Bulk list optional. |
| 2 | Fail mode when Orders is unreachable | Fail closed for paid content |
| 3 | Person key | PersonID authoritative; email convenience, ambiguous-if-duplicate |
| 4 | Does LXP have its own user id? | Ask Ethan before adding ExternalUserID |
| 5 | Team / org inheritance | Person grants only unless LXP sells site licences at launch |
| 6 | Entitlement code registry | Convention `APP_AREA_TIER` now; lookup table if codes proliferate |
| 7 | Client `AsOf` | Diagnostics only; future values rejected; CacheUntil always from wall-clock now |

---

## 8. How these operations reach a host

The metadata JSON in this repo (`metadata/remote-operations/`) is the source of the Remote Operation rows. `mj-app.json`'s `metadata.directory` is a **dev-time pointer**, not something `mj app install` applies. There is no `*Metadata_Sync*.sql` in `migrations/`, and no migration inserts a `RemoteOperation` row.

That is **repo-wide**, not introduced here: every Orders remote operation (`PreviewPrice`, `CapturePayment`, `CancelSubscription`, …) ships the same way. `V202608091500__Retire_draft_operations.sql` exists because *deleting* a pushed row is an act that `mj sync push` will not perform on its own; the INSERT side was never written as a migration.

A host that installed Orders therefore does **not** automatically have `Orders.CheckEntitlement`. Until the project settles a metadata-to-deployment path, the operations exist in an environment only after someone runs `mj sync push` against it. That is a conversation to have before the LXP goes live, not a defect of this PR — but it is the thing that will make the LXP's first call fail if nobody has pushed.

---

## Provenance

Static reading only (nothing executed at capture): entitlement schema in `V202607061432`, `EntitlementEngine.ts`, `EntitlementBehavior.ts`, `EntitlementGrantClaimDriver.ts`, `entitlements.checks.ts`, the eleven declared Remote Operations, and `plans/archive/bizapps-orders-master.md` D27 / §13 / §18.
