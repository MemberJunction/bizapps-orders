/**
 * @fileoverview `OrderPricingService` — what an order comes to, decided once, callable without
 * saving anything.
 *
 * WHY THIS EXISTS
 *
 * The pricing walk — resolve each line's price, then promotions, then charges, then tax — lived as
 * private methods on `OrderEntityServer`, reading its fields directly. That had two consequences:
 *
 *   · The UI could not ask "what would this order cost?" without saving. `Orders.PreviewPrice`
 *     answers for ONE LINE, by calling `ResolvePrice` directly, and its own comment admits the
 *     result is advisory: promotions stack against ORDER totals, charges apportion ACROSS lines, and
 *     tax computes on the discounted amount. A per-line answer cannot see any of that.
 *   · An earlier attempt at a full answer ran an entire REAL booking inside a transaction that
 *     always rolled back, purely to read the totals off the entities before they vanished. It fired
 *     on every keystroke and was removed for the cost.
 *
 * Extracting the walk gives one implementation with two callers: `OrderEntityServer.Save()` prices
 * before it persists, and `Orders.PriceOrder` prices and persists nothing. Neither reimplements the
 * other, which is the property that keeps the screen's number and the ledger's number the same.
 *
 * WHAT IT IS NOT
 *
 * Not pure, and not client-side. Pricing reads price lists, promotion definitions, tax rates,
 * taxability chains and company policy — so it takes a provider and a user, and the browser reaches
 * it through the remote operation rather than running it locally.
 *
 * It also does not persist. It mutates the line ENTITIES it is handed (UnitPrice, DiscountAmount,
 * LineTax, ChargeAmount) because that is what the save path needs, and returns the decisions the
 * caller has to write as rows — promotion applications, charge rows, price components, tax reasons.
 * Whether any of that reaches the database is the caller's business.
 *
 * @module @mj-biz-apps/orders-core-entities-server
 */
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { mjBizAppsOrdersOrderLineEntity } from '@mj-biz-apps/orders-entities';
import type { ComputeChargesResult } from './ChargeBehavior.js';
import type { RequestedCharge } from './ChargeEngine.js';
import type { ResolvedPrice } from './PriceResolver.js';
import type { ManualDiscountRequest, PromotionRunResult } from './PromotionEngine.js';
import { RunView, type IRunViewProvider } from '@memberjunction/core';
import { RunCharges, SplitChargesByLine } from './ChargeEngine.js';
import { ResolvePrice } from './PriceResolver.js';
import { AllocateProRata, LineGross, NetAfterDiscount } from './PricingBehavior.js';
import type { OrderLineEntityServer } from './OrderLineEntityServer.js';
import type { StackingMode } from './PromotionBehavior.js';
import {
    AuthorizeManualDiscount,
    RunPromotions,
    WriteAdjustments,
    type PromotableLine,
} from './PromotionEngine.js';
import {
    ResolveTax,
    ResolveTaxability,
    type ResolvedTaxability,
    type TaxAddress,
    type TaxabilityCategoryLevel,
} from './TaxResolver.js';

/** Entity names the walk reads. Kept here so the service does not import the entity it was lifted from. */
const ORDER_COMPANY_POLICY_ENTITY = 'MJ_BizApps_Orders: Order Company Policies';
const COMMON_ADDRESS_ENTITY = 'MJ_BizApps_Common: Addresses';
const PRODUCT_ENTITY = 'MJ_BizApps_Orders: Products';
const PRODUCT_CATEGORY_ENTITY = 'MJ_BizApps_Orders: Product Categories';


/**
 * Everything the walk needs to price an order, stated explicitly rather than read off an entity.
 *
 * The header fields are the ones that actually steer pricing: the company owns the price lists and
 * the policy, the payer decides promotion eligibility and tax exemption, the date decides which
 * price and which rate were in force, and the ship-to address decides jurisdiction.
 */
export interface OrderPricingContext {
    /** Null for an order that does not exist yet — pricing never needs it to be saved. */
    OrderHeaderID: string | null;
    CompanyID: string;
    BillToPersonID: string | null;
    BillToOrganizationID: string | null;
    /** The date the price and tax rate are read AS OF. Null means today. */
    OrderDate: Date | string | null;
    ShipToAddressID: string | null;
    /**
     * The lines, as entities. They are MUTATED in place with the resolved money — that is what the
     * save path needs, and what lets the same call serve both callers.
     */
    Lines: mjBizAppsOrdersOrderLineEntity[];
    PromotionCodes: string[];
    ManualDiscounts: ManualDiscountRequest[];
    Charges: RequestedCharge[];
}

/**
 * The decisions the walk made. The line entities carry the money; this carries everything that
 * becomes a ROW, and the reasons a caller may want to show.
 */
