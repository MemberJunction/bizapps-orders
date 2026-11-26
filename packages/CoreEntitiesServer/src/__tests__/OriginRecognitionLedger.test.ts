/**
 * A return mirrors what the origin's recognition entries say, not a schedule rebuilt from its product's current
 * recognition type (golive #495). An on-completion line whose product later moved to straight-line holds one
 * release; a return of it takes back that one release, not twelve monthly ones.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OrdersEngine } from '@mj-biz-apps/orders-entities';
import { OrderJournalEntryFactory, type CreditMemoForLine, type OrderLineDraft, type ReversalLedger } from '../OrderJournalEntryFactory.js';
import { HasOriginRecognition, LedgerEarnedThrough, PlanLedgerMirrors, type OriginRecognitionLedger } from '../OriginRecognitionLedger.js';
import type { StagedEntry } from '../TermExtensionPlan.js';
import '../RevenueRecognition.js';

const DEFERRED = 'gl-DeferredRevenue';
const SALES = 'gl-Sales';
const DISCOUNTS = 'gl-SalesDiscounts';
const DIM = [{ DimensionID: 'dim-venture', DimensionValueID: 'v-1' }];

/** An origin release on `iso`: Dr Deferred `amount`, Dr Sales Discounts `discount`, Cr Sales both. */
function release(id: string, iso: string, amount: number, discount = 0, status = 'Pending'): StagedEntry {
    return {
        ID: id,
        EntryNumber: `JE-${id}`,
        EffectiveDate: new Date(`${iso}T00:00:00Z`),
        Status: status,
        JournalEntryBatchID: null,
        Lines: [
            { GLAccountID: DEFERRED, DebitAmount: amount, CreditAmount: null, Description: 'Release deferred — Consulting', Dimensions: DIM },
            ...(discount ? [{ GLAccountID: DISCOUNTS, DebitAmount: discount, CreditAmount: null, Description: 'Discount — Consulting', Dimensions: DIM }] : []),
            { GLAccountID: SALES, DebitAmount: null, CreditAmount: amount + discount, Description: 'Revenue — Consulting', Dimensions: DIM },
        ],
    };
}

/** A mirror of `release`, as an earlier reversal staged it. */
function mirror(id: string, iso: string, amount: number): StagedEntry {
    const r = release(id, iso, amount);
    return { ...r, Lines: r.Lines.map((l) => ({ ...l, DebitAmount: l.CreditAmount, CreditAmount: l.DebitAmount })) };
}

function total(lines: { GLAccountID: string; DebitAmount?: number; CreditAmount?: number }[], account: string, side: 'DebitAmount' | 'CreditAmount'): number {
    return Math.round(lines.filter((l) => l.GLAccountID === account).reduce((t, l) => t + (l[side] ?? 0), 0) * 100) / 100;
}

