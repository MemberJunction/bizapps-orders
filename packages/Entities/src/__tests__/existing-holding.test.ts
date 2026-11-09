import { describe, expect, it, vi } from 'vitest';
import type { IRunViewProvider, RunViewParams } from '@memberjunction/core';
import {
    EXISTING_HOLDING_STATUSES,
    ExtendChoiceTextFor,
    ExtendOutcomeFor,
    FindExistingHolding,
    type ExistingHolding,
    FindUnansweredHeldLines,
    HoldingSubscriberFor,
    type HoldingLine,
    type HoldingOrder,
} from '../existing-holding';

/**
 * A line for a product the subscriber already holds is extended at confirm unless it says otherwise
 * (golive #299, #318). These pin which lines are asked, and that a failed read is never "holds none".
 */
const PRODUCT = '11111111-1111-4111-8111-111111111111';
const ONE_TIME = '22222222-2222-4222-8222-222222222222';
const ORG = '33333333-3333-4333-8333-333333333333';
const SUB = '44444444-4444-4444-8444-444444444444';
const TYPE = '55555555-5555-4555-8555-555555555555';

const order: HoldingOrder = {
    ShipToOrganizationID: null,
    ShipToPersonID: null,
    BillToOrganizationID: ORG,
    BillToPersonID: null,
};

function line(overrides: Partial<HoldingLine> = {}): HoldingLine {
    return {
        ID: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        LineNumber: 1,
        ProductID: PRODUCT,
        ShipToOrganizationID: null,
        ShipToPersonID: null,
        RenewsSubscriptionID: null,
        SubscriptionAction: null,
        ...overrides,
    };
}

type Rows = Record<string, unknown[]>;

function provider(rows: Rows, failOn?: string): IRunViewProvider & { RunView: ReturnType<typeof vi.fn> } {
    return {
        RunView: vi.fn(async (params: RunViewParams) => {
            const name = params.EntityName ?? '';
            if (name === failOn) return { Success: false, Results: [], ErrorMessage: 'boom' };
            return { Success: true, Results: rows[name] ?? [] };
        }),
    } as unknown as IRunViewProvider & { RunView: ReturnType<typeof vi.fn> };
}

const held: Rows = {
    'MJ_BizApps_Orders: Products': [
        { ID: PRODUCT, SubscriptionTypeID: 'type-1' },
        { ID: ONE_TIME, SubscriptionTypeID: null },
    ],
    'MJ_BizApps_Orders: Subscriptions': [
        { ID: SUB, SubscriptionNumber: 'SUB-1', Status: 'Active', ProductID: PRODUCT, HolderOrganizationID: ORG, BeneficiaryPersonID: null },
    ],
    'MJ_BizApps_Orders: Subscription Terms': [
        { SubscriptionID: SUB, TermNumber: 2, EndDate: '2027-09-30' },
        { SubscriptionID: SUB, TermNumber: 1, EndDate: '2026-09-30' },
    ],
};

describe('HoldingSubscriberFor', () => {
    it('takes the line ship-to, then the order ship-to, then the bill-to', () => {
        expect(HoldingSubscriberFor(line(), order)).toEqual({ OrganizationID: ORG, PersonID: null });
        expect(HoldingSubscriberFor(line({ ShipToOrganizationID: SUB }), order)?.OrganizationID).toBe(SUB);
    });

    it('is null when nobody is named', () => {
        expect(HoldingSubscriberFor(line(), null)).toBeNull();
    });
});

describe('FindExistingHolding', () => {
    it('returns the live subscription and where its latest term ends', async () => {
        const h = await FindExistingHolding(PRODUCT, { OrganizationID: ORG, PersonID: null }, provider(held));
        expect(h?.SubscriptionNumber).toBe('SUB-1');
        expect(h?.LatestTermEnd?.toISOString().slice(0, 10)).toBe('2027-09-30');
    });

    it('throws when the read fails rather than reporting no holding', async () => {
        await expect(
            FindExistingHolding(PRODUCT, { OrganizationID: ORG, PersonID: null }, provider(held, 'MJ_BizApps_Orders: Subscriptions')),
        ).rejects.toThrow(/boom/);
    });

    it('counts every sold status that has not ended, and only those', async () => {
        expect([...EXISTING_HOLDING_STATUSES].sort()).toEqual(['Active', 'Paused', 'Trialing']);
        const p = provider(held);
        await FindExistingHolding(PRODUCT, { OrganizationID: ORG, PersonID: null }, p);
        const filter = (p.RunView.mock.calls[0][0] as RunViewParams).ExtraFilter ?? '';
        expect(filter).toContain(`Status IN ('Active', 'Trialing', 'Paused')`);
        expect(filter).not.toMatch(/Canceled|Migrated/);
    });

    it('finds a subscription whose first term has not started yet', async () => {
        // Sold for next month: Active from booking, terms in the future (golive #339).
        const future: Rows = {
            ...held,
            'MJ_BizApps_Orders: Subscription Terms': [
                { SubscriptionID: SUB, TermNumber: 2, EndDate: '2028-10-31' },
                { SubscriptionID: SUB, TermNumber: 1, EndDate: '2027-10-31' },
            ],
        };
        const h = await FindExistingHolding(PRODUCT, { OrganizationID: ORG, PersonID: null }, provider(future));
        expect(h?.SubscriptionID).toBe(SUB);
        expect(h?.LatestTermEnd?.toISOString().slice(0, 10)).toBe('2028-10-31');
    });

    it('does not query for a malformed id', async () => {
        const p = provider(held);
        expect(await FindExistingHolding('not-a-guid', { OrganizationID: ORG, PersonID: null }, p)).toBeNull();
        expect(p.RunView).not.toHaveBeenCalled();
    });
});

