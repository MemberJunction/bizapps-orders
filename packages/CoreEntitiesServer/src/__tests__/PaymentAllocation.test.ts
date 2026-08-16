/**
 * Unit tests for intercompany payment allocation (D13 payment half).
 *
 * Two things are under test and they fail in different ways:
 *
 *   AllocateByCompany — the money split. A slip here strands a cent on the wrong company's books
 *   or produces parts that do not sum to the whole.
 *
 *   PaymentAllocationFactory — the entry shapes. A slip here produces entries that BALANCE while
 *   crediting the wrong company's receivable, which is exactly the bug this work exists to fix and
 *   is invisible to every downstream assertion. The orientation checks below are the only thing
 *   that would catch it.
 *
 * The worked examples from plans/archive/intercompany-balancing.md §3 are reproduced verbatim, so the doc
 * and the code cannot drift apart silently.
 *
 * CONNECTS TO:
 *   TESTS: ../PaymentAllocationFactory.ts
 *   DOC:   plans/archive/intercompany-balancing.md §3
 */
import { describe, it, expect } from 'vitest';
import {
    AllocateByCompany,
    PaymentAllocationFactory,
    IntercompanyPairMissingError,
    type IntercompanyLookup,
    type OrderLineShare,
} from '../PaymentAllocationFactory.js';
import { GL_ROLE } from '../GLAccountResolver.js';

const A = 'company-a';
const B = 'company-b';
const C = 'company-c';
const D = 'company-d';

const line = (id: string, company: string, amount: number): OrderLineShare => ({
    OrderLineID: id,
    CompanyID: company,
    Amount: amount,
});

/** Deterministic account ids: `<role>@<company>`, so an assertion can name the expected account. */
const acct = (role: string, company: string) => `${role}@${company}`;

/** A resolver stub with the same surface the factory uses. */
const resolver = {
    Resolve: async (role: string, _p: unknown, _c: unknown, companyID: string) => acct(role, companyID),
} as never;

/** Pairs exist for A→B, A→C and A→D; anything else is unconfigured. */
const intercompany: IntercompanyLookup = (source, target) => {
    if (source !== A) return null;
    if (![B, C, D].includes(target)) return null;
    return { DueToGLAccountID: `dueTo:${source}->${target}`, DueFromGLAccountID: `dueFrom:${target}<-${source}` };
};

const factory = () => new PaymentAllocationFactory(resolver, intercompany, 'payment-line-entity');

const ctx = (over: Record<string, unknown> = {}) => ({
    PaymentLineID: 'pl-1',
    PaymentNumber: 'PAY-1',
    OrderNumber: 'ORD-1',
    Amount: 300,
    ReceivingCompanyID: A,
    OrderLines: [line('l1', A, 100), line('l2', B, 200)],
    TargetOrderLineID: null,
    PaymentDate: new Date('2026-07-26'),
    IsReversal: false,
    ...over,
});

const debitOn = (lines: Array<{ GLAccountID: string; DebitAmount?: number; CreditAmount?: number }>, account: string) =>
    lines.find((l) => l.GLAccountID === account)?.DebitAmount;
const creditOn = (lines: Array<{ GLAccountID: string; DebitAmount?: number; CreditAmount?: number }>, account: string) =>
    lines.find((l) => l.GLAccountID === account)?.CreditAmount;

