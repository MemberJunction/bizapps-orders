/**
 * Booking for companies that keep no books of their own (golive #313).
 *
 * A Division, Department or Branch uses the books of its legal entity. Two consequences, both
 * tested here against the real classes with the accounting engine stubbed out:
 *
 *   GLAccountResolver — a Division's line resolves its legal entity's accounts. The company default
 *   is looked for on the Division's own company record first, then on its legal entity's, and D6
 *   compares the account against the legal entity.
 *
 *   PaymentAllocationFactory — cash the legal entity collects for a Division's line is not
 *   intercompany: one entry, the Division's receivable credited on the legal entity's AR with the
 *   line's tags. Between different legal entities the pair is looked up by the legal-entity pair.
 *
 * CONNECTS TO:
 *   TESTS: ../GLAccountResolver.ts · ../PaymentAllocationFactory.ts
 *   RULE:  AccountingEngineBase.LegalEntityFor (bizapps-accounting)
 */
import { describe, it, expect, vi } from 'vitest';
import { GLAccountResolutionError, GLAccountResolver, GL_ROLE } from '../GLAccountResolver.js';
import {
    PaymentAllocationFactory,
    IntercompanyPairMissingError,
    type IntercompanyLookup,
    type LegalEntityLookup,
    type OrderLineShare,
} from '../PaymentAllocationFactory.js';

/** A legal entity, a Division of it, a separate legal entity, and a Division of that one. */
const CONSULTING = 'co-consulting';
const BRAND = 'co-brand';
const STUDIO = 'co-studio';
const STUDIO_LAB = 'co-studio-lab';
const ORPHAN = 'co-orphan';

const PARENT: Record<string, string> = { [BRAND]: CONSULTING, [STUDIO_LAB]: STUDIO };
const legalEntityFor: LegalEntityLookup = (companyID) => {
    if (companyID === ORPHAN) throw new Error(`Cannot find the legal entity of company ${ORPHAN}: no parent company.`);
    return PARENT[companyID] ?? companyID;
};

const E = { Product: 'ent-product', ProductCategory: 'ent-category', ProductType: 'ent-type', Company: 'ent-company' };
const asOf = new Date('2026-10-04');

/** A link: which record it hangs off, for which role, and the account (with its owning company). */
interface Link {
    Entity: string;
    Record: string;
    Role: string;
    GLAccountID: string;
    AccountCompanyID: string;
}

/** A resolver over `links` that honours the company scope the way the live bridge does (D71). */
function resolverOver(links: Link[], legalEntity: LegalEntityLookup = legalEntityFor) {
    const scopes: Array<string | undefined> = [];
    const impl = new GLAccountResolver(
        E,
        {} as never,
        {} as never,
        (entityId, recordId, role, _asOf, forCompanyID) => {
            scopes.push(forCompanyID);
            const hit = links.find(
                (l) =>
                    l.Entity === entityId &&
                    l.Record === recordId &&
                    l.Role === role &&
                    (!forCompanyID || l.AccountCompanyID === forCompanyID),
            );
            return hit ? { GLAccountID: hit.GLAccountID, CompanyID: hit.AccountCompanyID } : null;
        },
        legalEntity,
    );
    (impl as unknown as { _categoriesLoaded: boolean })._categoriesLoaded = true;
    return { impl, scopes };
}

