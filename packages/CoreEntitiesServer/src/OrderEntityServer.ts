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
import { MJGlobal, RegisterClass } from '@memberjunction/global';
import { mjBizAppsOrdersOrderHeaderEntity, mjBizAppsOrdersOrderLineEntity } from '@mj-biz-apps/orders-entities';
import { GLAccountResolver } from './GLAccountResolver.js';
import { BuildGLAccountResolver, EntityIDFor } from './AccountingBridge.js';
import { ResolvePrice, type ResolvedPrice } from './PriceResolver.js';
import { AllocateProRata, NetAfterDiscount } from './PricingBehavior.js';
import { InheritedTerms, ValidateReversal } from './ReversalBehavior.js';
import { LoadReversalContext } from './ReversalResolver.js';
import { CreateEntitlementGrants, RevokeGrantsForReturn } from './EntitlementEngine.js';
import { IssueGiftCards } from './GiftCardEngine.js';
import { ExpandBundleLines, type ExpandableLine } from './BundleEngine.js';
import type { StackingMode } from './PromotionBehavior.js';
import {
    RunCharges,
    SplitChargesByLine,
    WriteCharges,
    type RequestedCharge,
} from './ChargeEngine.js';
import type { ComputeChargesResult } from './ChargeBehavior.js';
import {
    ResolveTax,
    ResolveTaxability,
    type ResolvedTaxability,
    type TaxabilityCategoryLevel,
    type TaxAddress,
} from './TaxResolver.js';
import {
    AuthorizeManualDiscount,
    RunPromotions,
    WriteAdjustments,
    type ManualDiscountRequest,
    type PromotableLine,
    type PromotionRunResult,
} from './PromotionEngine.js';
import { OrdersSettings } from './OrdersSettings.js';
import { OrderJournalEntryFactory, type OrderLineDraft } from './OrderJournalEntryFactory.js';
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
const SUBSCRIPTION_ENTITY = 'MJ_BizApps_Orders: Subscriptions';
const SUBSCRIPTION_EVENT_ENTITY = 'MJ_BizApps_Orders: Subscription Events';
const RELATIONSHIP_ENTITY = 'MJ_BizApps_Common: Relationships';
const COMMON_SCHEMA = '__mj_BizAppsCommon';
const SUBSCRIPTION_TERM_ENTITY = 'MJ_BizApps_Orders: Subscription Terms';
const SUBSCRIPTION_TYPE_ENTITY = 'MJ_BizApps_Orders: Subscription Types';

/** Statuses at or beyond the booking lock (plan D8/D9). */
const BOOKED_STATUSES = new Set(['Confirmed', 'Posted', 'Fulfilled']);

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
}

interface CreateJournalEntriesResult {
    Success: boolean;
    Results?: Array<{ Success: boolean; JournalEntryID?: string; EntryNumber?: string }>;
    Errors?: Array<{ Code: string; Message: string; DraftIndex?: number; LineIndex?: number }>;
}

@RegisterClass(BaseEntity, ORDER_ENTITY)
export class OrderEntityServer extends mjBizAppsOrdersOrderHeaderEntity {
    private _lines: mjBizAppsOrdersOrderLineEntity[] = [];
    /** Price decompositions produced during this save, written once the lines have IDs (D69). */
    private readonly _priceComponents = new Map<mjBizAppsOrdersOrderLineEntity, ResolvedPrice>();
    /** Why a line owes no tax, by line index — written as a zero-amount component (D73). */
    private readonly _taxReasons = new Map<number, string>();
    private _promotionCodes: string[] = [];
    private _manualDiscounts: ManualDiscountRequest[] = [];
    private _charges: RequestedCharge[] = [];
    /** Codes that resolved to nothing usable, so the caller can tell the customer WHY. */
    private _unusableCodes: Array<{ Code: string; Reason: string }> = [];

    /**
     * Promotion codes the customer presented (D70). Set before `Save()`; resolved after the lines
     * are priced, because a promotion's value depends on what it is discounting.
     */
    public get PromotionCodes(): string[] {
        return this._promotionCodes;
    }
    public set PromotionCodes(value: string[]) {
        this._promotionCodes = value ?? [];
    }

    /** Ad-hoc discounts with a stated reason, each gated by the applying user's SalesAuthority. */
    public get ManualDiscounts(): ManualDiscountRequest[] {
        return this._manualDiscounts;
    }
    public set ManualDiscounts(value: ManualDiscountRequest[]) {
        this._manualDiscounts = value ?? [];
    }

