# Subscriptions — model audit and proposed design

> **Status:** Proposal for review (2026-07-25). Raised by Amith: recurring behaviour is far more
> variable than the current model expresses, and the rules that govern a subscription's term should
> also govern its revenue recognition.
> **Parent plan:** [`bizapps-orders-master.md`](./bizapps-orders-master.md) §4.5, D20, D43.

---

## 1. What we have today

| Table | Carries |
|---|---|
| `Product.SubscriptionType` | an NVARCHAR: `None` / `Standard` / `Membership` |
| `SubscriptionPlan` | `ProductID`, `Name`, `BillingCycle` (Monthly/Quarterly/Annual/Custom), `CustomCycleDays`, `PricePerCycle`, `TrialDays` |
| `Subscription` | continuity record — number, company, birth `OrderLineID`, customer, beneficiary, `Status`, `StartDate`, `CurrentPeriodStart/End`, `TrialEndDate`, `EndDate`, `AutoRenew`, `RenewalLeadDays`, provider linkage, `MigratesFrom/ToSubscriptionID` |
| `SubscriptionEvent` | immutable lifecycle log with webhook idempotency |

Two things follow from that shape:

- **The subscription holds only its CURRENT period.** `CurrentPeriodStart/End` is a moving pointer;
  history exists only as `SubscriptionEvent` rows and the renewal Orders. There is no record of "the
  2026 term" as a thing you can attach anything to.
- **Recurring behaviour is a string on the product** (`SubscriptionType`), not a rule set. Nothing
  can express *how* a subscription starts, extends, renews, or ends.

## 2. What is missing

Mapping Amith's requirements against the schema:

| Requirement | Today | Gap |
|---|---|---|
| Recognize quarterly for some subs, monthly for others | rev-rec driver is `EvenOverTime`, which always slices **monthly** (`MonthSpan`) | **Yes** — cadence isn't expressible |
| Deferred vs immediate start | `StartDate` exists but nothing defers it | **Yes** |
| Calendar-anchored subs (all start 1/1 or 7/1) | — | **Yes — nothing at all** |
| Proration before the anchor date | — | **Yes** |
| Backdate + charge full year (the alternative to prorating) | — | **Yes** |
| Company-level vs individual-level | `CustomerOrganizationID` and `BeneficiaryPersonID` both exist and are nullable | **Partial** — expressible, but no rule says which is required |
| Multiple concurrent subs vs extend-the-existing | D20 names find-or-extend-or-create; **not built**, and no attribute selects the behaviour | **Yes** |
| Reactivate an expired/canceled sub vs always create new | — | **Yes** |
| Cancellation rules (immediate vs end-of-term, refund policy, proration) | reversal Orders with negative quantity work mechanically | **Yes** — no policy, and the UX is raw |
| Grace periods | — | **Yes** |
| Term/renewal history | `SubscriptionEvent` log + renewal Orders | **Yes** — no first-class term record |

**`SubscriptionTerm` does not exist.** The only matches in the migration are
`Product.DefaultSubscriptionTermMonths`, which is a number, not a record.

## 3. Proposed model

Two new tables. The shape mirrors patterns already proven in this schema — a rules table with a
pluggable driver (like `RevenueRecognitionType`, D43) plus a period record that the ledger can
point at.

### 3.1 `SubscriptionType` — the rules

Replaces `Product.SubscriptionType`'s string. Every row names a `DriverClass` resolved through
`ClassFactory`, exactly like `RevenueRecognitionType` (D43): the types we ship are ordinary
implementations with overridable methods, so an adopter subclasses one and re-registers under the
same key. No "standard vs custom" split.

```sql
SubscriptionType (
  ID, Code UNIQUE, Name, Description,
  DriverClass,                     -- @RegisterClass key for the behaviour object

  -- WHO holds it
  SubscriberScope,                 -- Organization | Person | Either

  -- WHEN a term starts
  StartMode,                       -- Immediate | Deferred | CalendarAnchored
  AnchorMonth, AnchorDay,          -- for CalendarAnchored: e.g. 1/1 or 7/1
  PartialPeriodMode,               -- Prorate | ChargeFull | ExtendToNextAnchor
  DeferredStartDays,               -- for Deferred

  -- HOW LONG and how often
  DefaultTermMonths,
  BillingCadence,                  -- Monthly | Quarterly | Annual | Custom
  RecognitionCadence,              -- Monthly | Quarterly | Annual | MatchBilling
  CustomCycleDays,

  -- WHAT HAPPENS on a repeat purchase
  ConcurrencyMode,                 -- AllowMultiple | ExtendExisting | RejectDuplicate
  ReactivationMode,                -- ReactivateExisting | AlwaysCreateNew | ReactivateWithinWindow
  ReactivationWindowDays,

  -- ENDING
  AutoRenewDefault, RenewalLeadDays,
  CancellationMode,                -- Immediate | EndOfTerm | EndOfBillingPeriod
  CancellationRefundMode,          -- NoRefund | ProrateUnused | FullRefundWithinWindow
  CancellationWindowDays,
  GracePeriodDays,                 -- access continues this long past lapse

  Sequence, IsActive
)
```

