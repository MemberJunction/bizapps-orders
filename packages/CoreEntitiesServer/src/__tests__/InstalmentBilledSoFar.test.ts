import { describe, expect, it } from 'vitest';

import { ReduceLineAmounts } from '../AmountChangePlan';
import { BilledSoFar, type RecordedBilledPart } from '../InstalmentBilledSoFar';
import { SliceLayout, SliceLayoutParts, TiedSlice } from '../InstalmentInvoiceEntry';

/**
 * #681: an instalment invoice records what it billed each line, part by part, and later invoices slice what
 * each line has left instead of slicing the invoiced rows again against lines an amount change or a return
 * has lowered since.
 */

const A = 'AAAAAAAA-0000-0000-0000-000000000001';
const B = 'BBBBBBBB-0000-0000-0000-000000000002';
const TAX_TYPE = 'DDDDDDDD-0000-0000-0000-000000000004';

type Line = ReturnType<typeof line>;

function line(id: string, net: number, tax = 0) {
    return {
        ID: id,
        Quantity: 1,
        Net: net,
        Tax: tax,
        Charges: 0,
        Gross: net + tax,
        ChargeCredits: tax ? [{ GLAccountID: 'tax-account', Amount: tax, Label: 'Tax', ChargeTypeID: TAX_TYPE }] : [],
    };
}

interface Row {
    ID: string;
    Amount: number;
    DocumentNumber: string | null;
}

const cents = (n: number): number => Math.round(n * 100);

/** Invoice one row the way the operation does: slice against what is left, then record the pieces. */
function invoice(lines: Line[], booked: Line[], rows: Row[], recorded: RecordedBilledPart[], index: number): void {
    const billed = BilledSoFar(lines, booked, rows, recorded);
    const pieces = TiedSlice(lines.map(SliceLayout).flat(), rows.map((r) => r.Amount), index, {
        Amounts: billed,
        Invoiced: rows.map((r) => !!r.DocumentNumber),
    });
    lines.flatMap(SliceLayoutParts).forEach((part, k) => {
        if (pieces[k] !== 0) recorded.push({ ...part, Amount: pieces[k], OrderHeaderPaymentScheduleID: rows[index].ID });
    });
    rows[index].DocumentNumber = `INV-${index + 1}`;
}

/** What the records say each line was billed, net plus tax, in cents. */
function billedByLine(recorded: RecordedBilledPart[]): Map<string, number> {
    const out = new Map<string, number>();
    for (const p of recorded) out.set(p.OrderLineID, (out.get(p.OrderLineID) ?? 0) + cents(p.Amount));
    return out;
}

/** Lower the rows not yet invoiced by `gross`, spread evenly in cents, as an amount change or return does. */
function lowerOpenRows(rows: Row[], gross: number): void {
    const open = rows.filter((r) => !r.DocumentNumber);
    let left = cents(gross);
    open.forEach((r, i) => {
        const take = i === open.length - 1 ? left : Math.round(cents(gross) / open.length);
        r.Amount = (cents(r.Amount) - take) / 100;
        left -= take;
    });
}

