/**
 * OrderEntityServer — the server-only Order subclass that makes booking atomic (plan D12).
 *
 * On the FIRST transition into `Confirmed` (plan D8), one transaction covers:
 *
 *     order header  →  its lines  →  one JE per line  →  each line's JournalEntryID stamp
 *
 * Any failure rolls the whole thing back. A confirmed order without its journal entries is
 * invalid state, so there is deliberately no partial-success path and no compensation logic.
 *
 * The JE set is written by accounting's `Accounting.CreateJournalEntries`, whose own transaction
 * NESTS inside ours as savepoints — so the single outer commit here covers the order row and
 * every entry. (This is why no TransactionGroup plumbing is needed; nesting composes.)
 *
 * PROVIDER DISCIPLINE (plan D12): everything uses `this.ProviderToUse` — the entity's own
 * provider — throughout. A fresh global `Metadata` inside the transaction path would open a
 * SECOND connection that cannot see our uncommitted work, silently breaking atomicity.
 *
 * IDEMPOTENCY: booking keys off `ConfirmedAt`. Once set, re-saving a confirmed order updates the
 * row normally and never re-books. `OrderLine.JournalEntryID` is additionally NULL→value-once at
 * the database level (trigger 51008), so a double-book is refused by the DB even if this class
 * were bypassed.
 *
 * CONNECTS TO:
 *   FACTORY:  OrderJournalEntryFactory (./OrderJournalEntryFactory.ts)
 *   RESOLVER: GLAccountResolver (./GLAccountResolver.ts)
 *   OP:       'Accounting.CreateJournalEntries' (@mj-biz-apps/accounting-core-entities-server)
 */
import {
    BaseEntity,
    BaseEntityResult,
    BaseRemotableOperation,
    CompositeKey,
    DatabaseProviderBase,
    EntitySaveOptions,
    IMetadataProvider,
    IRunViewProvider,
    LogError,
    Metadata,
    RunView,
    UserInfo,
    ValidationErrorInfo,
    ValidationErrorType,
    ValidationResult,
} from '@memberjunction/core';
import { MJGlobal, RegisterClass, UUIDsEqual } from '@memberjunction/global';
import {
    OrderHeaderEntity,
    mjBizAppsOrdersOrderLineEntity,
    mjBizAppsOrdersOrderLinePriceComponentEntity,
    mjBizAppsOrdersPaymentDetailEntity,
    mjBizAppsOrdersPaymentLineEntity,
    mjBizAppsOrdersPaymentTypeEntity,
    mjBizAppsOrdersSubscriptionEntity,
    mjBizAppsOrdersSubscriptionEventEntity,
    mjBizAppsOrdersSubscriptionTermEntity,
} from '@mj-biz-apps/orders-entities';
import { PaymentHeaderEntityServer } from './PaymentHeaderEntityServer.js';
import { GLAccountResolver } from './GLAccountResolver.js';
import { BuildGLAccountResolver, EntityIDFor } from './AccountingBridge.js';
import { OrderLineEntityServer } from './OrderLineEntityServer.js';
import { InheritedTerms, ValidateReversal } from './ReversalBehavior.js';
import { LoadReversalContext } from './ReversalResolver.js';
import { CreateEntitlementGrants, RevokeGrantsForReturn } from './EntitlementEngine.js';
import { PushProvisioningForOrder } from './EntitlementProvisioningService.js';
import { IssueGiftCards } from './GiftCardEngine.js';
import { ExpandBundleLines, type ExpandableLine } from './BundleEngine.js';
import { OrdersSettings } from './OrdersSettings.js';
import { OrderJournalEntryFactory, type OrderLineDraft } from './OrderJournalEntryFactory.js';
import { RequireUUID } from './sql-guards.js';
import { ResolveDueDate, type CustomerTermsFacts } from './PaymentTermsBehavior.js';
import { AllocateProRata, AuthorizeManualDiscount, LineGross, LoadOrdersEngine, NetAfterDiscount, OrderPricingService, OrdersEngine, ResolvePrice, ResolveTax, ResolveTaxability, RunCharges, RunPromotions, SplitChargesByLine, WriteAdjustments, WriteCharges, type ComputeChargesResult, type ManualDiscountRequest, type PromotableLine, type PromotionRunResult, type RequestedCharge, type ResolvedPrice, type ResolvedTaxability, type StackingMode, type TaxAddress, type TaxabilityCategoryLevel } from '@mj-biz-apps/orders-entities';

const CUSTOMER_PAYMENT_TERMS_ENTITY = 'MJ_BizApps_Orders: Customer Payment Terms';
const ORDER_COMPANY_POLICY_ENTITY = 'MJ_BizApps_Orders: Order Company Policies';
import {
    SubscriptionBehavior,
    type SubscriberIdentity,
    type ExistingSubscription,
    type SubscriptionDecision,
    type SubscriptionTypeRules,
} from './SubscriptionBehavior.js';

interface ProductRow {
    ID: string;
    Name: string;
    SubscriptionTypeID?: string | null;
    RevenueRecognitionTypeID: string;
}

/** Terms created during a confirm, and the recognition cadence each line inherits from its type. */
interface SubscriptionMaterialization {
    TermsByLine: Map<string, { ID: string; StartDate: Date; EndDate: Date; Amount: number }>;
    RecognitionMonthsByLine: Map<string, number>;
}

const ORDER_ENTITY = 'MJ_BizApps_Orders: Order Headers';
const CHARGE_TYPE_ENTITY = 'MJ_BizApps_Orders: Charge Types';
// bizapps-common names its entities with DOTS, not the underscores the other apps use.
const COMMON_ADDRESS_ENTITY = 'MJ_BizApps_Common: Addresses';
const ORDER_LINE_ENTITY = 'MJ_BizApps_Orders: Order Lines';
const PRODUCT_ENTITY = 'MJ_BizApps_Orders: Products';
const PRODUCT_CATEGORY_ENTITY = 'MJ_BizApps_Orders: Product Categories';
/** IsA Disjoint child of Product (BO-D37) — present only for products that ARE events. */
const EVENT_PRODUCT_ENTITY = 'MJ_BizApps_Orders: Event Products';
const COMPANY_ENTITY = 'MJ: Companies';
const PAYMENT_HEADER_ENTITY = 'MJ_BizApps_Orders: Payment Headers';
const PAYMENT_LINE_ENTITY = 'MJ_BizApps_Orders: Payment Lines';
const PAYMENT_DETAIL_ENTITY = 'MJ_BizApps_Orders: Payment Details';
/** Carries `RequiresReference`, which decides whether a tender needs a check/wire number. */
const PAYMENT_TYPE_ENTITY = 'MJ_BizApps_Orders: Payment Types';
const SUBSCRIPTION_ENTITY = 'MJ_BizApps_Orders: Subscriptions';
const SUBSCRIPTION_EVENT_ENTITY = 'MJ_BizApps_Orders: Subscription Events';
const RELATIONSHIP_ENTITY = 'MJ_BizApps_Common: Relationships';
const COMMON_SCHEMA = '__mj_BizAppsCommon';
const SUBSCRIPTION_TERM_ENTITY = 'MJ_BizApps_Orders: Subscription Terms';
const SUBSCRIPTION_TYPE_ENTITY = 'MJ_BizApps_Orders: Subscription Types';

/** Statuses at or beyond the booking lock (plan D8/D9). */
const BOOKED_STATUSES = new Set(['Confirmed']);

/**
 * The subset of `AccountingEngineBase` this class uses. Declared structurally so the accounting
 * peer stays an optional, dynamically-imported dependency at build time.
 */
interface AccountingEngineSurface {
    ConfigEx: (o: { contextUser: UserInfo; provider: IMetadataProvider }) => Promise<unknown>;
    /** Returns the matched link (account lives on `Link.GLAccountID`) plus its dimensions. */
    ResolveLinkedAccount: (
        entityId: string,
        recordId: string,
        role: string,
        asOf: Date,
    ) => { Link?: { GLAccountID?: string } } | null;
    GLAccountByID: (id: string) => { CompanyID?: string } | undefined;
}

/** Shape of the result accounting returns for the JE set. */
/**
 * Normalize a GUID for use as a Map key.
 *
 * SQL Server returns `UNIQUEIDENTIFIER` uppercased, while an ID that arrived from a caller (or from
 * `randomUUID()`) is lowercase. Both name the same row, and SQL compares them correctly — but a JS
 * `Map` does not, so any lookup that crosses the boundary between "value I was handed" and "value
 * that came back from the database" MUST go through here. Every place this was skipped produced the
 * same failure shape: a silent miss that looks like missing data rather than a key mismatch.
 */
const uuidKey = (id: string | null | undefined): string => (id ?? '').toLowerCase();

/** A line's subscription decision, carried from the pre-insert pass to the persistence pass. */
interface SubscriptionDecisionForLine {
    Product: ProductRow;
    Rules: SubscriptionTypeRules;
    Decision: SubscriptionDecision;
    /** Resolved once during the decision pass so persistence uses the same answer. */
    Subscriber: SubscriberIdentity;
    /** The resolved behaviour — reused for RecognitionMonths so a driver's override still applies. */
    Behavior: SubscriptionBehavior;
    /**
     * Product + subscriber identity, as the type's BenefitModel defines a duplicate.
     *
     * Carried from the decision pass so persistence can tell that two lines of the
     * SAME order are the same subscription — the decision pass can only synthesise
     * a placeholder for the second one, because the first is not written yet.
     */
    DedupeKey: string;
}

/**
 * Stands in for a subscription an EARLIER LINE OF THIS ORDER is about to create.
 *
 * The concurrency rules are evaluated against `ExistingSubscription`, which is a
 * database row — so with two lines for the same subscription in one order, the
 * second line saw nothing and decided `CreateNew` too. That silently produced two
 * concurrent subscriptions with identical terms under `ExtendExisting`, and
 * bypassed `RejectDuplicate` entirely. Feeding the sibling's pending decision back
 * in as `Existing` lets the SAME rule code handle the within-order case as the
 * across-order one, rather than duplicating the concurrency logic.
 */
const PENDING_SIBLING_ID = '__pending-sibling__';

interface CreateJournalEntriesResult {
    Success: boolean;
    Results?: Array<{ Success: boolean; JournalEntryID?: string; EntryNumber?: string }>;
    Errors?: Array<{ Code: string; Message: string; DraftIndex?: number; LineIndex?: number }>;
}

@RegisterClass(BaseEntity, ORDER_ENTITY)
export class OrderEntityServer extends OrderHeaderEntity {
    /** Price decompositions produced during this save, written once the lines have IDs (D69). */
    private _priceComponents = new Map<mjBizAppsOrdersOrderLineEntity, ResolvedPrice>();
    /** Why a line owes no tax, by line index — written as a zero-amount component (D73). */
    private _taxReasons = new Map<number, string>();
    private _manualDiscounts: ManualDiscountRequest[] = [];
    private _charges: RequestedCharge[] = [];
    /**
     * The total the CALLER was shown, if they want the confirm to refuse when it no longer matches.
     *
     * Between a user reading a total and pressing Confirm, a promotion can expire or a rate can
     * change, and without a guard the order books at the new number in silence. `Orders.ConfirmOrder`
     * accepted `ExpectedGrossTotal` for exactly this and then read it nowhere — a guard that reads as
     * enforced and is not, which is the failure mode this codebase keeps finding.
     *
     * It was implemented once by running an ENTIRE second booking through a rolled-back transaction
     * purely to learn the total, and removed because that cost was not acceptable. Its correct home
     * was always inside the booking transaction, where the real gross exists anyway — which is where
     * it now lives. Left null, nothing changes.
     */
    public ExpectedGrossTotal: number | null = null;

    /**
     * Promotion and charge decisions made by `prepareLines` and consumed by `savePendingLines`.
     *
     * They are decided while the lines are still in memory — a Confirmed line is frozen by trigger
     * 51003 — but the ROWS they produce need line keys, so writing them waits until after the
     * inserts. The two halves used to be one method; they were split when companion validation
     * moved the deadline for a complete line ahead of the header save.
     */
    private _pendingPromotions: PromotionRunResult | null = null;
    private _pendingCharges: ComputeChargesResult | null = null;

    /** Codes that resolved to nothing usable, so the caller can tell the customer WHY. */
    private _unusableCodes: Array<{ Code: string; Reason: string }> = [];

    // `PromotionCodes` is not declared here any more. It is a COMPANION on the shared subclass, so
    // the browser has it too — which is the entire point: a code typed on screen used to be priced
    // into the preview and then dropped at confirm, because only the server could hold one.
    //
    // Server-side callers that used to assign an array now push through the companion:
    //     order.PromotionCodes.Codes = ['SUMMER20'];

    /**
     * Ad-hoc discounts with a stated reason, each gated by the applying user's SalesAuthority.
     *
     * Named `Requested…` for the same reason as {@link RequestedCharges}: `Adjustments` is the
     * collection holding what the engine decided, and a request is not that.
     */
    public get RequestedDiscounts(): ManualDiscountRequest[] {
        return this._manualDiscounts;
    }
    public set RequestedDiscounts(value: ManualDiscountRequest[]) {
        this._manualDiscounts = value ?? [];
    }

    /**
     * Charges to apply to this order (D71) — shipping, handling, tax layers. Computed AFTER
     * promotions, because a charge's basis is the discounted line.
     *
     * NOT named `Charges`: that is now the related-record COLLECTION on the generated class, which
     * holds the rows the engine wrote. This is the request channel a server-side caller uses — the
     * two meet in `drainStagedPricingRequests`, which reads staged rows into exactly this shape. A
     * browser has only the collection, because it cannot name a charge type by code.
     */
    public get RequestedCharges(): RequestedCharge[] {
        return this._charges;
    }
    public set RequestedCharges(value: RequestedCharge[]) {
        this._charges = value ?? [];
    }

    /**
     * Codes that did not apply, and why — 'no such code', 'not currently running', 'this customer
     * does not qualify'. Silence is the wrong answer here: a customer who typed a code needs to be
     * told it did nothing, and told what to do about it.
     */
    public get UnusablePromotionCodes(): Array<{ Code: string; Reason: string }> {
        return this._unusableCodes;
    }

    // `Lines` is not declared here any more. It is a RelatedRecordCollection on the GENERATED class,
    // emitted from the `RelatedRecordCollection` metadata on the 'Order Headers → Order Lines'
    // relationship — so both tiers have it, and the browser can compose an order and ship the whole
    // graph in one `MJ.SaveEntityGraph` call.
    //
    // What it replaced: a `_lines` array plus a getter/setter pair that existed only on the server.
    // Callers assigned a whole array; they now add through the collection (`Lines.Create()` /
    // `Lines.Add()`), which stamps the foreign key and the line number for them, and tracks removals
    // so a dropped line is deleted rather than left orphaned pointing at its order.

