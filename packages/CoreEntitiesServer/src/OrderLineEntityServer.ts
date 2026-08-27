/**
 * OrderLineEntityServer — line-level invariants and engine-materialized totals.
 *
 * Two jobs, both of which must happen server-side because the journal entry is derived from them:
 *
 *   1. STAMP THE COMPANY (plan D6). `OrderLine.CompanyID` is a denormalized copy of the
 *      product's company, captured at save time so the line records who owned the product at
 *      transaction time even if product ownership later moves. It is derived, never authored —
 *      whatever a caller passes is overwritten.
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
    EntitySaveOptions,
    IMetadataProvider,
    IRunViewProvider,
    RunView,
    ValidationErrorInfo,
    ValidationErrorType,
    ValidationResult,
} from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { IsBooked, LineGross, NetAfterDiscount, OrderLineEntity } from '@mj-biz-apps/orders-entities';
import { ORDER_HEADER_ENTITY } from './entity-names.js';
import { RequireUUID } from './sql-guards.js';

const ORDER_LINE_ENTITY = 'MJ_BizApps_Orders: Order Lines';
const PRODUCT_ENTITY = 'MJ_BizApps_Orders: Products';

function money(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

@RegisterClass(BaseEntity, ORDER_LINE_ENTITY)
export class OrderLineEntityServer extends OrderLineEntity {
    /**
     * The exact extended amount the price rule computed, when a rule priced this line.
     *
     * TRANSIENT — not a column, and deliberately so. It is the pricing pass handing
     * this line the figure it already computed exactly, rather than the line
     * re-deriving it from a unit rate that cannot always represent it (see
     * {@link LineGross}). Persisting it would add a column whose only job is to
     * restate `LineTotalNet` before discount, and a second stored number that can
     * disagree with the first is the thing worth avoiding.
     *
     * Null means "no rule priced this" — a hand-typed unit price, where the unit
     * rate genuinely IS the authority — and the classic quantity × price applies.
     */
    public ResolvedExtendedAmount: number | null = null;

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

        await this.refuseNewLineOnBookedOrder(result);

        return result;
    }

    /** Set by OrderEntityServer when saving lines as part of an order graph save/booking. */
    public BypassBookedCheck = false;

    /**
     * A new line saved on its own (not through the order graph) still has to
     * refuse a booked parent. Header.Validate covers the graph path; this
     * covers the standalone path.
     */
    private async refuseNewLineOnBookedOrder(result: ValidationResult): Promise<void> {
        if (this.IsSaved || !this.OrderHeaderID || this.BypassBookedCheck) return;

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
        const status = lookup?.Results?.[0]?.Status;
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

    /** Derived from the product, always — plan D6. */
    private async stampCompanyFromProduct(): Promise<void> {
        if (!this.ProductID) return;

        const rv = new RunView(this.ProviderToUse as unknown as IRunViewProvider);
        const result = await rv.RunView<{ ID: string; CompanyID: string }>(
            {
                EntityName: PRODUCT_ENTITY,
                ExtraFilter: `ID='${this.ProductID}'`,
                Fields: ['ID', 'CompanyID'],
                ResultType: 'simple',
            },
            this.ContextCurrentUser,
        );

        const product = result?.Results?.[0];
        if (product?.CompanyID) {
            this.CompanyID = product.CompanyID;
        }
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
        const net = NetAfterDiscount(
            LineGross(this.Quantity, this.UnitPrice, this.ResolvedExtendedAmount),
            pct,
            this.DiscountAmount ?? 0,
        );
        this.LineTotalNet = net;
        this.LineTotalGross = money(net + (this.LineTax ?? 0) + (this.ChargeAmount ?? 0));
    }
}

/** Tree-shaking anchor — call from the server bootstrap so @RegisterClass is retained. */
export function LoadOrderLineEntityServer(): void {
    // intentionally empty
}