describe('BilledSoFar', () => {
    it('reads the recorded pieces, aligned with the slice layout', () => {
        const lines = [line(A, 600, 60), line(B, 600)];
        const rows: Row[] = [{ ID: 'r1', Amount: 330, DocumentNumber: 'INV-1' }, { ID: 'r2', Amount: 930, DocumentNumber: null }];
        const recorded: RecordedBilledPart[] = [
            { OrderHeaderPaymentScheduleID: 'r1', OrderLineID: A, Part: 'Net', ChargeTypeID: null, Amount: 150 },
            { OrderHeaderPaymentScheduleID: 'r1', OrderLineID: A, Part: 'Charge', ChargeTypeID: TAX_TYPE.toLowerCase(), Amount: 15 },
            { OrderHeaderPaymentScheduleID: 'r1', OrderLineID: B.toLowerCase(), Part: 'Net', ChargeTypeID: null, Amount: 165 },
        ];
        expect(BilledSoFar(lines, lines, rows, recorded)).toEqual([150, 0, 15, 165, 0]);
    });

    it('rebuilds a row invoiced before the record existed against the lines as booked', () => {
        const booked = [line(A, 600), line(B, 600)];
        const lowered = [ReduceLineAmounts(booked[0], [{ OrderLineID: A, Net: 225, Tax: 0 }]), booked[1]];
        const rows: Row[] = [
            { ID: 'r1', Amount: 300, DocumentNumber: 'INV-1' },
            { ID: 'r2', Amount: 225, DocumentNumber: null },
            { ID: 'r3', Amount: 225, DocumentNumber: null },
            { ID: 'r4', Amount: 225, DocumentNumber: null },
        ];
        expect(BilledSoFar(lowered, booked, rows, [])).toEqual([150, 0, 150, 0]);
    });

    it('ignores pieces of rows and lines outside the company it is asked about', () => {
        const lines = [line(A, 600)];
        const rows: Row[] = [{ ID: 'r1', Amount: 300, DocumentNumber: 'INV-1' }, { ID: 'r2', Amount: 300, DocumentNumber: null }];
        const recorded: RecordedBilledPart[] = [
            { OrderHeaderPaymentScheduleID: 'r1', OrderLineID: A, Part: 'Net', ChargeTypeID: null, Amount: 300 },
            { OrderHeaderPaymentScheduleID: 'r1', OrderLineID: B, Part: 'Net', ChargeTypeID: null, Amount: 99 },
            { OrderHeaderPaymentScheduleID: 'other', OrderLineID: A, Part: 'Net', ChargeTypeID: null, Amount: 1 },
        ];
        expect(BilledSoFar(lines, lines, rows, recorded)).toEqual([300, 0]);
    });

    it('refuses a part that was billed but that the line no longer carries', () => {
        const lines = [line(A, 600)];
        const rows: Row[] = [{ ID: 'r1', Amount: 330, DocumentNumber: 'INV-1' }];
        const recorded: RecordedBilledPart[] = [
            { OrderHeaderPaymentScheduleID: 'r1', OrderLineID: A, Part: 'Charge', ChargeTypeID: TAX_TYPE, Amount: 30 },
        ];
        expect(() => BilledSoFar(lines, lines, rows, recorded)).toThrow(/no longer carries/);
    });
});

describe('a two-line order billed in four instalments, lowered twice (#681)', () => {
    it('bills each line exactly its lowered amount', () => {
        const booked = [line(A, 600), line(B, 600)];
        const rows: Row[] = [1, 2, 3, 4].map((n) => ({ ID: `r${n}`, Amount: 300, DocumentNumber: null }));
        const recorded: RecordedBilledPart[] = [];
        let lines = booked;

        invoice(lines, booked, rows, recorded, 0);
        expect(billedByLine(recorded).get(A)).toBe(cents(150));

        // Line A lowered by 225 (an amount change or a return).
        lines = [ReduceLineAmounts(booked[0], [{ OrderLineID: A, Net: 225, Tax: 0 }]), booked[1]];
        lowerOpenRows(rows, 225);
        invoice(lines, booked, rows, recorded, 1);

        // Line B lowered by 150 after instalment 2.
        lines = [lines[0], ReduceLineAmounts(booked[1], [{ OrderLineID: B, Net: 150, Tax: 0 }])];
        lowerOpenRows(rows, 150);
        invoice(lines, booked, rows, recorded, 2);
        invoice(lines, booked, rows, recorded, 3);

        const billed = billedByLine(recorded);
        expect(billed.get(A)).toBe(cents(375));
        expect(billed.get(B)).toBe(cents(450));
        // Every invoice still billed exactly its row.
        for (const row of rows) {
            const mine = recorded.filter((p) => p.OrderHeaderPaymentScheduleID === row.ID).reduce((t, p) => t + cents(p.Amount), 0);
            expect(mine).toBe(cents(row.Amount));
        }
    });

    it('slices tax with its line, so the tax account ties to the lowered tax', () => {
        const booked = [line(A, 600, 60), line(B, 600, 60)];
        const rows: Row[] = [1, 2, 3, 4].map((n) => ({ ID: `r${n}`, Amount: 330, DocumentNumber: null }));
        const recorded: RecordedBilledPart[] = [];
        invoice(booked, booked, rows, recorded, 0);

        const lines = [ReduceLineAmounts(booked[0], [{ OrderLineID: A, Net: 225, Tax: 22.5 }]), booked[1]];
        lowerOpenRows(rows, 247.5);
        for (const index of [1, 2, 3]) invoice(lines, booked, rows, recorded, index);

        const tax = (id: string) => recorded.filter((p) => p.OrderLineID === id && p.Part === 'Charge').reduce((t, p) => t + cents(p.Amount), 0);
        expect(tax(A)).toBe(cents(37.5));
        expect(tax(B)).toBe(cents(60));
        expect(billedByLine(recorded).get(A)).toBe(cents(412.5));
    });
});