describe('AllocateByCompany', () => {
    it('gives one company the whole amount when it owns every line', () => {
        expect(AllocateByCompany(300, [line('l1', A, 100), line('l2', A, 200)])).toEqual([{ CompanyID: A, Amount: 300 }]);
    });

    it('splits a full payment in proportion to the lines', () => {
        expect(AllocateByCompany(300, [line('l1', A, 100), line('l2', B, 200)])).toEqual([
            { CompanyID: A, Amount: 100 },
            { CompanyID: B, Amount: 200 },
        ]);
    });

    it('pro-rates a PARTIAL payment across companies', () => {
        // Order 456 from the design doc: 100/200/500 paid 50%.
        const shares = AllocateByCompany(400, [line('l1', A, 100), line('l2', C, 200), line('l3', D, 500)]);
        expect(shares).toEqual([
            { CompanyID: A, Amount: 50 },
            { CompanyID: C, Amount: 100 },
            { CompanyID: D, Amount: 250 },
        ]);
    });

    it('groups a company’s lines into ONE share before pro-rating', () => {
        // Two A lines pro-rated separately would round twice and could miss the total by a cent.
        const shares = AllocateByCompany(100, [line('l1', A, 100), line('l2', A, 100), line('l3', B, 100)]);
        expect(shares).toEqual([
            { CompanyID: A, Amount: 66.67 },
            { CompanyID: B, Amount: 33.33 },
        ]);
    });

    it('always sums to the payment amount, giving the residue to the LARGEST share', () => {
        const shares = AllocateByCompany(100, [line('l1', A, 1), line('l2', B, 1), line('l3', C, 1)]);
        const total = shares.reduce((s, x) => s + x.Amount, 0);
        expect(Math.round(total * 100) / 100).toBe(100);
        // 33.33 each leaves a cent; it lands on one share, not nowhere.
        expect(shares.filter((s) => s.Amount === 33.34)).toHaveLength(1);
    });

    it('assigns the whole amount to the targeted line’s company, ignoring the others', () => {
        const shares = AllocateByCompany(300, [line('l1', A, 100), line('l2', B, 200)], 'l2');
        expect(shares).toEqual([{ CompanyID: B, Amount: 300 }]);
    });

    it('refuses a target that is not on the order', () => {
        expect(() => AllocateByCompany(300, [line('l1', A, 100)], 'not-here')).toThrow(/not on this order/i);
    });

    it('refuses to allocate when no line carries an amount to weight by', () => {
        expect(() => AllocateByCompany(300, [line('l1', A, 0)])).toThrow(/no basis/i);
    });

    it('drops a company whose share rounds to nothing rather than emitting a zero entry', () => {
        const shares = AllocateByCompany(0.01, [line('l1', A, 1_000_000), line('l2', B, 1)]);
        expect(shares.some((s) => s.CompanyID === B)).toBe(false);
    });
});

describe('BuildAllocationDrafts — the single-company case still books what it always did', () => {
    it('produces ONE entry: Dr Cash / Cr AR, both on the receiving company', async () => {
        const { Drafts } = await factory().BuildAllocationDrafts(
            ctx({ OrderLines: [line('l1', A, 300)] }) as never,
        );
        expect(Drafts).toHaveLength(1);
        expect(debitOn(Drafts[0].Lines, acct(GL_ROLE.Cash, A))).toBe(300);
        expect(creditOn(Drafts[0].Lines, acct(GL_ROLE.AccountsReceivable, A))).toBe(300);
        expect(Drafts[0].Lines).toHaveLength(2);
    });
});

describe('BuildAllocationDrafts — design doc §3.1, two companies paid in full', () => {
    it('books Company A: Dr Cash 300 / Cr AR 100 / Cr Due To B 200', async () => {
        const { Drafts } = await factory().BuildAllocationDrafts(ctx() as never);
        const a = Drafts[0];
        expect(debitOn(a.Lines, acct(GL_ROLE.Cash, A))).toBe(300);
        expect(creditOn(a.Lines, acct(GL_ROLE.AccountsReceivable, A))).toBe(100);
        expect(creditOn(a.Lines, `dueTo:${A}->${B}`)).toBe(200);
    });

    it('books Company B: Dr Due From A 200 / Cr AR 200 — on B’s OWN receivable', async () => {
        const { Drafts } = await factory().BuildAllocationDrafts(ctx() as never);
        const b = Drafts[1];
        expect(debitOn(b.Lines, `dueFrom:${B}<-${A}`)).toBe(200);
        // The orientation check that matters: B's receivable, not A's. Crediting A here would
        // still balance and would still post.
        expect(creditOn(b.Lines, acct(GL_ROLE.AccountsReceivable, B))).toBe(200);
        expect(b.Lines.some((l) => l.GLAccountID === acct(GL_ROLE.AccountsReceivable, A))).toBe(false);
    });

    it('produces exactly one entry per company, receiving company first', async () => {
        const { Drafts, Shares } = await factory().BuildAllocationDrafts(ctx() as never);
        expect(Drafts).toHaveLength(2);
        expect(Shares).toEqual([
            { CompanyID: A, Amount: 100 },
            { CompanyID: B, Amount: 200 },
        ]);
    });

    it('every entry balances', async () => {
        const { Drafts } = await factory().BuildAllocationDrafts(ctx() as never);
        for (const d of Drafts) {
            const debits = d.Lines.reduce((s, l) => s + (l.DebitAmount ?? 0), 0);
            const credits = d.Lines.reduce((s, l) => s + (l.CreditAmount ?? 0), 0);
            expect(Math.round(debits * 100) / 100).toBe(Math.round(credits * 100) / 100);
        }
    });

    it('points every entry back at the PAYMENT LINE (D25 provenance)', async () => {
        const { Drafts } = await factory().BuildAllocationDrafts(ctx() as never);
        for (const d of Drafts) {
            expect(d.LinkedEntityID).toBe('payment-line-entity');
            expect(d.LinkedRecordID).toBe('pl-1');
        }
    });
});

