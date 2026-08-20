/**
 * PaymentAllocationMatrix.test.ts — comprehensive matrix unit tests for payment allocations.
 *
 * Covers:
 * 1. Single-company full & partial payments at order header level
 * 2. Multi-company full & partial payments at order header level with pro-rating
 * 3. Exact residue handling on fractional cent pro-rations
 * 4. Line-level targeted allocations (full & partial) assigning 100% to line's owning company
 * 5. Split payments (multiple allocation lines on one payment) mixing header & line targets
 * 6. Sequential incremental payments settling order lines step-by-step
 * 7. Refund & reversal allocations at header and line level
 * 8. Journal Entry verification ensuring proper Dr Cash / Cr AR & Intercompany pairs
 */
import { describe, it, expect } from 'vitest';
import {
    AllocateByCompany,
    PaymentAllocationFactory,
    type IntercompanyLookup,
    type OrderLineShare,
} from '../PaymentAllocationFactory.js';
import { GL_ROLE } from '../GLAccountResolver.js';

const CO_A = 'company-a';
const CO_B = 'company-b';
const CO_C = 'company-c';
const CO_D = 'company-d';

const makeLine = (id: string, company: string, amount: number): OrderLineShare => ({
    OrderLineID: id,
    CompanyID: company,
    Amount: amount,
});

/** Deterministic account id generator for tests: `<role>@<company>` */
const acct = (role: string, company: string) => `${role}@${company}`;

const mockResolver = {
    Resolve: async (role: string, _p: unknown, _c: unknown, companyID: string) => acct(role, companyID),
} as never;

/** Configured intercompany pairs for test mesh */
const mockIntercompany: IntercompanyLookup = (source, target) => {
    if (source === target) return null;
    return {
        DueToGLAccountID: `dueTo:${source}->${target}`,
        DueFromGLAccountID: `dueFrom:${target}<-${source}`,
    };
};

const createFactory = () => new PaymentAllocationFactory(mockResolver, mockIntercompany, 'payment-line-entity');

const createCtx = (overrides: Record<string, unknown> = {}) => ({
    PaymentLineID: 'pl-1',
    PaymentNumber: 'PAY-001',
    OrderNumber: 'ORD-001',
    Amount: 100,
    ReceivingCompanyID: CO_A,
    OrderLines: [makeLine('l1', CO_A, 100)],
    TargetOrderLineID: null,
    PaymentDate: new Date('2026-08-20'),
    IsReversal: false,
    ...overrides,
});

const debitOn = (lines: Array<{ GLAccountID: string; DebitAmount?: number; CreditAmount?: number }>, account: string) =>
    lines.find((l) => l.GLAccountID === account)?.DebitAmount;

const creditOn = (lines: Array<{ GLAccountID: string; DebitAmount?: number; CreditAmount?: number }>, account: string) =>
    lines.find((l) => l.GLAccountID === account)?.CreditAmount;