    /**
     * Charges to apply to this order (D71) — shipping, handling, tax layers. Computed AFTER
     * promotions, because a charge's basis is the discounted line.
     */
    public get Charges(): RequestedCharge[] {
        return this._charges;
    }
    public set Charges(value: RequestedCharge[]) {
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

    /**
     * Unsaved child lines to persist with this order (plan D12). Populate before `Save()` when
     * creating an order and its lines as one unit; leave empty to save the header alone.
     */
    public get Lines(): mjBizAppsOrdersOrderLineEntity[] {
        return this._lines;
    }
    public set Lines(value: mjBizAppsOrdersOrderLineEntity[]) {
        this._lines = value ?? [];
    }

    // ─── Validation ────────────────────────────────────────────────────────────

    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();

        // An order entering the booked state must have something to book. Draft orders may be
        // empty — you build them up over time.
        if (this.willBookOnThisSave()) {
            const lineCount = this._lines.length > 0 ? this._lines.length : await this.countPersistedLines();
            if (lineCount === 0) {
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
        }

        // Children guard their own invariants; surface their failures against the order.
        for (const line of this._lines) {
            const lineResult = await line.ValidateAsync();
            if (!lineResult.Success) {
                result.Success = false;
                result.Errors.push(...lineResult.Errors);
            }
        }

        return result;
    }

    // ─── Save Override ─────────────────────────────────────────────────────────

    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        const booking = this.willBookOnThisSave();

        // Not a booking save — ordinary path, no transaction needed beyond the base save.
        if (!booking && this._lines.length === 0) {
            return super.Save(options);
        }

        const dbProvider = this.ProviderToUse as unknown as DatabaseProviderBase;

        try {
            await dbProvider.BeginTransaction();

            if (booking) {
                this.ConfirmedAt = new Date();
            }

            // The order IS the receivable, so its number is an A/R document number — assigned
            // gap-consciously from OrderSequence before the first insert (D30).
            if (!this.IsSaved && !this.OrderNumber) {
                this.OrderNumber = await this.assignOrderNumber();
            }

            const savedHeader = await super.Save(options);
            if (!savedHeader) {
                throw new Error(
                    `Failed to save order header: ${this.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                );
            }

            // DECIDE BEFORE THE LINES ARE INSERTED. The rules may shorten the first period, and a
            // prorated term must bill the prorated amount — but the header is already Confirmed by
            // now, so the immutability trigger (correctly) refuses to let a saved line's Quantity
            // change afterwards. Deciding first means the line is INSERTED at its final quantity
            // and never updated, which keeps the trigger's guarantee intact instead of working
            // around it.
            // BUNDLES EXPAND FIRST, before anything reads the line collection. Everything downstream
            // — pricing, proration, totals, tax, booking, entitlements — operates per line, so the
            // components have to BE lines by the time any of it runs. It also has to happen before
            // the insert: a Confirmed line is frozen by trigger 51003, so turning a parent's money to
            // zero afterwards would be an update the trigger refuses, reported as an INSERT-EXEC
            // rollback that names neither the line nor the rule.
            await this.expandBundles();

            const decisions = booking ? await this.decideSubscriptions() : new Map();

            await this.savePendingLines(options, decisions);
            await this.savePriceComponents(options);

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
        result.Error = err;
        result.OriginalValues = this.Fields.map(f => ({ FieldName: f.Name, Value: f.OldValue }));
        result.NewValues = this.Fields.map(f => ({ FieldName: f.Name, Value: f.Value }));
        result.StartedAt = new Date();
        result.EndedAt = new Date();
        return result;
    }

    // ─── Booking ───────────────────────────────────────────────────────────────

    /** True when this save is the first transition into a booked status (plan D8). */
    private willBookOnThisSave(): boolean {
        if (!BOOKED_STATUSES.has(this.Status)) return false;
        if (this.ConfirmedAt) return false; // already booked — never re-book
        return true;
    }

    private async savePendingLines(
        options?: EntitySaveOptions,
        decisions?: Map<mjBizAppsOrdersOrderLineEntity, SubscriptionDecisionForLine>,
    ): Promise<void> {
        // EVERY in-memory decision happens first, then the rows go down. That ordering is forced
        // rather than tidy: a Confirmed line is frozen by trigger 51003, and because the CRUD procs
        // run under INSERT-EXEC, a trigger rollback raises 'Cannot use the ROLLBACK statement within
        // an INSERT-EXEC statement' — an error naming neither the line nor the rule it broke. So
        // anything that changes a line's money must be settled BEFORE the insert, not corrected
        // after it.
        for (const line of this._lines) {
            line.OrderHeaderID = this.ID;

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
            if (!inheritedFromOrigin && Number(line.Quantity ?? 0) >= 0) {
                await this.applyResolvedPrice(line);
            }
        }

        // Promotions see priced lines and stamp DiscountAmount while they are still in memory.
        const pending = await this.decidePromotions();
        // Charges follow promotions: their basis is the DISCOUNTED line, and tax computes on what
        // the customer actually owes rather than on list price.
        const charges = await this.decideCharges();

        const persisted: mjBizAppsOrdersOrderLineEntity[] = [];
        for (const line of this._lines) {
            const saved = await line.Save(options);
            if (!saved) {
                throw new Error(
                    `Failed to save order line ${line.LineNumber}: ${line.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                );
            }
            persisted.push(line);
        }
        await this.saveTaxReasons(persisted);
        this._lines = [];

        // The adjustment and charge rows need line IDs, so they follow the insert — but they only ADD
        // rows and never touch the frozen line again.
        if (pending) await this.writePromotionRecords(pending, persisted);
        if (charges) await this.writeChargeRecords(charges, persisted);
    }

    /**
     * Compute charges over the in-memory lines and stamp each line's share (D71).
     *
     * Tax lands on `LineTax` and everything else on `ChargeAmount`. Both feed `LineTotalGross`
     * identically; they are stored apart because tax is reported and remitted separately everywhere,
     * and merging them would mean unpicking the two again exactly when it matters most.
     */
    private async decideCharges(): Promise<ComputeChargesResult | null> {
        // NOT gated on _charges being non-empty. Tax is RESOLVED from the ship-to address rather
        // than stated by the caller, so the commonest real order — goods, an address, no
        // hand-entered charges — has an empty _charges and still owes tax. Returning early here
        // silently skipped tax on every such order, and the zeros looked correct.
        if (!this._lines.length) return null;

        const provider = this.ProviderToUse as unknown as IMetadataProvider;
        const user = this.ContextCurrentUser as UserInfo;

        // Nets AFTER promotions — decidePromotions has already stamped DiscountAmount.
        // Shared with `OrderLineEntityServer.computeTotals` — the same rule, computed once. When
        // these were two independent expressions they clamped a reversal line to zero in both
        // places, so a return owed no tax refund and the ledger and the line disagreed.
        const chargeable = this._lines.map((line, i) => ({
            ID: String(i),
            Net: NetAfterDiscount(
                Number(line.Quantity ?? 0) * Number(line.UnitPrice ?? 0),
                // 4dp, matching `DiscountPct DECIMAL(7,4)`. The charge and tax base must agree with
                // the line total to the penny, and the line rounds — so this has to round the same
                // way or tax is computed on a base the line does not have.
                Math.round(Number(line.DiscountPct ?? 0) * 1e4) / 1e4,
                Number(line.DiscountAmount ?? 0),
            ),
        }));

        // Tax charges the caller did not state are RESOLVED from the ship-to address (D73): which
        // jurisdictions reach it, whether this company has nexus in them, whether the product is
        // taxable, and whether the buyer is exempt. A caller-supplied rate still wins — the same
        // rule as a stated UnitPrice.
        const resolvedTax = await this.resolveTaxCharges(chargeable, provider, user);
        if (!this._charges.length && !resolvedTax.length) return null;
        const result = await RunCharges([...this._charges, ...resolvedTax], chargeable, provider, user);
        const split = SplitChargesByLine(result);
        for (let i = 0; i < this._lines.length; i++) {
            const share = split.get(String(i));
            if (!share) continue;
            if (share.Tax) this._lines[i].LineTax = share.Tax;
            if (share.Other) {
                (this._lines[i] as unknown as { ChargeAmount: number }).ChargeAmount = share.Other;
            }
        }
        return result;
    }

    /**
     * Turn the ship-to address into tax charges, one per jurisdiction layer (D73).
     *
     * Returns NOTHING — correctly and for four different reasons, which is the point:
     *   - the caller already stated a tax charge, so resolution would double it
     *   - no ship-to address, so there is nowhere to resolve to
     *   - the product is not taxable (the walk: product → category → type)
     *   - this company has no nexus, or the buyer is exempt
     *
     * The last three are recorded on the order's notes rather than swallowed. A zero tax line is
     * the same number in all four cases and an auditor asking "why was no tax charged" needs the
     * right answer, not the right total.
     */
    private async resolveTaxCharges(
        chargeable: Array<{ ID: string; Net: number }>,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<RequestedCharge[]> {
        // A stated tax charge wins, exactly as a stated UnitPrice does.
        if (this._charges.some((c) => /tax/i.test(c.Code))) return [];

        const addressID = this.ShipToAddressID;
        if (!addressID) return [];

        const address = await this.loadAddress(addressID);
        if (!address) return [];

        const out: RequestedCharge[] = [];

        for (let i = 0; i < this._lines.length; i++) {
            const line = this._lines[i];
            // A line worth NOTHING is not taxed — but a NEGATIVE line is a reversal (D16), and it
            // owes a tax refund of exactly the same shape. `<= 0` collapsed those two: a return
            // came back with the goods refunded and the tax kept, which overcharges the customer
            // by the tax and leaves a ledger that balances perfectly while doing it.
            if ((chargeable[i]?.Net ?? 0) === 0) continue;

            const taxability = await this.resolveLineTaxability(line.ProductID);
            const resolved = await ResolveTax(
                {
                    Address: address,
                    IsTaxable: taxability.IsTaxable,
                    ProductTaxCategory: taxability.TaxCategory,
                    CompanyID: this.CompanyID,
                    OrganizationID: this.BillToOrganizationID ?? null,
                    PersonID: this.BillToPersonID ?? null,
                    AsOf: this.OrderDate ? new Date(this.OrderDate) : new Date(),
                },
                provider,
                user,
            );

            if (resolved.ExemptReason) {
                // Recorded as a ZERO-AMOUNT price component rather than on Notes. Notes cannot work
                // here — the header is already saved by the time charges are decided, so an
                // in-memory assignment never reaches the database. And the component trail is the
                // right home anyway: it is already the per-line 'how did we get here' record, and a
                // zero with a label is exactly 'no tax, because X'.
                this._taxReasons.set(i, resolved.ExemptReason);
                continue;
            }
            for (const layer of resolved.Layers) {
                out.push({
                    Code: 'SalesTax',
                    // Targeted at THIS line: taxability, nexus and exemption are all per line, so a
                    // two-line order can legitimately tax one and not the other.
                    TargetLineID: String(i),
                    Rate: layer.Rate,
                    TaxJurisdictionID: layer.TaxJurisdictionID,
                    TaxRateID: layer.TaxRateID,
                });
            }
        }

        return out;
    }

    /**
     * The taxability walk for a product: product → its category → that category's ANCESTORS → type.
     *
     * The ancestor climb is the same one `GLAccountResolver` does, and for the same reason: a
     * deployment that organises products into a tree expects a setting on the root to reach every
     * leaf beneath it. Reading only the immediate category would make an ancestor's setting
     * unreachable, which defeats having a tree at all.
     */
    private async resolveLineTaxability(productID: string): Promise<ResolvedTaxability> {
        const rv = new RunView(this.ProviderToUse as unknown as IRunViewProvider);
        const pRes = await rv.RunView<{
            IsTaxable: boolean | null;
            TaxCategory: string | null;
            ProductCategoryID: string | null;
            ProductTypeID: string | null;
        }>(
            {
                EntityName: 'MJ_BizApps_Orders: Products',
                ExtraFilter: `ID = '${productID}'`,
                Fields: ['IsTaxable', 'TaxCategory', 'ProductCategoryID', 'ProductTypeID'],
                ResultType: 'simple',
                BypassCache: true,
            },
            this.ContextCurrentUser,
        );
        const p = pRes?.Results?.[0];
        if (!p) return { IsTaxable: true, TaxCategory: null, DecidedAt: 'Default' };

        const chain = await this.categoryTaxChain(p.ProductCategoryID);

        let type: { DefaultIsTaxable: boolean; DefaultTaxCategory: string | null } | null = null;
        if (p.ProductTypeID) {
            const tRes = await rv.RunView<{ DefaultIsTaxable: boolean; DefaultTaxCategory: string | null }>(
                {
                    EntityName: 'MJ_BizApps_Orders: Product Types',
                    ExtraFilter: `ID = '${p.ProductTypeID}'`,
                    Fields: ['DefaultIsTaxable', 'DefaultTaxCategory'],
                    ResultType: 'simple',
                    BypassCache: true,
                },
                this.ContextCurrentUser,
            );
            type = tRes?.Results?.[0] ?? null;
        }

        return ResolveTaxability(p, chain, type);
    }

    /**
     * The category and every ancestor, nearest first.
     *
     * One read of the tree, then pointer-chasing — the same shape `GLAccountResolver` uses. The
     * cycle guard is not paranoia: the DB CHECK blocks self-parenting but not a longer loop, and an
     * unguarded climb would hang the confirm rather than fail it.
     */
    private async categoryTaxChain(startCategoryID: string | null): Promise<TaxabilityCategoryLevel[]> {
        if (!startCategoryID) return [];
        const rv = new RunView(this.ProviderToUse as unknown as IRunViewProvider);
        const res = await rv.RunView<{
            ID: string;
            ParentProductCategoryID: string | null;
            DefaultIsTaxable: boolean | null;
            DefaultTaxCategory: string | null;
        }>(
            {
                EntityName: 'MJ_BizApps_Orders: Product Categories',
                Fields: ['ID', 'ParentProductCategoryID', 'DefaultIsTaxable', 'DefaultTaxCategory'],
                ResultType: 'simple',
                BypassCache: true,
            },
            this.ContextCurrentUser,
        );
        const byID = new Map(
            (res?.Results ?? []).map((c) => [String(c.ID).toLowerCase(), c]),
        );

        const chain: TaxabilityCategoryLevel[] = [];
        const seen = new Set<string>();
        let current: string | null = startCategoryID;
        while (current) {
            const key = String(current).toLowerCase();
            if (seen.has(key)) break;
            seen.add(key);
            const row = byID.get(key);
            if (!row) break;
            chain.push({
                ID: row.ID,
                DefaultIsTaxable: row.DefaultIsTaxable,
                DefaultTaxCategory: row.DefaultTaxCategory,
            });
            current = row.ParentProductCategoryID;
        }
        return chain;
    }

    /** The ship-to address, in the shape jurisdiction matching wants. */
    private async loadAddress(addressID: string): Promise<TaxAddress | null> {
        const rv = new RunView(this.ProviderToUse as unknown as IRunViewProvider);
        const res = await rv.RunView<TaxAddress>(
            {
                EntityName: COMMON_ADDRESS_ENTITY,
                ExtraFilter: `ID = '${addressID}'`,
                Fields: ['Country', 'StateProvince', 'City', 'PostalCode'],
                ResultType: 'simple',
                BypassCache: true,
            },
            this.ContextCurrentUser,
        );
        return res?.Results?.[0] ?? null;
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
    private async expandBundles(): Promise<void> {
        if (!this._lines.length) return;

        const provider = this.ProviderToUse as unknown as IMetadataProvider;
        const user = this.ContextCurrentUser as UserInfo;

        // A parent needs an ID the children can name. Unsaved lines may not have one yet, and the
        // database default would only assign it at insert — too late for the child rows going down
        // in the same batch.
        for (const line of this._lines) {
            if (!line.ID) (line as unknown as { ID: string }).ID = crypto.randomUUID().toUpperCase();
        }

        const before = this._lines.length;
        await ExpandBundleLines(
            this._lines as unknown as ExpandableLine[],
            async () => {
                const row = await provider.GetEntityObject<mjBizAppsOrdersOrderLineEntity>(
                    'MJ_BizApps_Orders: Order Lines',
                    user,
                );
                row.NewRecord();
                (row as unknown as { ID: string }).ID = crypto.randomUUID().toUpperCase();
                return row as unknown as ExpandableLine;
            },
            provider,
            user,
        );
        if (this._lines.length === before) return;

        // REORDER AND RENUMBER. Children are appended to the end of the collection, so without this
        // a two-bundle order interleaves as parent, parent, child, child, child, child — unreadable
        // on an invoice and impossible to group by eye. Putting each child directly beneath its
        // parent is also what `UQ_OrderLine_OrderHeader_LineNumber` needs: the children arrive with
        // no LineNumber at all, and the column is NOT NULL.
        const byParent = new Map<string, mjBizAppsOrdersOrderLineEntity[]>();
        const roots: mjBizAppsOrdersOrderLineEntity[] = [];
        for (const line of this._lines) {
            const parentID = (line as unknown as { ParentOrderLineID?: string | null }).ParentOrderLineID;
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
        for (const line of this._lines) if (!ordered.includes(line)) ordered.push(line);

        ordered.forEach((line, i) => {
            line.LineNumber = i + 1;
        });
        this._lines = ordered;
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
                    (l as unknown as { ReversesOrderLineID?: string | null }).ReversesOrderLineID ?? null,
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
            (l) => (l as unknown as { ReversesOrderLineID?: string | null }).ReversesOrderLineID,
        );
        if (!reversals.length) return;

        const provider = this.ProviderToUse as unknown as IMetadataProvider;
        const user = this.ContextCurrentUser as UserInfo;

        for (const line of reversals) {
            const reverses = (line as unknown as { ReversesOrderLineID: string }).ReversesOrderLineID;
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
        const reverses = (line as unknown as { ReversesOrderLineID?: string | null }).ReversesOrderLineID;
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
        for (const other of this._lines) {
            if (other === line) continue;
            const otherReverses = (other as unknown as { ReversesOrderLineID?: string | null })
                .ReversesOrderLineID;
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
     * Fill `UnitPrice` from the pricing engine when the caller did not state one (D69).
     *
     * DIRECT ENTRY STILL WINS, and that is deliberate rather than transitional (D21): a stated price
     * is a decision somebody made, and an engine that overrode it would make the order say something
     * other than what was agreed. Resolution fills a blank; it never argues.
     *
     * `ProductPriceID` records WHICH rule produced the number, so a disputed invoice can be traced
     * back to the rule rather than to "the system". Without it the stamp is an assertion with no
     * evidence behind it.
     *
     * Refusal is governed by `OrderCompanyPolicy.RefuseUnpricedLines` (default ON, per D12's
     * precedent): a line nobody can price is refused rather than booked at zero, because an invoice
     * for nothing looks exactly like a deliberate freebie.
     */
    private async applyResolvedPrice(line: mjBizAppsOrdersOrderLineEntity): Promise<void> {
        // A stated price ends it. `UnitPrice` is NOT NULL with no sentinel, so "not stated" has to
        // be read from the field's dirty state rather than from its value — 0 is a legitimate price
        // for a free line and must not be mistaken for silence.
        const field = line.GetFieldByName('UnitPrice');
        const stated = field?.Dirty === true || (line.UnitPrice ?? 0) > 0;
        if (stated) return;

        const provider = this.ProviderToUse as unknown as IMetadataProvider;
        const user = this.ContextCurrentUser as UserInfo;

        const product = await this.loadProductForPricing(line.ProductID);
        const resolved = await ResolvePrice(
            {
                ProductID: line.ProductID,
                ProductCategoryID: product?.ProductCategoryID ?? null,
                CompanyID: product?.CompanyID ?? this.CompanyID,
                Quantity: Number(line.Quantity ?? 0),
                AsOf: this.OrderDate ? new Date(this.OrderDate) : new Date(),
                OrganizationID: this.BillToOrganizationID ?? null,
                PersonID: this.BillToPersonID ?? null,
            },
            provider,
            user,
        );

        if (!resolved) {
            if (await this.refusesUnpricedLines()) {
                throw new Error(
                    `Order line ${line.LineNumber} (${product?.Name ?? line.ProductID}) cannot be priced: no price ` +
                        `rule was found for this product, and no UnitPrice was supplied. Add a price for the product ` +
                        `or state one on the line.`,
                );
            }
            return;
        }

        line.UnitPrice = resolved.UnitPrice;
        line.ProductPriceID = resolved.ProductPriceID;
        this._priceComponents.set(line, resolved);
    }

    /** Product facts pricing needs: its category (for the walk) and its company. */
    private async loadProductForPricing(
        productID: string,
    ): Promise<{ ProductCategoryID: string | null; CompanyID: string; Name: string } | null> {
        const rv = new RunView(this.ProviderToUse as unknown as IRunViewProvider);
        const res = await rv.RunView<{ ProductCategoryID: string | null; CompanyID: string; Name: string }>(
            {
                EntityName: 'MJ_BizApps_Orders: Products',
                ExtraFilter: `ID = '${productID}'`,
                Fields: ['ProductCategoryID', 'CompanyID', 'Name'],
                ResultType: 'simple',
            },
            this.ContextCurrentUser,
        );
        return res?.Results?.[0] ?? null;
    }

    /** Company policy, defaulting to REFUSE when no policy row exists. */
    private async refusesUnpricedLines(): Promise<boolean> {
        const rv = new RunView(this.ProviderToUse as unknown as IRunViewProvider);
        const res = await rv.RunView<{ RefuseUnpricedLines: boolean }>(
            {
                EntityName: 'MJ_BizApps_Orders: Order Company Policies',
                ExtraFilter: `ID = '${this.CompanyID}'`,
                Fields: ['RefuseUnpricedLines'],
                ResultType: 'simple',
            },
            this.ContextCurrentUser,
        );
        const row = res?.Results?.[0];
        // No row means defaults, and the default is to refuse.
        return row ? row.RefuseUnpricedLines !== false : true;
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
            const row = await provider.GetEntityObject<BaseEntity>(
                'MJ_BizApps_Orders: Order Line Price Components',
                user,
            );
            row.NewRecord();
            row.Set('OrderLineID', line.ID);
            row.Set('Sequence', 900);
            row.Set('ComponentType', 'Tax');
            row.Set('Label', `no tax — ${reason}`);
            row.Set('Amount', 0);
            row.Set('RunningTotal', Number(line.LineTotalNet ?? 0));
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
                const row = await provider.GetEntityObject<BaseEntity>(
                    'MJ_BizApps_Orders: Order Line Price Components',
                    user,
                );
                row.NewRecord();
                row.Set('OrderLineID', line.ID);
                row.Set('Sequence', seq++);
                row.Set('ComponentType', c.ComponentType);
                row.Set('Label', c.Label);
                row.Set('Amount', c.Amount);
                row.Set('RunningTotal', c.RunningTotal);
                if (c.SourceEntityName && c.SourceRecordID) {
                    const ent = md.EntityByName(c.SourceEntityName);
                    if (ent) {
                        row.Set('SourceEntityID', ent.ID);
                        row.Set('SourceRecordID', c.SourceRecordID);
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
     * Decide promotions and manual discounts while the lines are still IN MEMORY (D70).
     *
     * Returns what should be recorded once the lines have IDs, and stamps each line's
     * `DiscountAmount` on the way. The split exists because a Confirmed line is frozen by trigger
     * 51003 and the CRUD procs run under INSERT-EXEC, where a trigger rollback surfaces as
     * 'Cannot use the ROLLBACK statement within an INSERT-EXEC statement' — an error that names
     * neither the line nor the rule. Deciding first and writing second sidesteps that entirely, and
     * matches how subscriptions already work (decide, then materialize).
     *
     * `DiscountAmount` is the field that makes everything downstream work unchanged: `LineTotalNet`
     * subtracts it, the journal entry mirrors the same arithmetic, and tax will compute on the
     * discounted base — none of them needing to know that promotions exist.
     */
    private async decidePromotions(): Promise<PromotionRunResult | null> {
        if (!this._promotionCodes.length && !this._manualDiscounts.length) return null;
        if (!this._lines.length) return null;

        const provider = this.ProviderToUse as unknown as IMetadataProvider;
        const user = this.ContextCurrentUser as UserInfo;

        // Line nets from memory, mirroring OrderLineEntityServer's own arithmetic — the rows do not
        // exist yet, so LineTotalNet has not been computed.
        const lines: PromotableLine[] = [];
        for (let i = 0; i < this._lines.length; i++) {
            const line = this._lines[i];
            const product = await this.loadProductForPricing(line.ProductID);
            const gross = Math.round(Number(line.Quantity ?? 0) * Number(line.UnitPrice ?? 0) * 100) / 100;
            const net = Math.round(gross * (1 - Number(line.DiscountPct ?? 0)) * 100) / 100;
            lines.push({
                // Positional key: the real ID does not exist yet, and the writer maps it back by index.
                ID: String(i),
                ProductID: line.ProductID,
                ProductCategoryID: product?.ProductCategoryID ?? null,
                Quantity: Number(line.Quantity ?? 0),
                Net: net,
                Entity: line as unknown as BaseEntity,
            });
        }

        const policy = await this.loadCompanyPolicy();
        const run = await RunPromotions(
            {
                OrderHeaderID: this.ID,
                CompanyID: this.CompanyID,
                OrganizationID: this.BillToOrganizationID ?? null,
                PersonID: this.BillToPersonID ?? null,
                AsOf: this.OrderDate ? new Date(this.OrderDate) : new Date(),
                Codes: this._promotionCodes,
                Lines: lines,
                StackingMode: policy.StackingMode,
                AllowStacking: policy.AllowPromotionStacking,
            },
            provider,
            user,
        );
        this._unusableCodes = run.Unusable;

        // Manual discounts are authorized individually — the cap is per user, not per order.
        for (const md of this._manualDiscounts) {
            const target = md.OrderLineID ? lines.find((l) => l.ID === md.OrderLineID) : null;
            const base = target ? target.Net : lines.reduce((sum, l) => sum + l.Net, 0);
            const auth = await AuthorizeManualDiscount(md, base, user?.ID ?? null, provider, user);
            if (auth.Refusal) throw new Error(`Manual discount refused: ${auth.Refusal}`);

            if (target) {
                run.Applications.push({
                    PromotionID: null,
                    PromotionCodeID: null,
                    OrderLineID: target.ID,
                    Amount: md.Amount,
                    Label: 'manual discount',
                    Reason: md.Reason,
                    AuthorizedBySalesAuthorityID: auth.AuthorityID,
                    ApprovedByUserID: auth.ApprovedByUserID ?? null,
                });
                run.PerLine.set(target.ID, Math.round(((run.PerLine.get(target.ID) ?? 0) + md.Amount) * 100) / 100);
            } else {
                // An order-level manual discount allocates exactly like an order-level promotion —
                // it must reach the lines or tax and GL see the wrong base.
                const parts = AllocateProRata(md.Amount, lines.map((l) => l.Net));
                lines.forEach((l, i) => {
                    if (parts[i] <= 0) return;
                    run.Applications.push({
                        PromotionID: null,
                        PromotionCodeID: null,
                        OrderLineID: l.ID,
                        Amount: parts[i],
                        Label: 'manual discount (order-level share)',
                        Reason: md.Reason,
                        AuthorizedBySalesAuthorityID: auth.AuthorityID,
                        ApprovedByUserID: auth.ApprovedByUserID ?? null,
                    });
                    run.PerLine.set(l.ID, Math.round(((run.PerLine.get(l.ID) ?? 0) + parts[i]) * 100) / 100);
                });
            }
        }

        // Stamp the lines while they are still unsaved.
        for (const l of lines) {
            const total = run.PerLine.get(l.ID);
            if (total) (l.Entity as unknown as { DiscountAmount: number }).DiscountAmount = total;
        }
        return run;
    }

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

    /** Stacking policy for this company, defaulting to no stacking and sequential maths. */
    private async loadCompanyPolicy(): Promise<{ AllowPromotionStacking: boolean; StackingMode: StackingMode }> {
        const rv = new RunView(this.ProviderToUse as unknown as IRunViewProvider);
        const res = await rv.RunView<{ AllowPromotionStacking: boolean; StackingMode: string }>(
            {
                EntityName: 'MJ_BizApps_Orders: Order Company Policies',
                ExtraFilter: `ID = '${this.CompanyID}'`,
                ResultType: 'simple',
            },
            this.ContextCurrentUser,
        );
        const row = res?.Results?.[0];
        return {
            AllowPromotionStacking: row ? row.AllowPromotionStacking === true : false,
            StackingMode: (row?.StackingMode as StackingMode) ?? 'Sequential',
        };
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
        if (line.ServicePeriodStart || line.ServicePeriodEnd) return;
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
        if (!event?.EventStartsAt) return;

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

            // Provider discipline (plan D12): load through the entity's OWN provider so the read
            // sees our uncommitted transaction, not a second connection.
            const line = await provider.GetEntityObject<mjBizAppsOrdersOrderLineEntity>(
                ORDER_LINE_ENTITY,
                CompositeKey.FromID(drafts[i].OrderLineID),
                this.ContextCurrentUser,
            );
            line.JournalEntryID = jeID;

            const saved = await line.Save(options);
            if (!saved) {
                throw new Error(
                    `Failed to stamp JournalEntryID on order line ${line.LineNumber}: ` +
                        `${line.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                );
            }
        }
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

        for (const line of lines) {
            const decided = byLineID.get(uuidKey(line.ID));
            if (!decided) continue;
            const { Product: product, Rules: rules, Decision: decision } = decided;

            const subscriptionID =
                decision.Action === 'CreateNew'
                    ? await this.createSubscription(line, product, rules, decision, decided.Subscriber, options)
                    : await this.touchExistingSubscription(decision, !!line.RenewsSubscriptionID, options);

            const term = decision.Term!;

            // The LINE is the authority on price — `savePendingLines` already inserted it at the
            // prorated quantity. Taking the term's amount from it makes booking (line net), the
            // term, and the recognition schedule reconcile exactly; three numbers that must agree
            // or deferred revenue never clears to zero.
            term.Amount = line.LineTotalNet ?? term.Amount;

            const termEntity = await provider.GetEntityObject<BaseEntity>(SUBSCRIPTION_TERM_ENTITY, user);
            termEntity.NewRecord();
            termEntity.Set('SubscriptionID', subscriptionID);
            termEntity.Set('TermNumber', term.TermNumber);
            termEntity.Set('OrderLineID', line.ID);
            termEntity.Set('StartDate', term.StartDate);
            termEntity.Set('EndDate', term.EndDate);
            termEntity.Set('Amount', term.Amount);
            termEntity.Set('IsProrated', term.IsProrated);
            termEntity.Set('ProrationFactor', term.ProrationFactor);
            // Frozen at purchase: later changes to the product's rules must never restate a
            // term that has already been booked.
            termEntity.Set('RevenueRecognitionTypeID', product.RevenueRecognitionTypeID);
            termEntity.Set('Status', 'Active');

            if (!(await termEntity.Save(options))) {
                throw new Error(
                    `Failed to create the subscription term for order line ${line.LineNumber}: ` +
                        `${termEntity.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                );
            }

            // The term is the coverage window the schedule must follow, and its cadence decides
            // how many slices that window produces.
            out.TermsByLine.set(line.ID, {
                ID: termEntity.Get('ID') as string,
                StartDate: term.StartDate,
                EndDate: term.EndDate,
                Amount: term.Amount,
            });
            out.RecognitionMonthsByLine.set(line.ID, decided.Behavior.RecognitionMonths(rules));

            // The line's stored service period reflects the TERM, not what a user typed.
            line.ServicePeriodStart = term.StartDate;
            line.ServicePeriodEnd = term.EndDate;
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
        const subLines = await this.subscriptionLines(this._lines);
        if (subLines.length === 0) return out;

        // Settings drive whether the organization is inferred at all, so load the cache once here
        // rather than per line.
        await OrdersSettings.Load(this.ProviderToUse as unknown as IMetadataProvider, this.ContextCurrentUser);

        for (const { line, product, rules } of subLines) {
            const behavior = this.behaviorFor(rules);
            let subscriber = await this.withInferredOrganization(this.resolveSubscriber(line));
            // An explicitly named subscription wins; otherwise find one for this subscriber and
            // product, scoped by the type's BenefitModel (D62).
            const existing = line.RenewsSubscriptionID
                ? await this.loadSubscriptionState(`ID='${line.RenewsSubscriptionID}'`)
                : await this.findExistingSubscription(product.ID, behavior.DedupeIdentity(rules, subscriber));

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

            out.set(line, { Product: product, Rules: rules, Decision: decision, Behavior: behavior, Subscriber: subscriber });
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
        // THREE tiers, resolved per side independently: the line's ship-to, then the ORDER's
        // ship-to, then the order's customer. Nothing is required at the line — an order shipping
        // everything to one recipient states them once on the header, and a line only overrides
        // when it genuinely differs.
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

    /** Net for a line that has not been saved yet — mirrors OrderLineEntityServer's own formula. */
    private pendingLineNet(line: mjBizAppsOrdersOrderLineEntity): number {
        const gross = (line.Quantity ?? 0) * (line.UnitPrice ?? 0);
        const net = gross * (1 - (line.DiscountPct ?? 0));
        return Math.round((net + Number.EPSILON) * 100) / 100;
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
        const sub = await provider.GetEntityObject<BaseEntity>(SUBSCRIPTION_ENTITY, this.ContextCurrentUser);
        sub.NewRecord();
        sub.Set('SubscriptionNumber', await this.assignSubscriptionNumber());
        sub.Set('CompanyID', this.CompanyID);
        // The BIRTH line (D39/D40) — which purchase brought this subscription into existence.
        // Renewals append terms that carry their own OrderLineID; this one never changes.
        sub.Set('OrderLineID', line.ID);
        sub.Set('SubscriptionTypeID', rules.ID);
        sub.Set('ProductID', product.ID);
        // The RESOLVED subscriber, which may differ from the order's customer: the customer pays,
        // the ship-to holds and benefits.
        sub.Set('HolderOrganizationID', subscriber.OrganizationID);
        sub.Set('BeneficiaryPersonID', subscriber.PersonID);
        sub.Set('Status', rules.TrialDays > 0 ? 'Trialing' : 'Active');
        sub.Set('StartDate', decision.Term!.StartDate);
        sub.Set('AutoRenew', rules.AutoRenewDefault);
        // A trial with no end date is not a trial. Without this, `Status='Trialing'` is a label
        // nothing can ever act on — no job can find trials about to expire.
        if (rules.TrialDays > 0) {
            const trialEnd = new Date(decision.Term!.StartDate);
            trialEnd.setUTCDate(trialEnd.getUTCDate() + rules.TrialDays);
            sub.Set('TrialEndDate', trialEnd);
        }

        if (!(await sub.Save(options))) {
            throw new Error(
                `Failed to create the subscription for '${product.Name}': ` +
                    `${sub.LatestResult?.CompleteMessage ?? 'unknown error'}`,
            );
        }

        const subscriptionID = sub.Get('ID') as string;
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
        eventType: string,
        options?: EntitySaveOptions,
        data?: Record<string, unknown>,
    ): Promise<void> {
        const provider = this.ProviderToUse as unknown as IMetadataProvider;
        const event = await provider.GetEntityObject<BaseEntity>(
            SUBSCRIPTION_EVENT_ENTITY,
            this.ContextCurrentUser,
        );
        event.NewRecord();
        event.Set('SubscriptionID', subscriptionID);
        event.Set('EventType', eventType);
        event.Set('OccurredAt', new Date());
        event.Set('RelatedOrderHeaderID', this.ID);
        if (data) event.Set('EventData', JSON.stringify(data));

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
        const sub = await provider.GetEntityObject<BaseEntity>(
            SUBSCRIPTION_ENTITY,
            CompositeKey.FromID(decision.SubscriptionID!),
            this.ContextCurrentUser,
        );
        if (decision.Action === 'Reactivate') {
            sub.Set('Status', 'Active');
            sub.Set('CanceledAt', null);
            sub.Set('EndDate', null);
            sub.Set('AutoRenew', true);
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
    private async createInitialPayment(options?: EntitySaveOptions): Promise<void> {
        const amount = this.InitialPaymentAmount ?? 0;
        if (!this.InitialPaymentTypeID || amount <= 0) return;

        const provider = this.ProviderToUse as unknown as IMetadataProvider;
        const user = this.ContextCurrentUser;

        // Copy the intent instrument so the payment owns its own row (D39).
        let paymentDetailID: string | null = null;
        if (this.InitialPaymentDetailID) {
            paymentDetailID = await this.copyPaymentDetail(this.InitialPaymentDetailID, options);
        }

        const payment = await provider.GetEntityObject<BaseEntity>(PAYMENT_HEADER_ENTITY, user);
        payment.NewRecord();
        payment.Set('PaymentNumber', await this.assignPaymentNumber());
        payment.Set('ReceivingCompanyID', this.CompanyID);
        payment.Set('BillToOrganizationID', this.BillToOrganizationID);
        payment.Set('BillToPersonID', this.BillToPersonID);
        payment.Set('PaymentDate', this.OrderDate ?? new Date());
        payment.Set('PaymentTypeID', this.InitialPaymentTypeID);
        payment.Set('Amount', amount);
        payment.Set('PaymentDetailID', paymentDetailID);
        payment.Set('Status', 'Captured');
        payment.Set('Description', `Initial payment for order ${this.OrderNumber}`);

        // The allocation rides the payment's Lines collection so both land in ONE save (D68). The
        // payment's Amount must equal the sum of its lines at capture, so writing the header first
        // and the allocation second would fail on a payment that is about to be exactly consistent.
        const line = await provider.GetEntityObject<BaseEntity>(PAYMENT_LINE_ENTITY, user);
        line.NewRecord();
        line.Set('OrderHeaderID', this.ID);
        line.Set('Amount', amount);
        line.Set('AllocatedAt', new Date());
        line.Set('AllocatedByUserID', user?.ID ?? null);
        (payment as unknown as { Lines: BaseEntity[] }).Lines = [line];

        if (!(await payment.Save(options))) {
            throw new Error(
                `Failed to create the initial payment for order ${this.OrderNumber}: ` +
                    `${payment.LatestResult?.CompleteMessage ?? 'unknown error'}`,
            );
        }
    }

    /** Duplicate a PaymentDetail so each host owns its own immutable snapshot (D39). */
    private async copyPaymentDetail(sourceID: string, options?: EntitySaveOptions): Promise<string> {
        const provider = this.ProviderToUse as unknown as IMetadataProvider;
        const source = await provider.GetEntityObject<BaseEntity>(
            PAYMENT_DETAIL_ENTITY,
            CompositeKey.FromID(sourceID),
            this.ContextCurrentUser,
        );

        const copy = await provider.GetEntityObject<BaseEntity>(PAYMENT_DETAIL_ENTITY, this.ContextCurrentUser);
        copy.NewRecord();
        for (const f of source.Fields) {
            if (f.Name === 'ID' || f.Name.startsWith('__mj_')) continue;
            copy.Set(f.Name, source.Get(f.Name));
        }
        // Record where the copy came from when the source was a saved wallet entry.
        if (!source.Get('SourceCustomerPaymentMethodID')) {
            copy.Set('SourceCustomerPaymentMethodID', source.Get('SourceCustomerPaymentMethodID'));
        }

        if (!(await copy.Save(options))) {
            throw new Error(
                `Failed to copy the payment instrument for order ${this.OrderNumber}: ` +
                    `${copy.LatestResult?.CompleteMessage ?? 'unknown error'}`,
            );
        }
        return copy.Get('ID') as string;
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

/** Tree-shaking anchor — call from the server bootstrap so @RegisterClass is retained. */
export function LoadOrderEntityServer(): void {
    // intentionally empty
}
