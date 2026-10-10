import { describe, expect, it } from 'vitest';
import { PlanAmountChange, PlanReduction, type AmountChangeInput, type ReductionInput, type ReductionInstalment } from '../AmountChangePlan';
import { RevenueRecognitionDriver, type RevRecContext, type RevRecSchedule } from '../RevenueRecognition';
import type { StagedEntry } from '../TermExtensionPlan';

/**
 * #506 (golive #221, case A): lowering a booked term's amount takes the earned share back at once (cumulative
 * catch-up), nets the slices still to come and re-spreads what is left, and takes the reduction off the
 * instalments not yet invoiced before crediting a document already sent.
 */

const DEFERRED = 'AAAAAAAA-0000-0000-0000-000000000001';
const REVENUE = 'AAAAAAAA-0000-0000-0000-000000000002';
const DIM = [{ DimensionID: 'DDDDDDDD-0000-0000-0000-000000000001', DimensionValueID: 'EEEEEEEE-0000-0000-0000-000000000001' }];

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

function release(n: number, iso: string, amount: number, overrides: Partial<StagedEntry> = {}): StagedEntry {
    return {
        ID: `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`,
        EntryNumber: `JE-${String(n).padStart(4, '0')}`,
        EffectiveDate: day(iso),
        Status: 'Pending',
        JournalEntryBatchID: null,
        Lines: [
            { GLAccountID: DEFERRED, DebitAmount: amount, CreditAmount: null, Description: 'Release deferred', Dimensions: DIM },
            { GLAccountID: REVENUE, DebitAmount: null, CreditAmount: amount, Description: 'Revenue', Dimensions: DIM },
        ],
        ...overrides,
    };
}

/** Twelve monthly releases of 100 across 2026: a 1,200 annual term recognised monthly. */
function monthlyYear(): StagedEntry[] {
    return Array.from({ length: 12 }, (_, i) => release(i + 1, `2026-${String(i + 1).padStart(2, '0')}-01`, 100));
}

/** Slices on the first of each month from `start`, so these tests do not depend on the host's time zone. */
class MonthlyDriver extends RevenueRecognitionDriver {
    public constructor(private readonly count: number, private readonly start: string) {
        super();
    }
    public BuildSchedule(context: RevRecContext): RevRecSchedule {
        const [y, m] = this.start.split('-').map(Number);
        const amounts = this.AllocateEvenly(context.Amount, this.count);
        return {
            Entries: amounts.map((amount, i) => {
                const d = new Date(Date.UTC(y, m - 1 + i, 1));
                return { RecognitionDate: d, Amount: amount, PeriodStart: d, PeriodEnd: d };
            }),
        };
    }
}

function input(overrides: Partial<AmountChangeInput> = {}): AmountChangeInput {
    return {
        Entries: monthlyYear(),
        EffectiveDate: day('2026-05-01'),
        TermEndDate: day('2026-12-31'),
        CurrentAmount: 1200,
        NewAmount: 900,
        Driver: new MonthlyDriver(8, '2026-05'),
        PeriodMonths: 1,
        LinkedEntityID: 'FFFFFFFF-0000-0000-0000-000000000001',
        LinkedRecordID: 'FFFFFFFF-0000-0000-0000-000000000002',
        Label: 'term 1 of SUB-000001 reduced to 900.00',
        ProductName: 'Membership',
        ...overrides,
    };
}

function plan(overrides: Partial<AmountChangeInput> = {}) {
    const result = PlanAmountChange(input(overrides));
    if (typeof result === 'string') throw new Error(result);
    return result;
}

const debit = (d: { Lines: Array<{ DebitAmount?: number | null }> }) => d.Lines.reduce((s, l) => s + Number(l.DebitAmount ?? 0), 0);