describe('FindUnansweredHeldLines', () => {
    it('reports a subscription line with no answer whose subscriber holds the product', async () => {
        const found = await FindUnansweredHeldLines(order, [line()], provider(held));
        expect(found).toHaveLength(1);
        expect(found[0].LineNumber).toBe(1);
        expect(found[0].Holding.SubscriptionID).toBe(SUB);
        expect(found[0].Holding.LatestTermEnd?.toISOString().slice(0, 10)).toBe('2027-09-30');
    });

    it('asks about a paused subscription with the same status set as the single lookup', async () => {
        const paused: Rows = {
            ...held,
            'MJ_BizApps_Orders: Subscriptions': [{ ...(held['MJ_BizApps_Orders: Subscriptions'][0] as object), Status: 'Paused' }],
        };
        const p = provider(paused);
        const found = await FindUnansweredHeldLines(order, [line()], p);
        expect(found[0]?.Holding.Status).toBe('Paused');
        const subsCall = p.RunView.mock.calls.find(([params]) => (params as RunViewParams).EntityName === 'MJ_BizApps_Orders: Subscriptions');
        expect((subsCall?.[0] as RunViewParams).ExtraFilter).toContain(`Status IN ('Active', 'Trialing', 'Paused')`);
    });

    it('reads three times however many lines there are', async () => {
        const p = provider(held);
        const found = await FindUnansweredHeldLines(order, [line(), line({ ID: 'b', LineNumber: 2 }), line({ ID: 'c', LineNumber: 3 })], p);
        expect(found.map((f) => f.LineNumber)).toEqual([1, 2, 3]);
        expect(p.RunView).toHaveBeenCalledTimes(3);
    });

    it('does not match a subscription held by someone else', async () => {
        const other = { ...held, 'MJ_BizApps_Orders: Subscriptions': [{ ...(held['MJ_BizApps_Orders: Subscriptions'][0] as object), HolderOrganizationID: SUB }] };
        expect(await FindUnansweredHeldLines(order, [line()], provider(other))).toEqual([]);
    });

    it('leaves out answered lines, renewal lines and one-time products', async () => {
        const p = provider(held);
        const found = await FindUnansweredHeldLines(
            order,
            [
                line({ SubscriptionAction: 'CreateNew' }),
                line({ RenewsSubscriptionID: SUB }),
                line({ ProductID: ONE_TIME }),
            ],
            p,
        );
        expect(found).toEqual([]);
    });

    it('asks about a product that inherits its subscription type from its product type', async () => {
        // Confirm builds a term from the product type's default, so the line is a subscription (golive #339).
        const inherited: Rows = {
            ...held,
            'MJ_BizApps_Orders: Products': [{ ID: PRODUCT, SubscriptionTypeID: null, ProductTypeID: TYPE }],
            'MJ_BizApps_Orders: Product Types': [{ ID: TYPE, DefaultSubscriptionTypeID: 'type-1' }],
        };
        const found = await FindUnansweredHeldLines(order, [line()], provider(inherited));
        expect(found.map((f) => f.Holding.SubscriptionID)).toEqual([SUB]);
    });

    it('leaves out a product whose product type has no subscription default', async () => {
        const merch: Rows = {
            ...held,
            'MJ_BizApps_Orders: Products': [{ ID: PRODUCT, SubscriptionTypeID: null, ProductTypeID: TYPE }],
            'MJ_BizApps_Orders: Product Types': [{ ID: TYPE, DefaultSubscriptionTypeID: null }],
        };
        expect(await FindUnansweredHeldLines(order, [line()], provider(merch))).toEqual([]);
    });

    it('throws when the product types cannot be read rather than skipping the line', async () => {
        const inherited: Rows = {
            ...held,
            'MJ_BizApps_Orders: Products': [{ ID: PRODUCT, SubscriptionTypeID: null, ProductTypeID: TYPE }],
        };
        await expect(FindUnansweredHeldLines(order, [line()], provider(inherited, 'MJ_BizApps_Orders: Product Types'))).rejects.toThrow(/boom/);
    });

    it('reports nothing when the subscriber holds nothing', async () => {
        const found = await FindUnansweredHeldLines(order, [line()], provider({ ...held, 'MJ_BizApps_Orders: Subscriptions': [] }));
        expect(found).toEqual([]);
    });

    it('throws when the product read fails', async () => {
        await expect(FindUnansweredHeldLines(order, [line()], provider(held, 'MJ_BizApps_Orders: Products'))).rejects.toThrow(/boom/);
    });
});

