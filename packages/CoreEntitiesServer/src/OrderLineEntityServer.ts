/**
 * OrderLineEntityServer — line-level invariants and engine-materialized totals.
 *
 * Two jobs, both of which must happen server-side because the journal entry is derived from them:
 *
 *   1. STAMP THE COMPANY (plan D6). `OrderLine.CompanyID` is a denormalized copy of the
 *      product's company, captured at save time so the line records who owned the product at
 *      transaction time even if product ownership later moves. It is derived, never authored —
 *      whatever a caller passes is overwritten while the order is open, and once the order is
 *      booked the stamped value is kept (trigger 51003 freezes it).
 *
 *   2. COMPUTE THE TOTALS. `LineTotalNet` / `LineTotalGross` are engine-materialized and never
 *      user-entered:
 *          LineTotalNet   = (Quantity × UnitPrice × (1 − DiscountPct)) − DiscountAmount
 *          LineTotalGross = LineTotalNet + LineTax + ChargeAmount
 *
 *      DiscountPct and DiscountAmount are both applied, in that order, because they mean different
 *      things: a percentage is a negotiated concession on the line, an amount is an allocated share
 *      of a promotion (D70). The net is clamped TOWARD ZERO, in whichever direction the line runs —
 *      a discount larger than the line is a configuration mistake and must not turn a sale into a
 *      credit, but a reversal line (D16) is legitimately negative and must not be flattened to zero.
 *      The rule lives in `PricingBehavior.NetAfterDiscount`, shared with the charge/tax base, because
 *      it was written twice and both copies had the same bug.
 *      The journal entry is built from the same arithmetic, so a client-supplied total can never
 *      disagree with what was booked.
 *
 * The DB trigger (51003) freezes these columns once the parent order is Confirmed, so this runs
 * meaningfully only while the order is still open.
 *
 * CONNECTS TO:
 *   FACTORY: OrderJournalEntryFactory (./OrderJournalEntryFactory.ts) — mirrors this arithmetic
 */
import {
    BaseEntity,
    BaseEntityResult,
    EntitySaveOptions,
    IMetadataProvider,
    IRunViewProvider,
    RunView,
    ValidationErrorInfo,
    ValidationErrorType,
    ValidationResult,
} from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    DropStaleExtendedAmount,
    HostOrderLineEditVeto,
    IsBooked,
    LineGross,
    NetAfterDiscount,
    OrderLineEntity,
    OrdersEngine,
    PRICE_OVERRIDE_REASON_REQUIRED,
    ResolveOrderLineEditRefusal,
    priceOverrideReasonMissing,
    type mjBizAppsOrdersProductEntity,
    type OrderLineEditKind,
} from '@mj-biz-apps/orders-entities';
import { ORDER_HEADER_ENTITY } from './entity-names.js';
import { RequireUUID } from './sql-guards.js';

const ORDER_LINE_ENTITY = 'MJ_BizApps_Orders: Order Lines';