describe('PlanAmountChange — a 1,200 term cut to 900 with four months earned', () => {
    it('takes back the earned share of the reduction at once', () => {
        const p = plan();
        expect(p.Reduction).toBe(300);
        expect(p.Recognized).toBe(400);
        // 400 of 1,200 earned: a third of the 300 reduction belongs to the past.
        expect(p.CatchUp).toBe(100);
    });

    it('offsets only the slices from the effective date on, each on its own date', () => {
        const p = plan();
        expect(p.Targets.map((t) => t.EntryNumber)).toEqual(['JE-0005', 'JE-0006', 'JE-0007', 'JE-0008', 'JE-0009', 'JE-0010', 'JE-0011', 'JE-0012']);
        expect(p.Offsets.map((o) => o.EffectiveDate)).toEqual(p.Targets.map((t) => t.EffectiveDate.toISOString().slice(0, 10)));
        // A mirror swaps the sides: the deferred account is credited back and revenue debited.
        expect(p.Offsets[0].Lines).toEqual([
            { GLAccountID: DEFERRED, CreditAmount: 100, Description: 'Release deferred', Dimensions: DIM },
            { GLAccountID: REVENUE, DebitAmount: 100, Description: 'Revenue', Dimensions: DIM },
        ]);
        expect(p.Offsets.every((o) => o.EntryType === 'RevenueRecognition')).toBe(true);
    });

    it('re-spreads what is left at the new price: 800 still to come becomes 600', () => {
        const p = plan();
        expect(p.Replaced).toBe(800);
        expect(p.Remaining).toBe(600);
        expect(p.Respread).toHaveLength(8);
        expect(p.Respread.reduce((s, d) => s + debit(d), 0)).toBe(600);
        expect(p.Respread[0].Lines[0]).toMatchObject({ GLAccountID: DEFERRED, DebitAmount: 75, Dimensions: DIM });
        expect(p.Respread[0].Lines[1]).toMatchObject({ GLAccountID: REVENUE, CreditAmount: 75, Dimensions: DIM });
    });

    it('over the whole term, earned plus catch-up plus re-spread comes to the new amount', () => {
        const p = plan();
        expect(p.Recognized - p.CatchUp + p.Remaining).toBe(900);
    });
});

describe('PlanAmountChange — edges', () => {
    it('before anything is earned, there is no catch-up and the whole new amount is re-spread', () => {
        const p = plan({ EffectiveDate: day('2026-01-01'), Driver: new MonthlyDriver(12, '2026-01') });
        expect(p.CatchUp).toBe(0);
        expect(p.Remaining).toBe(900);
        expect(p.Targets).toHaveLength(12);
    });

    it('after the last slice, the whole reduction is catch-up and nothing is re-spread', () => {
        const p = plan({ EffectiveDate: day('2027-01-01') });
        expect(p.CatchUp).toBe(300);
        expect(p.Targets).toHaveLength(0);
        expect(p.Respread).toHaveLength(0);
    });

    it('a term recognised at booking has nothing staged: the whole reduction is catch-up', () => {
        const p = plan({ Entries: [], Driver: null });
        expect(p.CatchUp).toBe(300);
        expect(p.Offsets).toHaveLength(0);
    });

    it('rounds the catch-up to the cent and keeps the re-spread exact', () => {
        // 1,000 over 12 front-loads the remainder: 90.74 then 11 × 82.66. Three earned: 256.06.
        const entries = Array.from({ length: 12 }, (_, i) =>
            release(i + 1, `2026-${String(i + 1).padStart(2, '0')}-01`, i === 0 ? 90.74 : 82.66),
        );
        const p = plan({ Entries: entries, CurrentAmount: 1000, NewAmount: 777.77, EffectiveDate: day('2026-04-01'), Driver: new MonthlyDriver(9, '2026-04') });
        expect(p.Recognized).toBe(256.06);
        expect(p.CatchUp).toBe(56.9); // 222.23 × 256.06 / 1000 = 56.904…
        expect(p.Replaced).toBe(743.94);
        expect(p.Remaining).toBe(578.61); // 743.94 − (222.23 − 56.90)
        expect(Math.round(p.Respread.reduce((s, d) => s + debit(d), 0) * 100) / 100).toBe(p.Remaining);
    });

    it('refuses an increase, a cut to zero, a batched target and a ledger that does not describe the amount', () => {
        expect(PlanAmountChange(input({ NewAmount: 1300 }))).toMatch(/lower than the current 1200\.00/);
        expect(PlanAmountChange(input({ NewAmount: 1200 }))).toMatch(/lower than the current/);
        expect(PlanAmountChange(input({ NewAmount: 0 }))).toMatch(/cancellation/);
        const batched = monthlyYear();
        batched[6] = { ...batched[6], JournalEntryBatchID: 'BBBBBBBB-0000-0000-0000-000000000001' };
        expect(PlanAmountChange(input({ Entries: batched }))).toMatch(/JE-0007 .*already in a journal-entry batch/);
        expect(PlanAmountChange(input({ CurrentAmount: 1250, NewAmount: 900 }))).toMatch(/add up to 1200\.00, not its amount of 1250\.00/);
    });

    it('a batched entry already earned does not block the change', () => {
        const entries = monthlyYear();
        entries[0] = { ...entries[0], Status: 'Posted', JournalEntryBatchID: 'BBBBBBBB-0000-0000-0000-000000000001' };
        expect(typeof PlanAmountChange(input({ Entries: entries }))).toBe('object');
    });
});

