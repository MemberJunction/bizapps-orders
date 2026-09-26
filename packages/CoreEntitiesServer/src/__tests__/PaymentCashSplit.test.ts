/**
 * Cash against a scheduled order divides between receivable and deposit (D91).
 *
 * The arithmetic lives here rather than in the factory's tests because it is the part with money in
 * it: getting `Receivable` wrong either drives AR negative on a customer who has been billed
 * nothing, or hides a real receivable inside a deposit.
 */
import { describe, expect, it } from 'vitest';
import {
    ConsumeReceivable,
    DepositReleasedByCompany,
    HeldDeposit,
    PlanLineDeposits,
    SplitCashForCompany,
    type InstalmentCashFacts,
} from '../PaymentScheduleBehavior.js';

const CO_A = '11111111-1111-1111-1111-111111111111';
const CO_B = '22222222-2222-2222-2222-222222222222';

const row = (over: Partial<InstalmentCashFacts> & { ID: string }): InstalmentCashFacts => ({
    CompanyID: CO_A,
    Status: 'Scheduled',
    Amount: 100,
    AmountPaid: 0,
    DocumentNumber: null,
    ...over,
});

const invoiced = (id: string, amount: number, paid = 0): InstalmentCashFacts =>
    row({ ID: id, Amount: amount, AmountPaid: paid, Status: paid >= amount ? 'Paid' : 'Invoiced', DocumentNumber: `ORD-1-${id}` });

describe('SplitCashForCompany', () => {
    it('an order with no schedule is all receivable — the entry every order books today', () => {
        expect(SplitCashForCompany(250, CO_A, [])).toEqual({ Receivable: 250, Deposit: 0 });
    });

    it('a company with no rows of its own on a scheduled order is also all receivable', () => {
        expect(SplitCashForCompany(250, CO_B, [invoiced('1', 100)])).toEqual({ Receivable: 250, Deposit: 0 });
    });

    it('cash with nothing invoiced yet is entirely a deposit', () => {
        const rows = [row({ ID: '1' }), row({ ID: '2', Amount: 200 })];
        expect(SplitCashForCompany(120, CO_A, rows)).toEqual({ Receivable: 0, Deposit: 120 });
    });

    it('settles the invoiced instalments first and holds the rest as a deposit', () => {
        const rows = [invoiced('1', 100), row({ ID: '2', Amount: 200 })];
        expect(SplitCashForCompany(150, CO_A, rows)).toEqual({ Receivable: 100, Deposit: 50 });
    });

    it('counts only what is still unpaid on an invoiced row', () => {
        const rows = [invoiced('1', 100, 40), row({ ID: '2', Amount: 200 })];
        expect(SplitCashForCompany(150, CO_A, rows)).toEqual({ Receivable: 60, Deposit: 90 });
    });

    it('a fully paid invoice contributes nothing', () => {
        expect(SplitCashForCompany(50, CO_A, [invoiced('1', 100, 100)])).toEqual({ Receivable: 0, Deposit: 50 });
    });

    it('cash short of the invoiced total leaves no deposit', () => {
        expect(SplitCashForCompany(30, CO_A, [invoiced('1', 100)])).toEqual({ Receivable: 30, Deposit: 0 });
    });

    it('naming a Scheduled instalment makes the whole payment a deposit, however much is owed elsewhere', () => {
        const rows = [invoiced('1', 100), row({ ID: '2', Amount: 200 })];
        expect(SplitCashForCompany(150, CO_A, rows, '2')).toEqual({ Receivable: 0, Deposit: 150 });
    });

    it('naming an Invoiced instalment settles it and deposits the overpayment', () => {
        const rows = [invoiced('1', 100), invoiced('2', 200)];
        expect(SplitCashForCompany(150, CO_A, rows, '1')).toEqual({ Receivable: 100, Deposit: 50 });
    });

    it('is case-insensitive on ids, like every other key comparison here', () => {
        const rows = [invoiced('AB', 100)];
        expect(SplitCashForCompany(40, CO_A.toUpperCase(), rows, 'ab')).toEqual({ Receivable: 40, Deposit: 0 });
    });

    it('ignores a Canceled row — it bills nothing and absorbs nothing', () => {
        const rows = [row({ ID: '1', Status: 'Canceled', DocumentNumber: 'ORD-1-1' })];
        expect(SplitCashForCompany(80, CO_A, rows)).toEqual({ Receivable: 80, Deposit: 0 });
    });

    it('keeps the two halves summing to the share, to the penny', () => {
        const rows = [invoiced('1', 33.33), row({ ID: '2', Amount: 66.67 })];
        const split = SplitCashForCompany(50.01, CO_A, rows);
        expect(split.Receivable + split.Deposit).toBeCloseTo(50.01, 10);
        expect(split).toEqual({ Receivable: 33.33, Deposit: 16.68 });
    });
});