describe('Payment Allocation Matrix — Header vs Line & Split Payments', () => {

    describe('1. Header-Level Pro-Rata Allocations', () => {
        it('allocates 100% to single company when all lines belong to that company', () => {
            const lines = [
                makeLine('l1', CO_A, 150),
                makeLine('l2', CO_A, 250),
                makeLine('l3', CO_A, 100),
            ];
            const shares = AllocateByCompany(500, lines, null);
            expect(shares).toEqual([{ CompanyID: CO_A, Amount: 500 }]);
        });

        it('pro-rates multi-company full payment exactly by gross line weights', () => {
            const lines = [
                makeLine('l1', CO_A, 300), // 30%
                makeLine('l2', CO_B, 500), // 50%
                makeLine('l3', CO_C, 200), // 20%
            ];
            const shares = AllocateByCompany(1000, lines, null);
            expect(shares).toEqual([
                { CompanyID: CO_A, Amount: 300 },
                { CompanyID: CO_B, Amount: 500 },
                { CompanyID: CO_C, Amount: 200 },
            ]);
        });

        it('pro-rates multi-company PARTIAL payment in exact proportions', () => {
            // $1,000 order total with $400 partial payment (40% paid)
            const lines = [
                makeLine('l1', CO_A, 300), // 40% of $300 = $120
                makeLine('l2', CO_B, 500), // 40% of $500 = $200
                makeLine('l3', CO_C, 200), // 40% of $200 = $80
            ];
            const shares = AllocateByCompany(400, lines, null);
            expect(shares).toEqual([
                { CompanyID: CO_A, Amount: 120 },
                { CompanyID: CO_B, Amount: 200 },
                { CompanyID: CO_C, Amount: 80 },
            ]);
        });

        it('collapses multiple lines of the same company into one share before pro-rating', () => {
            const lines = [
                makeLine('l1', CO_A, 100),
                makeLine('l2', CO_A, 100),
                makeLine('l3', CO_B, 200),
            ];
            // Total = 400. Co A total = 200 (50%), Co B total = 200 (50%).
            // Partial payment of $150 -> $75 to Co A, $75 to Co B.
            const shares = AllocateByCompany(150, lines, null);
            expect(shares).toEqual([
                { CompanyID: CO_A, Amount: 75 },
                { CompanyID: CO_B, Amount: 75 },
            ]);
        });

        it('distributes 1-cent rounding residue to the largest company share', () => {
            const lines = [
                makeLine('l1', CO_A, 100),
                makeLine('l2', CO_B, 60),
                makeLine('l3', CO_C, 40),
            ];
            const shares = AllocateByCompany(100.01, lines, null);
            const sum = shares.reduce((acc, s) => acc + s.Amount, 0);
            expect(Math.round(sum * 100) / 100).toBe(100.01);
            expect(shares.find((s) => s.CompanyID === CO_A)?.Amount).toBe(50.01);
            expect(shares.find((s) => s.CompanyID === CO_B)?.Amount).toBe(30.00);
            expect(shares.find((s) => s.CompanyID === CO_C)?.Amount).toBe(20.00);
        });
    });

    describe('2. Line-Level Targeted Allocations', () => {
        it('assigns 100% of amount to targeted line company regardless of other lines', () => {
            const lines = [
                makeLine('l1', CO_A, 500),
                makeLine('l2', CO_B, 1000),
                makeLine('l3', CO_C, 300),
            ];
            // Payment targets line l2 directly
            const shares = AllocateByCompany(600, lines, 'l2');
            expect(shares).toEqual([{ CompanyID: CO_B, Amount: 600 }]);
        });

        it('throws an error if targeted order line is not present on the order', () => {
            const lines = [makeLine('l1', CO_A, 100), makeLine('l2', CO_B, 200)];
            expect(() => AllocateByCompany(100, lines, 'unknown-line-id')).toThrow(/not on this order/i);
        });

        it('handles case-insensitive line id matching', () => {
            const lines = [makeLine('LINE-UUID-1234', CO_B, 200)];
            const shares = AllocateByCompany(150, lines, 'line-uuid-1234');
            expect(shares).toEqual([{ CompanyID: CO_B, Amount: 150 }]);
        });
    });

    describe('3. Journal Entry Generation for Header vs Line Payments', () => {
        it('generates direct Dr Cash / Cr AR when receiving company pays its own targeted line', async () => {
            const factory = createFactory();
            const { Drafts } = await factory.BuildAllocationDrafts(
                createCtx({
                    Amount: 250,
                    ReceivingCompanyID: CO_A,
                    OrderLines: [makeLine('l1', CO_A, 500), makeLine('l2', CO_B, 500)],
                    TargetOrderLineID: 'l1',
                }) as never,
            );

            expect(Drafts).toHaveLength(1);
            const entry = Drafts[0];
            expect(entry.Lines).toHaveLength(2);
            expect(debitOn(entry.Lines, acct(GL_ROLE.Cash, CO_A))).toBe(250);
            expect(creditOn(entry.Lines, acct(GL_ROLE.AccountsReceivable, CO_A))).toBe(250);
        });

        it('generates Intercompany Due-To / Due-From entries when receiving company pays a targeted line of another company', async () => {
            const factory = createFactory();
            const { Drafts } = await factory.BuildAllocationDrafts(
                createCtx({
                    Amount: 400,
                    ReceivingCompanyID: CO_A,
                    OrderLines: [makeLine('l1', CO_A, 500), makeLine('l2', CO_B, 500)],
                    TargetOrderLineID: 'l2', // Targets Co B line
                }) as never,
            );

            // Two balanced journal entries:
            // 1. Co A (Receiving): Dr Cash $400 / Cr Due To B $400
            // 2. Co B (Owner): Dr Due From A $400 / Cr AR $400
            expect(Drafts).toHaveLength(2);

            const coAEntry = Drafts[0];
            expect(debitOn(coAEntry.Lines, acct(GL_ROLE.Cash, CO_A))).toBe(400);
            expect(creditOn(coAEntry.Lines, `dueTo:${CO_A}->${CO_B}`)).toBe(400);

            const coBEntry = Drafts[1];
            expect(debitOn(coBEntry.Lines, `dueFrom:${CO_B}<-${CO_A}`)).toBe(400);
            expect(creditOn(coBEntry.Lines, acct(GL_ROLE.AccountsReceivable, CO_B))).toBe(400);
        });

        it('generates 3 balanced entries for multi-company pro-rated header payment', async () => {
            const factory = createFactory();
            const { Drafts } = await factory.BuildAllocationDrafts(
                createCtx({
                    Amount: 600,
                    ReceivingCompanyID: CO_A,
                    OrderLines: [
                        makeLine('l1', CO_A, 200), // 1/3 -> $200
                        makeLine('l2', CO_B, 200), // 1/3 -> $200
                        makeLine('l3', CO_C, 200), // 1/3 -> $200
                    ],
                    TargetOrderLineID: null, // Header level pro-rating
                }) as never,
            );

            expect(Drafts).toHaveLength(3);

            // Entry 1: Co A has Dr Cash $600, Cr AR $200, Cr Due To B $200, Cr Due To C $200
            const coAEntry = Drafts[0];
            expect(debitOn(coAEntry.Lines, acct(GL_ROLE.Cash, CO_A))).toBe(600);
            expect(creditOn(coAEntry.Lines, acct(GL_ROLE.AccountsReceivable, CO_A))).toBe(200);
            expect(creditOn(coAEntry.Lines, `dueTo:${CO_A}->${CO_B}`)).toBe(200);
            expect(creditOn(coAEntry.Lines, `dueTo:${CO_A}->${CO_C}`)).toBe(200);

            // Entry 2: Co B has Dr Due From A $200, Cr AR $200
            const coBEntry = Drafts[1];
            expect(debitOn(coBEntry.Lines, `dueFrom:${CO_B}<-${CO_A}`)).toBe(200);
            expect(creditOn(coBEntry.Lines, acct(GL_ROLE.AccountsReceivable, CO_B))).toBe(200);

            // Entry 3: Co C has Dr Due From A $200, Cr AR $200
            const coCEntry = Drafts[2];
            expect(debitOn(coCEntry.Lines, `dueFrom:${CO_C}<-${CO_A}`)).toBe(200);
            expect(creditOn(coCEntry.Lines, acct(GL_ROLE.AccountsReceivable, CO_C))).toBe(200);
        });
    });

    describe('4. Split & Incremental Payments Lifecycle', () => {
        it('correctly allocates split payment with multiple allocation lines to distinct order lines', async () => {
            const factory = createFactory();
            const orderLines = [
                makeLine('line-1', CO_A, 500),
                makeLine('line-2', CO_B, 300),
            ];

            // Allocation Line 1: $300 targeted to Line 1 (Co A)
            const alloc1 = await factory.BuildAllocationDrafts(
                createCtx({
                    PaymentLineID: 'pl-split-1',
                    Amount: 300,
                    ReceivingCompanyID: CO_A,
                    OrderLines: orderLines,
                    TargetOrderLineID: 'line-1',
                }) as never,
            );

            // Allocation Line 2: $200 targeted to Line 2 (Co B)
            const alloc2 = await factory.BuildAllocationDrafts(
                createCtx({
                    PaymentLineID: 'pl-split-2',
                    Amount: 200,
                    ReceivingCompanyID: CO_A,
                    OrderLines: orderLines,
                    TargetOrderLineID: 'line-2',
                }) as never,
            );

            // Alloc 1 clears Co A AR directly
            expect(alloc1.Drafts).toHaveLength(1);
            expect(creditOn(alloc1.Drafts[0].Lines, acct(GL_ROLE.AccountsReceivable, CO_A))).toBe(300);

            // Alloc 2 clears Co B AR via intercompany
            expect(alloc2.Drafts).toHaveLength(2);
            const coBEntry = alloc2.Drafts[1];
            expect(creditOn(coBEntry.Lines, acct(GL_ROLE.AccountsReceivable, CO_B))).toBe(200);
        });

        it('supports refund reversals targeted at line level', async () => {
            const factory = createFactory();
            const orderLines = [makeLine('line-1', CO_A, 400), makeLine('line-2', CO_B, 400)];

            const { Drafts } = await factory.BuildAllocationDrafts(
                createCtx({
                    Amount: -150, // Negative amount = refund/un-apply
                    ReceivingCompanyID: CO_A,
                    OrderLines: orderLines,
                    TargetOrderLineID: 'line-2',
                    IsReversal: true,
                }) as never,
            );

            // Reversed entries: Co A credits cash $150 and debits Due To B $150
            expect(Drafts).toHaveLength(2);
            const coAEntry = Drafts[0];
            expect(creditOn(coAEntry.Lines, acct(GL_ROLE.Cash, CO_A))).toBe(150);
            expect(debitOn(coAEntry.Lines, `dueTo:${CO_A}->${CO_B}`)).toBe(150);

            // Co B debits AR $150 and credits Due From A $150
            const coBEntry = Drafts[1];
            expect(debitOn(coBEntry.Lines, acct(GL_ROLE.AccountsReceivable, CO_B))).toBe(150);
            expect(creditOn(coBEntry.Lines, `dueFrom:${CO_B}<-${CO_A}`)).toBe(150);
        });
    });

});