function money(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * The columns that set WHEN the thing is delivered rather than WHAT was sold (golive#322).
 *
 * Kept beside the class rather than inline so the exemption below reads as a list someone may extend
 * deliberately, and so a reader can see at a glance how short it is.
 */
const SERVICE_PERIOD_FIELDS: readonly string[] = ['ServicePeriodStart', 'ServicePeriodEnd'];

/**
 * Whether a field held NOTHING before this save.
 *
 * MEASURED against the SQL provider, not assumed: a date column that was never set arrives here as
 * `null`, and one that carries a date arrives as a real `Date`. Those are the two shapes this rule
 * actually decides between. `undefined` and the empty string are covered because a value can also
 * reach a field before any row exists behind it, and because treating either as "set" would refuse
 * the fill this exemption exists for -- the failure that costs is a blank read as a value, not the
 * reverse. A non-empty string is NOT blank, so a provider that ever hands these columns back as ISO
 * strings still sees a set date as set.
 */
function IsBlankValue(value: unknown): boolean {
    return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
}

@RegisterClass(BaseEntity, ORDER_LINE_ENTITY)
export class OrderLineEntityServer extends OrderLineEntity {
    /**
     * Set only by bundle expansion, on the component lines it writes (bc-aidp-next-golive#292).
     *
     * TRANSIENT: not a column. A line with a `ParentOrderLineID` is a bundle
     * component, priced at its share of the bundle, and the concession confirm gate does not re-price
     * it. Only expansion may make a line one: a parent set any other way would let an ordinary line
     * skip the gate. See `refuseParentNotFromExpansion`.
     */
    public WrittenByBundleExpansion = false;

    /**
     * `BaseEntity` skips `ValidateAsync` unless a subclass opts in, so without this the checks
     * below never run when a line is saved on its own. The order's own `ValidateAsync` loops over
     * its lines and would have covered the confirm path — except that one was skipped for the same
     * reason, so in practice nothing here was enforced anywhere. See the note on
     * `OrderEntityServer.DefaultSkipAsyncValidation`.
     */
    public override get DefaultSkipAsyncValidation(): boolean {
        return false;
    }

    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();

        // Quantity <> 0 is a DB CHECK; negative quantities are legal only as reversal slices
        // (plan D16), which is a cross-field rule the database cannot express.
        if (this.Quantity < 0 && !this.ReversesOrderLineID) {
            result.Success = false;
            result.Errors.push(
                new ValidationErrorInfo(
                    'Quantity',
                    `A negative quantity is only valid on a reversal line. Set ReversesOrderLineID to the ` +
                        `line being reversed, or use a positive quantity.`,
                    this.Quantity,
                    ValidationErrorType.Failure,
                ),
            );
        }

        // The GL dimension tag is a PAIR (golive #236). `CK_OrderLine_DimensionPair` already refuses
        // a half-set row, but a raw CHECK violation names the constraint rather than the field, and
        // arrives from inside the order's transaction after every other line has been written. Said
        // here, it names which half is missing while the caller can still fix it.
        const dimensionHalves = [this.DimensionID, this.DimensionValueID];
        if (dimensionHalves.some((half) => !!half) && dimensionHalves.some((half) => !half)) {
            const missing = this.DimensionID ? 'DimensionValueID' : 'DimensionID';
            result.Success = false;
            result.Errors.push(
                new ValidationErrorInfo(
                    missing,
                    `A GL dimension tag needs both halves: the dimension names the axis and the value ` +
                        `names the point on it, and a journal entry line carries the pair. Set ${missing}, ` +
                        `or clear both to leave this line untagged.`,
                    this[missing],
                    ValidationErrorType.Failure,
                ),
            );
        }

        this.refuseUnexplainedOverride(result);
        this.refuseParentNotFromExpansion(result);
        await this.refuseNewLineOnBookedOrder(result);
        await this.refuseVetoedEdit(result, this.IsSaved ? 'update' : 'create');

        return result;
    }

    /**
     * A line flagged `PriceOverridden` has to say why (bc-aidp-next-golive#253 item 4).
     *
     * The reason is the audit trail for a price that left the rules; without it the flag records that
     * a concession happened and nothing about it. Refused here, in validation, rather than by a
     * database constraint: lines converted from the previous system carry overridden prices with no
     * reason and must stay loadable, and an unrelated edit to one of them — a quantity, a dimension —
     * must not suddenly demand a reason nobody recorded at the time. So the rule fires only when the
     * override itself is being written: a new line, or a saved one whose price or override fields
     * changed.
     */
    private refuseUnexplainedOverride(result: ValidationResult): void {
        if (!priceOverrideReasonMissing(this)) return;
        const writingOverride =
            !this.IsSaved || this.FieldIsDirty('UnitPrice', 'ProductPriceID', 'PriceOverridden', 'PriceOverrideReason');
        if (!writingOverride) return;
        result.Success = false;
        result.Errors.push(
            new ValidationErrorInfo(
                'PriceOverrideReason',
                PRICE_OVERRIDE_REASON_REQUIRED,
                this.PriceOverrideReason,
                ValidationErrorType.Failure,
            ),
        );
    }

    /**
     * A parent line is written by bundle expansion and nothing else (bc-aidp-next-golive#292).
     *
     * The concession confirm gate skips a line with a `ParentOrderLineID`, because a bundle component
     * is priced at its share of the bundle rather than at a concession. Set by an API caller on an
     * ordinary line, the same field would carry a price below the engine's past the gate. So a parent
     * is refused unless expansion wrote it. Clearing one is allowed: the line is then checked like any
     * other. A saved component whose parent is not being changed is not affected.
     */
    private refuseParentNotFromExpansion(result: ValidationResult): void {
        if (!this.ParentOrderLineID || this.WrittenByBundleExpansion) return;
        if (this.IsSaved && !this.FieldIsDirty('ParentOrderLineID')) return;
        result.Success = false;
        result.Errors.push(
            new ValidationErrorInfo(
                'ParentOrderLineID',
                'ParentOrderLineID is set only by bundle expansion, which writes each component of a bundle ' +
                    'line at its share of the bundle price. Leave it empty, and sell the bundle product to get ' +
                    'its components.',
                this.ParentOrderLineID,
                ValidationErrorType.Failure,
            ),
        );
    }

    /**
     * Ask whoever else has a stake in this line whether it may change (bc-aidp-next-golive#206 item 1).
     *
     * COVERS EDITS, NOT JUST CREATES. `refuseNewLineOnBookedOrder` above returns early on `IsSaved`,
     * because Orders' own booked rule is about ADDING to a booked order. A deal lock is not: a line
     * that already exists is exactly what the contract was derived from, so changing it after the
     * close is the damaging case, and the one the tester actually hit.
     *
     * A THROWN VETO IS A REFUSAL, not an allowance. A vetoer that cannot reach what it needs to judge
     * has not said yes, and treating "could not tell" as "go ahead" is how a frozen record gets
     * edited. The message names the fault so it is fixed rather than worked around.
     */
    private async refuseVetoedEdit(result: ValidationResult, kind: OrderLineEditKind): Promise<void> {
        const veto = HostOrderLineEditVeto();
        if (!veto || !this.OrderHeaderID || this.BypassExternalEditVeto) return;

        /**
         * A SERVICE PERIOD IS NOT WHAT WAS SOLD (bc-aidp-next-golive#322).
         *
         * The lock's own refusal says it: "before changing what was sold". Service dates are the
         * coverage WINDOW, not the thing — the product, quantity and price are untouched.
         *
         * Why it matters rather than being a nicety: `ConfirmEligibility` refuses to confirm a line
         * whose product has `RequiresServicePeriod` until it has BOTH a start and an end. Sales can
         * state a term START on a deal line (golive#32) and nothing else — `DealLine` carries no date
         * columns at all — so the end can only be set on the order. With the lock covering every
         * field, a perfectly ordinary Won deal could not have its order confirmed without reopening
         * the deal, setting the dates and closing it again. That reopen is itself now refused for the
         * confirm (golive#323), so the workaround was getting narrower, not wider.
         *
         * SCOPED TO AN ORDER THAT HAS NOT BOOKED. After confirm the stored period is the SETTLED term
         * that `materializeSubscriptions` wrote, and recognition is derived from it. Trigger 51003
         * freezes the financial columns at confirm but NOT these two, so the database would not catch
         * a late edit — which is the reason to be explicit here rather than to rely on it.
         */
        if (kind === 'update' && (await this.changesOnlyTheServicePeriod())) return;

        const refusal = await ResolveOrderLineEditRefusal(
            veto,
            {
                OrderHeaderID: this.OrderHeaderID,
                OrderLineID: this.IsSaved ? (this.ID ?? null) : null,
                Kind: kind,
                // The vetoer reads something to answer, and on the server that read needs a user.
                // `refuseNewLineOnBookedOrder` passes the same one to its own RunView.
                ContextUser: this.ContextCurrentUser ?? null,
            },
            'The edit was not applied.',
        );
        if (!refusal) return;

        result.Success = false;
        result.Errors.push(
            new ValidationErrorInfo('OrderHeaderID', refusal, this.OrderHeaderID, ValidationErrorType.Failure),
        );
    }

    /**
     * Deleting a line is an edit too, and validation does not run on the delete path.
     *
     * #206 item 1 asks for adding, editing AND deleting to be refused on a locked deal. `Delete()` never
     * calls `ValidateAsync`, so without this the grid's delete button would remain the one way through
     * a lock that refuses everything else — and deleting the line a contract was derived from is the
     * most damaging of the three, not the least.
     */
    public override async Delete(options?: Parameters<BaseEntity['Delete']>[0]): Promise<boolean> {
        const veto = HostOrderLineEditVeto();
        if (veto && this.OrderHeaderID && !this.BypassExternalEditVeto) {
            const refusal = await ResolveOrderLineEditRefusal(
                veto,
                {
                    OrderHeaderID: this.OrderHeaderID,
                    OrderLineID: this.ID ?? null,
                    Kind: 'delete',
                    ContextUser: this.ContextCurrentUser ?? null,
                },
                'Nothing was deleted.',
            );
            if (refusal) {
                /**
                 * REGISTERED, NOT ASSIGNED ONTO `LatestResult`.
                 *
                 * An earlier version set `this.LatestResult.Success` directly, and that threw. Core
                 * returns `null` from that getter when the result history is empty — while TYPING it
                 * as non-null, so nothing caught it — and the history is empty on exactly the entity
                 * this path gets: the delete resolver loads a line and deletes it without ever saving.
                 *
                 * So the refusal arrived as a TypeError instead of as the message explaining the
                 * freeze. The delete was still stopped, but by the unhandled error this whole approach
                 * exists to avoid.
                 *
                 * `RegisterResultHistoryEntry` is what core itself uses to record a failed delete, and
                 * it is also what makes the message readable when an Event Order Line delete cascades
                 * up to its parent line.
                 */
                const failed = new BaseEntityResult();
                failed.Success = false;
                failed.Type = 'delete';
                failed.Message = refusal;
                failed.StartedAt = new Date();
                failed.EndedAt = new Date();
                failed.OriginalValues = this.Fields.map((f) => ({ FieldName: f.CodeName, Value: f.OldValue }));
                this.RegisterResultHistoryEntry(failed);
                return false;
            }
        }
        return super.Delete(options);
    }

    /** Set by OrderEntityServer when saving lines as part of an order graph save/booking. */
    public BypassBookedCheck = false;

    /**
     * Set by Orders' OWN writers, so an external freeze does not stop Orders' bookkeeping.
     *
     * ── WHY THIS IS SEPARATE FROM THE CHECK ITSELF ──────────────────────────────────────────────
     *
     * The external check is asked on every save of a line, and Orders saves lines constantly AFTER a
     * deal is won: marking one fulfilled, stamping the journal entry id once the order books,
     * rippling a bundle's quantities, writing the reversal line when a subscription is cancelled.
     * Every one of those is Orders doing its own work on a line some other app has frozen.
     *
     * The vetoer cannot tell them apart. It is handed an order id, a line id and create/update/delete
     * — nothing that says whether a person typed in a grid or Orders is closing its own books. So the
     * distinction has to be made HERE, by the only code that knows.
     *
     * The deal close itself is unaffected either way: the deal server confirms the order before it
     * writes the Won status, so the freeze is not in place yet. It is everything after the close that
     * would have broken.
     *
     * ── WHY NOT `BypassBookedCheck` ─────────────────────────────────────────────────────────────
     *
     * That one means "this write comes through the order graph, so the booked-parent rule has already
     * been applied at the header". This one means "this write is Orders' own, so an external freeze
     * does not apply". They coincide on the graph path and nowhere else — a fulfillment write needs
     * this and not that. One flag meaning two rules is a flag that gets set for one reason and
     * silently changes the other.
     */
    public BypassExternalEditVeto = false;

    /**
     * A new line saved on its own (not through the order graph) still has to
     * refuse a booked parent. Header.Validate covers the graph path; this
     * covers the standalone path.
     */
    private async refuseNewLineOnBookedOrder(result: ValidationResult): Promise<void> {
        if (this.IsSaved || !this.OrderHeaderID || this.BypassBookedCheck) return;

        const status = await this.storedOrderStatus();
        if (!status || !IsBooked(status)) return;

        result.Success = false;
        result.Errors.push(
            new ValidationErrorInfo(
                'OrderHeaderID',
                `Order line cannot be added — the order is booked. Corrections to booked orders go through reversal orders.`,
                this.OrderHeaderID,
                ValidationErrorType.Failure,
            ),
        );
    }

    /**
     * Whether this update touches the service period and NOTHING else, on an order that has not booked.
     *
     * Deliberately "only": a save that moves the dates AND the quantity is still changing what was
     * sold, and must meet the lock like any other. An empty dirty set returns false rather than true —
     * a save with nothing dirty has no claim on an exemption, and reading it as one would hand every
     * no-op edit a way past the lock.
     *
     * The status read is the same one `refuseNewLineOnBookedOrder` makes, through `ProviderToUse`, so
     * inside the booking transaction it sees what the transaction has written. A status that cannot be
     * read yields NO exemption — the lock then applies, which is the safe direction.
     */
    private async changesOnlyTheServicePeriod(): Promise<boolean> {
        const dirty = this.Fields.filter((f) => f.Dirty);
        if (dirty.length === 0) return false;
        if (!dirty.every((f) => SERVICE_PERIOD_FIELDS.includes(f.Name))) return false;

        /**
         * FILLING A BLANK, NOT CHANGING A DATE (review on golive#322).
         *
         * The exemption exists because a date that was never set cannot be set anywhere else: Sales
         * states only a term START on a deal line, so the END arrives blank and the order is the only
         * place to put it. A date that is ALREADY set had a source, and moving it is a change to the
         * coverage window that was agreed at the close -- which is what the lock is for.
         *
         * So the prior value decides. Blank before, and this is the fill the confirm is waiting on;
         * populated before, and it meets the lock like any other edit to a closed deal's line.
         *
         * Read from the dirty fields themselves rather than through `GetFieldByName`, so this asks the
         * same objects the test above filtered and cannot disagree with them about which fields moved.
         */
        if (!dirty.every((f) => IsBlankValue(f.OldValue))) return false;

        const status = await this.storedOrderStatus();
        return !!status && !IsBooked(status);
    }

    /**
     * The parent order's status AS STORED, not as the in-memory header holds it.
     *
     * Read through `this.ProviderToUse`, so inside the booking transaction it sees the header row the
     * transaction has already written. The stored status is the one trigger 51003 judges by, which is
     * why the confirming save itself (stored Draft, in-memory Confirmed) still counts as open.
     */
    private async storedOrderStatus(): Promise<string | null> {
        if (!this.OrderHeaderID) return null;
        const rv = new RunView(this.ProviderToUse as unknown as IRunViewProvider);
        const lookup = await rv.RunView<{ ID: string; Status: string }>(
            {
                EntityName: ORDER_HEADER_ENTITY,
                ExtraFilter: `ID='${RequireUUID(this.OrderHeaderID, 'OrderHeaderID')}'`,
                Fields: ['ID', 'Status'],
                ResultType: 'simple',
            },
            this.ContextCurrentUser,
        );
        return lookup?.Results?.[0]?.Status ?? null;
    }

    /**
     * Populate the fields this line DERIVES rather than accepts, so it is valid before anything
     * validates it.
     *
     * Public because the ORDER now has to call it. `Lines` is a related-record collection, and
     * MJ validates every companion from the PARENT's save — deliberately, so a cross-record
     * invariant sees the whole graph before the first row lands. But that runs before any child's
     * own `Save()`, and `CompanyID` is stamped here, inside this class's `Save()`. The result was
     * that every confirm failed with `Lines[0].CompanyID: Company cannot be null` — a NOT NULL
     * column the line derives from its product and no caller ever authors.
     *
     * Idempotent, so the ordinary path (`Save()` calling it directly) is unaffected, and a line
     * that was prepared by its order and then saved individually simply re-derives the same values.
     */
    public async PrepareForSave(): Promise<void> {
        await this.stampCompanyFromProduct();
        this.computeTotals();
    }

    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        await this.PrepareForSave();
        const ok = await super.Save(options);
        if (!ok) {
            return false;
        }

        await this.persistExtension(options);
        return true;
    }

    private async persistExtension(options?: EntitySaveOptions): Promise<void> {
        if (!this.Extension.IsConfigured) {
            return;
        }

        const ext = await this.Extension.EnsureEntity();
        if (!ext) {
            return;
        }

        if (this.ID && (!ext.Get('ID') || ext.Get('ID') !== this.ID)) {
            ext.Set('ID', this.ID);
        }

        // If the extension is an IS-A child of this line, sync the saved parent state
        // so the extension's inner save knows the parent row is already persisted in the database.
        const parent = ext.ISAParent;
        if (parent) {
            await parent.LoadFromData(this.GetAll(), true);
        }

        // A persisted IS-A child with no leaf-owned dirt has nothing to write.
        // Re-saving it re-enters BaseEntity's child-save path; after the parent
        // row is already persisted, that path only re-hydrates from GetAll(),
        // which includes parent virtuals the child does not own (e.g. OrderHeader).
        if (parent && ext.IsSaved && !this.extensionHasLeafDirtyFields(ext)) {
            return;
        }

        if (!ext.IsSaved || ext.Dirty) {
            const saved = await ext.Save(options);
            if (!saved) {
                throw new Error(
                    `Failed to save line extension '${this.Extension.EntityName}' for order line ${this.LineNumber}: ` +
                        (ext.LatestResult?.CompleteMessage ?? 'unknown error'),
                );
            }
        }
    }

    private extensionHasLeafDirtyFields(ext: BaseEntity): boolean {
        const parentNames = ext.EntityInfo.ParentEntityFieldNames;
        return ext.Fields.some((f) => f.Dirty && !parentNames.has(f.Name));
    }

    /**
     * Derived from the product while the order is open — plan D6 — and kept once it is booked.
     *
     * A BOOKED LINE KEEPS THE COMPANY IT WAS SOLD UNDER (golive #262). Tax obligations are counted
     * per selling company from confirmed orders, and the invoice renders from this column. Re-deriving
     * it on every save meant that moving a product to another company and then touching an old
     * confirmed line moved that sale too, leaving nothing on the order to say who actually made it.
     * Trigger 51003 refuses the change at the database; skipping it here keeps an ordinary re-save of
     * a booked line (stamping `JournalEntryID`, a fulfilment write) from tripping that refusal.
     *
     * The status is only read when the product's company actually differs from the line's, so the
     * common save — nothing moved — costs no extra query.
     *
     * A PRODUCT THIS PROCESS HAS NOT CACHED IS RELOADED, NOT SKIPPED (golive #301). Returning on a
     * cache miss left `CompanyID` null for any product written outside this process after it
     * started, and the save failed on "Company cannot be null", which names neither the product nor
     * the cache. `RequireProduct` reloads the catalog once and throws naming the product if it is
     * still not there.
     */
    private async stampCompanyFromProduct(): Promise<void> {
        if (!this.ProductID) return;
        let product: mjBizAppsOrdersProductEntity;
        try {
            product = await OrdersEngine.Instance.RequireProduct(
                this.ProductID,
                this.ContextCurrentUser,
                this.ProviderToUse as unknown as IMetadataProvider,
            );
        } catch (err) {
            throw new Error(`Order line ${this.LineNumber}: ${err instanceof Error ? err.message : String(err)}`);
        }
        if (!product.CompanyID || product.CompanyID === this.CompanyID) return;
        if (this.IsSaved && this.CompanyID && IsBooked((await this.storedOrderStatus()) ?? '')) return;
        this.CompanyID = product.CompanyID;
    }

    private computeTotals(): void {
        // ROUND THE DISCOUNT TO ITS COLUMN'S SCALE FIRST, and store the rounded value.
        //
        // `DiscountPct` is `DECIMAL(7,4)`. Computing with an unrounded rate and storing a rounded one
        // makes the application and the database disagree about the same line: a third off 900 is
        // 600.00 by full precision and 600.03 by the stored 0.3333.
        //
        // That disagreement does not surface until the line is UPDATED — which happens when
        // `JournalEntryID` is stamped after booking. `computeTotals` runs again, now reading 0.3333
        // back from the row, produces 600.03, and the immutability trigger correctly refuses to let
        // booked money change. The confirm then fails with 'Failed to stamp JournalEntryID', which
        // names neither the discount nor the rounding, and any DiscountPct with more than four
        // decimal places is simply un-bookable.
        //
        // `savePendingLines` already does exactly this for `Quantity` and for exactly this reason;
        // the discount never got the same treatment. Assigning the rounded value here means the two
        // can never diverge again, whichever path set it.
        // A BOOKED LINE'S MONEY IS FROZEN — so do not recompute it.
        //
        // Trigger 51003 already enforces this at the database, and that is precisely
        // the problem: the line is saved a SECOND time to stamp JournalEntryID after
        // booking, computeTotals runs again, and any figure it cannot reproduce from
        // stored state alone comes out different. The trigger then correctly refuses
        // the change and the whole confirm rolls back, reported as a stamping failure
        // that names neither the total nor the cause.
        //
        // That is not hypothetical — it is how a flat-priced line failed: the exact
        // extended amount is known while pricing is in flight, but the reloaded line
        // has only quantity and a derived unit rate, which for a Flat rule cannot
        // reproduce the total (3 × 33.33 = 99.99, not 100.00). Rather than make the
        // arithmetic reproducible from a rate that provably cannot represent every
        // total, respect the rule the trigger already states: once booked, these
        // columns are history, not a derivation.
        if (this.JournalEntryID) return;

        const pct = Math.round((this.DiscountPct ?? 0) * 1e4) / 1e4;
        if (pct !== (this.DiscountPct ?? 0)) this.DiscountPct = pct;

        // A ROLLUP PARENT CONTRIBUTES NOTHING (D45).
        //
        // An expanded bundle's parent line is customer-facing: it keeps its UnitPrice so an invoice
        // can print "Gold Package — 100", but the money lives on the children, which carry the
        // allocated shares. Letting the parent compute a line total as well would DOUBLE the order —
        // and do it invisibly, because the parent's own arithmetic is perfectly correct and every
        // child's is too. The header rollup trigger sums LineTotalGross across all lines, so zero
        // here is what keeps it honest without the trigger needing to know bundles exist.
        //
        // Deliberately after the DiscountPct rounding above, so the stored rate stays consistent
        // whether or not the line happens to be a parent.
        if (this.IsRollupParent) {
            this.LineTotalNet = 0;
            this.LineTotalGross = 0;
            return;
        }

        // `NetAfterDiscount` is shared with the charge/tax base in OrderEntityServer. It used to be
        // computed independently in both places, and both clamped a reversal line to zero — see
        // PricingBehavior for what that cost.
        //
        // The gross is the rule's stored figure when there is one (#579): Flat 100.00 at quantity 3
        // is 100.00, not 3 × 33.33. A draft line saved again keeps it; one edited past it drops it
        // and goes back to quantity × unit price, here as well as in the pricing walk, because a
        // line can be saved on its own without the walk running.
        DropStaleExtendedAmount(this);
        const net = NetAfterDiscount(
            LineGross(this.Quantity, this.UnitPrice, this.ExtendedAmount),
            pct,
            this.DiscountAmount ?? 0,
        );
        this.LineTotalNet = net;
        this.LineTotalGross = money(net + (this.LineTax ?? 0) + (this.ChargeAmount ?? 0));
    }
}

/**
 * Mark a line as Orders' own write, so an external freeze does not stop Orders' bookkeeping.
 *
 * A FUNCTION rather than eight hand-set booleans. The failure this guards against is a writer that
 * forgets, and a named call at the point the entity is acquired is harder to forget — and far easier
 * to grep for — than a property assignment buried further down. It also keeps the cast in one place:
 * the operations hold the GENERATED entity type, which does not know about the server subclass.
 *
 * Call it where the line is obtained, before anything is set on it.
 */
export function MarkAsOrdersOwnWrite(line: unknown): void {
    (line as { BypassExternalEditVeto?: boolean }).BypassExternalEditVeto = true;
}

/** Tree-shaking anchor — call from the server bootstrap so @RegisterClass is retained. */
export function LoadOrderLineEntityServer(): void {
    // intentionally empty
}
