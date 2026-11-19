/**
 * Unit tests for how an ACCOUNT CREDIT allocation posts.
 *
 * Spending a credit moves a receivable between orders and no cash. The entries used to run through
 * Cash and net to zero there, which is activity on a bank account that no statement shows. These
 * pin the rule that replaced it: the Cash leg sits on the collector's receivable, lines that cancel
 * on one account and tag set are dropped, and an entry with nothing left is not booked.
 *
 * CONNECTS TO:
 *   TESTS: ../PaymentAllocationFactory.ts (AccountCredit, NetOffsettingLines)
 *   AKIN:  ./PaymentAllocation.test.ts (the cash shapes these must leave alone)
 */
import { describe, it, expect } from 'vitest';
import {
    NetOffsettingLines,
    PaymentAllocationFactory,
    type IntercompanyLookup,
    type OrderLineShare,
} from '../PaymentAllocationFactory.js';
import { GL_ROLE } from '../GLAccountResolver.js';

const A = 'company-a';
const B = 'company-b';

const line = (id: string, company: string, amount: number, dims?: OrderLineShare['Dimensions']): OrderLineShare => ({
    OrderLineID: id,
    CompanyID: company,
    Amount: amount,
    ...(dims ? { Dimensions: dims } : {}),
});

const acct = (role: string, company: string) => `${role}@${company}`;
const resolver = {
    Resolve: async (role: string, _p: unknown, _c: unknown, companyID: string) => acct(role, companyID),
} as never;

const intercompany: IntercompanyLookup = (source, target) => ({
    DueToGLAccountID: `dueTo:${source}->${target}`,
    DueFromGLAccountID: `dueFrom:${target}<-${source}`,
});

const factory = () => new PaymentAllocationFactory(resolver, intercompany, 'payment-line-entity');

const ctx = (over: Record<string, unknown> = {}) => ({
    PaymentLineID: 'pl-1',
    PaymentNumber: 'PAY-1',
    OrderNumber: 'ORD-1',
    Amount: 100,
    ReceivingCompanyID: A,
    OrderLines: [line('l1', A, 100)],
    TargetOrderLineID: null,
    PaymentDate: new Date('2026-07-26'),
    IsReversal: false,
    AccountCredit: true,
    ...over,
});

const net = (drafts: Array<{ Lines: Array<{ GLAccountID: string; DebitAmount?: number; CreditAmount?: number }> }>, account: string) =>
    drafts
        .flatMap((d) => d.Lines)
        .filter((l) => l.GLAccountID === account)
        .reduce((s, l) => s + (l.DebitAmount ?? 0) - (l.CreditAmount ?? 0), 0);

const accounts = (drafts: Array<{ Lines: Array<{ GLAccountID: string }> }>) => drafts.flatMap((d) => d.Lines.map((l) => l.GLAccountID));

describe('NetOffsettingLines', () => {
    it('drops a debit and a credit that cancel on one account', () => {
        expect(NetOffsettingLines([
            { GLAccountID: 'ar', DebitAmount: 100, Description: 'd' },
            { GLAccountID: 'ar', CreditAmount: 100, Description: 'c' },
        ])).toEqual([]);
    });

    it('keeps what is left, on the side it is left on', () => {
        expect(NetOffsettingLines([
            { GLAccountID: 'ar', DebitAmount: 100, Description: 'd' },
            { GLAccountID: 'ar', CreditAmount: 40, Description: 'c' },
        ])).toEqual([{ GLAccountID: 'ar', DebitAmount: 60, Description: 'd' }]);
        expect(NetOffsettingLines([
            { GLAccountID: 'ar', DebitAmount: 40, Description: 'd' },
            { GLAccountID: 'ar', CreditAmount: 100, Description: 'c' },
        ])).toEqual([{ GLAccountID: 'ar', CreditAmount: 60, Description: 'd' }]);
    });

    it('does not net lines on one account that carry different tags', () => {
        const east = [{ DimensionID: 'region', DimensionValueID: 'east' }];
        const west = [{ DimensionID: 'region', DimensionValueID: 'west' }];
        const lines = [
            { GLAccountID: 'ar', DebitAmount: 100, Description: 'd', Dimensions: east },
            { GLAccountID: 'ar', CreditAmount: 100, Description: 'c', Dimensions: west },
        ];
        expect(NetOffsettingLines(lines)).toEqual(lines);
    });

    it('leaves lines on different accounts as they were', () => {
        const lines = [
            { GLAccountID: 'ar', DebitAmount: 100, Description: 'd' },
            { GLAccountID: 'due-to', CreditAmount: 100, Description: 'c' },
        ];
        expect(NetOffsettingLines(lines)).toEqual(lines);
    });
});

