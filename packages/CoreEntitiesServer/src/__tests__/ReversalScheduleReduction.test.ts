import { describe, expect, it } from 'vitest';
import { PlanReduction, ReduceLineAmounts } from '../AmountChangePlan';
import { SliceLayout, TiedSlice } from '../InstalmentInvoiceEntry';
import { ReturnScheduleReduction, SplitReturnReduction, StillToBillByLine, type SlicedInstalment } from '../ReversalScheduleReduction';

/**
 * #661: a partial return against an order billed by instalment takes the returned units' share of what is not
 * yet invoiced off the origin's instalments, and the lowered instalments still tie to the origin's lines read
 * less that reduction.
 */

const A = 'AAAAAAAA-0000-0000-0000-000000000001';
const B = 'BBBBBBBB-0000-0000-0000-000000000002';
const TAX_ACCOUNT = 'CCCCCCCC-0000-0000-0000-000000000003';

function line(id: string, net: number, tax = 0) {
    return {
        ID: id,
        Quantity: 2,
        Net: net,
        Tax: tax,
        Charges: 0,
        Gross: net + tax,
        ChargeCredits: tax ? [{ GLAccountID: TAX_ACCOUNT, Amount: tax, Label: 'Tax' }] : [],
    };
}

function rows(amounts: number[], invoiced: number): SlicedInstalment[] {
    return amounts.map((Amount, i) => ({ Amount, Status: i < invoiced ? 'Invoiced' : 'Scheduled', DocumentNumber: i < invoiced ? `INV-${i + 1}` : null }));
}

describe('StillToBillByLine', () => {
    it('sums the uninvoiced instalments’ slices of each line', () => {
        const still = StillToBillByLine([line(A, 600), line(B, 600)], rows([300, 300, 300, 300], 1));
        expect(still.get(A.toLowerCase())).toEqual({ Net: 450, Tax: 0 });
        expect(still.get(B.toLowerCase())).toEqual({ Net: 450, Tax: 0 });
    });

    it('keeps the tax apart from the net', () => {
        const still = StillToBillByLine([line(A, 600, 60), line(B, 600, 60)], rows([330, 330, 330, 330], 1));
        expect(still.get(A.toLowerCase())).toEqual({ Net: 450, Tax: 45 });
    });

    it('bills nothing more once every instalment is invoiced', () => {
        const still = StillToBillByLine([line(A, 600)], rows([300, 300], 2));
        expect(still.get(A.toLowerCase())).toEqual({ Net: 0, Tax: 0 });
    });
});

describe('ReturnScheduleReduction', () => {
    it('takes the returned units’ share of what is not yet invoiced, not the returned value less the memo', () => {
        // A 600 line, 150 invoiced, 50 earned; half returned. The memo credits 50 of the 75 invoiced for that half.
        // The half kept still owes 300, so the instalments lose 225 of their 450. Returned value less the memo
        // would take 250 and leave the 25 earned on the returned half unbilled.
        expect(ReturnScheduleReduction({ Net: 450, Tax: 0 }, 1, 2)).toBe(225);
    });

    it('includes the tax still to bill', () => {
        expect(ReturnScheduleReduction({ Net: 450, Tax: 45 }, -1, 2)).toBe(247.5);
    });

    it('measures against what is left after earlier returns', () => {
        // 4 of 10 already returned on another order; 3 of the 6 left come back now.
        expect(ReturnScheduleReduction({ Net: 360, Tax: 0 }, 3, 6)).toBe(180);
    });

    it('refuses to return more than is left', () => {
        expect(() => ReturnScheduleReduction({ Net: 450, Tax: 0 }, 3, 2)).toThrow(/left to take back/);
    });
});

describe('SplitReturnReduction', () => {
    it('splits in the origin line’s own proportion', () => {
        expect(SplitReturnReduction(110, { Net: 600, Tax: 60 })).toEqual({ Net: 100, Tax: 10 });
    });

    it('is all net on an untaxed line', () => {
        expect(SplitReturnReduction(225, { Net: 600, Tax: 0 })).toEqual({ Net: 225, Tax: 0 });
    });
});

describe('a partial return on an order billed in four instalments', () => {
    // Two subscription lines billed in four instalments; instalment 1 invoiced; half of line A returned.
    const lines = [line(A, 600, 60), line(B, 600, 60)];
    const schedule = rows([330, 330, 330, 330], 1);
    const gross = ReturnScheduleReduction(StillToBillByLine(lines, schedule).get(A.toLowerCase())!, 1, 2);
    const plan = PlanReduction({
        GrossReduction: gross,
        Instalments: schedule.map((r, i) => ({
            ID: `row-${i + 1}`,
            InstallmentNumber: i + 1,
            DueDate: `2027-0${i + 1}-01`,
            Amount: r.Amount,
            Balance: r.Amount,
            Status: r.Status,
            DocumentNumber: r.DocumentNumber ?? null,
        })),
        OrderBalance: 0,
    });
    if (typeof plan === 'string') throw new Error(plan);
    const lowered = schedule.map((r, i) => plan.Instalments.find((c) => c.ID === `row-${i + 1}`)?.NewAmount ?? r.Amount);
    const split = SplitReturnReduction(gross, { Net: 600, Tax: 60 });
    const reduced = lines.map((l) => ReduceLineAmounts(l, [{ OrderLineID: A, ...split }]));

    it('lowers only the uninvoiced instalments, by the whole reduction', () => {
        expect(gross).toBe(247.5);
        expect(plan.CreditMemo).toBe(0);
        expect(lowered[0]).toBe(330);
        expect(lowered.slice(1).reduce((t, a) => t + a, 0)).toBeCloseTo(990 - 247.5, 2);
    });

    it('still ties, so every remaining instalment can be invoiced', () => {
        const layout = reduced.map(SliceLayout).flat();
        for (let index = 1; index < lowered.length; index++) {
            const pieces = TiedSlice(layout, lowered, index);
            expect(pieces.reduce((t, p) => t + p, 0)).toBeCloseTo(lowered[index], 2);
        }
    });

    it('does not tie when nothing is taken off the lines, which is the refusal the issue reports', () => {
        const layout = lines.map(SliceLayout).flat();
        expect(() => TiedSlice(layout, lowered, 1)).toThrow(/cannot be sliced/);
    });
});