// ─── Billing ────────────────────────────────────────────────────────────────

const ID = (n: number) => `11111111-0000-0000-0000-${String(n).padStart(12, '0')}`;

/** Four quarterly instalments of 300: the first two invoiced (the second unpaid), the last two scheduled. */
function quarters(overrides: Partial<Record<number, Partial<ReductionInstalment>>> = {}): ReductionInstalment[] {
    const base: ReductionInstalment[] = [
        { ID: ID(1), InstallmentNumber: 1, DueDate: '2026-01-01', Amount: 300, Balance: 0, Status: 'Paid', DocumentNumber: 'INV-1' },
        { ID: ID(2), InstallmentNumber: 2, DueDate: '2026-04-01', Amount: 300, Balance: 300, Status: 'Invoiced', DocumentNumber: 'INV-2' },
        { ID: ID(3), InstallmentNumber: 3, DueDate: '2026-07-01', Amount: 300, Balance: 300, Status: 'Scheduled', DocumentNumber: null },
        { ID: ID(4), InstallmentNumber: 4, DueDate: '2026-10-01', Amount: 300, Balance: 300, Status: 'Scheduled', DocumentNumber: null },
    ];
    return base.map((row, i) => ({ ...row, ...(overrides[i + 1] ?? {}) }));
}

function reduce(overrides: Partial<ReductionInput>) {
    const result = PlanReduction({ GrossReduction: 330, Instalments: quarters(), OrderBalance: 0, ...overrides });
    if (typeof result === 'string') throw new Error(result);
    return result;
}

describe('PlanReduction — blank: off the instalments not yet invoiced', () => {
    it('spreads pro rata and needs no customer document', () => {
        const r = reduce({});
        expect(r.Instalments.map((c) => [c.InstallmentNumber, c.NewAmount])).toEqual([[3, 135], [4, 135]]);
        expect(r.CreditMemo).toBe(0);
        expect(r.Applied).toEqual([]);
    });

    it('rounds cumulatively, so the pieces sum to the reduction', () => {
        const rows = [3, 4, 5].map((n) => ({ ID: ID(n), InstallmentNumber: n, DueDate: `2026-0${n}-01`, Amount: 100, Balance: 100, Status: 'Scheduled', DocumentNumber: null }));
        const r = reduce({ Instalments: rows, GrossReduction: 100 });
        expect(r.Instalments.map((c) => c.NewAmount)).toEqual([66.67, 66.66, 66.67]);
    });

    it('cancels them all and credits only the excess when the reduction is larger', () => {
        const r = reduce({ GrossReduction: 700 });
        expect(r.Instalments.map((c) => c.NewAmount)).toEqual([0, 0]);
        expect(r.CreditMemo).toBe(100);
        expect(r.OpenCredit).toBe(100);
    });
});