describe('PlanLedgerMirrors', () => {
    const onCompletion: OriginRecognitionLedger = { Origin: [release('a', '2027-04-30', 90000)], Prior: [] };

    it('mirrors everything left when the whole remainder is returned', () => {
        const mirrors = PlanLedgerMirrors(onCompletion, 1, null);
        expect(mirrors).toHaveLength(1);
        expect(mirrors[0].Date).toBe('2027-04-30');
        expect(total(mirrors[0].Lines, DEFERRED, 'CreditAmount')).toBe(90000);
        expect(total(mirrors[0].Lines, SALES, 'DebitAmount')).toBe(90000);
        expect(mirrors[0].Lines.every((l) => l.Dimensions?.[0]?.DimensionValueID === 'v-1')).toBe(true);
    });

    it('takes its share of each date and keeps every entry balanced to the cent', () => {
        const ledger: OriginRecognitionLedger = { Origin: [release('a', '2026-01-31', 100, 33.33)], Prior: [] };
        const [m] = PlanLedgerMirrors(ledger, 1 / 3, null);
        const debits = m.Lines.reduce((t, l) => t + (l.DebitAmount ?? 0), 0);
        const credits = m.Lines.reduce((t, l) => t + (l.CreditAmount ?? 0), 0);
        expect(Math.round(debits * 100)).toBe(Math.round(credits * 100));
        expect(total(m.Lines, DEFERRED, 'CreditAmount')).toBe(33.33);
    });

    it('nets what earlier reversals already took back', () => {
        const ledger: OriginRecognitionLedger = {
            Origin: [release('a', '2026-01-31', 1000), release('b', '2026-02-28', 1000)],
            Prior: [mirror('p', '2026-02-28', 400)],
        };
        const mirrors = PlanLedgerMirrors(ledger, 1, null);
        expect(mirrors.map((m) => [m.Date, total(m.Lines, DEFERRED, 'CreditAmount')])).toEqual([
            ['2026-01-31', 1000],
            ['2026-02-28', 600],
        ]);
    });

    it('leaves dates on or before `after` alone, and skips voided entries and dates already at zero', () => {
        const ledger: OriginRecognitionLedger = {
            Origin: [release('a', '2026-01-31', 1000), release('b', '2026-02-28', 1000, 0, 'Voided'), release('c', '2026-03-31', 1000)],
            Prior: [mirror('p', '2026-03-31', 1000)],
        };
        expect(PlanLedgerMirrors(ledger, 1, '2026-01-31')).toEqual([]);
        expect(PlanLedgerMirrors(ledger, 1, null).map((m) => m.Date)).toEqual(['2026-01-31']);
    });

    it('reads earned to date from the Deferred Revenue lines, net of earlier mirrors', () => {
        const ledger: OriginRecognitionLedger = {
            Origin: [release('a', '2026-01-31', 1000, 100), release('b', '2026-02-28', 1000, 100), release('c', '2026-03-31', 1000, 100)],
            Prior: [mirror('p', '2026-02-28', 250)],
        };
        expect(LedgerEarnedThrough(ledger, '2026-02-28')).toBe(1750);
        expect(LedgerEarnedThrough(ledger, '2026-01-15')).toBe(0);
    });

    it('has nothing to say for an origin with no staged entries', () => {
        expect(HasOriginRecognition({ Origin: [], Prior: [] })).toBe(false);
        expect(HasOriginRecognition({ Origin: [release('a', '2026-01-31', 1, 0, 'Voided')], Prior: [] })).toBe(false);
        expect(HasOriginRecognition(onCompletion)).toBe(true);
    });
});

