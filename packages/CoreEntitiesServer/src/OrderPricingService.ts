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