describe('GLAccountResolver — a Division resolves its legal entity\'s accounts', () => {
    it('scopes the product walk to the legal entity\'s accounts', async () => {
        const { impl, scopes } = resolverOver([
            { Entity: E.Product, Record: 'prod', Role: GL_ROLE.Sales, GLAccountID: 'sales@consulting', AccountCompanyID: CONSULTING },
        ]);
        await expect(impl.Resolve(GL_ROLE.Sales, 'prod', null, BRAND, asOf)).resolves.toBe('sales@consulting');
        expect(scopes[0]).toBe(CONSULTING);
    });

    it('takes the company default from the legal entity when the Division has none', async () => {
        const { impl } = resolverOver([
            { Entity: E.Company, Record: CONSULTING, Role: GL_ROLE.AccountsReceivable, GLAccountID: 'ar@consulting', AccountCompanyID: CONSULTING },
        ]);
        await expect(impl.Resolve(GL_ROLE.AccountsReceivable, null, null, BRAND, asOf)).resolves.toBe('ar@consulting');
    });

    it('prefers a default linked on the Division\'s own company record', async () => {
        const { impl } = resolverOver([
            { Entity: E.Company, Record: BRAND, Role: GL_ROLE.Sales, GLAccountID: 'brand-sales@consulting', AccountCompanyID: CONSULTING },
            { Entity: E.Company, Record: CONSULTING, Role: GL_ROLE.Sales, GLAccountID: 'sales@consulting', AccountCompanyID: CONSULTING },
        ]);
        await expect(impl.Resolve(GL_ROLE.Sales, null, null, BRAND, asOf)).resolves.toBe('brand-sales@consulting');
    });

    it('does not fall back to another legal entity\'s default for a company that is its own legal entity', async () => {
        const { impl, scopes } = resolverOver([
            { Entity: E.Company, Record: CONSULTING, Role: GL_ROLE.Cash, GLAccountID: 'cash@consulting', AccountCompanyID: CONSULTING },
        ]);
        await expect(impl.Resolve(GL_ROLE.Cash, null, null, STUDIO, asOf)).rejects.toMatchObject({ Failure: 'NotLinked' });
        expect(scopes).toEqual([STUDIO]);
    });

    it('names both the company and its legal entity when nothing is linked for a Division', async () => {
        const { impl } = resolverOver([]);
        await expect(impl.Resolve(GL_ROLE.Cash, null, null, BRAND, asOf)).rejects.toThrow(
            `company ${BRAND} or its legal entity ${CONSULTING}`,
        );
    });

    it('refuses an account outside the legal entity (D6), whatever the scope returned', async () => {
        const impl = new GLAccountResolver(E, {} as never, {} as never, () => ({ GLAccountID: 'ar@brand', CompanyID: BRAND }), legalEntityFor);
        const err = await impl.Resolve(GL_ROLE.AccountsReceivable, null, null, BRAND, asOf).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(GLAccountResolutionError);
        expect((err as GLAccountResolutionError).Failure).toBe('CrossCompany');
        expect((err as Error).message).toContain(`whose legal entity is ${CONSULTING}`);
    });

    it('refuses a Division whose legal entity cannot be found, rather than guessing', async () => {
        const { impl } = resolverOver([]);
        await expect(impl.Resolve(GL_ROLE.Cash, null, null, ORPHAN, asOf)).rejects.toThrow(/legal entity of company co-orphan/);
    });

    it('scopes a direct record lookup to the legal entity too', async () => {
        const { impl } = resolverOver([
            { Entity: 'ent-charge', Record: 'shipping', Role: GL_ROLE.Sales, GLAccountID: 'ship@consulting', AccountCompanyID: CONSULTING },
        ]);
        await expect(impl.ResolveForRecord(GL_ROLE.Sales, 'ent-charge', 'shipping', BRAND, asOf)).resolves.toBe('ship@consulting');
    });
});

// ─── payment allocation ──────────────────────────────────────────────────────────────────────────

/** Accounts as the walk-up resolves them: every company books on its legal entity's account. */
const acct = (role: string, companyID: string) => `${role}@${legalEntityFor(companyID)}`;
const resolver = {
    Resolve: async (role: string, _p: unknown, _c: unknown, companyID: string) => acct(role, companyID),
} as never;

/** Pairs exist between the two legal entities only, as the match sheet would hold them. */
const pairs = vi.fn<IntercompanyLookup>((source, target) => {
    const known = (source === CONSULTING && target === STUDIO) || (source === STUDIO && target === CONSULTING);
    return known ? { DueToGLAccountID: `dueTo:${source}->${target}`, DueFromGLAccountID: `dueFrom:${target}<-${source}` } : null;
});

const factory = () => new PaymentAllocationFactory(resolver, pairs, 'payment-line-entity', legalEntityFor);

const VENTURE = 'dim-venture';
const line = (id: string, company: string, amount: number, venture?: string): OrderLineShare => ({
    OrderLineID: id,
    CompanyID: company,
    Amount: amount,
    ...(venture ? { Dimensions: [{ DimensionID: VENTURE, DimensionValueID: venture }] } : {}),
});

const ctx = (over: Record<string, unknown>) => ({
    PaymentLineID: 'pl-1',
    PaymentNumber: 'PAY-1',
    OrderNumber: 'ORD-1',
    Amount: 300,
    ReceivingCompanyID: CONSULTING,
    OrderLines: [line('l1', BRAND, 300)],
    TargetOrderLineID: null,
    PaymentDate: asOf,
    IsReversal: false,
    ...over,
});