describe('ConsumeReceivable', () => {
    it('charges the settled amount against billed rows so the next line sees what is left', () => {
        const rows = [invoiced('1', 100), invoiced('2', 200)];
        const after = ConsumeReceivable(rows, CO_A, 150);
        expect(after.map((r) => r.AmountPaid)).toEqual([100, 50]);
        expect(SplitCashForCompany(100, CO_A, after)).toEqual({ Receivable: 100, Deposit: 0 });
    });

    it('never touches an unbilled row, another company, or more than the row can hold', () => {
        const rows = [row({ ID: '1' }), invoiced('2', 50), row({ ID: '3', CompanyID: CO_B, DocumentNumber: 'X' })];
        const after = ConsumeReceivable(rows, CO_A, 500);
        expect(after.map((r) => r.AmountPaid)).toEqual([0, 50, 0]);
    });

    it('returns the rows untouched when nothing was settled', () => {
        const rows = [invoiced('1', 100)];
        expect(ConsumeReceivable(rows, CO_A, 0)).toEqual(rows);
    });
});

describe('ConsumeReceivable with a named row (#234 review, item 3)', () => {
    it('charges the named row, not the oldest billed one', () => {
        const rows = [invoiced('1', 100), invoiced('2', 200)];
        const after = ConsumeReceivable(rows, CO_A, 200, '2');
        expect(after.map((r) => r.AmountPaid)).toEqual([0, 200]);
        // …so a second line naming instalment 1 still finds its invoice open.
        expect(SplitCashForCompany(100, CO_A, after, '1')).toEqual({ Receivable: 100, Deposit: 0 });
    });

    it('a name that is not one of this company’s rows falls back to billed-rows-first', () => {
        const rows = [invoiced('1', 100), invoiced('2', 200)];
        expect(ConsumeReceivable(rows, CO_A, 150, 'elsewhere').map((r) => r.AmountPaid)).toEqual([100, 50]);
    });
});

describe('HeldDeposit', () => {
    it('counts all of an unbilled row’s cash and only the overpayment on a billed one', () => {
        const rows = [invoiced('1', 100, 130), row({ ID: '2', Amount: 200, AmountPaid: 50 })];
        expect(HeldDeposit(rows, CO_A)).toBe(80);
    });

    it('ignores other companies and canceled rows', () => {
        const rows = [row({ ID: '1', AmountPaid: 40, CompanyID: CO_B }), row({ ID: '2', AmountPaid: 40, Status: 'Canceled' })];
        expect(HeldDeposit(rows, CO_A)).toBe(0);
    });
});

describe('DepositReleasedByCompany', () => {
    it('PM2 refunded: the 50 held on instalment 2 is released', () => {
        const before = [invoiced('1', 100, 100), row({ ID: '2', Amount: 200, AmountPaid: 50 })];
        const after = [invoiced('1', 100, 0), row({ ID: '2', Amount: 200, AmountPaid: 0 })];
        expect(DepositReleasedByCompany(before, after).get(CO_A)).toBe(50);
    });

    it('issuing a later row the cascade then fills releases the deposit that moved onto it', () => {
        // 100 of unnamed cash sat on instalment 1 (earlier, unbilled); instalment 2 is issued and the
        // billed-first cascade moves the 100 onto it.
        const before = [row({ ID: '1', AmountPaid: 100 }), row({ ID: '2', Amount: 200 })];
        const after = [row({ ID: '1' }), invoiced('2', 200, 100)];
        expect(DepositReleasedByCompany(before, after).get(CO_A)).toBe(100);
    });

    it('never goes negative', () => {
        const before = [row({ ID: '1' })];
        const after = [row({ ID: '1', AmountPaid: 30 })];
        expect(DepositReleasedByCompany(before, after).get(CO_A)).toBe(0);
    });
});

describe('PlanLineDeposits', () => {
    const empty = { Facts: [] as InstalmentCashFacts[], Released: new Map<string, number>() };

    it('an unscheduled order plans no deposit at all', () => {
        const plan = PlanLineDeposits([{ CompanyID: CO_A, Amount: 300 }], false, null, empty);
        expect(plan.Deposits.size).toBe(0);
    });

    it('capture: two lines against one invoice do not both settle it', () => {
        const start = { Facts: [invoiced('1', 100), row({ ID: '2', Amount: 200 })], Released: new Map<string, number>() };
        const first = PlanLineDeposits([{ CompanyID: CO_A, Amount: 100 }], false, null, start);
        expect(first.Deposits.get(CO_A)).toBeUndefined();
        const second = PlanLineDeposits([{ CompanyID: CO_A, Amount: 100 }], false, null, first.Working);
        expect(second.Deposits.get(CO_A)).toBe(100);
    });

    it('reversal: draws on what the refund released, deposit first, then AR', () => {
        const start = { Facts: [], Released: new Map([[CO_A, 50]]) };
        const plan = PlanLineDeposits([{ CompanyID: CO_A, Amount: 150 }], true, null, start);
        expect(plan.Deposits.get(CO_A)).toBe(50);
        expect(plan.Working.Released.get(CO_A)).toBe(0);
        // A second refund line finds nothing left to release, so it is all AR.
        expect(PlanLineDeposits([{ CompanyID: CO_A, Amount: 20 }], true, null, plan.Working).Deposits.size).toBe(0);
    });

    it('keys the map by lower-cased company id, as the factory reads it', () => {
        const start = { Facts: [row({ ID: '1' })], Released: new Map<string, number>() };
        const plan = PlanLineDeposits([{ CompanyID: CO_A.toUpperCase(), Amount: 60 }], false, null, start);
        expect(plan.Deposits.get(CO_A)).toBe(60);
    });
});
