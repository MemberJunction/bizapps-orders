/**
 * What a subscription renews at, and onto what — shared by the renewal pass and the Renewals page.
 *
 * `Orders.SpawnRenewals` used to carry this code privately. The Renewals page needs the same answer
 * for a subscription the pass is not yet due to place — "what will this renew at, and why?" — so a
 * person can check the figure months ahead rather than the morning the order books. Moving the
 * pricing here is what lets both read one rule; a second implementation in a worklist operation
 * would be the one that drifted, and the drift would show up as a renewal priced differently from
 * its preview.
 *
 * The rule itself is `PriceRenewal` in orders-entities (golive #304): the prior term's undiscounted
 * price, or a successor's list price, plus the annual increase when the new term crosses an
 * anniversary. This module gathers that rule's inputs: the line that bought the expiring term, the
 * successor chain, the increase ladder (subscription → product → category → company), the list
 * prices the rule needs, and the term the renewal would buy. The increase ladder, the successor
 * chain and the type rules are cached per instance, because a worklist prices hundreds of rows and
 * most of them share a product.
 *
 * NOTHING HERE WRITES. A pricer is read-only by construction, so a preview, a worklist and the live
 * pass all run the same code and only the pass goes on to place an order.
 *
 * @module @mj-biz-apps/orders-core-entities-server
 */
import { LogError, RunView, type IMetadataProvider, type IRunViewProvider, type UserInfo } from '@memberjunction/core';
import {
    AsDateValue,
    BuildLinePriceContext,
    LoadOrdersEngine,
    OrdersEngine,
    PriceRenewal,
    PriorTermShare,
    RenewalCrossesAnniversary,
    ResolvePrice,
    ResolveRenewalIncrease,
    type PricedLineFacts,
    type RenewalPrice,
} from '@mj-biz-apps/orders-entities';
import { RequireUUID } from './sql-guards.js';
import {
    MultiTermLineMonths,
    ResolveSubscriptionTypeID,
    SubscriptionBehaviorFor,
    SubscriptionTypeRulesFrom,
    type SubscriptionTypeRules,
} from './SubscriptionBehavior.js';
import { SelectRenewalPromotionCodes } from './RenewalPromotions.js';

const ORDER_LINE_ENTITY = 'MJ_BizApps_Orders: Order Lines';
const ORDER_COMPANY_POLICY_ENTITY = 'MJ_BizApps_Orders: Order Company Policies';

/**
 * A subscription and the term that is expiring: everything the pricer and the pass read about it.
 * Dates are `YYYY-MM-DD` (or whatever the driver hands back for a `date` column; read through
 * `new Date(...)` only in UTC day arithmetic).
 */
export interface RenewalSubjectRow {
    SubscriptionID: string;
    SubscriptionNumber: string;
    SubscriptionStatus: string;
    SubscriptionTypeID: string;
    CompanyID: string;
    ProductID: string;
    HolderOrganizationID: string | null;
    BeneficiaryPersonID: string | null;
    SubscriptionRenewalLeadDays: number | null;
    TypeRenewalLeadDays: number | null;
    TermID: string;
    TermNumber: number;
    TermStartDate: string;
    TermEndDate: string;
    /** Seats the expiring term covers (`SubscriptionTerm.Quantity`) — what the renewal buys again. */
    TermQuantity: number;
    OrderLineID: string;
    SubscriptionStartDate: string;
    SubscriptionIncreasePercent: number | null;
    CarryDiscountOnRenewal: boolean;
    /** The renewal card (#289). When set, the renewal is charged on its term start and is due that day. */
    DefaultCustomerPaymentMethodID: string | null;
    /** `Subscription.AutoRenew`: the customer's standing consent to recurring billing. */
    AutoRenew: boolean;
}

/** The line that bought the expiring term, as the pricer reads it. */
export interface RenewalSourceLineRow {
    ID: string;
    OrderHeaderID: string;
    ProductID: string;
    Quantity: number;
    UnitPrice: number;
    DiscountPct: number | null;
    PriceOverridden: boolean;
    ProductPriceID: string | null;
    /** The coverage the line bought, start of its first term to end of its last (golive #338). */
    ServicePeriodStart: string | null;
    ServicePeriodEnd: string | null;
}