    // ─── Validation ────────────────────────────────────────────────────────────

    /**
     * WITHOUT THIS, NOTHING BELOW RUNS.
     *
     * `BaseEntity.DefaultSkipAsyncValidation` returns **true** — `Save()` calls `Validate()` always
     * but reaches `ValidateAsync()` only when a subclass opts in. This class never did, so its
     * entire async validation block was dead code from the day it was written: the "an order
     * entering the booked state must have something to book" rule never fired, and neither did the
     * loop that surfaces each line's `ValidateAsync` failures against the order.
     *
     * That is not a theory. Saving an order straight to Confirmed with ZERO lines succeeded and
     * produced ORD-000030 — a confirmed order with nothing on it. `ProductPriceEntityServer` is the
     * only class in this package that got this right, and its comment says exactly why.
     *
     * The failure mode is the dangerous kind: the rule reads as enforced, reviews as enforced, and
     * is not. If you add a `ValidateAsync` to any entity here, add this override with it.
     */
    public override get DefaultSkipAsyncValidation(): boolean {
        return false;
    }

    /**
     * The one order rule that CANNOT be decided without the database.
     *
     * The payer rule, the status-transition guard and the has-lines rule for a loaded collection all
     * moved to `OrderHeaderEntity.Validate()`, so the browser now refuses those before a round trip.
     * What is left here is the case the browser genuinely cannot answer: an order that is already
     * saved, being confirmed, whose `Lines` collection was never loaded. In memory that is
     * indistinguishable from an empty order — and answering "empty" would refuse a perfectly good
     * confirm of an order whose lines are sitting on disk.
     *
     * Per-line validation is no longer fanned out by hand. `Lines` is a companion, and
     * `BaseEntity.Save()` validates every companion — including pending removals — before the first
     * row is written, attributing failures by position (`Lines[3].Quantity`).
     */
    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();

        // The DEFINITIVE has-something-to-book check: nothing in memory AND nothing on disk.
        //
        // Both halves are required. Asking only about the collection refuses a confirm of a saved
        // order whose lines were never loaded; asking only the database refuses a brand-new order
        // whose lines exist solely in memory — and `Add()` does not mark a collection loaded, so
        // `IsLoaded` cannot stand in for either question.
        if (
            this.willBookOnThisSave() &&
            this.Lines.Count === 0 &&
            (await this.countPersistedLines()) === 0
        ) {
            result.Success = false;
            result.Errors.push(
                new ValidationErrorInfo(
                    'Status',
                    `Order ${this.OrderNumber ?? ''} cannot be confirmed with no lines — there would be nothing to book.`,
                    this.Status,
                    ValidationErrorType.Failure,
                ),
            );
        }