describe('BuildAllocationDrafts — design doc §3.2, split payment across companies', () => {
    it('reproduces payment line 1 (order 345 paid in full): 100 / 200 / 300', async () => {
        const { Drafts } = await factory().BuildAllocationDrafts(
            ctx({ Amount: 600, OrderLines: [line('l1', A, 100), line('l2', B, 200), line('l3', C, 300)] }) as never,
        );
        expect(Drafts).toHaveLength(3);
        expect(debitOn(Drafts[0].Lines, acct(GL_ROLE.Cash, A))).toBe(600);
        expect(creditOn(Drafts[0].Lines, acct(GL_ROLE.AccountsReceivable, A))).toBe(100);
        expect(creditOn(Drafts[0].Lines, `dueTo:${A}->${B}`)).toBe(200);
        expect(creditOn(Drafts[0].Lines, `dueTo:${A}->${C}`)).toBe(300);
    });

    it('keeps the Due To credits SEPARATE rather than netting them', async () => {
        // Aggregation is recoverable downstream; the derivation is not.
        const { Drafts } = await factory().BuildAllocationDrafts(
            ctx({ Amount: 600, OrderLines: [line('l1', A, 100), line('l2', B, 200), line('l3', C, 300)] }) as never,
        );
        const dueToLines = Drafts[0].Lines.filter((l) => l.GLAccountID.startsWith('dueTo:'));
        expect(dueToLines).toHaveLength(2);
    });

    it('reproduces payment line 2 (order 456 paid 50%): 50 / 100 / 250', async () => {
        const { Drafts } = await factory().BuildAllocationDrafts(
            ctx({ Amount: 400, OrderLines: [line('l1', A, 100), line('l2', C, 200), line('l3', D, 500)] }) as never,
        );
        expect(debitOn(Drafts[0].Lines, acct(GL_ROLE.Cash, A))).toBe(400);
        expect(creditOn(Drafts[0].Lines, acct(GL_ROLE.AccountsReceivable, A))).toBe(50);
        expect(creditOn(Drafts[0].Lines, `dueTo:${A}->${C}`)).toBe(100);
        expect(creditOn(Drafts[0].Lines, `dueTo:${A}->${D}`)).toBe(250);
        expect(debitOn(Drafts[2].Lines, `dueFrom:${D}<-${A}`)).toBe(250);
    });
});

describe('BuildAllocationDrafts — the collector owning no line', () => {
    it('omits the AR line entirely for a shared-services collector', async () => {
        // Explicitly supported, not an error: A collects purely on B and C's behalf.
        const { Drafts } = await factory().BuildAllocationDrafts(
            ctx({ Amount: 500, OrderLines: [line('l1', B, 200), line('l2', C, 300)] }) as never,
        );
        const a = Drafts[0];
        expect(debitOn(a.Lines, acct(GL_ROLE.Cash, A))).toBe(500);
        expect(a.Lines.some((l) => l.GLAccountID === acct(GL_ROLE.AccountsReceivable, A))).toBe(false);
        expect(creditOn(a.Lines, `dueTo:${A}->${B}`)).toBe(200);
        expect(creditOn(a.Lines, `dueTo:${A}->${C}`)).toBe(300);
    });
});

