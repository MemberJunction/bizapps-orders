/**
 * Posting an order in a foreign currency at its booking rate (golive #492).
 *
 * Every entry converts as round2(amount × rate), keeps the order-currency amount, code and rate on
 * the line, balances in functional currency, and keeps every line within accounting's one-cent rule
 * (checked here with accounting's own OriginalCurrencyProblem). A running balance (Deferred Revenue)
 * converts cumulatively, so it empties in functional currency when it empties in the order's.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OriginalCurrencyProblem } from '@mj-biz-apps/accounting-engine-base';
import { OrdersEngine } from '@mj-biz-apps/orders-entities';
import { ConvertDraftsToFunctional, PostingCurrencyOf, ToFunctional, type PostingCurrency } from '../OrderCurrencyPosting.js';
import { OrderJournalEntryFactory, type JEDraft, type JELineDraft, type OrderLineDraft } from '../OrderJournalEntryFactory.js';
import { DecideReversalCurrency } from '../OrderBookingRate.js';
import { DeferredRunningKey, MirrorLine, type StagedEntry } from '../TermExtensionPlan.js';
import { GL_ROLE } from '../GLAccountResolver.js';
import '../RevenueRecognition.js';

const AUD: PostingCurrency = { Code: 'AUD', Rate: 0.6543 };

const cents = (n: number) => Math.round(n * 100);
const debits = (lines: JELineDraft[]) => lines.reduce((t, l) => t + cents(l.DebitAmount ?? 0), 0);
const credits = (lines: JELineDraft[]) => lines.reduce((t, l) => t + cents(l.CreditAmount ?? 0), 0);

function draft(lines: JELineDraft[], description = 'test'): JEDraft {
    return { EffectiveDate: '2026-11-17', EntryType: 'OrderBooking', Description: description, Lines: lines };
}

function expectPostable(d: JEDraft): void {
    expect(debits(d.Lines)).toBe(credits(d.Lines));
    for (const line of d.Lines) expect(OriginalCurrencyProblem(line)).toBeNull();
}

describe('PostingCurrencyOf', () => {
    it('is null for an order in functional currency or one with no booking rate', () => {
        expect(PostingCurrencyOf({ CurrencyCode: null, BookingExchangeRate: null })).toBeNull();
        expect(PostingCurrencyOf({ CurrencyCode: 'USD', BookingExchangeRate: null })).toBeNull();
    });
    it('is the code and rate of an order booked in another currency', () => {
        expect(PostingCurrencyOf({ CurrencyCode: 'aud', BookingExchangeRate: 0.6543 })).toEqual({ Code: 'AUD', Rate: 0.6543 });
    });
    it('refuses a rate that is not positive', () => {
        expect(() => PostingCurrencyOf({ CurrencyCode: 'AUD', BookingExchangeRate: 0 })).toThrow(/not a positive number/);
    });
});

describe('ConvertDraftsToFunctional', () => {
    it('returns the drafts untouched when the order is in functional currency', () => {
        const drafts = [draft([{ GLAccountID: 'ar', DebitAmount: 100 }, { GLAccountID: 'sales', CreditAmount: 100 }])];
        expect(ConvertDraftsToFunctional(drafts, null)).toBe(drafts);
    });

    it('posts round2(amount × rate) and keeps the original amount, code and rate on each line', () => {
        const [out] = ConvertDraftsToFunctional([draft([{ GLAccountID: 'ar', DebitAmount: 13230 }, { GLAccountID: 'deferred', CreditAmount: 13230 }])], AUD);
        expect(out.Lines[0]).toMatchObject({ DebitAmount: 8656.39, OriginalCurrencyCode: 'AUD', OriginalDebitAmount: 13230, ExchangeRateUsed: 0.6543 });
        expect(out.Lines[0].CreditAmount).toBeUndefined();
        expect(out.Lines[1]).toMatchObject({ CreditAmount: 8656.39, OriginalCreditAmount: 13230 });
        expectPostable(out);
    });

    it('puts the rounding cent on one line that stays within the tolerance', () => {
        // 10.01 + 10.01 at 0.5 is 5.005 + 5.005: each credit rounds up to 5.01, the debit 20.02 → 10.01.
        const [out] = ConvertDraftsToFunctional(
            [draft([{ GLAccountID: 'ar', DebitAmount: 20.02 }, { GLAccountID: 'sales', CreditAmount: 10.01 }, { GLAccountID: 'tax', CreditAmount: 10.01 }])],
            { Code: 'AUD', Rate: 0.5 },
        );
        expectPostable(out);
        expect(out.Lines[0].DebitAmount).toBe(10.01);
        expect(cents(out.Lines[1].CreditAmount ?? 0) + cents(out.Lines[2].CreditAmount ?? 0)).toBe(1001);
    });

    it('balances and stays within the tolerance for any entry and rate (random sample)', () => {
        let seed = 492;
        const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
        for (let n = 0; n < 2000; n++) {
            const rate = Number((0.004 + rand() * 4).toFixed(8));
            const count = 1 + Math.floor(rand() * 5);
            const credits: number[] = Array.from({ length: count }, () => Math.round(100 + rand() * 1_000_000) / 100);
            const debitSplit = 1 + Math.floor(rand() * 3);
            const total = credits.reduce((t, c) => t + Math.round(c * 100), 0);
            const debitsCents: number[] = [];
            let left = total;
            for (let i = 0; i < debitSplit - 1; i++) {
                const piece = Math.max(1, Math.floor(left * rand() * 0.5));
                debitsCents.push(piece);
                left -= piece;
            }
            debitsCents.push(left);
            const lines: JELineDraft[] = [
                ...debitsCents.map((c, i) => ({ GLAccountID: `d${i}`, DebitAmount: c / 100 })),
                ...credits.map((c, i) => ({ GLAccountID: `c${i}`, CreditAmount: c })),
            ];
            const [out] = ConvertDraftsToFunctional([draft(lines)], { Code: 'AUD', Rate: rate });
            expectPostable(out);
        }
    });

    it('converts a running balance cumulatively, so Deferred empties exactly in functional currency', () => {
        const releases = [83.33, 83.33, 83.33, 83.33, 83.33, 83.33, 83.33, 83.33, 83.33, 83.33, 83.33, 83.37];
        const drafts = [
            draft([{ GLAccountID: 'ar', DebitAmount: 1000 }, { GLAccountID: 'deferred', CreditAmount: 1000 }], 'booking'),
            ...releases.map((r, i) =>
                draft([{ GLAccountID: 'deferred', DebitAmount: r }, { GLAccountID: 'sales', CreditAmount: r }], `release ${i + 1}`),
            ),
        ];
        const out = ConvertDraftsToFunctional(drafts, AUD, { RunningKey: (l) => (l.GLAccountID === 'deferred' ? 'deferred' : null) });
        for (const d of out) expectPostable(d);
        const deferred = out.flatMap((d) => d.Lines).filter((l) => l.GLAccountID === 'deferred');
        expect(credits(deferred) - debits(deferred)).toBe(0);
        expect(credits(deferred)).toBe(cents(ToFunctional(1000, AUD)));
    });

    it('releases with a discount share stay within the tolerance', () => {
        const drafts = [
            draft([{ GLAccountID: 'ar', DebitAmount: 9000 }, { GLAccountID: 'deferred', CreditAmount: 9000 }]),
            ...Array.from({ length: 7 }, (_, i) =>
                draft([
                    { GLAccountID: 'deferred', DebitAmount: i < 6 ? 1285.71 : 1285.74 },
                    { GLAccountID: 'discount', DebitAmount: i < 6 ? 142.86 : 142.84 },
                    { GLAccountID: 'sales', CreditAmount: i < 6 ? 1428.57 : 1428.58 },
                ]),
            ),
        ];
        for (const rate of [0.6543, 1.2345, 3.2711, 0.00671234, 0.5]) {
            const out = ConvertDraftsToFunctional(drafts, { Code: 'AUD', Rate: rate }, { RunningKey: (l) => (l.GLAccountID === 'deferred' ? 'k' : null) });
            for (const d of out) expectPostable(d);
            const deferred = out.flatMap((d) => d.Lines).filter((l) => l.GLAccountID === 'deferred');
            expect(credits(deferred) - debits(deferred)).toBe(0);
        }
    });

    it('starts a running balance where RunningStart says it stands', () => {
        // 600 of 1,000 already released; this releases the last 400 and must leave exactly zero.
        const [out] = ConvertDraftsToFunctional(
            [draft([{ GLAccountID: 'deferred', DebitAmount: 400 }, { GLAccountID: 'sales', CreditAmount: 400 }])],
            AUD,
            { RunningKey: (l) => (l.GLAccountID === 'deferred' ? 'k' : null), RunningStart: () => 400 },
        );
        expect(out.Lines[0].DebitAmount).toBe(ToFunctional(400, AUD));
        expectPostable(out);
    });

    it('keeps a line that is already converted exactly as it is', () => {
        const mirrored: JELineDraft = { GLAccountID: 'deferred', CreditAmount: 54.53, OriginalCurrencyCode: 'AUD', OriginalCreditAmount: 83.33, ExchangeRateUsed: 0.6543 };
        const [out] = ConvertDraftsToFunctional([draft([mirrored, { GLAccountID: 'sales', DebitAmount: 54.53, OriginalCurrencyCode: 'AUD', OriginalDebitAmount: 83.33, ExchangeRateUsed: 0.6543 }])], AUD);
        expect(out.Lines[0]).toEqual(mirrored);
    });

    it('refuses an entry that comes to less than a cent in functional currency', () => {
        expect(() =>
            ConvertDraftsToFunctional([draft([{ GLAccountID: 'ar', DebitAmount: 0.01 }, { GLAccountID: 'sales', CreditAmount: 0.01 }])], { Code: 'JPY', Rate: 0.0067 }),
        ).toThrow(/less than a cent/);
    });
});

describe('MirrorLine of a line posted from another currency', () => {
    it('mirrors the functional and original amounts as posted', () => {
        const mirror = MirrorLine({
            GLAccountID: 'deferred',
            DebitAmount: 83.33,
            CreditAmount: null,
            Description: 'Release',
            Dimensions: [],
            Posted: { DebitAmount: 54.52, CreditAmount: null, OriginalCurrencyCode: 'AUD', ExchangeRateUsed: 0.6543 },
        });
        expect(mirror).toEqual({
            GLAccountID: 'deferred',
            Description: 'Release',
            CreditAmount: 54.52,
            OriginalCurrencyCode: 'AUD',
            OriginalCreditAmount: 83.33,
            ExchangeRateUsed: 0.6543,
        });
    });
});

describe('DeferredRunningKey', () => {
    it('keys the account the staged releases debit', () => {
        const entries: StagedEntry[] = [
            {
                ID: 'e1', EntryNumber: 'JE-1', EffectiveDate: new Date('2026-01-31'), Status: 'Pending', JournalEntryBatchID: null,
                Lines: [
                    { GLAccountID: 'DEF', DebitAmount: 100, CreditAmount: null, Description: null, Dimensions: [] },
                    { GLAccountID: 'rev', DebitAmount: null, CreditAmount: 100, Description: null, Dimensions: [] },
                ],
            },
        ];
        const key = DeferredRunningKey(entries);
        expect(key({ GLAccountID: 'def' })).toBe('deferred');
        expect(key({ GLAccountID: 'rev' })).toBeNull();
        expect(DeferredRunningKey([])({ GLAccountID: 'def' })).toBeNull();
    });
});

describe('DecideReversalCurrency', () => {
    const origin = { OrderNumber: 'ORD-1', CurrencyCode: 'AUD', BookingExchangeRate: 0.6543, BookingRateDate: '2026-11-01' };
    it('does nothing for an order that reverses nothing', () => {
        expect(DecideReversalCurrency({ OrderNumber: 'R-1', CurrencyCode: null }, [])).toEqual({ Kind: 'None' });
    });
    it('takes the origin currency and booking rate', () => {
        expect(DecideReversalCurrency({ OrderNumber: 'R-1', CurrencyCode: null }, [origin])).toEqual({
            Kind: 'Inherit', CurrencyCode: 'AUD', Rate: 0.6543, RateDate: '2026-11-01',
        });
    });
    it('keeps a reversal of a functional-currency order in functional currency', () => {
        expect(DecideReversalCurrency({ OrderNumber: 'R-1', CurrencyCode: null }, [{ ...origin, CurrencyCode: null, BookingExchangeRate: null, BookingRateDate: null }])).toEqual({
            Kind: 'Inherit', CurrencyCode: null, Rate: null, RateDate: null,
        });
    });
    it('refuses a reversal stated in another currency than its origin', () => {
        const d = DecideReversalCurrency({ OrderNumber: 'R-1', CurrencyCode: 'GBP' }, [origin]);
        expect(d.Kind).toBe('Refused');
    });
    it('refuses reversing orders booked at different rates on one order', () => {
        const d = DecideReversalCurrency({ OrderNumber: 'R-1', CurrencyCode: null }, [origin, { ...origin, OrderNumber: 'ORD-2', BookingExchangeRate: 0.66 }]);
        expect(d.Kind).toBe('Refused');
    });
});

describe('the booking factory on an order in another currency', () => {
    const PRODUCT = { ID: 'p-1', CompanyID: 'c-1', ProductCategoryID: null, ProductTypeID: 'pt-1', RevenueRecognitionTypeID: 'rr-1', Name: 'Membership' };
    const EVEN = { ID: 'rr-1', Code: 'EVEN', DriverClass: 'EvenOverTime', IsDeferred: true, ScheduleBasis: 'AtBooking' };
    const resolver = { Resolve: async (role: string) => `gl-${role.replace(/ /g, '')}`, TakeResolved: () => [] };

    beforeEach(() => {
        const proto = OrderJournalEntryFactory.prototype as unknown as Record<string, unknown>;
        vi.spyOn(proto, 'loadProducts' as never).mockResolvedValue(new Map([['p-1', PRODUCT]]) as never);
        vi.spyOn(proto, 'loadGiftCardTypeIDs' as never).mockResolvedValue(new Set() as never);
        vi.spyOn(proto, 'loadRevRecTypes' as never).mockResolvedValue(new Map([['rr-1', EVEN]]) as never);
        vi.spyOn(proto, 'loadLineDimensions' as never).mockResolvedValue(new Map() as never);
        vi.spyOn(proto, 'effectiveDateOf' as never).mockResolvedValue('2026-01-01' as never);
        vi.spyOn(proto, 'chargeCreditsFor' as never).mockResolvedValue([] as never);
        vi.spyOn(OrdersEngine.Instance, 'ProductTypeByID').mockReturnValue(undefined as never);
    });
    afterEach(() => vi.restoreAllMocks());

    async function build(order: Record<string, unknown>, overrides: Record<string, unknown> = {}): Promise<OrderLineDraft[]> {
        const factory = new OrderJournalEntryFactory(resolver as never, 'ol', 'st', 'ct', {} as never, {} as never);
        const l = {
            ID: 'l-1', LineNumber: 1, ProductID: 'p-1', CompanyID: 'c-1', Quantity: 1, UnitPrice: 13230, ExtendedAmount: 13230,
            DiscountPct: 0.1, DiscountAmount: 0, LineTotalNet: 11907, LineTax: 0, ChargeAmount: 0,
            ServicePeriodStart: '2026-01-01', ServicePeriodEnd: '2026-12-31', DimensionID: null, DimensionValueID: null, ...overrides,
        } as never;
        return factory.BuildDrafts({ OrderNumber: 'ORD-1', CompanyID: 'c-1', ...order } as never, [l]);
    }

    it('books the functional amounts at the booking rate and Deferred empties exactly over the term', async () => {
        const drafts = await build({ CurrencyCode: 'AUD', BookingExchangeRate: 0.6543 });
        expect(drafts).toHaveLength(13);
        for (const d of drafts) expectPostable(d.Draft);
        const lines = drafts.flatMap((d) => d.Draft.Lines);
        const deferred = lines.filter((l) => l.GLAccountID === `gl-${GL_ROLE.DeferredRevenue.replace(/ /g, '')}`);
        expect(credits(deferred)).toBe(cents(ToFunctional(11907, AUD)));
        expect(credits(deferred) - debits(deferred)).toBe(0);
        expect(lines.every((l) => l.OriginalCurrencyCode === 'AUD' && l.ExchangeRateUsed === 0.6543)).toBe(true);
    });

    it('mirrors a reversal at the same rate, so a full return gives back exactly what was booked', async () => {
        const sold = await build({ CurrencyCode: 'AUD', BookingExchangeRate: 0.6543 });
        const returned = await build(
            { CurrencyCode: 'AUD', BookingExchangeRate: 0.6543 },
            { ID: 'l-2', Quantity: -1, ExtendedAmount: -13230, LineTotalNet: -11907 },
        );
        const net = (ds: OrderLineDraft[], account: string) => {
            const ls = ds.flatMap((d) => d.Draft.Lines).filter((l) => l.GLAccountID === account);
            return debits(ls) - credits(ls);
        };
        for (const account of ['gl-AccountsReceivable', 'gl-DeferredRevenue', 'gl-Sales', 'gl-SalesDiscounts']) {
            expect(net(sold, account) + net(returned, account)).toBe(0);
        }
    });

    it('leaves a functional-currency order exactly as before', async () => {
        const drafts = await build({ CurrencyCode: null, BookingExchangeRate: null });
        expect(drafts.flatMap((d) => d.Draft.Lines).some((l) => l.OriginalCurrencyCode !== undefined)).toBe(false);
        expect(drafts[0].Draft.Lines[0].DebitAmount).toBe(11907);
    });
});