        return result;
    }

    // ─── Save Override ─────────────────────────────────────────────────────────

    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        // REFUSE AN ILLEGAL STATUS MOVE BEFORE ANYTHING ELSE HAPPENS.
        //
        // The CHECK constraint enforces the legal SET and never enforced the legal MOVES, so
        // `Fulfilled -> Draft` and `Voided -> Confirmed` both saved: a voided order could come back
        // to life, keep the journal entries its reversal had already unwound, and be shipped. Every
        // row valid, the constraint satisfied, nothing looking.
        //
        // Checked HERE rather than in the operations because this is the one path every write goes
        // through — the operations, a workflow, a form, a fixture. A rule enforced anywhere else is a
        // rule that holds until somebody saves an entity directly, which is the failure this codebase
        // has now found three times.
        if (!this.passesStatusTransition()) return false;

        const booking = this.willBookOnThisSave();

        // ORDINARY PATH — no booking, and no line work to do.
        //
        // The test is DIRTINESS, not emptiness. It used to read `this._lines.length === 0`, which
        // worked only because `_lines` was a staging buffer that was emptied after every save: an
        // order that had just been saved had no lines in memory, so the next trivial save took this
        // branch by accident.
        //
        // `Lines` is a live collection now (`ClearAfterSave: false`), so it still holds the order's
        // lines afterwards, and asking about emptiness would send every subsequent edit — changing
        // Notes, say — down the full booking walk: expanding bundles, re-pricing, re-deciding
        // promotions, charges and tax for lines nobody touched.
        //
        // `Dirty` is the question that was always meant: it rolls up the collection, so it is true
        // when a line was added, edited or removed and false when the lines are merely present.
        // That also distinguishes a case emptiness never could — lines loaded but untouched.
        //
        // An UNSAVED header still has to mint `OrderNumber` (NOT NULL). That lives on the
        // full path below, inside the transaction, so a brand-new Draft with no lines must
        // not take this shortcut. Existing drafts with no line edits (Notes, payer, …) can.
        if (!booking && !this.Lines.Dirty && this.IsSaved) {
            return super.Save(options);
        }

        // WHEN IT IS DUE, DECIDED ONCE AND STORED (D83) — AND RESOLVED BEFORE THE TRANSACTION OPENS.
        //
        // `DueDate` is what the aging report ages, what the collections worklist filters on and what
        // the invoice prints, so it is settled at confirm rather than derived per reader; three
        // surfaces deriving it independently is how they end up disagreeing about one date.
        //
        // It runs OUTSIDE the transaction because it is three reads of seeded lookups and nothing
        // more. Inside, those round trips sat in the critical section of every confirm, and the
        // volume bundle — eighty orders back to back — started losing one or two to request
        // timeouts. Booking already holds locks across the ledger; lengthening it to look up terms
        // that cannot change mid-save was avoidable load for no gain.
        //
        // The values land on `this`, so they are persisted by the same `super.Save()` as everything
        // else and remain atomic with the booking.
        if (booking) await this.resolveDueDate();

        const dbProvider = this.ProviderToUse as unknown as DatabaseProviderBase;

        // Latch it BEFORE ConfirmedAt is stamped, so the validation that runs inside the
        // `super.Save()` below still knows this is the booking save. Cleared in `finally` — an
        // entity object can be re-saved, and a stale latch would make a later ordinary update
        // re-run the booking-only rules. See `bookingInFlight`.
        this.bookingInFlight = booking;

        try {
            await dbProvider.BeginTransaction();

            // Capture BEFORE any header write. A draft that is being confirmed already has a PK
            // and persisted lines; a brand-new confirm does not. The two paths write lines at
            // different times — see persistPreparedLines below.

            // THE HEADER + EMBEDS, not the lines. `SkipRelatedCollections` is load-bearing.
            //
            // `Lines` is a companion now, so an ordinary `super.Save()` would build a save plan,
            // see more than one node, and persist the lines here as part of the graph. That is the
            // right behaviour for a plain composite and completely wrong for this path: the lines
            // have not been expanded, priced, discounted, charged or taxed yet — all of that runs
            // below, and it has to, because it needs the header's key and the subscription
            // decisions.
            //
            // The failure would not have been obvious either. The lines would insert at their raw
            // quantities against an order that is already Confirmed, and `savePendingLines()` would
            // then try to UPDATE them with the resolved prices — which trigger 51003 refuses,
            // because a booked line is frozen. The error surfaces as an INSERT-EXEC rollback naming
            // neither the line nor the rule.
            //
            // `IsGraphNodeSave` is the wrong flag here: it skips *every* companion, including the
            // InitialPaymentDetail embed. `SkipRelatedCollections` persists embeds and leaves
            // collections for `persistPreparedLines` below.
            //
            // It does NOT suppress companion VALIDATION, and it should not: MJ validates every
            // companion from the parent's save so a cross-record invariant sees the whole graph
            // before the first row lands. That is the right guarantee — but it moves a deadline.
            // The lines are now validated HERE, before any line's own `Save()` runs, so every field
            // a line DERIVES rather than accepts has to exist by this point:
            //
            //   CompanyID — stamped from the product by OrderLineEntityServer
            //   UnitPrice — resolved by the pricing walk below
            //
            // Both are NOT NULL and neither is ever authored by a caller, so leaving them until
            // after the header save failed every confirm with "Company cannot be null" and then
            // "Unit Price cannot be null" — on columns nobody sets by hand.
            //
            // Hence the whole IN-MEMORY preparation phase runs first: bundles expand into real
            // lines, subscription decisions settle the quantities, and each line is priced. None of
            // it writes a row, and none of it needs the header's key — the collection stamps the
            // foreign key itself.
            // A form that saved the draft and then confirmed reloads the HEADER only.
            // Booking is the only caller that MUST have the collection before it decides subscriptions.
            if (booking && this.IsSaved && !this.Lines.IsLoaded) {
                await this.Lines.Load();
            }

            await this.expandBundles();
            const decisions: Map<mjBizAppsOrdersOrderLineEntity, SubscriptionDecisionForLine> =
                booking ? await this.decideSubscriptions() : new Map();
            await this.prepareLines(decisions);

            // CONFIRM-AFTER-DRAFT: the lines already exist. `prepareLines` just prorated them
            // (membership qty 1 → 0.3836). If the header flips to Confirmed first, trigger 51003
            // freezes Quantity/LineTotal* and the UPDATE rolls back inside INSERT-EXEC — the
            // error that names neither the line nor the rule. Write those updates WHILE the
            // header is still Draft. A brand-new confirm INSERTs lines after the header; the
            // trigger is UPDATE/DELETE only, so that path is safe.
            const headerAlreadyPersisted = this.IsSaved;
            if (booking && headerAlreadyPersisted) {
                await this.persistPreparedLines(options, decisions);
            }

            if (booking) {
                this.ConfirmedAt = new Date();
            }
            if (!headerAlreadyPersisted && !this.OrderNumber) {
                this.OrderNumber = await this.assignOrderNumber();
            }

            const savedHeader = await super.Save({ ...options, SkipRelatedCollections: true });
            if (!savedHeader) {
                throw new Error(
                    `Failed to save order header: ${this.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                );
            }

            if (!headerAlreadyPersisted || !booking) {
                await this.persistPreparedLines(options, decisions);
            }

            // THE PRICE THE CALLER WAS SHOWN STILL HOLDS — checked here, inside the transaction,
            // where the real gross already exists.
            //
            // The lines are written by now, so `trg_OrderLine_RollupTotals` has maintained
            // OrderHeader.TotalGross from what actually landed rather than from anything this
            // process computed. Throwing rolls the whole booking back: no journal entries, no
            // subscription, no sequence number consumed.
            //
            // Half a penny is the tolerance for the same reason it is elsewhere in this codebase:
            // the money columns are DECIMAL(18,2), so a penny is the unit of account and anything
            // finer is an artefact of summing in binary floating point.
            if (this.ExpectedGrossTotal != null) {
                const actual = (await this.readBalanceFromRow()).TotalGross ?? 0;
                if (Math.abs(actual - this.ExpectedGrossTotal) >= 0.005) {
                    throw new Error(
                        `The order total changed before it was confirmed: you were shown ` +
                            `${this.ExpectedGrossTotal.toFixed(2)} and it now comes to ${actual.toFixed(2)}. ` +
                            `Nothing has been booked. Review the order and confirm again.`,
                    );
                }
            }

            if (booking) {
                const lines = await this.loadLinesForBooking();
                // Subscriptions before booking: a term must exist so recognition entries can anchor
                // to it (D46) and use its anchored/prorated window rather than raw line dates.
                const subs = await this.materializeSubscriptions(lines, decisions, options);
                await this.bookLines(lines, options, subs);
                await this.createInitialPayment(options);

                // ENTITLEMENTS LAST, and INSIDE this transaction (D27/D76).
                //
                // Last because it needs everything above: persisted lines to point at, terms for a
                // subscription-scoped validity window, and — for `OnPaidInFull` timing — the balance
                // that `createInitialPayment` has just moved.
                //
                // Inside, because access and the receivable are the same decision. An order that
                // booked revenue and failed to grant access has charged for nothing; one that granted
                // access without booking has given something away. So a failure here rolls the confirm
                // back rather than being logged and shrugged at.
                await this.grantEntitlements(lines, subs, options);

                // And the mirror: a returned line takes its access with it.
                await this.revokeEntitlementsForReversals(lines, options);

                // GIFT CARDS, alongside entitlements and for the same reason. Selling a gift card
                // that never mints an instrument has taken money for nothing, so a failure here
                // rolls the confirm back rather than being logged. Handles both directions: an
                // ordinary line issues, a reversal line voids what the origin issued.
                await this.issueGiftCards(lines, options);
            }

            await dbProvider.CommitTransaction();

            // ENTITLEMENT PROVISIONING PUSH — POST-COMMIT, FIRE-AND-FORGET (WS-2).
            //
            // The grants above were born ProvisioningStatus='Pending' inside the transaction, so
            // the commit has already recorded the obligation durably. The push to the downstream
            // system deliberately happens OUT here: a slow or dead LXP must neither hold the
            // booking's locks nor fail a sale that has already committed. A failure is logged and
            // left for the reconcile sweep ('Orders.ReconcileEntitlementProvisioning'), which
            // re-drives anything Pending/RevokePending — at-least-once by design.
            if (booking) {
                const pushProvider = this.ProviderToUse as unknown as IMetadataProvider;
                const pushUser = this.ContextCurrentUser as UserInfo;
                void PushProvisioningForOrder(this.ID, pushProvider, pushUser).catch((err) => {
                    LogError(
                        `Post-commit entitlement provisioning push failed for order ${this.ID}: ` +
                            `${err instanceof Error ? err.message : String(err)} — the reconcile sweep will retry.`,
                    );
                });
            }
            return true;
        } catch (err) {
            LogError(`OrderEntityServer.Save failed for order ${this.OrderNumber ?? this.ID}: ${err}`);
            try {
                await dbProvider.RollbackTransaction();
            } catch (rollbackErr) {
                LogError(`Rollback failed after OrderEntityServer.Save error: ${rollbackErr}`);
            }
            // Surface WHY. Without this the caller gets a bare `false` and `LatestResult` still
            // holds the header's SUCCESSFUL save — so a subscription rule rejection or an
            // unresolvable GL account reads as "it just didn't work". The UI, the API and the
            // integration suite all need the reason; the log is not a return value.
            this.RegisterResultHistoryEntry(this.buildFailureResult(err));
            return false;
        } finally {
            this.bookingInFlight = false;
        }
    }

    /**
     * Turn a thrown booking error into the `BaseEntityResult` a caller can read off `LatestResult`.
     * The message is the error's own text — GLAccountResolver and SubscriptionBehavior both write
     * messages meant for a human, so passing them through beats a generic "save failed".
     */
    private buildFailureResult(err: unknown): BaseEntityResult {
        const result = new BaseEntityResult();
        result.Success = false;
        result.Type = this.IsSaved ? 'update' : 'create';
        result.Message = err instanceof Error ? err.message : String(err);
        // Do not also set `Error` to the same Error — CompleteMessage concatenates
        // Message + Error.message and the user sees the refusal twice.
        result.OriginalValues = this.Fields.map(f => ({ FieldName: f.Name, Value: f.OldValue }));
        result.NewValues = this.Fields.map(f => ({ FieldName: f.Name, Value: f.Value }));
        result.StartedAt = new Date();
        result.EndedAt = new Date();
        return result;
    }

    /**
     * Resolve and store this order's due date, walking the terms rungs (D83).
     *
     * A STATED DUE DATE IS LEFT ALONE. `PaymentTermsBehavior` reports whether the answer came from
     * the caller, and a stated date is never recomputed — that is how a contracts app supplies terms
     * Orders has no way to derive, and how a negotiated date survives the next save.
     *
     * The resolved TERMS are recorded alongside the date when the order did not name them, so the
     * invoice can print "Net 30" rather than inferring it back out of an interval.
     *
     * A failure here does not fail the confirm. Booking is the irreversible step and money has
     * already moved in the ledger; refusing it because a lookup could not be read would be a far
     * worse outcome than an order that falls back to due-on-receipt and says so in the log.
     */
    private async resolveDueDate(): Promise<void> {
        const provider = this.ProviderToUse as unknown as IMetadataProvider;
        const user = this.ContextCurrentUser as UserInfo;
        const orderDate = this.OrderDate ? new Date(this.OrderDate).toISOString().slice(0, 10) : null;
        if (!orderDate) return;

        try {
            await LoadOrdersEngine(provider, user);
            const terms = new Map(
                OrdersEngine.Instance.PaymentTermsTypes.map((t) => [
                    String(t.ID).toLowerCase(),
                    { PaymentTermsTypeID: String(t.ID), NetDays: t.NetDays ?? null },
                ]),
            );

            const [customerTerms, companyDefault] = await Promise.all([
                this.customerPaymentTerms(provider, user),
                this.companyDefaultTerms(provider, user, terms),
            ]);

            const resolution = ResolveDueDate({
                // `OldValue` is what is on disk. On the confirm save the caller may have set a date
                // moments ago, so the CURRENT value is what "stated" means here.
                StatedDueDate: this.DueDate ? new Date(this.DueDate).toISOString().slice(0, 10) : null,
                StatedPaymentTermsTypeID: this.PaymentTermsTypeID ?? null,
                OrderDate: orderDate,
                CompanyID: this.CompanyID ?? null,
                CustomerTerms: customerTerms,
                CompanyDefault: companyDefault,
                TermsByID: terms,
            });

            if (resolution.WasStated) return;
            if (resolution.DueDate) this.DueDate = new Date(resolution.DueDate);
            if (resolution.PaymentTermsTypeID) {
                this.PaymentTermsTypeID = resolution.PaymentTermsTypeID;
            }
        } catch (err) {
            LogError(
                `Order ${this.OrderNumber ?? this.ID}: could not resolve payment terms (${err}). ` +
                    `The order is due on receipt; configure CustomerPaymentTerms or the selling company's ` +
                    `default terms to change that.`,
            );
            if (!this.DueDate) this.DueDate = new Date(orderDate);
        }
    }

    /** This buyer's negotiated terms, joined to their net days. */
    private async customerPaymentTerms(provider: IMetadataProvider, user: UserInfo): Promise<CustomerTermsFacts[]> {
        const orgID = this.BillToOrganizationID;
        const personID = this.BillToPersonID;
        if (!orgID && !personID) return [];

        const clause = orgID
            ? `OrganizationID = '${RequireUUID(orgID, 'BillToOrganizationID')}'`
            : `PersonID = '${RequireUUID(personID as string, 'BillToPersonID')}'`;

        const rv = new RunView(provider as unknown as IRunViewProvider);
        const result = await rv.RunView<{
            PaymentTermsTypeID: string;
            CompanyID: string | null;
            StartedAt: string | null;
            EndedAt: string | null;
            Status: string;
        }>(
            {
                EntityName: CUSTOMER_PAYMENT_TERMS_ENTITY,
                ExtraFilter: `${clause} AND Status = 'Active'`,
                // ORDER IS PART OF THE CONTRACT, not a convenience. `BestCustomerTerms` picks the
                // most recently started row, and without an ORDER BY the rows arrive in whatever
                // order the engine chooses — so a bug that simply kept the FIRST row would give the
                // right answer or the wrong one depending on the plan, and a test could pass twice
                // and fail on the third run. Oldest first makes "keep the first" always wrong, which
                // is what makes the guard against it meaningful.
                OrderBy: 'StartedAt',
                ResultType: 'simple',
            },
            user,
        );
        if (!result?.Success) return [];

        const byID = new Map(OrdersEngine.Instance.PaymentTermsTypes.map((t) => [String(t.ID).toLowerCase(), t]));
        return (result.Results ?? []).map((row) => ({
            PaymentTermsTypeID: row.PaymentTermsTypeID,
            NetDays: byID.get(String(row.PaymentTermsTypeID).toLowerCase())?.NetDays ?? null,
            CompanyID: row.CompanyID ?? null,
            StartedAt: row.StartedAt ? new Date(row.StartedAt).toISOString() : null,
            EndedAt: row.EndedAt ? new Date(row.EndedAt).toISOString() : null,
            Status: row.Status,
        }));
    }

    /**
     * The selling company's default terms — the last step of the due-date walk before "due on
     * receipt" (D83).
     *
     * Reads `OrderCompanyPolicy`, NOT accounting's `AccountingCompanyProfile`.
     *
     * It used to read the latter, and accounting removed that column (their issue #22) on grounds
     * this codebase agrees with: accounting records what was owed and when, but deciding WHEN AN
     * ORDER IS DUE is a selling decision, so the default belongs to the app that makes it. Orders
     * kept reading the removed column, so every order whose customer had no negotiated terms failed
     * the walk with `Invalid column name 'DefaultPaymentTermsTypeID'` — six integration checks, and
     * in production the entire company-default step.
     *
     * `OrderCompanyPolicy` is the right home and needed no new table: it is already the per-company
     * orders policy row, IS-A `__mj.Company` so its ID *is* the company ID, and a company with no
     * row simply takes the defaults — which here means falling through to due on receipt.
     */
    private async companyDefaultTerms(
        provider: IMetadataProvider,
        user: UserInfo,
        terms: Map<string, { PaymentTermsTypeID: string; NetDays: number | null }>,
    ): Promise<{ PaymentTermsTypeID: string; NetDays: number | null } | null> {
        if (!this.CompanyID) return null;
        const rv = new RunView(provider as unknown as IRunViewProvider);
        const result = await rv.RunView<{ DefaultPaymentTermsTypeID: string | null }>(
            {
                EntityName: ORDER_COMPANY_POLICY_ENTITY,
                ExtraFilter: `ID = '${RequireUUID(this.CompanyID, 'CompanyID')}'`,
                ResultType: 'simple',
            },
            user,
        );
        const id = result?.Results?.[0]?.DefaultPaymentTermsTypeID;
        return id ? (terms.get(String(id).toLowerCase()) ?? null) : null;
    }

    /**
     * Refuse an illegal status move BEFORE this save does anything, and say why.
     *
     * ONLY the lifecycle verdict is asked here, deliberately. `super.Save()` runs the full
     * `Validate()` later, and that is the right place for the rest of it: `Validate()` includes the
     * generated NOT NULL field checks, and `OrderNumber`, `Company` and every line's `UnitPrice` are
     * populated BY this save — minted from the sequence, or resolved by the pricing walk below. An
     * attempt to run all of `Validate()` up front refused every confirm in the suite with
     * "Order Number cannot be null", on fields the save was about to fill in.
     *
     * The transition check has no such dependency: it reads the persisted `Status` against the new
     * one, and both are known before anything runs. Asking it here is what makes integration check
     * OS4 hold — a refused move must change nothing on disk and book nothing, and by the time
     * control reaches `super.Save()` this method has already priced lines, decided promotions and
     * charges, minted an order number and posted journal entries.
     *
     * The booking rules that DO need the full record — a payer, something to book — live on
     * `OrderHeaderEntity.Validate()` and fire inside `super.Save()`, where `bookingInFlight` keeps
     * `willBookOnThisSave()` answering true even though `ConfirmedAt` has just been stamped.
     *
     * Reports through `LatestResult`, the same shape every other refusal on this path uses, so a
     * caller gets the reason rather than a bare `false`.
     */
    private passesStatusTransition(): boolean {
        const verdict = this.statusTransitionVerdict();
        if (verdict.Allowed) return true;

        this.RegisterResultHistoryEntry(
            this.buildFailureResult(new Error(this.statusTransitionRefusal(verdict))),
        );
        return false;
    }

    // ─── Booking ───────────────────────────────────────────────────────────────

    // `bookingInFlight` and `willBookOnThisSave()` moved to OrderHeaderEntity (both `protected`),
    // because the rules that consult them — must have a payer, must have something to book — are
    // decidable without the database and now run on both tiers.

    /**
     * Settle every line's money IN MEMORY. Writes nothing.
     *
     * EVERY in-memory decision happens before any row goes down. That ordering is forced rather
     * than tidy: a Confirmed line is frozen by trigger 51003, and because the CRUD procs run under
     * INSERT-EXEC, a trigger rollback raises 'Cannot use the ROLLBACK statement within an
     * INSERT-EXEC statement' — an error naming neither the line nor the rule it broke. So anything
     * that changes a line's money must be settled BEFORE the insert, not corrected after it.
     *
     * Split out of `savePendingLines` and hoisted ahead of the header save when `Lines` became a
     * related-record collection: MJ validates companions from the parent's save, so a line has to be
     * complete — `CompanyID` stamped, `UnitPrice` resolved, both NOT NULL and neither ever authored
     * by a caller — before that save runs, not after it.
     */
    private async prepareLines(
        decisions?: Map<mjBizAppsOrdersOrderLineEntity, SubscriptionDecisionForLine>,
    ): Promise<void> {
        // Lines whose money came from the line they reverse (D16) rather than from the price table.
        // The pricing service is told to leave these alone.
        const settledFromOrigin = new Set<mjBizAppsOrdersOrderLineEntity>();

        for (const line of this.Lines.Items) {
            // Scale the QUANTITY, not DiscountPct: a short first period is not a concession, and
            // routing it through the discount field would corrupt discount reporting and post the
            // difference to the Sales Discounts contra account, where it does not belong.
            // Rounded to 4dp — `OrderLine.Quantity`'s scale — so the stored value and any later
            // recomputation of the line total agree exactly.
            const decided = decisions?.get(line);
            const term = decided?.Decision.Term;
            if (term?.IsProrated && term.ProrationFactor != null) {
                line.Quantity = Math.round(line.Quantity * term.ProrationFactor * 1e4) / 1e4;
            }
            if (term) {
                if (term.StartDate) line.ServicePeriodStart = term.StartDate;
                if (term.EndDate) line.ServicePeriodEnd = term.EndDate;
            }

            // Events carry their own service period — the event happens when it happens.
            await this.applyEventServicePeriod(line);

            // A REVERSAL is settled from its origin, not from the price table (D16). This must come
            // before pricing: `ComputeAmount` refuses a negative quantity outright — "which volume
            // band does -5 land in?" has no answer — so a reversal that reached the pricing engine
            // would fail there, with a message about quantity rather than about the return.
            const inheritedFromOrigin = await this.applyReversalOrigin(line);

            // Price after proration has settled the quantity — quantity bands and tiers are a
            // function of the quantity actually being bought, so pricing a pre-prorated quantity
            // would band on a number that never reaches the line.
            //
            // NOT for negative quantities. A negative line with no origin is refused by the line's
            // own validation, which names `ReversesOrderLineID` and tells the reader what would make
            // it legal — but pricing runs first and `ComputeAmount` throws about volume bands
            // instead, replacing a message that helps with one that does not.
            if (inheritedFromOrigin) settledFromOrigin.add(line);

            // The line's OWN derived fields — CompanyID from the product, and the computed totals.
            // Normally done inside `OrderLineEntityServer.Save()`; hoisted here for the same reason
            // the rest of this method is, so the line is complete before companion validation sees
            // it. Idempotent, so its own `Save()` re-deriving them below changes nothing.
            const serverLine = line as unknown as { PrepareForSave?: () => Promise<void> };
            if (typeof serverLine.PrepareForSave === 'function') {
                await serverLine.PrepareForSave();
            } else if (line.ISAParent) {
                const parentServerLine = line.ISAParent as unknown as { PrepareForSave?: () => Promise<void> };
                if (typeof parentServerLine.PrepareForSave === 'function') {
                    await parentServerLine.PrepareForSave();
                }
            }
        }

        // A BROWSER ASKS FOR CHARGES AND DISCOUNTS THROUGH THE COLLECTIONS, so drain them into the
        // request arrays before pricing runs. See `drainStagedPricingRequests` for why the rows are
        // consumed rather than saved as they arrive.
        await this.drainStagedPricingRequests();

        // PRICING, PROMOTIONS, CHARGES AND TAX — one call to the service that also answers
        // `Orders.PriceOrder`, so the number the screen shows and the number the ledger books come
        // from the same code rather than from two implementations that agree until they do not.
        const pricing = await new OrderPricingService({
            Provider: this.ProviderToUse as unknown as IMetadataProvider,
            User: this.ContextCurrentUser as UserInfo,
        }).Price(
            {
                OrderHeaderID: this.ID ?? null,
                CompanyID: this.CompanyID,
                BillToPersonID: this.BillToPersonID ?? null,
                BillToOrganizationID: this.BillToOrganizationID ?? null,
                OrderDate: this.OrderDate ?? null,
                ShipToAddressID: this.ShipToAddressID ?? null,
                Lines: [...this.Lines.Items],
                PromotionCodes: this.PromotionCodes.Codes,
                ManualDiscounts: this._manualDiscounts,
                Charges: this._charges,
            },
            settledFromOrigin,
        );

        this._unusableCodes = pricing.UnusableCodes;
        this._taxReasons = pricing.TaxReasons;
        this._priceComponents = pricing.PriceComponents;
        this._pendingPromotions = pricing.Promotions;
        this._pendingCharges = pricing.Charges;
    }

    /**
     * Write the lines that `prepareLines` settled, plus the adjustment rows that need their keys.
     */
    /**
     * Write the adjustment and allocation rows once the lines have real IDs.
     *
     * These only ADD rows — the frozen line is never touched again, which is what keeps this clear
     * of the immutability trigger.
     */
    private async writePromotionRecords(
        run: PromotionRunResult,
        persisted: mjBizAppsOrdersOrderLineEntity[],
    ): Promise<void> {
        if (!run.Applications.length) return;
        const provider = this.ProviderToUse as unknown as IMetadataProvider;
        const user = this.ContextCurrentUser as UserInfo;

        // Positional keys become real IDs.
        const applications = run.Applications.map((a) => ({
            ...a,
            OrderLineID: a.OrderLineID != null ? (persisted[Number(a.OrderLineID)]?.ID ?? null) : null,
        }));

        await WriteAdjustments(this.ID, applications, new Map(), [], user?.ID ?? null, provider, user);
    }

    /** Net for a line that has not been saved yet — mirrors OrderLineEntityServer's own formula. */
    private pendingLineNet(line: mjBizAppsOrdersOrderLineEntity): number {
        // Via LineGross for the same reason the other two sites do: a subscription sold
        // on a Flat rule must price its TERM at the flat amount, not at a re-multiplied
        // unit rate, or the term, the line and the journal entry disagree by pennies and
        // deferred revenue never clears to zero.
        return NetAfterDiscount(
            LineGross(Number(line.Quantity ?? 0), Number(line.UnitPrice ?? 0), this.resolvedExtendedFor(line)),
            Math.round(Number(line.DiscountPct ?? 0) * 1e4) / 1e4,
            Number(line.DiscountAmount ?? 0),
        );
    }

    /**
     * The exact extended amount a price rule computed for this line, if one did.
     *
     * `_priceComponents` is populated by the pricing pass in this same save, so this
     * is the authority while the line is still in flight; the line itself carries the
     * same figure for its own totals hook, which runs outside this class.
     */
    private resolvedExtendedFor(line: mjBizAppsOrdersOrderLineEntity): number | null {
        return this._priceComponents.get(line)?.ExtendedAmount ?? null;
    }

    /** Persist priced lines and the component/charge rows that need their IDs. */
    private async persistPreparedLines(
        options?: EntitySaveOptions,
        decisions?: Map<mjBizAppsOrdersOrderLineEntity, SubscriptionDecisionForLine>,
    ): Promise<void> {
        await this.savePendingLines(options, decisions);
        await this.savePriceComponents(options);
    }

    private async savePendingLines(
        options?: EntitySaveOptions,
        _decisions?: Map<mjBizAppsOrdersOrderLineEntity, SubscriptionDecisionForLine>,
    ): Promise<void> {
        const pending = this._pendingPromotions;
        const charges = this._pendingCharges;

        const persisted: mjBizAppsOrdersOrderLineEntity[] = [];
        for (const line of this.Lines.Items) {
            const serverLine = line as unknown as { BypassBookedCheck?: boolean };
            serverLine.BypassBookedCheck = true;
            const saved = await line.Save(options);
            if (!saved) {
                throw new Error(
                    `Failed to save order line ${line.LineNumber}: ${ExtractEntityErrorMessage(line)}`,
                );
            }
            persisted.push(line);
        }
        await this.saveTaxReasons(persisted);
        // The lines are NOT emptied here any more. `this._lines = []` drained a staging buffer that
        // existed because the old wire format shipped a draft and discarded it. The collection is
        // declared `ClearAfterSave: false`, so it stays a live view of what was just persisted —
        // carrying the server-assigned keys — which is what a UI bound straight to `order.Lines`
        // needs, and what the caller gets back from a graph save.

        // The adjustment and charge rows need line IDs, so they follow the insert — but they only ADD
        // rows and never touch the frozen line again.
        if (pending) await this.writePromotionRecords(pending, persisted);
        if (charges) await this.writeChargeRecords(charges, persisted);
    }






    /** Write the charge and allocation rows once the lines have real IDs. */
    private async writeChargeRecords(
        result: ComputeChargesResult,
        persisted: mjBizAppsOrdersOrderLineEntity[],
    ): Promise<void> {
        if (!result.Charges.length) return;
        const provider = this.ProviderToUse as unknown as IMetadataProvider;
        const user = this.ContextCurrentUser as UserInfo;
        await WriteCharges(
            this.ID,
            result,
            (positional) => persisted[Number(positional)]?.ID ?? null,
            user?.ID ?? null,
            provider,
            user,
        );
    }

    /**
     * Create the grants this order's lines confer (D27/D76).
     *
     * Delegates entirely to `EntitlementEngine`; what lives here is the mapping from the order's own
     * entities to the structural shape the engine takes, plus the balance the timing rule needs.
     *
     * `Balance` is re-read from the header rather than trusted from memory: `createInitialPayment`
     * has just run, and the rollup triggers (D41) moved `AmountPaid`/`Balance` on the ROW without
     * telling this object. An `OnPaidInFull` grant reading a stale balance would sit Suspended on an
     * order that is already paid.
     */
    private async grantEntitlements(
        lines: mjBizAppsOrdersOrderLineEntity[],
        subs: SubscriptionMaterialization,
        options?: EntitySaveOptions,
    ): Promise<void> {
        const provider = this.ProviderToUse as unknown as IMetadataProvider;
        const user = this.ContextCurrentUser as UserInfo;

        const fresh = await this.readBalanceFromRow();

        await CreateEntitlementGrants(
            {
                ID: this.ID,
                OrderDate: this.OrderDate ? new Date(this.OrderDate) : new Date(),
                Balance: fresh.Balance,
                TotalGross: fresh.TotalGross,
                BillToPersonID: this.BillToPersonID ?? null,
                BillToOrganizationID: this.BillToOrganizationID ?? null,
            },
            lines.map((l) => ({
                ID: l.ID,
                ProductID: l.ProductID,
                Quantity: Number(l.Quantity ?? 0),
                ShipToPersonID: l.ShipToPersonID ?? null,
                ShipToOrganizationID: l.ShipToOrganizationID ?? null,
            })),
            subs.TermsByLine,
            provider,
            user,
            options,
        );
    }

    /**
     * Turn any bundle line into a parent plus its component children (D32/D41/D45).
     *
     * Delegates to `BundleEngine`; what lives here is making a fresh line entity the way this class
     * does, and giving the parent an ID before either row is written so the children can point at it
     * at INSERT time rather than through a later update the immutability trigger would refuse.
     */
    /**
     * Turn charge and adjustment rows a CLIENT staged into the engine's request arrays.
     *
     * ## Why this exists
     *
     * `Charges` and `Adjustments` are related-record collections so a browser can ask for a shipping
     * charge or an ad-hoc discount and have it cross the wire with the order. Before them these were
     * transient arrays only the server could fill, so once `OrderDraft` was deleted a promotion code
     * or a manual discount typed on screen showed up in the PRICE PREVIEW and then vanished at
     * confirm — the screen and the ledger disagreeing, silently, which is the one failure this app
     * spends most of its guard rails preventing.
     *
     * ## Why the staged rows are CONSUMED rather than saved as they arrive
     *
     * A staged row is a REQUEST, and it is not the same object as the record the engine writes. A
     * client can fill in three of a charge's fifteen fields — the type, an amount or rate, and a
     * reason for an override. `BasisAmount`, the per-line allocations, the tax jurisdiction and the
     * sequence are all decided by the pricing walk, and the allocations cannot even be written until
     * the lines have IDs. Letting the graph write the row as it arrived would put a half-formed
     * charge in the transaction and then need a second write to correct it — with a window in
     * between where the order carries a charge with no basis.
     *
     * So the rows are read as requests and removed, and `WriteCharges` / the promotion writer produce
     * the authoritative rows exactly as they always have. The engine is untouched by this change,
     * which matters: it is the part with 373 integration checks against it.
     *
     * On the way OUT the collections mean what they say — `Charges.Load()` on a saved order returns
     * what the engine decided. Request on the way in, record on the way out.
     */
    private async drainStagedPricingRequests(): Promise<void> {
        const staged = this.Charges.Items.filter((c) => !c.IsSaved);
        if (staged.length) {
            const codes = await this.chargeTypeCodesByID(staged.map((c) => c.ChargeTypeID));
            const requests: RequestedCharge[] = [];
            for (const row of staged) {
                const code = codes.get(String(row.ChargeTypeID ?? '').toLowerCase());
                if (!code) {
                    // Refused rather than dropped. A charge type that does not resolve is a request
                    // the customer will not be billed for, and silently ignoring it is how an order
                    // ships without its freight.
                    throw new Error(
                        `Charge type '${row.ChargeTypeID}' does not exist, so the charge cannot be applied.`,
                    );
                }
                requests.push({
                    Code: code,
                    Amount: row.Amount ?? null,
                    Rate: row.Rate ?? null,
                    OverrideReason: row.OverrideReason ?? null,
                    ...(row.IsOverridden ? { OverrideAmount: row.Amount ?? null } : {}),
                });
                this.Charges.Remove(row);
            }
            this._charges = [...this._charges, ...requests];
        }

        const stagedAdjustments = this.Adjustments.Items.filter((a) => !a.IsSaved);
        for (const row of stagedAdjustments) {
            // Only MANUAL adjustments can be staged. One naming a promotion is the engine's own
            // output being handed back to it, which would double the discount.
            if (row.PromotionID || row.PromotionCodeID) {
                throw new Error(
                    'A promotion adjustment cannot be supplied on an order — present the code and let ' +
                        'the engine decide whether it applies, to whom, and for how much.',
                );
            }
            this._manualDiscounts = [
                ...this._manualDiscounts,
                {
                    OrderLineID: row.OrderLineID ?? null,
                    Amount: row.Amount ?? null,
                    Reason: row.Reason ?? '',
                } as ManualDiscountRequest,
            ];
            this.Adjustments.Remove(row);
        }
    }

    /** `ChargeType.ID` → `Code`, for the staged rows only. One read, not one per row. */
    private async chargeTypeCodesByID(ids: Array<string | null | undefined>): Promise<Map<string, string>> {
        const out = new Map<string, string>();
        const unique = [...new Set(ids.map((i) => String(i ?? '').trim()).filter(Boolean))];
        if (!unique.length) return out;

        const rv = new RunView(this.ProviderToUse as unknown as IRunViewProvider);
        const res = await rv.RunView<{ ID: string; Code: string }>(
            {
                EntityName: CHARGE_TYPE_ENTITY,
                ExtraFilter: `ID IN (${unique.map((id) => `'${id.replace(/'/g, "''")}'`).join(',')})`,
                ResultType: 'simple',
            },
            this.ContextCurrentUser as UserInfo,
        );
        for (const row of res.Results ?? []) out.set(String(row.ID).toLowerCase(), row.Code);
        return out;
    }

    private async expandBundles(): Promise<void> {
        if (!this.Lines.Count) return;

        const provider = this.ProviderToUse as unknown as IMetadataProvider;
        const user = this.ContextCurrentUser as UserInfo;

        // A parent needs an ID the children can name. Unsaved lines may not have one yet, and the
        // database default would only assign it at insert — too late for the child rows going down
        // in the same batch.
        for (const line of this.Lines.Items) {
            // `Set`, not `line.ID = …`: the primary key is ReadOnly on the generated class and has
            // no setter. BaseEntity allows exactly one write to a ReadOnly field on a new record,
            // which is what mints the id here.
            if (!line.ID) line.Set('ID', crypto.randomUUID().toUpperCase());
        }

        // ExpandBundleLines APPENDS to the array it is handed, and `Lines.Items` is readonly by
        // design — push/splice would bypass the FK stamping, sequence maintenance and removal
        // tracking the collection exists to guarantee. So it expands a working copy and the children
        // it created are attached through `Add()`, which stamps OrderHeaderID for us.
        const working = [...this.Lines.Items];
        const before = working.length;
        await ExpandBundleLines(
            working,
            async () => {
                const row = await provider.GetEntityObject<mjBizAppsOrdersOrderLineEntity>(
                    'MJ_BizApps_Orders: Order Lines',
                    user,
                );
                row.NewRecord();
                row.Set('ID', crypto.randomUUID().toUpperCase());  // ReadOnly PK — see above
                return row;
            },
            provider,
            user,
        );
        if (working.length === before) return;

        for (const child of working.slice(before)) {
            this.Lines.Add(child);
        }

        // REORDER AND RENUMBER. Children are appended to the end of the collection, so without this
        // a two-bundle order interleaves as parent, parent, child, child, child, child — unreadable
        // on an invoice and impossible to group by eye. Putting each child directly beneath its
        // parent is also what `UQ_OrderLine_OrderHeader_LineNumber` needs: the children arrive with
        // no LineNumber at all, and the column is NOT NULL.
        const byParent = new Map<string, mjBizAppsOrdersOrderLineEntity[]>();
        const roots: mjBizAppsOrdersOrderLineEntity[] = [];
        for (const line of this.Lines.Items) {
            const parentID = line.ParentOrderLineID;
            if (parentID) {
                const k = parentID.toLowerCase();
                if (!byParent.has(k)) byParent.set(k, []);
                byParent.get(k)!.push(line);
            } else {
                roots.push(line);
            }
        }

        const ordered: mjBizAppsOrdersOrderLineEntity[] = [];
        for (const root of roots) {
            ordered.push(root);
            for (const child of byParent.get((root.ID ?? '').toLowerCase()) ?? []) ordered.push(child);
        }
        // Anything whose parent is not on this order still has to be saved rather than dropped.
        for (const line of this.Lines.Items) if (!ordered.includes(line)) ordered.push(line);

        // ASSIGNED LAST, and deliberately after every `Add()` above.
        //
        // The collection declares `Sequence: { Field: 'LineNumber', From: 1 }`, and MJ's
        // `applySequence()` re-stamps LineNumber by ARRAY INDEX on every `Add()` and `Create()`. So
        // numbering the lines before attaching the bundle children would have been silently undone
        // by the next `Add()`. It does not run at save time, which makes this explicit pass the last
        // writer.
        //
        // The collection's in-memory order stays "originals, then children", which no longer
        // matters: `OrderBy: 'LineNumber ASC'` is what it reloads by, so the parent/child grouping
        // is what every reader sees.
        ordered.forEach((line, i) => {
            line.LineNumber = i + 1;
        });
    }

    /**
     * Mint the stored-value instruments this order's gift-card lines sell (D44).
     *
     * Delegates to `GiftCardEngine`; what lives here is the mapping from the order's entities to the
     * shape the engine takes. The engine is idempotent against the database, so a re-save of an
     * already confirmed order issues nothing — which matters because a second set of cards would be
     * free money that reconciles perfectly, with the accounts present and the ledger balanced.
     *
     * `IssuingCompanyID` is the ORDER's company rather than any line's. A gift card is a claim on
     * the entity that sold it, and on a multi-company order the seller is the header's company even
     * where a line's product belongs to a sibling.
     */
    private async issueGiftCards(
        lines: mjBizAppsOrdersOrderLineEntity[],
        options?: EntitySaveOptions,
    ): Promise<void> {
        const provider = this.ProviderToUse as unknown as IMetadataProvider;
        const user = this.ContextCurrentUser as UserInfo;

        await IssueGiftCards(
            {
                ID: this.ID,
                IssuingCompanyID: this.CompanyID,
                BillToPersonID: this.BillToPersonID ?? null,
                BillToOrganizationID: this.BillToOrganizationID ?? null,
            },
            lines.map((l) => ({
                ID: l.ID,
                ProductID: l.ProductID,
                Quantity: Number(l.Quantity ?? 0),
                UnitPrice: Number(l.UnitPrice ?? 0),
                ReversesOrderLineID:
                    l.ReversesOrderLineID ?? null,
                ShipToPersonID: l.ShipToPersonID ?? null,
                ShipToOrganizationID: l.ShipToOrganizationID ?? null,
            })),
            provider,
            user,
            options,
        );
    }

    /** The header's rollup columns as the DATABASE now holds them, after the payment triggers ran. */
    private async readBalanceFromRow(): Promise<{ Balance: number | null; TotalGross: number | null }> {
        const rv = new RunView(this.ProviderToUse as unknown as IRunViewProvider);
        const result = await rv.RunView<{ Balance: number | null; TotalGross: number | null }>(
            {
                EntityName: ORDER_ENTITY,
                ExtraFilter: `ID = '${this.ID}'`,
                Fields: ['Balance', 'TotalGross'],
                ResultType: 'simple',
            },
            this.ContextCurrentUser,
        );
        const row = result?.Results?.[0];
        return {
            Balance: row?.Balance ?? this.Balance ?? null,
            TotalGross: row?.TotalGross ?? this.TotalGross ?? null,
        };
    }

    /**
     * Take access away from what was sent back.
     *
     * A full return revokes; a partial return reduces the quantity proportionally. Uncountable grants
     * — a Feature, an AccessLevel — survive a partial return, because the customer still holds some of
     * the thing that conferred them.
     *
     * Runs on the REVERSAL order's lines, unwinding the grants that hang off each ORIGIN line. The
     * origin's quantity is what the proportion is taken against, so it is read from the origin rather
     * than inferred from the reversal.
     */
    private async revokeEntitlementsForReversals(
        lines: mjBizAppsOrdersOrderLineEntity[],
        options?: EntitySaveOptions,
    ): Promise<void> {
        const reversals = lines.filter(
            (l) => l.ReversesOrderLineID,
        );
        if (!reversals.length) return;

        const provider = this.ProviderToUse as unknown as IMetadataProvider;
        const user = this.ContextCurrentUser as UserInfo;

        for (const line of reversals) {
            const reverses = line.ReversesOrderLineID;
            const context = await LoadReversalContext(reverses, provider, user, [line.ID]);
            if (!context) continue; // applyReversalOrigin already refused anything unresolvable

            await RevokeGrantsForReturn(
                reverses,
                context.Origin.Quantity,
                Number(line.Quantity ?? 0),
                `Returned on order ${this.OrderNumber ?? this.ID}`,
                provider,
                user,
                options,
            );
        }
    }

    /**
     * Settle a reversal line from the line it unwinds (D16). Returns true when this line WAS a
     * reversal, so the caller knows to skip ordinary pricing.
     *
     * THREE THINGS ONLY THE ORIGIN KNOWS, and each of them produces a balanced journal entry when
     * it goes wrong — which is why they are refusals here rather than checks somewhere downstream:
     *
     *   - **How much is left.** Returning 5 against a line that sold 2 refunds money never
     *     collected. The entry balances; nothing later in the pipeline can tell.
     *   - **What it cost.** Pricing a return against today's table refunds last year's purchase at
     *     this year's rate. A stated `UnitPrice` still wins — see `applyResolvedPrice` — because a
     *     stated price is a decision somebody made, and a negotiated return settlement is exactly
     *     that.
     *   - **Which product.** An ID copied from the wrong row credits another company's revenue.
     *
     * Runs on any line carrying `ReversesOrderLineID`, including a POSITIVE one: a line that points
     * at an origin is making a claim about that origin, and the claim is checkable either way.
     */
    private async applyReversalOrigin(line: mjBizAppsOrdersOrderLineEntity): Promise<boolean> {
        const reverses = line.ReversesOrderLineID;
        if (!reverses) {
            // A negative line with no origin. `OrderLineEntityServer.ValidateAsync` says this too,
            // and says it well — but it never gets the chance: pricing is skipped for a negative
            // quantity, so `UnitPrice` stays null and the NOT NULL field check fires first with
            // "Unit Price cannot be null", which sends the reader to entirely the wrong field.
            // Refusing here keeps the message that names what would make the line legal.
            if (Number(line.Quantity ?? 0) < 0) {
                throw new Error(
                    `Order line ${line.LineNumber}: a negative quantity is only valid on a reversal line. ` +
                        `Set ReversesOrderLineID to the line being reversed, or use a positive quantity.`,
                );
            }
            return false;
        }

        const provider = this.ProviderToUse as unknown as IMetadataProvider;
        const user = this.ContextCurrentUser as UserInfo;

        // Exclude THIS line from the already-reversed total. On a re-save it is already in the
        // database, and counting it would make the line refuse itself.
        const context = await LoadReversalContext(reverses, provider, user, line.ID ? [line.ID] : []);
        if (!context) {
            throw new Error(
                `Order line ${line.LineNumber} reverses order line ${reverses}, which does not exist. ` +
                    `A reversal pointing at nothing cannot be validated against anything — the quantity ` +
                    `and price it claims to unwind have no source.`,
            );
        }

        // In-memory siblings on THIS order count too. Two reversal lines against one origin, saved
        // together, are each within the original while their sum is not — and neither is in the
        // database yet for `LoadReversalContext` to have seen.
        let siblingReversed = 0;
        for (const other of this.Lines.Items) {
            if (other === line) continue;
            const otherReverses = other.ReversesOrderLineID;
            if (otherReverses && uuidKey(otherReverses) === uuidKey(reverses)) {
                siblingReversed += Math.abs(Number(other.Quantity ?? 0));
            }
        }

        const refusal = ValidateReversal(
            { ProductID: line.ProductID, Quantity: Number(line.Quantity ?? 0) },
            context.Origin,
            context.AlreadyReversed + siblingReversed,
        );
        if (refusal) {
            throw new Error(`Order line ${line.LineNumber}: ${refusal}`);
        }

        // Inherit the origin's terms, unless the caller stated their own. Same rule as pricing: a
        // stated value is a decision, and resolution only ever fills a blank.
        const terms = InheritedTerms(context.Origin, Number(line.Quantity ?? 0));
        const priceField = line.GetFieldByName('UnitPrice');
        if (!(priceField?.Dirty === true || (line.UnitPrice ?? 0) > 0)) {
            line.UnitPrice = terms.UnitPrice;
        }
        const discountField = line.GetFieldByName('DiscountPct');
        if (!(discountField?.Dirty === true || (line.DiscountPct ?? 0) > 0)) {
            line.DiscountPct = terms.DiscountPct;
        }
        // THE ALLOCATED DISCOUNT, PROPORTIONALLY. Without this a line that sold 4 x 100 less a 50
        // order-level promotion — 350 actually paid — refunds 400, and the difference is simply given
        // away against a perfectly balanced journal entry. `DiscountPct` was carried through from the
        // start and this was not, which is why RT7 passed while the defect was live.
        const amountField = line.GetFieldByName('DiscountAmount');
        if (!(amountField?.Dirty === true || (line.DiscountAmount ?? 0) > 0)) {
            line.DiscountAmount = terms.DiscountAmount;
        }
        return true;
    }





    /**
     * Record WHY a line owes no tax, as a zero-amount price component (D73).
     *
     * A zero tax line looks identical whether the product was untaxable, we had no nexus, or the
     * buyer held a certificate — and those are different facts. An auditor asking "why was no tax
     * charged on this line" needs the reason, not the total, and the component trail is where the
     * rest of the line's reasoning already lives.
     */
    private async saveTaxReasons(persisted: mjBizAppsOrdersOrderLineEntity[]): Promise<void> {
        if (!this._taxReasons.size) return;
        const provider = this.ProviderToUse as unknown as IMetadataProvider;
        const user = this.ContextCurrentUser as UserInfo;

        for (const [index, reason] of this._taxReasons) {
            const line = persisted[index];
            if (!line?.ID) continue;
            const row = await provider.GetEntityObject<mjBizAppsOrdersOrderLinePriceComponentEntity>(
                'MJ_BizApps_Orders: Order Line Price Components',
                user,
            );
            row.NewRecord();
            row.OrderLineID = line.ID;
            row.Sequence = 900;
            row.ComponentType = 'Tax';
            row.Label = `no tax — ${reason}`;
            row.Amount = 0;
            row.RunningTotal = Number(line.LineTotalNet ?? 0);
            if (!(await row.Save())) {
                throw new Error(
                    `Failed to record why line ${line.LineNumber} owes no tax: ` +
                        `${row.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                );
            }
        }
        this._taxReasons.clear();
    }

    /**
     * Write the price decomposition for lines that were priced by the engine (D69).
     *
     * Runs AFTER the lines are saved, because a component points at a line that must already exist.
     * Pricing disputes are inevitable and "the system computed it" is not an answer to a customer or
     * an auditor, so the reasoning is stored rather than recomputed later against rules that may by
     * then have changed.
     */
    private async savePriceComponents(options?: EntitySaveOptions): Promise<void> {
        if (!this._priceComponents.size) return;
        const provider = this.ProviderToUse as unknown as IMetadataProvider;
        const user = this.ContextCurrentUser as UserInfo;
        const md = new Metadata();

        for (const [line, resolved] of this._priceComponents) {
            let seq = 0;
            for (const c of resolved.Components) {
                const row = await provider.GetEntityObject<mjBizAppsOrdersOrderLinePriceComponentEntity>(
                    'MJ_BizApps_Orders: Order Line Price Components',
                    user,
                );
                row.NewRecord();
                row.OrderLineID = line.ID;
                row.Sequence = seq++;
                row.ComponentType = c.ComponentType;
                row.Label = c.Label;
                row.Amount = c.Amount;
                row.RunningTotal = c.RunningTotal;
                if (c.SourceEntityName && c.SourceRecordID) {
                    const ent = md.EntityByName(c.SourceEntityName);
                    if (ent) {
                        row.SourceEntityID = ent.ID;
                        row.SourceRecordID = c.SourceRecordID;
                    }
                }
                if (!(await row.Save(options))) {
                    throw new Error(
                        `Failed to record the price breakdown for line ${line.LineNumber}: ` +
                            `${row.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                    );
                }
            }
        }
        this._priceComponents.clear();
    }




    /**
     * Stamp an event line's service period from the EVENT's own dates (D-EVENT).
     *
     * WHY THIS IS NOT LEFT TO THE CALLER
     * An event product is bought in advance and earned on the day it happens: the money is deferred
     * revenue until then. That behaviour needs `ServicePeriodStart`/`End` — `AllBackEnd` recognizes
     * 100% on the END date, and `RequireServicePeriod` refuses to run without one.
     *
     * Leaving those dates to whoever creates the line means the recognition date for a conference is
     * hand-typed on every ticket sold, and a typo silently books revenue in the wrong period. The
     * event already knows when it is. Reading it from `EventProduct` makes the correct answer the
     * default and the ticket line carry no date at all.
     *
     * An explicitly-set period WINS and is never overwritten: a line covering only part of a
     * multi-day event, or a deliberate override, is a legitimate thing to express. Subscription
     * lines are untouched — their period comes from the term, which is decided later and is
     * authoritative over anything typed (see `materializeSubscriptions`).
     *
     * A product with no `EventProduct` row is simply not an event; nothing happens.
     */
    private async applyEventServicePeriod(line: mjBizAppsOrdersOrderLineEntity): Promise<void> {
        if (!line.ProductID) return;

        const rv = new RunView(this.ProviderToUse as unknown as IRunViewProvider);
        const res = await rv.RunView<{ EventStartsAt: string; EventEndsAt: string | null }>(
            {
                EntityName: EVENT_PRODUCT_ENTITY,
                ExtraFilter: `ID='${line.ProductID}'`,
                Fields: ['EventStartsAt', 'EventEndsAt'],
                ResultType: 'simple',
                BypassCache: true,
            },
            this.ContextCurrentUser,
        );
        const event = res?.Results?.[0];
        if (!event) return;

        // NOTE: EventProduct.Capacity is deliberately NOT enforced here — see
        // plans/archive/bizapps-orders-master.md §21b. A correct check cannot be written
        // against these tables alone.

        // Dates only when the line does not state its own — an explicitly-set period WINS.
        if (line.ServicePeriodStart || line.ServicePeriodEnd) return;
        if (!event.EventStartsAt) return;

        const start = new Date(event.EventStartsAt);
        // A single-day event has no end date; the period is that one day, so recognition lands on
        // the event itself rather than being left without an end for AllBackEnd to aim at.
        const end = event.EventEndsAt ? new Date(event.EventEndsAt) : start;
        line.ServicePeriodStart = start;
        line.ServicePeriodEnd = end;
    }

    /**
     * Build one draft per line, submit them as ONE set, then stamp each line with its entry.
     * Every step is inside the caller's transaction.
     */
    private async bookLines(
        lines: mjBizAppsOrdersOrderLineEntity[],
        options?: EntitySaveOptions,
        subs?: SubscriptionMaterialization,
    ): Promise<void> {
        const provider = this.ProviderToUse as unknown as IMetadataProvider;
        const user = this.ContextCurrentUser as UserInfo;

        const unbooked = lines.filter((l) => !l.JournalEntryID);
        if (unbooked.length === 0) return;

        const factory = new OrderJournalEntryFactory(
            await this.buildResolver(provider, user),
            this.entityIDFor(ORDER_LINE_ENTITY),
            this.entityIDFor(SUBSCRIPTION_TERM_ENTITY),
            this.entityIDFor(CHARGE_TYPE_ENTITY),
            provider,
            user,
        );

        const drafts = await factory.BuildDrafts(this, unbooked, subs?.TermsByLine, subs?.RecognitionMonthsByLine);
        // An order can legitimately produce NO entries: every line fully comped, so nothing to
        // debit or credit. Accounting refuses an empty draft set, quite correctly, so the call is
        // skipped rather than the order being refused for having no ledger impact.
        if (drafts.length === 0) return;
        const result = await this.submitDrafts(drafts, provider, user);

        if (!result.Success) {
            const detail = (result.Errors ?? [])
                .map((e) => {
                    const which =
                        e.DraftIndex !== undefined
                            ? ` (order line ${
                                  unbooked.find((l) => l.ID === drafts[e.DraftIndex!]?.OrderLineID)?.LineNumber ??
                                  e.DraftIndex
                              })`
                            : '';
                    return `${e.Code}${which}: ${e.Message}`;
                })
                .join('; ');
            throw new Error(`Journal entry booking failed — no entries were written. ${detail}`);
        }

        await this.stampJournalEntryIDs(drafts, result, options);
    }

    /**
     * Invoke accounting's SET operation. Resolved through MJ's class factory by key so this
     * package does not hard-depend on the accounting server package at build time.
     */
    private async submitDrafts(
        drafts: OrderLineDraft[],
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<CreateJournalEntriesResult> {
        const op = MJGlobal.Instance.ClassFactory.CreateInstance<
            BaseRemotableOperation<{ Drafts: unknown[] }, CreateJournalEntriesResult>
        >(BaseRemotableOperation, 'Accounting.CreateJournalEntries');

        if (!op) {
            throw new Error(
                `The 'Accounting.CreateJournalEntries' operation is not registered. The BizApps ` +
                    `Accounting server package must be loaded before orders can book journal entries.`,
            );
        }

        const result = await op.Execute({ Drafts: drafts.map((d) => d.Draft) }, { provider, user });

        // The envelope reports transport/authorization failure; the payload reports the
        // accounting-domain outcome. Both must be checked — a successful call can still carry
        // a failed booking.
        if (!result.Success) {
            throw new Error(
                `Accounting.CreateJournalEntries did not execute: ${result.ErrorMessage ?? result.ResultCode ?? 'unknown error'}`,
            );
        }
        if (!result.Output) {
            throw new Error(`Accounting.CreateJournalEntries returned no payload.`);
        }
        return result.Output;
    }

    /**
     * Stamp each line with its BOOKING entry (NULL→value-once; trigger 51008 enforces the same
     * rule independently). Recognition entries are forward-dated releases — they belong to the
     * schedule, not to the line's booking pointer, so they are skipped here.
     */
    private async stampJournalEntryIDs(
        drafts: OrderLineDraft[],
        result: CreateJournalEntriesResult,
        options?: EntitySaveOptions,
    ): Promise<void> {
        const provider = this.ProviderToUse as unknown as IMetadataProvider;
        const results = result.Results ?? [];

        for (let i = 0; i < drafts.length; i++) {
            if (!drafts[i].IsBooking) continue;
            const jeID = results[i]?.JournalEntryID;
            if (!jeID) {
                throw new Error(
                    `Accounting reported success but returned no journal entry for order line index ${i}.`,
                );
            }

            // Prefer the in-memory line from this.Lines (already an instantiated IS-A subclass if applicable),
            // falling back to loading through the entity's OWN provider to see uncommitted transactions.
            let line = this.Lines.Items.find((l) => UUIDsEqual(l.ID, drafts[i].OrderLineID));
            if (!line) {
                const loadedLine = await provider.GetEntityObject<mjBizAppsOrdersOrderLineEntity>(
                    ORDER_LINE_ENTITY,
                    this.ContextCurrentUser,
                );
                if (await loadedLine.Load(drafts[i].OrderLineID)) {
                    line = loadedLine;
                }
            }
            if (!line) {
                throw new Error(
                    `Order line with ID ${drafts[i].OrderLineID} could not be loaded to stamp JournalEntryID.`,
                );
            }

            // JournalEntryID lives on Order Line. Event/Subscription/etc. IS-A children
            // in this.Lines would otherwise Save() as the leaf, whose clean-leaf
            // finalizeSave used to throw on parent virtuals (OrderHeader).
            const stampTarget = this.resolveOrderLineForStamp(line);
            stampTarget.JournalEntryID = jeID;

            const saveOptions = new EntitySaveOptions();
            if (options) {
                Object.assign(saveOptions, options);
            }
            saveOptions.IsParentEntitySave = true;

            const saved = await stampTarget.Save(saveOptions);
            if (!saved) {
                throw new Error(
                    `Failed to stamp JournalEntryID on order line ${stampTarget.LineNumber}: ${ExtractEntityErrorMessage(stampTarget)}`,
                );
            }
        }
    }

    /**
     * Walk up the IS-A chain to the Order Line that owns `JournalEntryID`.
     * Event Order Line / Subscription Order Line instances in `this.Lines` are
     * children of that row; stamping on the parent and saving with
     * `IsParentEntitySave` skips leaf delegation.
     */
    private resolveOrderLineForStamp(
        line: mjBizAppsOrdersOrderLineEntity,
    ): mjBizAppsOrdersOrderLineEntity {
        let current: BaseEntity = line;
        while (current.ISAParent) {
            current = current.ISAParent;
        }
        return current as mjBizAppsOrdersOrderLineEntity;
    }



    // ─── Subscriptions (D45/D46) ───────────────────────────────────────────────

    /**
     * For every subscription line, apply the type's rules and materialize the Subscription (find,
     * extend, reactivate, or create) plus the SubscriptionTerm this purchase bought.
     *
     * Runs BEFORE booking so the recognition entries can anchor to the term and use its
     * anchored/prorated window — a calendar-anchored membership bought in July does NOT recognize
     * over July→July; it recognizes over July→Dec at a prorated amount.
     *
     * All rule evaluation is delegated to `SubscriptionBehavior`, which is pure. This method does
     * the persistence, inside the caller's transaction.
     */
    private async materializeSubscriptions(
        lines: mjBizAppsOrdersOrderLineEntity[],
        decisions: Map<mjBizAppsOrdersOrderLineEntity, SubscriptionDecisionForLine>,
        options?: EntitySaveOptions,
    ): Promise<SubscriptionMaterialization> {
        const provider = this.ProviderToUse as unknown as IMetadataProvider;
        const user = this.ContextCurrentUser;
        const out: SubscriptionMaterialization = { TermsByLine: new Map(), RecognitionMonthsByLine: new Map() };

        if (decisions.size === 0) return out;

        // The decisions were made against the PENDING line objects; re-key them by ID so they can
        // be matched to the freshly loaded, now-persisted lines.
        //
        // LOWERCASED: a GUID that round-trips through SQL Server comes back uppercased, so keying
        // on the raw value silently misses every lookup — the subscription would be created with no
        // term attached, and the recognition schedule would then fail for want of a coverage window.
        const byLineID = new Map<string, SubscriptionDecisionForLine>();
        for (const [pending, decided] of decisions) {
            if (pending.ID) byLineID.set(uuidKey(pending.ID), decided);
        }

        // Subscriptions created during THIS pass, so a later line extending a sibling's
        // subscription can resolve the placeholder to the id that now exists.
        const createdByDedupeKey = new Map<string, string>();

        for (const line of lines) {
            const decided = byLineID.get(uuidKey(line.ID));
            if (!decided) continue;
            const { Product: product, Rules: rules, Decision: decision } = decided;

            // A line extending a subscription an EARLIER LINE of this order is creating
            // carries a placeholder, because that subscription did not exist when the
            // decision was made. Swap in the real ID now that the sibling has written it.
            if (decision.SubscriptionID === PENDING_SIBLING_ID) {
                const sibling = createdByDedupeKey.get(decided.DedupeKey);
                if (!sibling) {
                    throw new Error(
                        `Order line ${line.LineNumber} (${product.Name}) extends a subscription from an ` +
                            `earlier line of this order, but that line did not create one.`,
                    );
                }
                decision.SubscriptionID = sibling;
            }

            const subscriptionID =
                decision.Action === 'CreateNew'
                    ? await this.createSubscription(line, product, rules, decision, decided.Subscriber, options)
                    : await this.touchExistingSubscription(decision, !!line.RenewsSubscriptionID, options);

            // Remember it so a later line for the same subscription resolves above.
            if (decision.Action === 'CreateNew') createdByDedupeKey.set(decided.DedupeKey, subscriptionID);

            const term = decision.Term!;

            // The LINE is the authority on price — `savePendingLines` already inserted it at the
            // prorated quantity. Taking the term's amount from it makes booking (line net), the
            // term, and the recognition schedule reconcile exactly; three numbers that must agree
            // or deferred revenue never clears to zero.
            term.Amount = line.LineTotalNet ?? term.Amount;

            const termEntity = await provider.GetEntityObject<mjBizAppsOrdersSubscriptionTermEntity>(
                SUBSCRIPTION_TERM_ENTITY,
                user,
            );
            termEntity.NewRecord();
            termEntity.SubscriptionID = subscriptionID;
            termEntity.TermNumber = term.TermNumber;
            termEntity.OrderLineID = line.ID;
            termEntity.StartDate = term.StartDate;
            termEntity.EndDate = term.EndDate;
            termEntity.Amount = term.Amount;
            termEntity.IsProrated = term.IsProrated;
            termEntity.ProrationFactor = term.ProrationFactor;
            // Frozen at purchase: later changes to the product's rules must never restate a
            // term that has already been booked.
            termEntity.RevenueRecognitionTypeID = product.RevenueRecognitionTypeID;
            termEntity.Status = 'Active';

            if (!(await termEntity.Save(options))) {
                throw new Error(
                    `Failed to create the subscription term for order line ${line.LineNumber}: ` +
                        `${termEntity.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                );
            }

            // The term is the coverage window the schedule must follow, and its cadence decides
            // how many slices that window produces.
            out.TermsByLine.set(line.ID, {
                ID: termEntity.ID,
                StartDate: term.StartDate,
                EndDate: term.EndDate,
                Amount: term.Amount,
            });
            out.RecognitionMonthsByLine.set(line.ID, decided.Behavior.RecognitionMonths(rules));

            // The line's stored service period reflects the TERM, not what a user typed.
            line.ServicePeriodStart = term.StartDate;
            line.ServicePeriodEnd = term.EndDate;
            // The forward link, which nothing was writing. Subscription.OrderLineID
            // recorded the reverse, so the subscription knew its line while the line
            // did not know its subscription — and PreviewConfirmOperation reads
            // exactly this field to show what a confirm will create, so the pre-flight
            // could never show subscription detail for a line. Set here because the
            // line is already being saved on the next statement; it costs no extra write.
            line.SubscriptionID = subscriptionID;
            const serverLine = line as unknown as { BypassBookedCheck?: boolean };
            serverLine.BypassBookedCheck = true;
            await line.Save(options);
        }

        return out;
    }

    /**
     * Evaluate the subscription rules for every pending line, BEFORE any of them is inserted.
     *
     * Pure with respect to this app's tables — it reads the catalog and any existing subscription,
     * then asks the behaviour what to do. Nothing is written, so a rules rejection aborts the
     * confirm before a single line exists.
     */
    private async decideSubscriptions(): Promise<Map<mjBizAppsOrdersOrderLineEntity, SubscriptionDecisionForLine>> {
        const out = new Map<mjBizAppsOrdersOrderLineEntity, SubscriptionDecisionForLine>();
        const subLines = await this.subscriptionLines([...this.Lines.Items]);
        if (subLines.length === 0) return out;

        // Settings drive whether the organization is inferred at all, so load the cache once here
        // rather than per line.
        await OrdersSettings.Load(this.ProviderToUse as unknown as IMetadataProvider, this.ContextCurrentUser);

        // What an EARLIER line of this same order has already decided to create,
        // keyed the way the type defines a duplicate. Without this the rules only
        // ever see the database, so two lines for one subscription both decide
        // "create" — see PENDING_SIBLING_ID.
        const pendingSiblings = new Map<string, ExistingSubscription>();

        for (const { line, product, rules } of subLines) {
            const behavior = this.behaviorFor(rules);
            let subscriber = await this.withInferredOrganization(this.resolveSubscriber(line));
            const identity = behavior.DedupeIdentity(rules, subscriber);
            const dedupeKey = `${product.ID}|${identity.OrganizationID ?? ''}|${identity.PersonID ?? ''}`;
            // An explicitly named subscription wins; then a sibling line of THIS order;
            // then one already in the database for this subscriber and product (D62).
            const existing = line.RenewsSubscriptionID
                ? await this.loadSubscriptionState(`ID='${line.RenewsSubscriptionID}'`)
                : (pendingSiblings.get(dedupeKey) ??
                   (await this.findExistingSubscription(product.ID, identity)));

            // NAMING a subscription IS the statement of who the subscriber is. Requiring the line to
            // restate it would make renewing a seat impossible without repeating the person, and any
            // mismatch between the two would be a silent contradiction. The target wins.
            if (line.RenewsSubscriptionID && existing) {
                subscriber = {
                    OrganizationID: existing.HolderOrganizationID ?? null,
                    PersonID: existing.BeneficiaryPersonID ?? null,
                };
            }

            const decision = behavior.Decide({
                Rules: rules,
                PurchaseDate: this.OrderDate ? new Date(this.OrderDate) : new Date(),
                // The line is not saved yet, so `LineTotalNet` is not computed — derive the same
                // figure OrderLineEntityServer will: quantity × price, less the discount.
                Amount: this.pendingLineNet(line),
                Existing: existing,
                Subscriber: subscriber,
                // A renewal continues the NAMED subscription rather than starting one, so the
                // concurrency rule must not refuse it (D55).
                IsRenewal: !!line.RenewsSubscriptionID,
            });

            if (decision.Action === 'Reject') {
                // A rules violation fails the WHOLE confirm — booking is all-or-none, and a
                // silently-dropped subscription would leave a paid-for line with no coverage.
                throw new Error(
                    `Order line ${line.LineNumber} (${product.Name}) cannot be subscribed: ${decision.RejectReason}`,
                );
            }

            // Record what this line will produce, so a LATER line covering the same
            // subscription extends it (or is refused) instead of creating a second.
            // A real renewal target is left alone: it is already in the database, so
            // the ordinary lookup finds it.
            if (decision.Term && !line.RenewsSubscriptionID) {
                pendingSiblings.set(dedupeKey, {
                    ID: existing?.ID ?? PENDING_SIBLING_ID,
                    Status: 'Active',
                    HolderOrganizationID: subscriber.OrganizationID,
                    BeneficiaryPersonID: subscriber.PersonID,
                    LatestTermEnd: decision.Term.EndDate,
                    LatestTermNumber: decision.Term.TermNumber,
                });
            }

            out.set(line, {
                Product: product,
                Rules: rules,
                Decision: decision,
                Behavior: behavior,
                Subscriber: subscriber,
                DedupeKey: dedupeKey,
            });
        }
        return out;
    }

    /**
     * WHO a line is for: the line's ship-to, falling back to the order header (D61).
     *
     * Ship-to on a line means "where this goes" for a physical product and "who this is for" when
     * there is nothing to ship. A subscription line therefore reads its subscriber from the same
     * fields a shipped line reads its destination from — one question, two kinds of answer.
     *
     * The fallback is per-side, not all-or-nothing: a line may name only a person (a seat bought
     * under the order's customer organization) and still inherit that organization from the header.
     */
    private resolveSubscriber(line: mjBizAppsOrdersOrderLineEntity): SubscriberIdentity {
        return {
            OrganizationID:
                line.ShipToOrganizationID ?? this.ShipToOrganizationID ?? this.BillToOrganizationID ?? null,
            PersonID: line.ShipToPersonID ?? this.ShipToPersonID ?? this.BillToPersonID ?? null,
        };
    }

    /**
     * Fill in the organization from the person's affiliation, when it was left blank (D64).
     *
     * Only ever ADDS: an organization that was stated — on the line, the order's ship-to, or its
     * customer — is never second-guessed. And it only runs when the setting says so, so a
     * deployment that would rather not infer anything simply turns it off and blank stays blank.
     */
    private async withInferredOrganization(subscriber: SubscriberIdentity): Promise<SubscriberIdentity> {
        if (subscriber.OrganizationID) return subscriber;
        if (!subscriber.PersonID) return subscriber;
        if (!OrdersSettings.AutoPopulateOrganizationFromPerson) return subscriber;

        const asOf = this.OrderDate ? new Date(this.OrderDate) : new Date();
        const inferred = await this.organizationAsOf(subscriber.PersonID, asOf);
        return inferred ? { ...subscriber, OrganizationID: inferred } : subscriber;
    }

    /**
     * The organization a person belonged to AS OF the order date (D64).
     *
     * `Person` has no organization column — bizapps-common models affiliation as a dated
     * `Relationship` (FromPersonID → ToOrganizationID, with StartDate/EndDate/Status). So this is a
     * point-in-time question, and the answer legitimately changes when someone moves employer. That
     * is exactly why the result is STAMPED onto the order rather than resolved on read: deriving it
     * later would silently rewrite the history of an order that is otherwise immutable once booked.
     *
     * The rule, per Amith:
     *   zero qualifying affiliations → leave blank. That IS a personal order — no flag needed,
     *                                  because "person, no organization" already says it.
     *   exactly one                  → use it.
     *   more than one                → the most recent by StartDate. A person can hold several at
     *                                  once (employee here, board member there), and Relationship
     *                                  has no uniqueness constraint, so this case is normal rather
     *                                  than exceptional and needs a stated rule instead of a guess.
     *
     * Which relationship types qualify is a SETTING, defaulting to `Employee` — being a `Vendor` to
     * an organization must not make it your bill-to.
     */
    private async organizationAsOf(personID: string, asOf: Date): Promise<string | null> {
        const types = OrdersSettings.OrganizationAffiliationRelationshipTypes;
        if (types.length === 0) return null;

        const rv = new RunView(this.ProviderToUse as unknown as IRunViewProvider);
        const quoted = types.map((t) => `'${t.replace(/'/g, "''")}'`).join(',');
        const date = asOf.toISOString().slice(0, 10);

        const result = await rv.RunView<{ ToOrganizationID: string; StartDate: string }>(
            {
                EntityName: RELATIONSHIP_ENTITY,
                ExtraFilter:
                    `FromPersonID='${personID}' AND ToOrganizationID IS NOT NULL ` +
                    `AND Status='Active' ` +
                    `AND (StartDate IS NULL OR StartDate <= '${date}') ` +
                    `AND (EndDate IS NULL OR EndDate >= '${date}') ` +
                    `AND RelationshipTypeID IN (SELECT ID FROM ${COMMON_SCHEMA}.RelationshipType WHERE Name IN (${quoted}))`,
                Fields: ['ToOrganizationID', 'StartDate'],
                // Most recent affiliation first. NULL StartDate sorts last: an undated relationship
                // is weaker evidence than one that says when it began.
                OrderBy: 'StartDate DESC',
                ResultType: 'simple',
                BypassCache: true,
            },
            this.ContextCurrentUser,
        );

        return result?.Results?.[0]?.ToOrganizationID ?? null;
    }



    /** Lines whose product carries a subscription type, joined to their rules. */
    private async subscriptionLines(
        lines: mjBizAppsOrdersOrderLineEntity[],
    ): Promise<Array<{ line: mjBizAppsOrdersOrderLineEntity; product: ProductRow; rules: SubscriptionTypeRules }>> {
        const rv = new RunView(this.ProviderToUse as unknown as IRunViewProvider);
        const ids = [...new Set(lines.map(l => l.ProductID))].map(id => `'${id}'`).join(',');
        if (!ids) return [];

        const prod = await rv.RunView<ProductRow>(
            {
                EntityName: PRODUCT_ENTITY,
                ExtraFilter: `ID IN (${ids}) AND SubscriptionTypeID IS NOT NULL`,
                Fields: ['ID', 'Name', 'SubscriptionTypeID', 'RevenueRecognitionTypeID'],
                ResultType: 'simple',
            },
            this.ContextCurrentUser,
        );
        const products = new Map((prod?.Results ?? []).map(p => [uuidKey(p.ID), p]));
        if (products.size === 0) return [];

        const types = await rv.RunView<SubscriptionTypeRules>(
            { EntityName: SUBSCRIPTION_TYPE_ENTITY, ResultType: 'simple' },
            this.ContextCurrentUser,
        );
        const rulesByID = new Map((types?.Results ?? []).map(t => [uuidKey(t.ID), t]));

        const out = [];
        for (const line of lines) {
            const product = products.get(uuidKey(line.ProductID));
            if (!product) continue;
            // A REVERSAL line buys nothing — it unwinds a purchase (D16). Materializing here would
            // create a second subscription (and a second term) every time one was cancelled, which
            // is the exact opposite of what the line means.
            if (line.ReversesOrderLineID || (line.Quantity ?? 0) < 0) continue;
            const rules = rulesByID.get(uuidKey(product.SubscriptionTypeID));
            if (!rules) {
                throw new Error(`Product '${product.Name}' names a subscription type that was not found.`);
            }
            out.push({ line, product, rules });
        }
        return out;
    }

    /**
     * The behaviour object: the base class when the type has no driver (the common case — the
     * columns ARE the rules, D45), or a registered subclass when one is named.
     */
    private behaviorFor(rules: SubscriptionTypeRules): SubscriptionBehavior {
        if (!rules.DriverClass) return new SubscriptionBehavior();
        const driver = MJGlobal.Instance.ClassFactory.CreateInstance<SubscriptionBehavior>(
            SubscriptionBehavior,
            rules.DriverClass,
        );
        if (!driver) {
            throw new Error(
                `Subscription type '${rules.Code}' names driver '${rules.DriverClass}', which is not ` +
                    `registered. Register a SubscriptionBehavior subclass under that key.`,
            );
        }
        return driver;
    }

    /**
     * The subscription this purchase attaches to.
     *
     * A RENEWAL names its subscription outright (D55) — resolving by (customer, product) instead
     * would be a guess, and would pick the wrong one whenever a customer holds two subscriptions to
     * the same product under an `AllowMultiple` type.
     */
    private async findExistingSubscription(
        productID: string,
        identity: SubscriberIdentity,
    ): Promise<ExistingSubscription | null> {
        // Match on exactly the axes the BenefitModel says define a duplicate. An org-members type
        // ignores the person entirely (one company membership, however many employees); a seat type
        // matches BOTH, so two seats for two people never collide.
        const clauses: string[] = [];
        clauses.push(
            identity.OrganizationID
                ? `HolderOrganizationID='${identity.OrganizationID}'`
                : `HolderOrganizationID IS NULL`,
        );
        clauses.push(
            identity.PersonID ? `BeneficiaryPersonID='${identity.PersonID}'` : `BeneficiaryPersonID IS NULL`,
        );
        if (!identity.OrganizationID && !identity.PersonID) return null;

        return this.loadSubscriptionState(`ProductID='${productID}' AND ${clauses.join(' AND ')}`);
    }

    /** Load a subscription plus the end and number of its latest term, by whatever filter. */
    private async loadSubscriptionState(filter: string): Promise<ExistingSubscription | null> {
        const rv = new RunView(this.ProviderToUse as unknown as IRunViewProvider);
        const res = await rv.RunView<{
            ID: string;
            Status: string;
            HolderOrganizationID: string | null;
            BeneficiaryPersonID: string | null;
        }>(
            {
                EntityName: SUBSCRIPTION_ENTITY,
                ExtraFilter: filter,
                Fields: ['ID', 'Status', 'HolderOrganizationID', 'BeneficiaryPersonID'],
                OrderBy: '__mj_CreatedAt DESC',
                MaxRows: 1,
                ResultType: 'simple',
                BypassCache: true,
            },
            this.ContextCurrentUser,
        );
        const sub = res?.Results?.[0];
        if (!sub) return null;

        const terms = await rv.RunView<{ EndDate: string; TermNumber: number }>(
            {
                EntityName: SUBSCRIPTION_TERM_ENTITY,
                ExtraFilter: `SubscriptionID='${sub.ID}'`,
                Fields: ['EndDate', 'TermNumber'],
                OrderBy: 'TermNumber DESC',
                MaxRows: 1,
                ResultType: 'simple',
                BypassCache: true,
            },
            this.ContextCurrentUser,
        );
        const latest = terms?.Results?.[0];
        return {
            ID: sub.ID,
            Status: sub.Status,
            HolderOrganizationID: sub.HolderOrganizationID,
            BeneficiaryPersonID: sub.BeneficiaryPersonID,
            LatestTermEnd: latest?.EndDate ? new Date(latest.EndDate) : null,
            LatestTermNumber: latest?.TermNumber ?? 0,
        };
    }

    private async createSubscription(
        line: mjBizAppsOrdersOrderLineEntity,
        product: ProductRow,
        rules: SubscriptionTypeRules,
        decision: SubscriptionDecision,
        subscriber: SubscriberIdentity,
        options?: EntitySaveOptions,
    ): Promise<string> {
        const provider = this.ProviderToUse as unknown as IMetadataProvider;
        const sub = await provider.GetEntityObject<mjBizAppsOrdersSubscriptionEntity>(
            SUBSCRIPTION_ENTITY,
            this.ContextCurrentUser,
        );
        sub.NewRecord();
        sub.SubscriptionNumber = await this.assignSubscriptionNumber();
        // The LINE's company, not the order's. A subscription is recurring revenue
        // for whoever sells it, and on a mixed order that is not the order's owner:
        // an order carrying a membership from each of two companies produced two
        // subscriptions that BOTH landed in the header's ledger, so one company held
        // the other's subscriber. The journal entries in this same transaction are
        // already per-line and single-company (D10) — this brings subscriptions onto
        // the same footing rather than leaving the two records disagreeing about who
        // sold what. Falls back to the order's company only if a line somehow has
        // none, which savePendingLines does not allow.
        sub.CompanyID = line.CompanyID ?? this.CompanyID;
        // The BIRTH line (D39/D40) — which purchase brought this subscription into existence.
        // Renewals append terms that carry their own OrderLineID; this one never changes.
        sub.OrderLineID = line.ID;
        sub.SubscriptionTypeID = rules.ID;
        sub.ProductID = product.ID;
        // The RESOLVED subscriber, which may differ from the order's customer: the customer pays,
        // the ship-to holds and benefits.
        sub.HolderOrganizationID = subscriber.OrganizationID;
        sub.BeneficiaryPersonID = subscriber.PersonID;
        sub.Status = rules.TrialDays > 0 ? 'Trialing' : 'Active';
        sub.StartDate = decision.Term!.StartDate;
        sub.AutoRenew = rules.AutoRenewDefault;
        // A trial with no end date is not a trial. Without this, `Status='Trialing'` is a label
        // nothing can ever act on — no job can find trials about to expire.
        if (rules.TrialDays > 0) {
            const trialEnd = new Date(decision.Term!.StartDate);
            trialEnd.setUTCDate(trialEnd.getUTCDate() + rules.TrialDays);
            sub.TrialEndDate = trialEnd;
        }

        if (!(await sub.Save(options))) {
            throw new Error(
                `Failed to create the subscription for '${product.Name}': ` +
                    `${sub.LatestResult?.CompleteMessage ?? 'unknown error'}`,
            );
        }

        const subscriptionID = sub.ID;
        await this.logSubscriptionEvent(
            subscriptionID,
            rules.TrialDays > 0 ? 'TrialStarted' : 'Created',
            options,
        );
        return subscriptionID;
    }

    /**
     * Append to the subscription's immutable lifecycle log.
     *
     * The log is the answer to "what happened to this membership, and when" — the question support
     * actually gets asked. Writing it at every transition is the only thing that makes the table
     * worth having; a `SubscriptionEvent` table nobody writes to is just schema.
     */
    private async logSubscriptionEvent(
        subscriptionID: string,
        // DERIVED from the entity, never restated: `EventType` is a CHECK-constrained value list, so
        // CodeGen widens this union whenever a migration adds a value. A hand-copied union would
        // silently stop tracking it.
        eventType: mjBizAppsOrdersSubscriptionEventEntity['EventType'],
        options?: EntitySaveOptions,
        data?: Record<string, unknown>,
    ): Promise<void> {
        const provider = this.ProviderToUse as unknown as IMetadataProvider;
        const event = await provider.GetEntityObject<mjBizAppsOrdersSubscriptionEventEntity>(
            SUBSCRIPTION_EVENT_ENTITY,
            this.ContextCurrentUser,
        );
        event.NewRecord();
        event.SubscriptionID = subscriptionID;
        event.EventType = eventType;
        event.OccurredAt = new Date();
        event.RelatedOrderHeaderID = this.ID;
        if (data) event.EventData = JSON.stringify(data);

        if (!(await event.Save(options))) {
            // Inside the booking transaction: a lost lifecycle record is a silent hole in the
            // audit trail, so it fails the confirm rather than being swallowed.
            throw new Error(
                `Failed to log the '${eventType}' subscription event: ` +
                    `${event.LatestResult?.CompleteMessage ?? 'unknown error'}`,
            );
        }
    }

    /** Extension or reactivation — the term is what changes; the subscription just re-activates. */
    private async touchExistingSubscription(
        decision: SubscriptionDecision,
        isRenewal: boolean,
        options?: EntitySaveOptions,
    ): Promise<string> {
        const provider = this.ProviderToUse as unknown as IMetadataProvider;
        const sub = await provider.GetEntityObject<mjBizAppsOrdersSubscriptionEntity>(
            SUBSCRIPTION_ENTITY,
            CompositeKey.FromID(decision.SubscriptionID!),
            this.ContextCurrentUser,
        );
        if (decision.Action === 'Reactivate') {
            sub.Status = 'Active';
            sub.CanceledAt = null;
            sub.EndDate = null;
            sub.AutoRenew = true;
            if (!(await sub.Save(options))) {
                throw new Error(
                    `Failed to reactivate subscription: ${sub.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                );
            }
        }
        // 'Extended' is the CUSTOMER buying more coverage. The system renewing them under standing
        // authority logs 'RenewalOrderSpawned' from SpawnRenewalsOperation instead — same table,
        // opposite answers to "why is this member still here", and retention reporting needs both.
        // A renewal reaches this method too, so it must not also log the customer-side event. The
        // marker is now per-LINE (D61): one order can renew several subscriptions, so "is this a
        // renewal" is a question about the line, not the order.
        if (!isRenewal) {
            await this.logSubscriptionEvent(
                decision.SubscriptionID!,
                decision.Action === 'Reactivate' ? 'Activated' : 'Extended',
                options,
                { TermNumber: decision.Term?.TermNumber, Action: decision.Action },
            );
        }
        return decision.SubscriptionID!;
    }

    /**
     * Mint the next `SUB-{seq}` from the SubscriptionSequence singleton.
     *
     * A subscription number is member-facing — it is the "membership number" someone reads over the
     * phone — so it gets its own counter rather than being derived from whichever order created it.
     */
    private async assignSubscriptionNumber(): Promise<string> {
        return `SUB-${String(await this.nextSequence('SubscriptionSequence')).padStart(6, '0')}`;
    }

    // ─── Numbering (D30) ───────────────────────────────────────────────────────

    /**
     * Mint the next `ORD-{seq}` from the OrderSequence singleton.
     *
     * The order IS the invoice (D2), so this is an A/R document number and auditors expect it to
     * be gap-conscious. Taken with UPDLOCK+HOLDLOCK inside the caller's transaction so concurrent
     * confirms serialize on the counter rather than colliding on the UNIQUE index.
     *
     * Currently a GLOBAL sequence per D30. Jeremy's global-vs-per-company call is still open; the
     * change would be a WHERE clause here plus a CompanyID on the sequence table.
     */
    private async assignOrderNumber(): Promise<string> {
        return `ORD-${String(await this.nextSequence('OrderSequence')).padStart(6, '0')}`;
    }

    /**
     * Take the next value from one of the singleton counter tables.
     *
     * Taken with UPDLOCK+HOLDLOCK inside the CALLER'S transaction, so concurrent confirms serialize
     * on the counter row rather than colliding on the UNIQUE index — and a confirm that rolls back
     * releases its number rather than burning it.
     *
     * `OUTPUT ... INTO` (not a bare `OUTPUT`): CodeGen puts an `__mj_UpdatedAt` trigger on every
     * table, and SQL Server forbids a bare OUTPUT clause on a table that has triggers.
     */
    private async nextSequence(table: 'OrderSequence' | 'PaymentSequence' | 'SubscriptionSequence'): Promise<number> {
        const provider = this.ProviderToUse as unknown as { ExecuteSQL: (sql: string, params?: unknown[]) => Promise<unknown> };
        const rows = (await provider.ExecuteSQL(
            `DECLARE @seq TABLE (Seq INT);
             UPDATE __mj_BizAppsOrders.${table} WITH (UPDLOCK, HOLDLOCK)
             SET NextSequenceNumber = NextSequenceNumber + 1
             OUTPUT deleted.NextSequenceNumber INTO @seq(Seq)
             WHERE ID = 1;
             SELECT Seq FROM @seq;`,
        )) as Array<{ Seq: number }>;

        const seq = rows?.[0]?.Seq;
        if (!seq) {
            throw new Error(
                `Could not obtain the next number from ${table} — its singleton row (ID=1) is missing. ` +
                    `It is seeded by the baseline migration.`,
            );
        }
        return seq;
    }

    // ─── Initial payment (D42) ─────────────────────────────────────────────────

    /**
     * Turn the order's captured payment INTENT into a real payment.
     *
     * `InitialPaymentTypeID`/`Amount`/`DetailID` are a convenience capture at order entry; on
     * confirm they become a PaymentHeader plus a PaymentLine applied to this order. The rollup
     * triggers then move AmountPaid/Balance/PaymentStatus on their own (D41) — nothing here
     * touches those fields.
     *
     * The instrument is COPIED, never shared (D39): the order keeps its snapshot of what was
     * intended, the payment gets its own record of what ran, and neither can rewrite the other.
     */
    /**
     * Refuse the confirm when the initial tender needs a reference and none reached us.
     *
     * "None reached us" means no typed `InitialPaymentReference`, no `InitialPaymentDetailID`,
     * or a detail whose `ReferenceNumber` is blank — an instrument row with an empty reference
     * is the same failure wearing a foreign key.
     */
    private async requireReferenceWhenTenderDemandsOne(
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<void> {
        const type = await provider.GetEntityObject<mjBizAppsOrdersPaymentTypeEntity>(PAYMENT_TYPE_ENTITY, user);
        const loaded = await type.Load(this.InitialPaymentTypeID as string);
        if (!loaded || !type.RequiresReference) return;

        let reference: string | null = (this.InitialPaymentReference ?? '').trim() || null;
        if (!reference && this.InitialPaymentDetailID) {
            const detail = await provider.GetEntityObject<mjBizAppsOrdersPaymentDetailEntity>(PAYMENT_DETAIL_ENTITY, user);
            if (await detail.Load(this.InitialPaymentDetailID)) {
                reference = (detail.ReferenceNumber ?? '').trim() || null;
            }
        }
        if (!reference) {
            throw new Error(
                `${type.Name} payments need a reference number — a check number, wire ` +
                    `confirmation or transfer id. Without one the payment cannot be reconciled ` +
                    `against the bank statement. Enter it on the order, or invoice on terms instead.`,
            );
        }
    }

    private async createInitialPayment(options?: EntitySaveOptions): Promise<void> {
        const amount = this.InitialPaymentAmount ?? 0;
        if (!this.InitialPaymentTypeID || amount <= 0) return;

        const provider = this.ProviderToUse as unknown as IMetadataProvider;
        const user = this.ContextCurrentUser;

        // A TENDER THAT REQUIRES A REFERENCE MUST HAVE ONE. Check, Wire and Internal Transfer carry
        // `RequiresReference` because a captured payment with no check number or confirmation id
        // cannot be reconciled against a bank statement — the money is recorded and unfindable.
        //
        // Enforced HERE, in the save path, rather than in the order screen. The screen should ask
        // for it too, but a rule that lives only in the screen is a rule that holds until the next
        // caller — a fixture, an import, the other entry lane — and this codebase has now been
        // caught by that three times.
        await this.requireReferenceWhenTenderDemandsOne(provider, user);

        // The payment owns its own instrument row (D39). If the order already has an
        // InitialPaymentDetail row (from the embedded record), copy it; otherwise mint a
        // fresh PaymentDetail from the typed reference.
        let paymentDetailID: string | null = null;
        if (this.InitialPaymentDetailID) {
            paymentDetailID = await this.copyPaymentDetail(this.InitialPaymentDetailID, options);
        } else if (this.InitialPaymentReference) {
            paymentDetailID = await this.createPaymentDetailFromReference(options);
        }

        // Typed as the SERVER subclass, which is what the class factory returns for this key: the
        // header's `Lines` collection lives there, and asking for the generated class would mean
        // casting it back to reach the very property this code exists to set.
        const payment = await provider.GetEntityObject<PaymentHeaderEntityServer>(PAYMENT_HEADER_ENTITY, user);
        payment.NewRecord();
        payment.PaymentNumber = await this.assignPaymentNumber();
        payment.ReceivingCompanyID = this.CompanyID;
        payment.BillToOrganizationID = this.BillToOrganizationID;
        payment.BillToPersonID = this.BillToPersonID;
        payment.PaymentDate = this.OrderDate ?? new Date();
        payment.PaymentTypeID = this.InitialPaymentTypeID;
        payment.Amount = amount;
        payment.PaymentDetailID = paymentDetailID;
        payment.Status = 'Captured';
        payment.Description = `Initial payment for order ${this.OrderNumber}`;

        // The allocation rides the payment's Lines collection so both land in ONE save (D68). The
        // payment's Amount must equal the sum of its lines at capture, so writing the header first
        // and the allocation second would fail on a payment that is about to be exactly consistent.
        const line = await provider.GetEntityObject<mjBizAppsOrdersPaymentLineEntity>(PAYMENT_LINE_ENTITY, user);
        line.NewRecord();
        line.OrderHeaderID = this.ID;
        line.Amount = amount;
        line.AllocatedAt = new Date();
        line.AllocatedByUserID = user?.ID ?? null;
        // Attached, not assigned — the collection stamps PaymentHeaderID.
        payment.Lines.Add(line);

        if (!(await payment.Save(options))) {
            throw new Error(
                `Failed to create the initial payment for order ${this.OrderNumber}: ` +
                    `${payment.LatestResult?.CompleteMessage ?? 'unknown error'}`,
            );
        }
    }

    /** Mint a PaymentDetail from the typed check / wire / transfer number. */
    private async createPaymentDetailFromReference(options?: EntitySaveOptions): Promise<string> {
        const provider = this.ProviderToUse as unknown as IMetadataProvider;
        const detail = await provider.GetEntityObject<mjBizAppsOrdersPaymentDetailEntity>(
            PAYMENT_DETAIL_ENTITY,
            this.ContextCurrentUser,
        );
        detail.NewRecord();
        detail.CompanyID = this.CompanyID;
        detail.PaymentTypeID = this.InitialPaymentTypeID as string;
        detail.ReferenceNumber = this.InitialPaymentReference;
        if (!(await detail.Save(options))) {
            throw new Error(
                `Failed to record the payment reference for order ${this.OrderNumber}: ` +
                    `${detail.LatestResult?.CompleteMessage ?? 'unknown error'}`,
            );
        }
        return detail.ID;
    }

    /** Duplicate a PaymentDetail so each host owns its own immutable snapshot (D39). */
    private async copyPaymentDetail(sourceID: string, options?: EntitySaveOptions): Promise<string> {
        const provider = this.ProviderToUse as unknown as IMetadataProvider;
        const source = await provider.GetEntityObject<mjBizAppsOrdersPaymentDetailEntity>(
            PAYMENT_DETAIL_ENTITY,
            CompositeKey.FromID(sourceID),
            this.ContextCurrentUser,
        );

        const copy = await provider.GetEntityObject<mjBizAppsOrdersPaymentDetailEntity>(
            PAYMENT_DETAIL_ENTITY,
            this.ContextCurrentUser,
        );
        copy.NewRecord();
        // `CopyFrom` rather than a field loop: it skips primary keys by default, which is the only
        // exclusion this copy actually needs. The loop it replaced also skipped `__mj_*`, but those
        // are ReadOnly and absent from spCreate's parameter list, so they cannot reach the insert.
        // `SourceCustomerPaymentMethodID` comes across with everything else — the guard that used to
        // "record where the copy came from" only fired when the source value was FALSY and then
        // assigned that same falsy value, so it was dead code stating the opposite of its comment.
        copy.CopyFrom(source);

        if (!(await copy.Save(options))) {
            throw new Error(
                `Failed to copy the payment instrument for order ${this.OrderNumber}: ` +
                    `${copy.LatestResult?.CompleteMessage ?? 'unknown error'}`,
            );
        }
        return copy.ID;
    }

    private async assignPaymentNumber(): Promise<string> {
        return `PAY-${String(await this.nextSequence('PaymentSequence')).padStart(6, '0')}`;
    }

    // ─── Helpers ───────────────────────────────────────────────────────────────

    /** Resolver + accounting engine come from the shared bridge — see AccountingBridge.ts. */
    private async buildResolver(provider: IMetadataProvider, user: UserInfo): Promise<GLAccountResolver> {
        return BuildGLAccountResolver(provider, user);
    }

    private entityIDFor(entityName: string): string {
        return EntityIDFor(entityName);
    }

    private async loadLinesForBooking(): Promise<mjBizAppsOrdersOrderLineEntity[]> {
        const rv = new RunView(this.ProviderToUse as unknown as IRunViewProvider);
        const result = await rv.RunView<mjBizAppsOrdersOrderLineEntity>(
            {
                EntityName: ORDER_LINE_ENTITY,
                ExtraFilter: `OrderHeaderID='${this.ID}'`,
                OrderBy: 'LineNumber',
                ResultType: 'entity_object',
            },
            this.ContextCurrentUser,
        );
        return result?.Results ?? [];
    }

    private async countPersistedLines(): Promise<number> {
        if (!this.IsSaved) return 0;
        const rv = new RunView(this.ProviderToUse as unknown as IRunViewProvider);
        const result = await rv.RunView(
            {
                EntityName: ORDER_LINE_ENTITY,
                ExtraFilter: `OrderHeaderID='${this.ID}'`,
                Fields: ['ID'],
                ResultType: 'simple',
            },
            this.ContextCurrentUser,
        );
        return result?.Results?.length ?? 0;
    }
}

/**
 * Extract human-readable error messages from an entity, including its leaf/root chain,
 * LatestResult, ResultHistory, and synchronous validation.
 */
function ExtractEntityErrorMessage(entity: BaseEntity | null | undefined): string {
    if (!entity) return 'unknown error (null entity)';
    const candidateEntities = [entity, entity.LeafEntity, entity.RootEntity].filter(Boolean);
    const messages: string[] = [];

    for (const ent of candidateEntities) {
        const latest = ent.LatestResult;
        if (latest) {
            if (latest.Message && latest.Message.trim().length > 0) {
                const trimmed = latest.Message.trim();
                if (!messages.includes(trimmed)) messages.push(trimmed);
            }
            if (latest.Error) {
                const errStr = typeof latest.Error === 'string' ? latest.Error : (latest.Error as Error).message || JSON.stringify(latest.Error);
                if (errStr && !messages.includes(errStr)) messages.push(errStr);
            }
            if (latest.Errors && latest.Errors.length > 0) {
                for (const err of latest.Errors) {
                    const field = (err as ValidationErrorInfo).Source ?? (err as any).FieldName ?? '';
                    const msg = (err as ValidationErrorInfo).Message ?? (err as any).message ?? JSON.stringify(err);
                    const formatted = field ? `${field}: ${msg}` : msg;
                    if (formatted && !messages.includes(formatted)) messages.push(formatted);
                }
            }
        }
        for (const res of ent.ResultHistory ?? []) {
            if (!res.Success) {
                if (res.Message && res.Message.trim().length > 0 && !messages.includes(res.Message.trim())) {
                    messages.push(res.Message.trim());
                }
                if (res.Errors && res.Errors.length > 0) {
                    for (const err of res.Errors) {
                        const field = (err as ValidationErrorInfo).Source ?? (err as any).FieldName ?? '';
                        const msg = (err as ValidationErrorInfo).Message ?? (err as any).message ?? JSON.stringify(err);
                        const formatted = field ? `${field}: ${msg}` : msg;
                        if (formatted && !messages.includes(formatted)) messages.push(formatted);
                    }
                }
            }
        }
    }

    // Also check synchronous validation directly if no messages found
    if (messages.length === 0) {
        const val = entity.Validate();
        if (!val.Success && val.Errors.length > 0) {
            for (const err of val.Errors) {
                const field = err.Source ?? '';
                const msg = err.Message ?? JSON.stringify(err);
                const formatted = field ? `${field}: ${msg}` : msg;
                if (formatted && !messages.includes(formatted)) messages.push(formatted);
            }
        }
    }

    return messages.length > 0 ? messages.join('; ') : (entity.LatestResult?.CompleteMessage ?? 'unknown error');
}

/** Tree-shaking anchor — call from the server bootstrap so @RegisterClass is retained. */
export function LoadOrderEntityServer(): void {
    // intentionally empty
}