describe('a paused holding: what "extend" does (golive #339)', () => {
    const TYPE = '55555555-5555-4555-8555-555555555555';
    const pausedRows = (mode: string, windowDays: number | null = null): Rows => ({
        ...held,
        'MJ_BizApps_Orders: Subscriptions': [
            { ...(held['MJ_BizApps_Orders: Subscriptions'][0] as object), Status: 'Paused', SubscriptionTypeID: TYPE },
        ],
        'MJ_BizApps_Orders: Subscription Types': [{ ReactivationMode: mode, ReactivationWindowDays: windowDays }],
    });
    const holding = (over: Partial<ExistingHolding>): ExistingHolding => ({
        SubscriptionID: SUB,
        SubscriptionNumber: 'SUB-1',
        Status: 'Paused',
        LatestTermEnd: new Date('2027-09-30T00:00:00Z'),
        ...over,
    });
    const day = new Date('2027-10-15T00:00:00Z');

    it('reads the type\'s reactivation rule for a paused holding only', async () => {
        const p = provider(pausedRows('ReactivateExisting'));
        const h = await FindExistingHolding(PRODUCT, { OrganizationID: ORG, PersonID: null }, p);
        expect(h?.Reactivation).toEqual({ Mode: 'ReactivateExisting', WindowDays: null });

        const active = provider(held);
        const a = await FindExistingHolding(PRODUCT, { OrganizationID: ORG, PersonID: null }, active);
        expect(a?.Reactivation).toBeNull();
        expect(active.RunView.mock.calls.map(([q]) => (q as RunViewParams).EntityName)).not.toContain(
            'MJ_BizApps_Orders: Subscription Types',
        );
    });

    it('an active holding is extended: next term from the day after coverage ends', () => {
        const text = ExtendChoiceTextFor(holding({ Status: 'Active' }), day);
        expect(text.Choice).toBe('Add as next term (starts 2027-10-01)');
        expect(text.Hint).toContain('adds a term to SUB-1');
    });

    it('a paused holding whose type reactivates is described as a reactivation, not a next term', () => {
        const text = ExtendChoiceTextFor(holding({ Reactivation: { Mode: 'ReactivateExisting', WindowDays: null } }), day);
        expect(text.Choice).toBe('Reactivate SUB-1');
        expect(text.Hint).toBe("SUB-1 is paused. Confirm makes it active again and adds a term on this line's dates.");
        expect(text.Choice).not.toMatch(/next term/);
    });

    it('a type that never reactivates says confirm starts a separate subscription', () => {
        const outcome = ExtendOutcomeFor(holding({ Reactivation: { Mode: 'AlwaysCreateNew', WindowDays: null } }), day);
        expect(outcome.Kind).toBe('NewSubscription');
        expect(ExtendChoiceTextFor(holding({ Reactivation: { Mode: 'AlwaysCreateNew', WindowDays: null } }), day).Hint).toMatch(
            /starts a separate subscription/,
        );
    });

    it('a reactivation window is judged from the latest term end to the purchase day, as the server does', () => {
        const rule = { Mode: 'ReactivateWithinWindow', WindowDays: 30 };
        expect(ExtendOutcomeFor(holding({ Reactivation: rule }), day).Kind).toBe('Reactivate'); // 15 days
        expect(ExtendOutcomeFor(holding({ Reactivation: rule }), new Date('2027-11-15T00:00:00Z')).Kind).toBe('NewSubscription'); // 46 days
    });

    it('with no rule read, says the type decides rather than promising a next term', () => {
        expect(ExtendOutcomeFor(holding({ Reactivation: null }), day).Kind).toBe('TypeRule');
    });
});