/** A product on the subscription's successor chain, the subscription's own product first. */
export interface ChainProductRow {
    ID: string;
    Name: string;
    Status: string;
    ProductCategoryID: string;
    RenewalIncreasePercent: number | null;
    SuccessorProductID: string | null;
    /** The product's subscription type, else its product type's default; null when it sells no subscription. */
    SubscriptionTypeID: string | null;
    ProductTypeID: string | null;
}

/** A promotion code recorded on the line that bought the expiring term. */
export interface RecordedCodeRow {
    PromotionCodeID: string;
    Code: string;
    AppliesToRenewals: boolean;
}

/** What the pricer decided: the product, quantity and price the renewal line is written with. */
export interface PricedRenewal {
    ProductID: string;
    ProductName: string;
    MovesToSuccessor: boolean;
    Quantity: number;
    Price: RenewalPrice;
    /** The months the prior line's price covered, when it bought several terms and was cut to one (golive #338). */
    PriorLineMonths: number | null;
    /** The renewal term, as the confirm will decide it; null when it cannot be decided ahead of the confirm. */
    Term: { Start: string; End: string } | null;
    /** The codes the renewal presents (see `RenewalPromotions.ts`), with their PromotionCode IDs. */
    PromotionCodes: RecordedCodeRow[];
}

export interface RenewalPriceOptions {
    /**
     * The source line, when the caller has already read it (a worklist reads them all in one query).
     * `null` says it was looked for and is gone; absent says the pricer should read it.
     */
    SourceLine?: RenewalSourceLineRow | null;
    /** Read the promotion codes recorded on the source line. Defaults to true; a worklist projection skips them. */
    IncludePromotions?: boolean;
}

/**
 * Why a successor chain cannot be renewed onto, or null when it can (#869).
 *
 * A successor that resolves no subscription type would book the renewal as a plain line with no
 * term, and every later pass would then skip the subscription as already renewed. So the candidate
 * is skipped with this reason instead. The subscription's own product (the first entry) is not
 * checked: it already holds the subscription.
 */
export function NonSubscriptionSuccessorRefusal(chain: ReadonlyArray<Pick<ChainProductRow, 'Name' | 'SubscriptionTypeID'>>): string | null {
    for (let i = 1; i < chain.length; i++) {
        if (chain[i].SubscriptionTypeID) continue;
        return (
            `${chain[i - 1].Name} names ${chain[i].Name} as its successor, but ${chain[i].Name} is not a subscription ` +
            `product (neither it nor its product type has a subscription type), so the renewal cannot be placed on it. ` +
            `Give ${chain[i].Name} a subscription type or change the successor.`
        );
    }
    return null;
}

/** The day after a `YYYY-MM-DD` (or date-like) value, as a UTC-midnight `Date`: where the renewal term starts. */
export function DayAfter(date: string | Date): Date {
    const d = new Date(date);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
}

/** Lead days in force for a subject: its own, else its type's, else 0. */
export function EffectiveLeadDays(subject: Pick<RenewalSubjectRow, 'SubscriptionRenewalLeadDays' | 'TypeRenewalLeadDays'>): number {
    return subject.SubscriptionRenewalLeadDays ?? subject.TypeRenewalLeadDays ?? 0;
}

/** Column list the pricer needs from an order line; shared so a bulk reader returns the same shape. */
export const RENEWAL_SOURCE_LINE_FIELDS = [
    'ID',
    'OrderHeaderID',
    'ProductID',
    'Quantity',
    'UnitPrice',
    'DiscountPct',
    'PriceOverridden',
    'ProductPriceID',
    'ServicePeriodStart',
    'ServicePeriodEnd',
] as const;

/**
 * Prices renewals for one provider and user, caching what rows share.
 *
 * @example
 * ```typescript
 * const pricer = new RenewalPricer(provider, user);
 * const priced = await pricer.Price(subject);          // throws with a reason a person can act on
 * priced.Price.UnitPrice; priced.Term?.Start;
 * ```
 */
export class RenewalPricer {
    private readonly chains = new Map<string, Promise<ChainProductRow[]>>();
    private readonly categoryIncreases = new Map<string, Promise<Array<number | null>>>();
    private readonly companyIncreases = new Map<string, Promise<number | null>>();