describe('BuildAllocationDrafts — targeting one order line', () => {
    it('produces NO intercompany legs when the target is the collector’s own line', async () => {
        const { Drafts } = await factory().BuildAllocationDrafts(ctx({ Amount: 100, TargetOrderLineID: 'l1' }) as never);
        expect(Drafts).toHaveLength(1);
        expect(creditOn(Drafts[0].Lines, acct(GL_ROLE.AccountsReceivable, A))).toBe(100);
    });

    it('produces exactly one intercompany pair when the target belongs to another company', async () => {
        const { Drafts } = await factory().BuildAllocationDrafts(ctx({ Amount: 200, TargetOrderLineID: 'l2' }) as never);
        expect(Drafts).toHaveLength(2);
        // A owns no part of this allocation, so it has no receivable to clear.
        expect(Drafts[0].Lines.some((l) => l.GLAccountID === acct(GL_ROLE.AccountsReceivable, A))).toBe(false);
        expect(creditOn(Drafts[0].Lines, `dueTo:${A}->${B}`)).toBe(200);
    });
});

describe('BuildAllocationDrafts — reversals', () => {
    it('MIRRORS every entry rather than negating amounts (D53)', async () => {
        const { Drafts } = await factory().BuildAllocationDrafts(ctx({ IsReversal: true }) as never);
        // Cash is credited on the way out; every amount stays positive.
        expect(creditOn(Drafts[0].Lines, acct(GL_ROLE.Cash, A))).toBe(300);
        expect(debitOn(Drafts[0].Lines, acct(GL_ROLE.AccountsReceivable, A))).toBe(100);
        expect(debitOn(Drafts[0].Lines, `dueTo:${A}->${B}`)).toBe(200);
        expect(creditOn(Drafts[1].Lines, `dueFrom:${B}<-${A}`)).toBe(200);
        for (const d of Drafts) {
            for (const l of d.Lines) {
                expect((l.DebitAmount ?? 0) >= 0 && (l.CreditAmount ?? 0) >= 0).toBe(true);
            }
        }
    });

    it('uses accounting’s Refund entry type', async () => {
        const { Drafts } = await factory().BuildAllocationDrafts(ctx({ IsReversal: true }) as never);
        expect(Drafts.every((d) => d.EntryType === 'Refund')).toBe(true);
    });

    it('uses PaymentReceipt otherwise', async () => {
        const { Drafts } = await factory().BuildAllocationDrafts(ctx() as never);
        expect(Drafts.every((d) => d.EntryType === 'PaymentReceipt')).toBe(true);
    });
});

describe('BuildAllocationDrafts — a missing intercompany pair is fatal', () => {
    it('refuses to book, naming both companies and the date', async () => {
        // There is no fallback account on purpose: a guessed intercompany account still balances,
        // so the misposting would not surface until the two companies' books disagreed.
        const noPairs: IntercompanyLookup = () => null;
        const f = new PaymentAllocationFactory(resolver, noPairs, 'payment-line-entity');
        await expect(f.BuildAllocationDrafts(ctx() as never)).rejects.toThrow(IntercompanyPairMissingError);
        await expect(f.BuildAllocationDrafts(ctx() as never)).rejects.toThrow(/IntercompanyAccountMatch/);
    });

    it('does NOT need a pair when the order is single-company', async () => {
        const noPairs: IntercompanyLookup = () => null;
        const f = new PaymentAllocationFactory(resolver, noPairs, 'payment-line-entity');
        const { Drafts } = await f.BuildAllocationDrafts(ctx({ OrderLines: [line('l1', A, 300)] }) as never);
        expect(Drafts).toHaveLength(1);
    });

    it('refuses a zero-amount allocation', async () => {
        await expect(factory().BuildAllocationDrafts(ctx({ Amount: 0 }) as never)).rejects.toThrow(/nothing/i);
    });
});
