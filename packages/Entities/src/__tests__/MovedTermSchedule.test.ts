import { describe, expect, it } from 'vitest';
import {
    DescribeInstalmentsBeforeMovedTerm,
    ExplainInstalmentsBeforeMovedTerms,
    FindInstalmentsBeforeMovedTerms,
    type MovedTermLine,
    type MovedTermScheduleRow,
} from '../moved-term-schedule';
import { ExplainUnansweredHeldLines, type UnansweredHeldLine } from '../existing-holding';

/**
 * A confirm that adds a line as the next term of a subscription the customer already holds moves the
 * line's dates, but not the order's payment schedule (golive #467). These pin which schedules confirm
 * refuses and what it says.
 */
const moved: MovedTermLine = {
    LineNumber: 1,
    Product: 'Care Plus',
    LineTotalGross: 24000,
    StatedStart: '2026-12-01',
    StatedEnd: '2027-11-30',
    SettledStart: '2027-11-03',
    SettledEnd: '2028-11-02',
};

const quarterly: MovedTermScheduleRow[] = [
    { InstallmentNumber: 1, DueDate: '2026-12-01', Amount: 6000, Status: 'Scheduled' },
    { InstallmentNumber: 2, DueDate: '2027-03-01', Amount: 6000, Status: 'Scheduled' },
    { InstallmentNumber: 3, DueDate: '2027-06-01', Amount: 6000, Status: 'Scheduled' },
    { InstallmentNumber: 4, DueDate: '2027-09-01', Amount: 6000, Status: 'Scheduled' },
];

describe('FindInstalmentsBeforeMovedTerms', () => {
    it('reports every instalment due before the new start when the order has only the moved line', () => {
        const found = FindInstalmentsBeforeMovedTerms(quarterly, [moved], 24000);
        expect(found).toHaveLength(1);
        expect(found[0].Rows.map((r) => r.InstallmentNumber)).toEqual([1, 2, 3, 4]);
    });

    it('passes a schedule that falls within the new term', () => {
        const shifted = quarterly.map((r, i) => ({ ...r, DueDate: ['2027-11-03', '2028-02-03', '2028-05-03', '2028-08-03'][i] }));
        expect(FindInstalmentsBeforeMovedTerms(shifted, [moved], 24000)).toEqual([]);
    });

    it('passes when the line did not move', () => {
        const kept = { ...moved, SettledStart: moved.StatedStart, SettledEnd: moved.StatedEnd };
        expect(FindInstalmentsBeforeMovedTerms(quarterly, [kept], 24000)).toEqual([]);
    });

    it('lets early instalments pay for the other lines of the order', () => {
        const rows: MovedTermScheduleRow[] = [
            { InstallmentNumber: 1, DueDate: '2026-12-01', Amount: 5000, Status: 'Scheduled' },
            { InstallmentNumber: 2, DueDate: '2027-11-03', Amount: 24000, Status: 'Scheduled' },
        ];
        // A $5,000 line that is not a subscription starts now; the moved line is the $24,000.
        expect(FindInstalmentsBeforeMovedTerms(rows, [moved], 29000)).toEqual([]);
        // But not more than they come to.
        const more = [{ ...rows[0], Amount: 6000 }, { ...rows[1], Amount: 23000 }];
        expect(FindInstalmentsBeforeMovedTerms(more, [moved], 29000)).toHaveLength(1);
    });

    it('ignores cancelled instalments', () => {
        const rows = quarterly.map((r) => ({ ...r, Status: 'Canceled' }));
        expect(FindInstalmentsBeforeMovedTerms(rows, [moved], 24000)).toEqual([]);
    });

    it('reads a due date given as a Date', () => {
        const rows = [{ InstallmentNumber: 1, DueDate: new Date('2026-12-01T00:00:00Z'), Amount: 24000, Status: 'Scheduled' }];
        expect(FindInstalmentsBeforeMovedTerms(rows, [moved], 24000)).toHaveLength(1);
    });
});

describe('ExplainInstalmentsBeforeMovedTerms', () => {
    it('names the line, both periods, the instalments and the two ways out', () => {
        const found = FindInstalmentsBeforeMovedTerms(quarterly, [moved], 24000);
        expect(ExplainInstalmentsBeforeMovedTerms('ORD-1', found)).toBe(
            'Order ORD-1 was not confirmed. Line 1 (Care Plus) becomes the next term of a subscription the customer ' +
                'already holds, so it runs 2027-11-03 to 2028-11-02, not 2026-12-01 to 2027-11-30 as entered. ' +
                'Instalments 1, 2, 3 and 4 (due 2026-12-01 to 2027-09-01) fall due before that term starts. ' +
                'Move those instalments into the new term, or choose "New subscription" on the line to keep the dates entered.',
        );
    });

    it('says one instalment in the singular', () => {
        const found = FindInstalmentsBeforeMovedTerms([quarterly[0]], [{ ...moved, StatedEnd: null }], 6000);
        expect(DescribeInstalmentsBeforeMovedTerm(found[0])).toContain(
            'not from 2026-12-01 as entered. Instalment 1 (due 2026-12-01) falls due before that term starts.',
        );
    });
});

describe('ExplainUnansweredHeldLines', () => {
    const line: UnansweredHeldLine = {
        LineID: 'a',
        LineNumber: 2,
        ProductID: 'p',
        Holding: { SubscriptionID: 's', SubscriptionNumber: 'SUB-9', Status: 'Active', LatestTermEnd: new Date('2027-11-02T00:00:00Z') },
    };

    it('names the line, the subscription it would extend and the choice to make', () => {
        expect(ExplainUnansweredHeldLines('ORD-2', [line], () => 'Care Plus')).toBe(
            'Order ORD-2 was not confirmed. Line 2 (Care Plus): the customer already holds SUB-9, covered through ' +
                '2027-11-02. Choose on the line whether it adds the next term to that subscription or starts a new ' +
                'subscription on the dates entered.',
        );
    });

    it('asks for each line when several are open, and copes with an unknown product and coverage end', () => {
        const other = { ...line, LineNumber: 3, Holding: { ...line.Holding, LatestTermEnd: null } };
        const text = ExplainUnansweredHeldLines(null, [line, other], () => null);
        expect(text).toContain('The order was not confirmed. Line 2: the customer already holds SUB-9, covered through 2027-11-02.');
        expect(text).toContain('Line 3: the customer already holds SUB-9. Choose on each line');
    });
});