export interface OrderPricingResult {
    /**
     * Codes that resolved to nothing usable, and why. Silence is the wrong answer: a customer who
     * typed a code needs to be told it did nothing, and told what would make it work.
     */
    UnusableCodes: Array<{ Code: string; Reason: string }>;
    /** Why a line owes no tax, by line index — written as a zero-amount component (D73). */
    TaxReasons: Map<number, string>;
    /** Per-line price decomposition, written once the lines have IDs (D69). */
    PriceComponents: Map<mjBizAppsOrdersOrderLineEntity, ResolvedPrice>;
    /** Promotion applications to record, or null when no code or manual discount applied. */
    Promotions: PromotionRunResult | null;
    /** Charge and tax rows to record, or null when the order attracts neither. */
    Charges: ComputeChargesResult | null;
}

/** Everything the walk needs from its host, so it can run without an entity. */
export interface OrderPricingHost {
    Provider: IMetadataProvider;
    User: UserInfo;
}

/**
 * Runs the pricing walk against an explicit context, and persists nothing.
 *
 * One instance per call — it holds the context and the accumulating result as fields so the walk's
 * steps can read them the way they used to read the entity, which is what makes this a MOVE of the
 * original code rather than a rewrite of it. The order of the walk is load-bearing and unchanged:
 *
 *   1. price each line — after any proration has settled its quantity, because quantity bands are a
 *      function of the quantity actually being bought
 *   2. promotions — they see PRICED lines and stamp DiscountAmount while the lines are in memory
 *   3. charges — their basis is the DISCOUNTED line
 *   4. tax — computed inside the charge step, on what the customer actually owes rather than list
 *
 * Reordering any of those changes what the customer pays.
 */
export class OrderPricingService {
    private ctx!: OrderPricingContext;
    private out!: OrderPricingResult;

    constructor(private readonly host: OrderPricingHost) {}