describe('PaymentAllocationFactory: account credit', () => {
    it('posts nothing when the credit is applied inside one company', async () => {
        const target = await factory().BuildAllocationDrafts(ctx());
        const source = await factory().BuildAllocationDrafts(ctx({ IsReversal: true, Amount: -100 }));
        expect(target.Drafts).toEqual([]);
        expect(source.Drafts).toEqual([]);
        // The split is still reported: the caller's deposit planning reads it.
        expect(target.Shares).toEqual([{ CompanyID: A, Amount: 100 }]);
    });

    it('never resolves or posts to Cash', async () => {
        const asked: string[] = [];
        const spy = {
            Resolve: async (role: string, _p: unknown, _c: unknown, companyID: string) => {
                asked.push(role);
                return acct(role, companyID);
            },
        } as never;
        const f = new PaymentAllocationFactory(spy, intercompany, 'payment-line-entity');
        const crossing = await f.BuildAllocationDrafts(ctx({ OrderLines: [line('l1', B, 100)] }));
        expect(asked).not.toContain(GL_ROLE.Cash);
        expect(accounts(crossing.Drafts)).not.toContain(acct(GL_ROLE.Cash, A));
    });

    it('moves the receivable across companies through the intercompany pair', async () => {
        // The collector is A; the order being settled is wholly B's.
        const { Drafts } = await factory().BuildAllocationDrafts(ctx({ OrderLines: [line('l1', B, 100)] }));
        expect(Drafts).toHaveLength(2);
        expect(net(Drafts, acct(GL_ROLE.AccountsReceivable, A))).toBe(100);
        expect(net(Drafts, `dueTo:${A}->${B}`)).toBe(-100);
        expect(net(Drafts, `dueFrom:${B}<-${A}`)).toBe(100);
        expect(net(Drafts, acct(GL_ROLE.AccountsReceivable, B))).toBe(-100);
        for (const d of Drafts) {
            const dr = d.Lines.reduce((s, l) => s + (l.DebitAmount ?? 0), 0);
            const cr = d.Lines.reduce((s, l) => s + (l.CreditAmount ?? 0), 0);
            expect(dr).toBe(cr);
        }
    });

    it('keeps the deposit a scheduled order holds: receivable to customer deposits', async () => {
        const { Drafts } = await factory().BuildAllocationDrafts(ctx({ Deposits: new Map([[A, 100]]) }));
        expect(Drafts).toHaveLength(1);
        expect(net(Drafts, acct(GL_ROLE.AccountsReceivable, A))).toBe(100);
        expect(net(Drafts, acct(GL_ROLE.CustomerDeposits, A))).toBe(-100);
    });

    it('names what is left a credit, not a payment or a refund', async () => {
        const applied = await factory().BuildAllocationDrafts(ctx({ OrderLines: [line('l1', B, 100)] }));
        const spent = await factory().BuildAllocationDrafts(ctx({ OrderLines: [line('l1', B, 100)], IsReversal: true, Amount: -100 }));
        expect(applied.Drafts[0].Description).toMatch(/^Credit applied PAY-1/);
        expect(spent.Drafts[0].Description).toMatch(/^Credit spent PAY-1/);
        for (const l of [...applied.Drafts, ...spent.Drafts].flatMap((d) => d.Lines)) {
            expect(l.Description).not.toMatch(/Payment|Refund|cash/);
        }
    });

    it('leaves a cash payment exactly as it was: Dr Cash, Cr receivable', async () => {
        const { Drafts } = await factory().BuildAllocationDrafts(ctx({ AccountCredit: false }));
        expect(Drafts).toHaveLength(1);
        expect(net(Drafts, acct(GL_ROLE.Cash, A))).toBe(100);
        expect(net(Drafts, acct(GL_ROLE.AccountsReceivable, A))).toBe(-100);
        expect(Drafts[0].Description).toMatch(/^Payment PAY-1/);
    });
});