type Line = { GLAccountID: string; DebitAmount?: number; CreditAmount?: number; Dimensions?: Array<{ DimensionValueID: string }> };
const sum = (lines: Line[], account: string, side: 'DebitAmount' | 'CreditAmount') =>
    lines.filter((l) => l.GLAccountID === account).reduce((s, l) => s + (l[side] ?? 0), 0);

describe('PaymentAllocationFactory — intercompany is between legal entities', () => {
    it('books one entry, no Due To / Due From, when the legal entity collects for its Division\'s line', async () => {
        pairs.mockClear();
        const { Drafts } = await factory().BuildAllocationDrafts(ctx({}) as never);

        expect(Drafts).toHaveLength(1);
        const lines = Drafts[0].Lines as Line[];
        expect(sum(lines, acct(GL_ROLE.Cash, CONSULTING), 'DebitAmount')).toBe(300);
        expect(sum(lines, acct(GL_ROLE.AccountsReceivable, BRAND), 'CreditAmount')).toBe(300);
        expect(lines.some((l) => l.GLAccountID.startsWith('due'))).toBe(false);
        expect(pairs).not.toHaveBeenCalled();
    });

    it('keeps each company\'s receivable credit separate by its tags on the shared AR account', async () => {
        const { Drafts } = await factory().BuildAllocationDrafts(
            ctx({ OrderLines: [line('l1', CONSULTING, 100, 'v-consulting'), line('l2', BRAND, 200, 'v-brand')] }) as never,
        );

        expect(Drafts).toHaveLength(1);
        const ar = (Drafts[0].Lines as Line[]).filter((l) => l.GLAccountID === acct(GL_ROLE.AccountsReceivable, CONSULTING));
        expect(ar.map((l) => [l.Dimensions?.[0]?.DimensionValueID, l.CreditAmount])).toEqual([
            ['v-consulting', 100],
            ['v-brand', 200],
        ]);
    });

    it('books one entry when a Division collects for its legal entity\'s line', async () => {
        const { Drafts } = await factory().BuildAllocationDrafts(
            ctx({ ReceivingCompanyID: BRAND, OrderLines: [line('l1', CONSULTING, 300)] }) as never,
        );
        expect(Drafts).toHaveLength(1);
    });

    it('looks the pair up by legal entity when the owner is another legal entity\'s Division', async () => {
        pairs.mockClear();
        const { Drafts } = await factory().BuildAllocationDrafts(
            ctx({ OrderLines: [line('l1', BRAND, 100), line('l2', STUDIO_LAB, 200)] }) as never,
        );

        expect(pairs).toHaveBeenCalledWith(CONSULTING, STUDIO, asOf);
        expect(Drafts).toHaveLength(2);
        const [collector, owner] = Drafts.map((d) => d.Lines as Line[]);
        expect(sum(collector, acct(GL_ROLE.AccountsReceivable, BRAND), 'CreditAmount')).toBe(100);
        expect(sum(collector, `dueTo:${CONSULTING}->${STUDIO}`, 'CreditAmount')).toBe(200);
        expect(sum(owner, `dueFrom:${STUDIO}<-${CONSULTING}`, 'DebitAmount')).toBe(200);
        expect(sum(owner, acct(GL_ROLE.AccountsReceivable, STUDIO_LAB), 'CreditAmount')).toBe(200);
    });

    it('names the legal-entity pair when it is not configured', async () => {
        const err = await factory()
            .BuildAllocationDrafts(ctx({ ReceivingCompanyID: STUDIO_LAB, OrderLines: [line('l1', 'co-elsewhere', 300)] }) as never)
            .catch((e: unknown) => e);
        expect(err).toBeInstanceOf(IntercompanyPairMissingError);
        expect((err as IntercompanyPairMissingError).SourceCompanyID).toBe(STUDIO);
        expect((err as IntercompanyPairMissingError).TargetCompanyID).toBe('co-elsewhere');
    });

    it('refuses the payment when a Division\'s legal entity cannot be found', async () => {
        await expect(
            factory().BuildAllocationDrafts(ctx({ OrderLines: [line('l1', ORPHAN, 300)] }) as never),
        ).rejects.toThrow(/legal entity of company co-orphan/);
    });

    it('treats every company as its own legal entity when no lookup is given, as before', async () => {
        pairs.mockClear();
        const plain = new PaymentAllocationFactory(resolver, pairs, 'payment-line-entity');
        await expect(plain.BuildAllocationDrafts(ctx({}) as never)).rejects.toBeInstanceOf(IntercompanyPairMissingError);
        expect(pairs).toHaveBeenCalledWith(CONSULTING, BRAND, asOf);
    });
});