describe('PlanReduction — applies to an invoice', () => {
    it('credits that invoice up to its open amount, and the rest comes off the uninvoiced instalments', () => {
        const r = reduce({ AppliesToInvoiceID: ID(2) });
        expect(r.Applied).toEqual([{ InstalmentID: ID(2), DocumentNumber: 'INV-2', Amount: 300 }]);
        expect(r.Instalments.map((c) => c.NewAmount)).toEqual([285, 285]);
        expect(r.CreditMemo).toBe(300);
    });

    it('a smaller reduction is all credited on that invoice', () => {
        const r = reduce({ AppliesToInvoiceID: ID(2), GrossReduction: 120 });
        expect(r.Applied[0].Amount).toBe(120);
        expect(r.Instalments).toEqual([]);
        expect(r.CreditMemo).toBe(120);
    });

    it('a paid invoice: the credit comes off the next instalment', () => {
        const r = reduce({ AppliesToInvoiceID: ID(1) });
        // 300 of the 330 would have credited INV-1: it cancels instalment 3; the other 30 comes off instalment 4.
        expect(r.Instalments.map((c) => [c.InstallmentNumber, c.NewAmount])).toEqual([[3, 0], [4, 270]]);
        expect(r.CreditMemo).toBe(0);
        expect(r.Refund).toBe(0);
    });

    it('a paid invoice with a refund asked for: that part is refunded', () => {
        const r = reduce({ AppliesToInvoiceID: ID(1), RefundRequested: true });
        expect(r.Refund).toBe(300);
        expect(r.Instalments.map((c) => c.NewAmount)).toEqual([285, 285]);
        expect(r.CreditMemo).toBe(300);
    });

    it('a paid invoice with nothing left to invoice leaves the credit as the customer\'s', () => {
        const rows = quarters({ 3: { Status: 'Paid', Balance: 0, DocumentNumber: 'INV-3' }, 4: { Status: 'Paid', Balance: 0, DocumentNumber: 'INV-4' } });
        const r = reduce({ Instalments: rows, AppliesToInvoiceID: ID(1) });
        expect(r.Instalments).toEqual([]);
        expect(r.CreditMemo).toBe(330);
        expect(r.OpenCredit).toBe(330);
    });

    it('refuses what it cannot apply', () => {
        expect(PlanReduction({ GrossReduction: 330, Instalments: quarters(), OrderBalance: 0, AppliesToInvoiceID: ID(3) })).toMatch(/has not been invoiced/);
        expect(PlanReduction({ GrossReduction: 330, Instalments: quarters(), OrderBalance: 0, AppliesToInvoiceID: ID(9) })).toMatch(/is not one of this term's order's instalments/);
        expect(PlanReduction({ GrossReduction: 330, Instalments: quarters(), OrderBalance: 0, AppliesToInvoiceID: ID(2), RefundRequested: true })).toMatch(/still has 300\.00 open/);
        expect(PlanReduction({ GrossReduction: 330, Instalments: quarters(), OrderBalance: 0, RefundRequested: true })).toMatch(/name it in AppliesToInvoiceID/);
    });
});

describe('PlanReduction — an order billed as a whole', () => {
    it('credits the order, which is the invoice', () => {
        const r = reduce({ Instalments: [], OrderBalance: 500 });
        expect(r.Applied).toEqual([{ InstalmentID: null, DocumentNumber: null, Amount: 330 }]);
        expect(r.CreditMemo).toBe(330);
        expect(r.OpenCredit).toBe(0);
    });

    it('beyond what is still owed, the credit is the customer\'s, or refunded when asked for', () => {
        expect(reduce({ Instalments: [], OrderBalance: 100 })).toMatchObject({ CreditMemo: 330, OpenCredit: 230, Refund: 0 });
        expect(reduce({ Instalments: [], OrderBalance: 100, RefundRequested: true })).toMatchObject({ CreditMemo: 330, OpenCredit: 0, Refund: 230 });
    });

    it('refuses an "applies to invoice", since there are no instalments to name', () => {
        expect(PlanReduction({ GrossReduction: 330, Instalments: [], OrderBalance: 500, AppliesToInvoiceID: ID(1) })).toMatch(/billed as a whole/);
    });
});