describe('a return after the product moved to another recognition type', () => {
    const resolver = { Resolve: async (role: string) => `gl-${role.replace(/ /g, '')}`, TakeResolved: () => [] };
    // The product is straight-line today; the origin was booked on completion and holds one release.
    const PRODUCT = { ID: 'p-1', CompanyID: 'c-1', ProductCategoryID: null, ProductTypeID: 'pt-1', RevenueRecognitionTypeID: 'rr-even', Name: 'Consulting' };
    const EVEN = { ID: 'rr-even', Code: 'EVEN', DriverClass: 'EvenOverTime', IsDeferred: true, ScheduleBasis: 'AtBooking' };
    const ledger: OriginRecognitionLedger = { Origin: [release('a', '2026-12-31', 12000)], Prior: [] };

    const reversal = (quantity: number) =>
        ({
            ID: 'l-rev',
            LineNumber: 1,
            ProductID: 'p-1',
            CompanyID: 'c-1',
            Quantity: quantity,
            UnitPrice: 12000,
            ExtendedAmount: 12000 * quantity,
            DiscountPct: 0,
            DiscountAmount: 0,
            LineTotalNet: 12000 * quantity,
            LineTax: 0,
            ChargeAmount: 0,
            ReversesOrderLineID: 'l-1',
            ServicePeriodStart: '2026-01-01',
            ServicePeriodEnd: '2026-12-31',
            DimensionID: null,
            DimensionValueID: null,
        }) as never;

    async function build(l: never, originLedger?: ReversalLedger, creditMemo?: CreditMemoForLine): Promise<OrderLineDraft[]> {
        const factory = new OrderJournalEntryFactory(resolver as never, 'ol', 'st', 'ct', {} as never, {} as never);
        return factory.BuildDrafts(
            { OrderNumber: 'ORD-2', CompanyID: 'c-1' } as never,
            [l],
            undefined,
            undefined,
            undefined,
            creditMemo ? new Map([['l-rev', creditMemo]]) : undefined,
            originLedger ? new Map([['l-rev', originLedger]]) : undefined,
        );
    }

    beforeEach(() => {
        const proto = OrderJournalEntryFactory.prototype as unknown as Record<string, unknown>;
        vi.spyOn(proto, 'loadProducts' as never).mockResolvedValue(new Map([['p-1', PRODUCT]]) as never);
        vi.spyOn(proto, 'loadGiftCardTypeIDs' as never).mockResolvedValue(new Set() as never);
        vi.spyOn(proto, 'loadRevRecTypes' as never).mockResolvedValue(new Map([['rr-even', EVEN]]) as never);
        vi.spyOn(proto, 'loadLineDimensions' as never).mockResolvedValue(new Map() as never);
        vi.spyOn(proto, 'effectiveDateOf' as never).mockResolvedValue('2026-06-30' as never);
        vi.spyOn(proto, 'chargeCreditsFor' as never).mockResolvedValue([] as never);
        vi.spyOn(OrdersEngine.Instance, 'ProductTypeByID').mockReturnValue(undefined as never);
    });

    afterEach(() => vi.restoreAllMocks());

    it('mirrors the one release the origin holds, not twelve monthly ones', async () => {
        const releases = (await build(reversal(-1), { Ledger: ledger, Fraction: 1 })).filter((d) => !d.IsBooking);
        expect(releases).toHaveLength(1);
        expect(releases[0].Draft.EffectiveDate).toBe('2026-12-31');
        expect(releases[0].Draft.LinkedRecordID).toBe('l-rev');
        expect(total(releases[0].Draft.Lines, DEFERRED, 'CreditAmount')).toBe(12000);
    });

    it('takes back its share of a partial return', async () => {
        const releases = (await build(reversal(-1), { Ledger: ledger, Fraction: 0.25 })).filter((d) => !d.IsBooking);
        expect(total(releases[0].Draft.Lines, DEFERRED, 'CreditAmount')).toBe(3000);
    });

    it('falls back to the current type when the ledger holds nothing for the origin', async () => {
        const releases = (await build(reversal(-1), { Ledger: { Origin: [], Prior: [] }, Fraction: 1 })).filter((d) => !d.IsBooking);
        expect(releases).toHaveLength(12);
    });

    it('measures a scheduled origin\'s earned revenue from the ledger', async () => {
        // On completion: nothing earned by 30 June, so the whole billed amount comes back as the memo.
        const origin: CreditMemoForLine = {
            OriginLineID: 'l-1',
            BilledToDate: 12000,
            RecognizedToDate: 0,
            RemainingQuantity: 1,
            OriginNet: 12000,
            PriorReversals: [],
            ScheduleRows: [{ ID: 's-1', CompanyID: 'c-1', InstallmentNumber: 1, DueDate: '2026-01-01', Status: 'Invoiced', DocumentNumber: 'ORD-1-1' }],
            OriginOrderNumber: 'ORD-1',
            OriginLineNumber: 1,
        };
        const drafts = await build(reversal(-1), { Ledger: ledger, Fraction: 1 }, origin);
        expect(total(drafts.filter((d) => d.IsBooking).flatMap((d) => d.Draft.Lines), DEFERRED, 'DebitAmount')).toBe(12000);
        const releases = drafts.filter((d) => !d.IsBooking);
        expect(releases.map((r) => r.Draft.EffectiveDate)).toEqual(['2026-12-31']);
    });
});