    constructor(
        private readonly provider: IMetadataProvider,
        private readonly user: UserInfo,
    ) {}

    /**
     * What the renewal line is written with: product, quantity and price (golive #304).
     *
     * Read-only, so a preview and a worklist run it too. Throws with a reason a person can act on
     * when the renewal cannot be priced; the caller reports that reason on the row.
     */
    public async Price(due: RenewalSubjectRow, options: RenewalPriceOptions = {}): Promise<PricedRenewal> {
        const source = options.SourceLine === undefined ? await this.LoadSourceLine(due.OrderLineID) : options.SourceLine;
        if (!source) {
            throw new Error(
                `The order line that bought term ${due.TermNumber} (${due.OrderLineID}) no longer exists, ` +
                    `so there is no price to renew at.`,
            );
        }

        const chain = await this.loadSuccessorChain(due.ProductID);
        const notSubscription = NonSubscriptionSuccessorRefusal(chain);
        if (notSubscription) throw new Error(notSubscription);
        const product = chain[chain.length - 1];
        const movesToSuccessor = chain.length > 1;
        const quantity = Math.max(1, Number(due.TermQuantity));
        const renewalDay = DayAfter(due.TermEndDate);
        const carry = !!due.CarryDiscountOnRenewal;
        await LoadOrdersEngine(this.provider, this.user);
        const priorLineMonths = this.priorLineMonths(due, source);
        const share = priorLineMonths == null ? 1 : PriorTermShare(priorLineMonths, this.termMonthsOf(due));

        // A list price is resolved only where the rule needs one: the successor's as of the renewal
        // day, or the prior product's as of the prior order when a price typed below it may lapse.
        const successorList = movesToSuccessor
            ? await this.listPrice({ ...source, ProductID: product.ID, Quantity: quantity, UnitPrice: null, ProductPriceID: null }, renewalDay)
            : undefined;
        const priorList =
            !movesToSuccessor && source.PriceOverridden && !carry ? await this.listPrice({ ...source, Quantity: quantity }, null) : null;

        const increase = ResolveRenewalIncrease({
            Subscription: due.SubscriptionIncreasePercent,
            Product: product.RenewalIncreasePercent,
            Categories: await this.loadCategoryIncreases(product.ProductCategoryID),
            Company: await this.loadCompanyIncrease(due.CompanyID),
        });

        let price: RenewalPrice;
        try {
            price = PriceRenewal({
                PriorUnitPrice: Number(source.UnitPrice),
                PriorTermShare: share,
                PriorDiscountPct: source.DiscountPct,
                PriorPriceOverridden: !!source.PriceOverridden,
                PriorListPrice: priorList,
                SuccessorListPrice: successorList,
                CarryDiscount: carry,
                Increase: increase,
                ApplyIncrease: RenewalCrossesAnniversary(due.SubscriptionStartDate, due.TermStartDate, renewalDay),
            });
        } catch (err) {
            throw new Error(
                `${due.SubscriptionNumber} moves to ${product.Name} at renewal, but ` +
                    `${err instanceof Error ? err.message : String(err)}. Add a price for ${product.Name}.`,
            );
        }

        return {
            ProductID: product.ID,
            ProductName: product.Name,
            MovesToSuccessor: movesToSuccessor,
            Quantity: quantity,
            Price: price,
            // Only a typed price is cut (see `PriceRenewal`), so only that one is reported as a share.
            PriorLineMonths: share < 1 && source.PriceOverridden ? priorLineMonths : null,
            Term: this.RenewalTerm(due, product),
            PromotionCodes: options.IncludePromotions === false ? [] : await this.loadRenewalPromotionCodes(source),
        };
    }

    /** The line that bought the expiring term, or null when it is gone. */
    public async LoadSourceLine(orderLineID: string): Promise<RenewalSourceLineRow | null> {
        const lines = await this.LoadSourceLines([orderLineID]);
        return lines.get(orderLineID.toLowerCase()) ?? null;
    }

