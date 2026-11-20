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

describe('FindInstalmentsBeforeMovedTerms boundaries', () => {
    const one = (amount: number, due = '2026-12-01'): MovedTermScheduleRow[] => [
        { InstallmentNumber: 1, DueDate: due, Amount: amount, Status: 'Scheduled' },
    ];

    it('allows up to half a penny of early money beyond what the other lines account for', () => {
        // Threshold: 25000 - 24000 = 1000.
        expect(FindInstalmentsBeforeMovedTerms(one(1000.004), [moved], 25000)).toEqual([]);
        expect(FindInstalmentsBeforeMovedTerms(one(1000.01), [moved], 25000)).toHaveLength(1);
    });

    it('does not report float noise in the sums as early money', () => {
        const rows: MovedTermScheduleRow[] = [
            { InstallmentNumber: 1, DueDate: '2026-12-01', Amount: 0.1, Status: 'Scheduled' },
            { InstallmentNumber: 2, DueDate: '2026-12-01', Amount: 0.2, Status: 'Scheduled' },
        ];
        // 0.1 + 0.2 comes to a hair over 0.3, and 24000.3 - 24000 to a hair under it.
        expect(FindInstalmentsBeforeMovedTerms(rows, [moved], 24000.3)).toEqual([]);
    });

    it('treats a due date on the new start as within the term', () => {
        expect(FindInstalmentsBeforeMovedTerms(one(24000, moved.SettledStart), [moved], 24000)).toEqual([]);
        expect(FindInstalmentsBeforeMovedTerms(one(24000, '2027-11-02'), [moved], 24000)).toHaveLength(1);
    });

    it('does not count a line whose settled start is earlier than its stated one as moved', () => {
        const earlier = { ...moved, SettledStart: '2026-11-01' };
        expect(FindInstalmentsBeforeMovedTerms(one(24000, '2026-10-01'), [earlier], 24000)).toEqual([]);
    });

    it('charges a later-starting moved line against the threshold of an earlier one', () => {
        // Two moved $1,000 lines on a $2,000 order, $500 due before either new start.
        const a = { ...moved, LineNumber: 1, LineTotalGross: 1000, SettledStart: '2027-06-01' };
        const b = { ...moved, LineNumber: 2, LineTotalGross: 1000, SettledStart: '2027-09-01' };
        // Line 1 starts first, so line 2 cannot account for money due before it: line 1 is reported.
        // Line 2 sees line 1's $1,000 as the rest of the order and passes.
        const found = FindInstalmentsBeforeMovedTerms(one(500), [a, b], 2000);
        expect(found.map((f) => f.Line.LineNumber)).toEqual([1]);
        // Tested alone, line 1 would see line 2's gross as the rest of the order and pass.
        expect(FindInstalmentsBeforeMovedTerms(one(500), [a], 2000)).toEqual([]);
        // Starting on the same day, neither can account for the other: both are reported.
        const sameDay = FindInstalmentsBeforeMovedTerms(one(500), [a, { ...b, SettledStart: a.SettledStart }], 2000);
        expect(sameDay.map((f) => f.Line.LineNumber)).toEqual([1, 2]);
    });

    it('does not charge an earlier-starting moved line against a later one', () => {
        // $1,500 due between the two starts: line 1 (from 2027-06-01) is owed none of it beyond
        // line 2's $1,000, and line 2 sees only line 1's $1,000 as the rest of the order.
        const a = { ...moved, LineNumber: 1, LineTotalGross: 1000, SettledStart: '2027-06-01' };
        const b = { ...moved, LineNumber: 2, LineTotalGross: 1000, SettledStart: '2027-09-01' };
        const found = FindInstalmentsBeforeMovedTerms(one(1500, '2027-07-01'), [a, b], 2000);
        expect(found.map((f) => f.Line.LineNumber)).toEqual([2]);
    });

    it('lists the instalments in instalment order, whatever order they arrive in', () => {
        const shuffled = [quarterly[2], quarterly[0], quarterly[3], quarterly[1]];
        const [found] = FindInstalmentsBeforeMovedTerms(shuffled, [moved], 24000);
        expect(found.Rows.map((r) => r.InstallmentNumber)).toEqual([1, 2, 3, 4]);
    });

    it('names an unnumbered instalment with a question mark, first', () => {
        const rows = [quarterly[1], { ...quarterly[0], InstallmentNumber: null }];
        const [found] = FindInstalmentsBeforeMovedTerms(rows, [moved], 24000);
        expect(DescribeInstalmentsBeforeMovedTerm(found)).toContain('Instalments ? and 2 (due 2026-12-01 to 2027-03-01)');
    });
});

describe('ExplainInstalmentsBeforeMovedTerms', () => {
    it('names the line, both periods, the instalments and the two ways out', () => {
        const found = FindInstalmentsBeforeMovedTerms(quarterly, [moved], 24000);
        expect(ExplainInstalmentsBeforeMovedTerms('ORD-1', found)).toBe(
            'Order ORD-1 was not confirmed. Line 1 (Care Plus) becomes the next term of a subscription the customer ' +
                'already holds, so it runs 2027-11-03 to 2028-11-02, not 2026-12-01 to 2027-11-30 as entered. ' +
                'Instalments 1, 2, 3 and 4 (due 2026-12-01 to 2027-09-01) fall due before that term starts. ' +
                'Move those instalments into the new term, or choose "Create new subscription" on the line to keep the dates entered.',
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