`RecognitionCadence` separate from `BillingCadence` is deliberate: a sub can bill annually and
recognize monthly, which is the common case and something the current model cannot say.

### 3.2 `SubscriptionTerm` — the periods

The missing concept. One row per contiguous coverage period; renewals and extensions append rows
rather than mutating a moving pointer.

```sql
SubscriptionTerm (
  ID, SubscriptionID, TermNumber,          -- 1, 2, 3… within the subscription
  OrderLineID,                             -- the line that BOUGHT this term
  StartDate, EndDate,
  Amount,                                  -- what was charged for this term
  IsProrated, ProrationFactor,             -- partial first term into an anchor
  RevenueRecognitionTypeID,                -- resolved at purchase, frozen for the term
  Status,                                  -- Scheduled | Active | Completed | Canceled | Lapsed
  CanceledAt, CancellationEffectiveDate,
  UNIQUE (SubscriptionID, TermNumber)
)
```

`Subscription` then keeps identity and continuity (subscriber, product, status, auto-renew) and
loses `CurrentPeriodStart/End` — "current" becomes the term whose window covers today, which is a
query rather than a field that can silently go stale.

## 4. The journal-entry anchoring question

Amith's position: *"the journal entries should actually be tied to the SubscriptionTerm record, not
the OrderHeader, OrderLine, or Subscription."*

I think that is right for **recognition** entries and wrong for the **booking** entry, and the D25
polymorphic origin pair already lets us have both:

| Entry | Caused by | Proposed origin (`LinkedEntityID`/`LinkedRecordID`) |
|---|---|---|
| Booking (`Dr AR / Cr Deferred Revenue`) | the **sale** — a customer bought something | `OrderLine` (unchanged) |
| Recognition (`Dr Deferred / Cr Revenue`) | **time passing over a coverage period** | `SubscriptionTerm` |

The booking entry exists because an order line was confirmed; that is what an auditor drills into,
and it is what `OrderLine.JournalEntryID` already points at. The recognition entries exist because a
term is being earned — and once terms are first-class, anchoring releases to the term makes
"show me everything earned on the 2026 term" a single query, survives renewals cleanly, and gives
cancellation an obvious target for the unearned remainder.

**This needs a decision for non-subscription deferred revenue.** An event product (`AllBackEnd`) has
no subscription and therefore no term. Options: keep order-line origin for those (two anchoring
rules, chosen by whether a term exists), or generalize `SubscriptionTerm` into a neutral
`RecognitionPeriod` that any deferred line creates. The second is cleaner conceptually but renames a
concept the business already calls a *term*. **Recommend deciding this before building.**

## 5. Cancellation

The mechanic works today — a reversal Order with a negative-quantity line produces mirrored JEs
(D16). What is missing is the **policy** and the **UX affordance**.

Amith's example: sub runs 1/1–12/31, cancel on 7/1. The reversal is a line of quantity `-0.5`.
That is correct double-entry and terrible data entry.

Proposal: a `Orders.CancelSubscription` remote operation that takes the subscription, an effective
date, and a reason, then applies the `SubscriptionType`'s `CancellationMode` /
`CancellationRefundMode` to compute the reversal quantity itself and emit the reversal order
atomically — the same pattern as `Orders.RefundPayment` (D17). The user picks a date; the engine
derives `-0.5`. The unearned remainder maps directly to the term's remaining recognition slices,
which is another argument for term-anchored recognition entries (§4).

## 6. Impact on what is already built

- **`RevenueRecognitionType` drivers gain a cadence input.** `EvenOverTimeDriver` currently hardcodes
  monthly slicing; it needs `RecognitionCadence` so quarterly/annual work. The driver interface
  (`RevRecContext`) already takes a service period, so this is an additive field, not a redesign.
- **`OrderLine.ServicePeriodStart/End` becomes derived** for subscription lines — the term computes
  it (anchor, proration, deferred start) rather than the user typing it.
- **The booking flow gains a step**: confirm → resolve `SubscriptionType` → find-or-extend-or-create
  the `Subscription` → create the `SubscriptionTerm` → then book. Today D20's
  find-or-extend-or-create is still unbuilt, so this is the natural moment.

## 7. Open questions

1. **Recognition anchor for non-subscription deferred revenue** (§4) — two rules, or generalize the
   term into a neutral recognition period?
2. **Does `SubscriptionPlan` survive?** Its `BillingCycle`/`PricePerCycle`/`TrialDays` overlap
   `SubscriptionType` and pricing. It may collapse into `SubscriptionType` + `ProductPrice`, leaving
   plans purely as a multi-tier presentation concept — or be dropped.
3. **Proration basis** — days, months, or billing periods? Affects both the charge and the
   recognition split, and finance will have an opinion.
4. **`ExtendExisting` and revenue** — when a purchase extends an active sub rather than creating a
   new one, does it create a new `SubscriptionTerm` (recommended: yes, terms stay contiguous and
   auditable) or lengthen the current one (loses the record of what was bought when)?
5. **Grace period semantics** — does grace extend *access* only, or also the term (and therefore
   recognition)? These give different revenue answers.