    /**
     * Several source lines in one read, keyed by lower-cased ID. A worklist prices hundreds of rows;
     * one query per row would be the N+1 the architecture doc warns about.
     */
    public async LoadSourceLines(orderLineIDs: ReadonlyArray<string>): Promise<Map<string, RenewalSourceLineRow>> {
        const out = new Map<string, RenewalSourceLineRow>();
        const ids = [...new Set(orderLineIDs.map((id) => RequireUUID(String(id), 'OrderLineID').toLowerCase()))];
        const rv = new RunView(this.provider as unknown as IRunViewProvider);
        for (let i = 0; i < ids.length; i += 500) {
            const chunk = ids.slice(i, i + 500);
            const result = await rv.RunView<RenewalSourceLineRow>(
                {
                    EntityName: ORDER_LINE_ENTITY,
                    ExtraFilter: `ID IN (${chunk.map((id) => `'${id}'`).join(',')})`,
                    Fields: [...RENEWAL_SOURCE_LINE_FIELDS],
                    ResultType: 'simple',
                    BypassCache: true,
                },
                this.user,
            );
            for (const row of result?.Results ?? []) out.set(String(row.ID).toLowerCase(), row);
        }
        return out;
    }

    /**
     * The term the renewal buys, decided the way the confirm decides it: the renewal product's
     * subscription type and behaviour, continuing the subscription from the day after its latest term.
     * Null when that cannot be decided here (no type, an unregistered driver, a rejection); the
     * confirm then reports the reason itself.
     */
    public RenewalTerm(due: RenewalSubjectRow, product: ChainProductRow): { Start: string; End: string } | null {
        const typeID = ResolveSubscriptionTypeID(
            product.SubscriptionTypeID,
            OrdersEngine.Instance.ProductTypeByID(product.ProductTypeID)?.DefaultSubscriptionTypeID ?? null,
        );
        const rules = this.rulesFor(typeID);
        if (!rules) return null;
        try {
            const holder = { OrganizationID: due.HolderOrganizationID ?? null, PersonID: due.BeneficiaryPersonID ?? null };
            const decision = SubscriptionBehaviorFor(rules).Decide({
                Rules: rules,
                PurchaseDate: DayAfter(due.TermEndDate),
                Amount: 0,
                Existing: {
                    ID: due.SubscriptionID,
                    Status: due.SubscriptionStatus,
                    HolderOrganizationID: holder.OrganizationID,
                    BeneficiaryPersonID: holder.PersonID,
                    LatestTermEnd: new Date(due.TermEndDate),
                    LatestTermNumber: due.TermNumber,
                },
                Subscriber: holder,
                IsRenewal: true,
            });
            const term = decision.Term;
            if (!term) return null;
            return { Start: term.StartDate.toISOString().slice(0, 10), End: term.EndDate.toISOString().slice(0, 10) };
        } catch (err) {
            LogError(`Renewal pricing: ${due.SubscriptionNumber} renewal term not decided: ${err instanceof Error ? err.message : String(err)}`);
            return null;
        }
    }

    /**
     * The months the source line's price covers when that line bought earlier terms too, or null
     * (golive #338). Read from the line's service period, which the confirm sets to the whole coverage.
     */
    private priorLineMonths(due: RenewalSubjectRow, source: RenewalSourceLineRow): number | null {
        const day = (v: string | Date | null) => (v ? new Date(`${new Date(v).toISOString().slice(0, 10)}T00:00:00Z`) : null);
        return MultiTermLineMonths(day(source.ServicePeriodStart), day(source.ServicePeriodEnd), day(due.TermStartDate)!);
    }

    /**
     * The term length of the subscription's own type: the length the confirm split the source line
     * by. Throws when the type cannot be read, since renewing at the whole line's price would bill
     * the customer for every term the line already paid for.
     */
    private termMonthsOf(due: RenewalSubjectRow): number {
        const rules = this.rulesFor(due.SubscriptionTypeID);
        if (!rules) {
            throw new Error(
                `${due.SubscriptionNumber}'s subscription type (${due.SubscriptionTypeID}) was not found, so the share ` +
                    `of its multi-term line one renewal term is worth cannot be worked out.`,
            );
        }
        return SubscriptionBehaviorFor(rules).TermMonths(rules);
    }