    /**
     * Price the order. MUTATES the line entities in `ctx.Lines` with the resolved money, and returns
     * the decisions that would become rows.
     *
     * `skipPricingFor` names lines the caller has already settled by other means — a reversal takes
     * its money from the line it reverses (D16), and running it through the pricing engine would
     * fail on a negative quantity with a message about volume bands rather than about the return.
     */
    public async Price(
        ctx: OrderPricingContext,
        skipPricingFor?: ReadonlySet<mjBizAppsOrdersOrderLineEntity>,
    ): Promise<OrderPricingResult> {
        this.ctx = ctx;
        this.out = {
            UnusableCodes: [],
            TaxReasons: new Map<number, string>(),
            PriceComponents: new Map<mjBizAppsOrdersOrderLineEntity, ResolvedPrice>(),
            Promotions: null,
            Charges: null,
        };

        for (const line of ctx.Lines) {
            if (skipPricingFor?.has(line)) continue;
            // Not for negative quantities: a negative line with no origin is refused by the line's
            // own validation, which names ReversesOrderLineID and says what would make it legal.
            if (Number(line.Quantity ?? 0) >= 0) {
                await this.applyResolvedPrice(line);
            }
        }

        this.out.Promotions = await this.decidePromotions();
        this.out.Charges = await this.decideCharges();
        return this.out;
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
        if (!this.ctx.PromotionCodes.length && !this.ctx.ManualDiscounts.length) return null;
        if (!this.ctx.Lines.length) return null;

        const provider = this.host.Provider;
        const user = this.host.User;

        // Line nets from memory, mirroring OrderLineEntityServer's own arithmetic — the rows do not
        // exist yet, so LineTotalNet has not been computed.
        const lines: PromotableLine[] = [];
        for (let i = 0; i < this.ctx.Lines.length; i++) {
            const line = this.ctx.Lines[i];
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
                Entity: line,
            });
        }

        const policy = await this.loadCompanyPolicy();
        const run = await RunPromotions(
            {
                OrderHeaderID: this.ctx.OrderHeaderID,
                CompanyID: this.ctx.CompanyID,
                OrganizationID: this.ctx.BillToOrganizationID ?? null,
                PersonID: this.ctx.BillToPersonID ?? null,
                AsOf: this.ctx.OrderDate ? new Date(this.ctx.OrderDate) : new Date(),
                Codes: this.ctx.PromotionCodes,
                Lines: lines,
                StackingMode: policy.StackingMode,
                AllowStacking: policy.AllowPromotionStacking,
            },
            provider,
            user,
        );
        this.out.UnusableCodes = run.Unusable;

        // Manual discounts are authorized individually — the cap is per user, not per order.
        for (const md of this.ctx.ManualDiscounts) {
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
            if (total) l.Entity.DiscountAmount = total;
        }
        return run;
    }

    /**
     * Write the adjustment and allocation rows once the lines have real IDs.
     *
     * These only ADD rows — the frozen line is never touched again, which is what keeps this clear
     * of the immutability trigger.
     */

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
        if (!this.ctx.Lines.length) return null;

        const provider = this.host.Provider;
        const user = this.host.User;

        // Nets AFTER promotions — decidePromotions has already stamped DiscountAmount.
        // Shared with `OrderLineEntityServer.computeTotals` — the same rule, computed once. When
        // these were two independent expressions they clamped a reversal line to zero in both
        // places, so a return owed no tax refund and the ledger and the line disagreed.
        const chargeable = this.ctx.Lines.map((line, i) => ({
            ID: String(i),
            Net: NetAfterDiscount(
                // Same LineGross the line itself uses — a Flat line's base must be the
                // flat amount, or tax is computed on a number the line does not have.
                LineGross(Number(line.Quantity ?? 0), Number(line.UnitPrice ?? 0), this.resolvedExtendedFor(line)),
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
        if (!this.ctx.Charges.length && !resolvedTax.length) return null;
        const result = await RunCharges([...this.ctx.Charges, ...resolvedTax], chargeable, provider, user);
        const split = SplitChargesByLine(result);
        for (let i = 0; i < this.ctx.Lines.length; i++) {
            const share = split.get(String(i));
            if (!share) continue;
            if (share.Tax) this.ctx.Lines[i].LineTax = share.Tax;
            if (share.Other) {
                this.ctx.Lines[i].ChargeAmount = share.Other;
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
        if (this.ctx.Charges.some((c) => /tax/i.test(c.Code))) return [];

        const addressID = this.ctx.ShipToAddressID;
        if (!addressID) return [];

        const address = await this.loadAddress(addressID);
        if (!address) return [];

        const out: RequestedCharge[] = [];

        for (let i = 0; i < this.ctx.Lines.length; i++) {
            const line = this.ctx.Lines[i];
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
                    CompanyID: this.ctx.CompanyID,
                    OrganizationID: this.ctx.BillToOrganizationID ?? null,
                    PersonID: this.ctx.BillToPersonID ?? null,
                    AsOf: this.ctx.OrderDate ? new Date(this.ctx.OrderDate) : new Date(),
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
                this.out.TaxReasons.set(i, resolved.ExemptReason);
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

        const provider = this.host.Provider;
        const user = this.host.User;

        const product = await this.loadProductForPricing(line.ProductID);
        // Before pricing it, establish that it may be sold at all — a retired or
        // out-of-window product should not reach the ledger, and refusing here aborts
        // the confirm before any line is written.
        if (product) this.assertProductSellable(line, product);
        const resolved = await ResolvePrice(
            {
                ProductID: line.ProductID,
                ProductCategoryID: product?.ProductCategoryID ?? null,
                CompanyID: product?.CompanyID ?? this.ctx.CompanyID,
                Quantity: Number(line.Quantity ?? 0),
                AsOf: this.ctx.OrderDate ? new Date(this.ctx.OrderDate) : new Date(),
                OrganizationID: this.ctx.BillToOrganizationID ?? null,
                PersonID: this.ctx.BillToPersonID ?? null,
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
        // The line computes its own totals in a hook outside this class, so it needs the
        // exact figure too — otherwise it would re-derive quantity × a rounded unit rate
        // and disagree with the base computed here.
        (line as OrderLineEntityServer).ResolvedExtendedAmount = resolved.ExtendedAmount;
        this.out.PriceComponents.set(line, resolved);
    }

    /** Product facts pricing needs: its category (for the walk), its company, and whether it may be sold at all. */
    private async loadProductForPricing(
        productID: string,
    ): Promise<{
        ProductCategoryID: string | null;
        CompanyID: string;
        Name: string;
        Status: string;
        AvailableFrom: Date | null;
        AvailableTo: Date | null;
    } | null> {
        const rv = new RunView((this.host.Provider as unknown as IRunViewProvider));
        const res = await rv.RunView<{
            ProductCategoryID: string | null;
            CompanyID: string;
            Name: string;
            Status: string;
            AvailableFrom: Date | null;
            AvailableTo: Date | null;
        }>(
            {
                EntityName: 'MJ_BizApps_Orders: Products',
                ExtraFilter: `ID = '${productID}'`,
                Fields: ['ProductCategoryID', 'CompanyID', 'Name', 'Status', 'AvailableFrom', 'AvailableTo'],
                ResultType: 'simple',
            },
            this.host.User,
        );
        return res?.Results?.[0] ?? null;
    }

    /**
     * Refuse a product that is not on sale — by STATUS or by its availability WINDOW.
     *
     * Neither was checked anywhere on the server. The product picker filters
     * `Status = 'Active'`, which made the status look enforced while being purely
     * presentational: anything reaching the API another way — a saved draft whose
     * product was later retired, an import, a remote operation, a second UI — booked
     * without complaint. `AvailableFrom` / `AvailableTo` were not consulted at all, so
     * a product available from 2030 and one whose window closed in 2021 both sold
     * today. The field that reads as the deliberate control worked; the dates beside
     * it were decoration.
     *
     * Checked here because pricing already loads the product per line, so this costs
     * no extra query, and because refusing during pricing aborts the confirm BEFORE
     * any line is written — the same all-or-none point the subscription rules use.
     *
     * The order's own date is the test, not today: back-dating an order to when the
     * product WAS on sale is legitimate, and re-pricing an old order must not start
     * failing because the catalogue moved on.
     */
    private assertProductSellable(
        line: mjBizAppsOrdersOrderLineEntity,
        product: { Name: string; Status: string; AvailableFrom: Date | null; AvailableTo: Date | null },
    ): void {
        const asOf = this.ctx.OrderDate ? new Date(this.ctx.OrderDate) : new Date();
        const day = (d: Date) => d.toISOString().slice(0, 10);

        if (product.Status !== 'Active') {
            throw new Error(
                `Order line ${line.LineNumber} (${product.Name}) cannot be sold: the product's status is ` +
                    `'${product.Status}', not 'Active'.`,
            );
        }
        if (product.AvailableFrom && asOf < new Date(product.AvailableFrom)) {
            throw new Error(
                `Order line ${line.LineNumber} (${product.Name}) cannot be sold: it is not available until ` +
                    `${day(new Date(product.AvailableFrom))}, and this order is dated ${day(asOf)}.`,
            );
        }
        if (product.AvailableTo && asOf > new Date(product.AvailableTo)) {
            throw new Error(
                `Order line ${line.LineNumber} (${product.Name}) cannot be sold: it was available until ` +
                    `${day(new Date(product.AvailableTo))}, and this order is dated ${day(asOf)}.`,
            );
        }
    }

    /** Company policy, defaulting to REFUSE when no policy row exists. */
    private async refusesUnpricedLines(): Promise<boolean> {
        const rv = new RunView((this.host.Provider as unknown as IRunViewProvider));
        const res = await rv.RunView<{ RefuseUnpricedLines: boolean }>(
            {
                EntityName: ORDER_COMPANY_POLICY_ENTITY,
                ExtraFilter: `ID = '${this.ctx.CompanyID}'`,
                Fields: ['RefuseUnpricedLines'],
                ResultType: 'simple',
            },
            this.host.User,
        );
        const row = res?.Results?.[0];
        // No row means defaults, and the default is to refuse.
        return row ? row.RefuseUnpricedLines !== false : true;
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
        const rv = new RunView((this.host.Provider as unknown as IRunViewProvider));
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
            this.host.User,
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
                this.host.User,
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
        const rv = new RunView((this.host.Provider as unknown as IRunViewProvider));
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
            this.host.User,
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
        const rv = new RunView((this.host.Provider as unknown as IRunViewProvider));
        const res = await rv.RunView<TaxAddress>(
            {
                EntityName: COMMON_ADDRESS_ENTITY,
                ExtraFilter: `ID = '${addressID}'`,
                Fields: ['Country', 'StateProvince', 'City', 'PostalCode'],
                ResultType: 'simple',
                BypassCache: true,
            },
            this.host.User,
        );
        return res?.Results?.[0] ?? null;
    }

    /** Stacking policy for this company, defaulting to no stacking and sequential maths. */
    private async loadCompanyPolicy(): Promise<{ AllowPromotionStacking: boolean; StackingMode: StackingMode }> {
        const rv = new RunView((this.host.Provider as unknown as IRunViewProvider));
        const res = await rv.RunView<{ AllowPromotionStacking: boolean; StackingMode: string }>(
            {
                EntityName: ORDER_COMPANY_POLICY_ENTITY,
                ExtraFilter: `ID = '${this.ctx.CompanyID}'`,
                ResultType: 'simple',
            },
            this.host.User,
        );
        const row = res?.Results?.[0];
        return {
            AllowPromotionStacking: row ? row.AllowPromotionStacking === true : false,
            StackingMode: (row?.StackingMode as StackingMode) ?? 'Sequential',
        };
    }

    /** Net for a line that has not been saved yet — mirrors OrderLineEntityServer's own formula. */

    /**
     * The exact extended amount a price rule computed for this line, if one did.
     *
     * `_priceComponents` is populated by the pricing pass in this same save, so this
     * is the authority while the line is still in flight; the line itself carries the
     * same figure for its own totals hook, which runs outside this class.
     */
    private resolvedExtendedFor(line: mjBizAppsOrdersOrderLineEntity): number | null {
        return this.out.PriceComponents.get(line)?.ExtendedAmount ?? null;
    }
}
