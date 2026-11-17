/**
 * A subscription sold in another currency renews in that currency (golive #492).
 *
 * The pricer starts from the prior line's unit price, which is in the order's currency, and applies
 * the increase to it. List prices are in the functional currency, so a rule that needs one cannot
 * price a foreign renewal: a successor move is refused, and a typed price is not compared with the
 * list. The renewal pass puts each currency on its own order. The pricer's database reads and the
 * group placement are stubbed; booking is the `subscription-renewal` integration bundle.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';

vi.mock('@mj-biz-apps/orders-entities', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@mj-biz-apps/orders-entities')>()),
    LoadOrdersEngine: async () => undefined,
}));

vi.mock('../OrdersSettings.js', () => ({
    OrdersSettings: { Load: async () => undefined, RenewalChargeRetryDays: [3, 7, 11], RenewalAccessCutoffDaysPastDue: 14 },
}));

import { RenewalPricer, type RenewalSourceLineRow, type RenewalSubjectRow } from '../RenewalPricing.js';

const USER = { ID: 'user-1' } as unknown as UserInfo;

const DUE: RenewalSubjectRow = {
    SubscriptionID: 's-1',
    SubscriptionNumber: 'SUB-1',
    SubscriptionStatus: 'Active',
    SubscriptionTypeID: 'type',
    CompanyID: 'co',
    ProductID: 'prod',
    HolderOrganizationID: 'org',
    BeneficiaryPersonID: null,
    SubscriptionRenewalLeadDays: null,
    TypeRenewalLeadDays: 90,
    TermID: 't-1',
    TermNumber: 1,
    TermStartDate: '2026-01-01',
    TermEndDate: '2026-12-31',
    TermQuantity: 1,
    OrderLineID: 'l-1',
    LineFirstTermStartDate: null,
    SubscriptionStartDate: '2026-01-01',
    SubscriptionIncreasePercent: 5,
    CarryDiscountOnRenewal: false,
    DefaultCustomerPaymentMethodID: null,
    AutoRenew: true,
};

const SOURCE: RenewalSourceLineRow = {
    ID: 'l-1',
    OrderHeaderID: 'o-1',
    ProductID: 'prod',
    Quantity: 1,
    UnitPrice: 12600,
    DiscountPct: 0,
    PriceOverridden: true,
    ProductPriceID: null,
    ServicePeriodStart: '2026-01-01',
    ServicePeriodEnd: '2026-12-31',
    CurrencyCode: 'AUD',
    BookingExchangeRate: 0.6543,
};

const PRODUCT = { ID: 'prod', Name: 'Membership', Status: 'Active', ProductCategoryID: 'cat', RenewalIncreasePercent: null, SuccessorProductID: null, SubscriptionTypeID: 'type', ProductTypeID: 'pt' };

let listPrice: ReturnType<typeof vi.fn>;
beforeEach(() => {
    const proto = RenewalPricer.prototype as unknown as Record<string, unknown>;
    vi.spyOn(proto, 'loadSuccessorChain' as never).mockResolvedValue([PRODUCT] as never);
    vi.spyOn(proto, 'loadCategoryIncreases' as never).mockResolvedValue([] as never);
    vi.spyOn(proto, 'loadCompanyIncrease' as never).mockResolvedValue(null as never);
    vi.spyOn(proto, 'priorLineMonths' as never).mockReturnValue(null as never);
    vi.spyOn(proto, 'RenewalTerm' as never).mockReturnValue({ Start: '2027-01-01', End: '2027-12-31' } as never);
    listPrice = vi.fn(async () => 20000);
    vi.spyOn(proto, 'listPrice' as never).mockImplementation(listPrice as never);
});
afterEach(() => vi.restoreAllMocks());

describe('pricing a renewal of a subscription sold in another currency', () => {
    it('starts from the prior unit price in that currency and applies the increase to it', async () => {
        const priced = await new RenewalPricer({} as never, USER).Price(DUE, { SourceLine: SOURCE, IncludePromotions: false });
        expect(priced.CurrencyCode).toBe('AUD');
        expect(priced.ForeignCurrency).toBe(true);
        expect(priced.Price.BaseSource).toBe('PriorPrice');
        expect(priced.Price.UnitPrice).toBe(13230);
        // The typed price is not compared with a functional-currency list price.
        expect(listPrice).not.toHaveBeenCalled();
    });

    it('refuses to move to a successor, whose list price is in the functional currency', async () => {
        vi.spyOn(RenewalPricer.prototype as never, 'loadSuccessorChain' as never).mockResolvedValue(
            [{ ...PRODUCT, SuccessorProductID: 'next' }, { ...PRODUCT, ID: 'next', Name: 'Membership 2027' }] as never,
        );
        await expect(new RenewalPricer({} as never, USER).Price(DUE, { SourceLine: SOURCE, IncludePromotions: false })).rejects.toThrow(
            /billed in AUD and moves to Membership 2027/,
        );
    });

    it('leaves a functional-currency subscription as before: a price typed below list lapses to the list', async () => {
        const priced = await new RenewalPricer({} as never, USER).Price(DUE, {
            SourceLine: { ...SOURCE, CurrencyCode: null, BookingExchangeRate: null },
            IncludePromotions: false,
        });
        expect(priced.CurrencyCode).toBeNull();
        expect(priced.ForeignCurrency).toBe(false);
        expect(priced.Price.BaseSource).toBe('PriorList');
        expect(priced.Price.UnitPrice).toBe(21000);
    });
});

describe('the renewal pass', () => {
    const ID_A = '11111111-1111-1111-1111-111111111111';
    const ID_B = '22222222-2222-2222-2222-222222222222';

    it('puts subscriptions in different currencies on different orders, even for one customer and day', async () => {
        const { SpawnRenewalsOperation } = await import('../SpawnRenewalsOperation.js');
        vi.spyOn(RenewalPricer.prototype, 'Price').mockImplementation(async (due) => ({
            ProductID: due.ProductID,
            ProductName: 'Membership',
            MovesToSuccessor: false,
            Quantity: 1,
            Price: { BasePrice: 100, BaseSource: 'PriorPrice', IncreasePercent: 0, IncreaseSource: 'None', IncreaseSetPercent: 0, IncreaseSetSource: 'None', IncreaseApplied: false, UnitPrice: 100, DiscountPct: 0 },
            PriorLineMonths: null,
            Term: null,
            PromotionCodes: [],
            CurrencyCode: due.SubscriptionNumber === 'SUB-A' ? 'AUD' : null,
            ForeignCurrency: due.SubscriptionNumber === 'SUB-A',
        }));
        const subject = (id: string, number: string) => ({ ...DUE, SubscriptionID: id, SubscriptionNumber: number, TermStatus: 'Active', ProviderSubscriptionID: null, OrderLineID: `line-${number}` });
        const provider = {
            ExecuteSQL: async (q: string) => (/FROM __mj_BizAppsOrders\.Subscription s\b/.test(q) ? [subject(ID_A, 'SUB-A'), subject(ID_B, 'SUB-B')] : []),
        } as unknown as IMetadataProvider;
        type Placer = { placeRenewalGroup(...args: unknown[]): Promise<{ ID: string; Number: string; Promotions: null }> };
        const proto = SpawnRenewalsOperation.prototype as unknown as Placer;
        const original = proto.placeRenewalGroup;
        let n = 0;
        const place = vi.fn(async () => ({ ID: `order-${++n}`, Number: `ORD-${n}`, Promotions: null }));
        proto.placeRenewalGroup = place as unknown as Placer['placeRenewalGroup'];
        try {
            const op = new SpawnRenewalsOperation() as unknown as {
                InternalExecute(i: unknown, p: IMetadataProvider, u: UserInfo): Promise<{ Placed: number; Candidates: Array<Record<string, unknown>> }>;
            };
            const out = await op.InternalExecute({ SubscriptionIDs: [ID_A, ID_B] }, provider, USER);
            expect(out.Placed).toBe(2);
            expect(place).toHaveBeenCalledTimes(2);
            expect(new Set(out.Candidates.map((c) => c['OrderGroup'])).size).toBe(2);
        } finally {
            proto.placeRenewalGroup = original;
        }
    });
});