    /** A subscription type's rules from the engine cache, or null when the type is not there. */
    private rulesFor(subscriptionTypeID: string | null | undefined): SubscriptionTypeRules | null {
        const cached = OrdersEngine.Instance.SubscriptionTypeByID(subscriptionTypeID);
        return cached ? SubscriptionTypeRulesFrom(cached as unknown as SubscriptionTypeRules) : null;
    }

    /**
     * The codes the renewal presents: those recorded on the line that bought the expiring term whose
     * promotion carries into renewals (#289). A promotion's adjustment rows always name a line; an
     * order-level promotion writes one per line, so the source line's own rows are complete.
     */
    private async loadRenewalPromotionCodes(source: RenewalSourceLineRow): Promise<RecordedCodeRow[]> {
        const orderID = RequireUUID(String(source.OrderHeaderID), 'OrderHeaderID');
        const lineID = RequireUUID(String(source.ID), 'OrderLineID');
        const rows = (await this.sql(`
            SELECT pc.ID AS PromotionCodeID, pc.Code, p.AppliesToRenewals, MIN(oa.Sequence) AS FirstSequence
            FROM __mj_BizAppsOrders.OrderAdjustment oa
            JOIN __mj_BizAppsOrders.PromotionCode pc ON pc.ID = oa.PromotionCodeID
            JOIN __mj_BizAppsOrders.Promotion p ON p.ID = pc.PromotionID
            WHERE oa.OrderHeaderID = '${orderID}'
              AND oa.OrderLineID = '${lineID}'
            GROUP BY pc.ID, pc.Code, p.AppliesToRenewals
            ORDER BY MIN(oa.Sequence), pc.Code
        `)) as RecordedCodeRow[];
        if (!Array.isArray(rows)) return [];
        const keep = new Set(
            SelectRenewalPromotionCodes(rows.map((r) => ({ Code: r.Code, AppliesToRenewals: !!r.AppliesToRenewals }))).map((c) =>
                c.toLowerCase(),
            ),
        );
        const out: RecordedCodeRow[] = [];
        for (const r of rows) {
            if (!keep.delete(String(r.Code).trim().toLowerCase())) continue;
            out.push({ PromotionCodeID: String(r.PromotionCodeID), Code: String(r.Code).trim(), AppliesToRenewals: true });
        }
        return out;
    }

    /**
     * The subscription's product followed along `SuccessorProductID` while the next product is
     * Active: a successor that is still a draft, or already retired, is not one to renew onto.
     * The subscription's own product comes first; the last entry is what the renewal is placed on.
     * Cached per product for the life of the pricer.
     */
    private loadSuccessorChain(productID: string): Promise<ChainProductRow[]> {
        const key = RequireUUID(String(productID), 'ProductID').toLowerCase();
        let pending = this.chains.get(key);
        if (!pending) {
            pending = this.readSuccessorChain(key);
            this.chains.set(key, pending);
            // A read that failed is forgotten, so one transient error does not fail every later row on this product.
            pending.catch(() => this.chains.delete(key));
        }
        return pending;
    }

    private async readSuccessorChain(productID: string): Promise<ChainProductRow[]> {
        const rows = (await this.sql(`
            WITH chain AS (
                SELECT p.ID, p.Name, p.Status, p.ProductCategoryID, p.RenewalIncreasePercent, p.SuccessorProductID,
                       p.SubscriptionTypeID, p.ProductTypeID, 0 AS Depth
                FROM __mj_BizAppsOrders.Product p
                WHERE p.ID = '${productID}'
                UNION ALL
                SELECT n.ID, n.Name, n.Status, n.ProductCategoryID, n.RenewalIncreasePercent, n.SuccessorProductID,
                       n.SubscriptionTypeID, n.ProductTypeID, c.Depth + 1
                FROM chain c
                JOIN __mj_BizAppsOrders.Product n ON n.ID = c.SuccessorProductID
                WHERE c.Depth < 20 AND n.Status = 'Active'
            )
            SELECT c.ID, c.Name, c.Status, c.ProductCategoryID, c.RenewalIncreasePercent, c.SuccessorProductID,
                   COALESCE(p.SubscriptionTypeID, pt.DefaultSubscriptionTypeID) AS SubscriptionTypeID, c.ProductTypeID
            FROM chain c
            JOIN __mj_BizAppsOrders.Product p ON p.ID = c.ID
            LEFT JOIN __mj_BizAppsOrders.ProductType pt ON pt.ID = p.ProductTypeID
            ORDER BY c.Depth
        `)) as ChainProductRow[];
        if (!Array.isArray(rows) || rows.length === 0) {
            throw new Error(`The subscription's product (${productID}) no longer exists, so there is nothing to renew.`);
        }

        // Successors that loop back would otherwise walk to the depth cap; stop at the first repeat.
        const seen = new Set<string>();
        const chain: ChainProductRow[] = [];
        for (const row of rows) {
            const key = String(row.ID).toLowerCase();
            if (seen.has(key)) break;
            seen.add(key);
            chain.push(row);
        }
        return chain;
    }

    /** `RenewalIncreasePercent` of a category and each ancestor, the category itself first. Cached. */
    private loadCategoryIncreases(categoryID: string | null): Promise<Array<number | null>> {
        if (!categoryID) return Promise.resolve([]);
        const key = RequireUUID(String(categoryID), 'ProductCategoryID').toLowerCase();
        let pending = this.categoryIncreases.get(key);
        if (!pending) {
            pending = (async () => {
                const rows = (await this.sql(`
                    WITH chain AS (
                        SELECT c.ID, c.ParentProductCategoryID, c.RenewalIncreasePercent, 0 AS Depth
                        FROM __mj_BizAppsOrders.ProductCategory c
                        WHERE c.ID = '${key}'
                        UNION ALL
                        SELECT p.ID, p.ParentProductCategoryID, p.RenewalIncreasePercent, ch.Depth + 1
                        FROM chain ch
                        JOIN __mj_BizAppsOrders.ProductCategory p ON p.ID = ch.ParentProductCategoryID
                        WHERE ch.Depth < 20
                    )
                    SELECT RenewalIncreasePercent FROM chain ORDER BY Depth
                `)) as Array<{ RenewalIncreasePercent: number | null }>;
                return Array.isArray(rows) ? rows.map((r) => (r.RenewalIncreasePercent == null ? null : Number(r.RenewalIncreasePercent))) : [];
            })();
            this.categoryIncreases.set(key, pending);
            pending.catch(() => this.categoryIncreases.delete(key));
        }
        return pending;
    }

    /** The selling company's `OrderCompanyPolicy.RenewalIncreasePercent`; null when it has no policy row. Cached. */
    private loadCompanyIncrease(companyID: string): Promise<number | null> {
        const key = RequireUUID(String(companyID), 'CompanyID').toLowerCase();
        let pending = this.companyIncreases.get(key);
        if (!pending) {
            pending = (async () => {
                const rv = new RunView(this.provider as unknown as IRunViewProvider);
                const result = await rv.RunView<{ RenewalIncreasePercent: number | null }>(
                    {
                        EntityName: ORDER_COMPANY_POLICY_ENTITY,
                        ExtraFilter: `ID='${key}'`,
                        Fields: ['RenewalIncreasePercent'],
                        ResultType: 'simple',
                        BypassCache: true,
                    },
                    this.user,
                );
                const value = result?.Results?.[0]?.RenewalIncreasePercent;
                return value == null ? null : Number(value);
            })();
            this.companyIncreases.set(key, pending);
            pending.catch(() => this.companyIncreases.delete(key));
        }
        return pending;
    }

    /**
     * What the pricing engine charges for `line`'s product, for the customer on `line`'s order. As of
     * that order's date, or as of `asOf` when given. Null when no rule prices the product.
     */
    private async listPrice(line: PricedLineFacts, asOf: Date | null): Promise<number | null> {
        const ctx = await BuildLinePriceContext(line, this.provider, this.user);
        if (!ctx) return null;
        if (asOf) ctx.AsOf = AsDateValue(asOf) ?? ctx.AsOf;
        const resolved = await ResolvePrice(ctx, this.provider, this.user);
        return resolved ? Number(resolved.UnitPrice) : null;
    }

    private sql(statement: string): Promise<unknown> {
        const db = this.provider as unknown as { ExecuteSQL(sql: string): Promise<unknown> };
        return db.ExecuteSQL(statement);
    }
}
