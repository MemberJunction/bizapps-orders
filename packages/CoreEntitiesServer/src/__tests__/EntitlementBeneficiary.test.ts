/**
 * Who an entitlement grant is for (#622).
 *
 * A grant used to fall back from the line's ship-to straight to the order's bill-to, while the
 * subscription it belongs to fell back to the order's ship-to first. An order billed to one party and
 * shipped to another gave the subscription to one and its access to the other. These tests drive the
 * real `CreateEntitlementGrants` against a fake `RunView` and record the grants it saves.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    /** Rows `RunView` answers with, keyed by the entity name's suffix. */
    rows: new Map<string, Record<string, unknown>[]>(),
    saved: [] as Array<Record<string, unknown>>,
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: class {
            RunView = vi.fn().mockImplementation((params: { EntityName: string }) => {
                const suffix = params.EntityName.split(': ')[1];
                return Promise.resolve({ Success: true, Results: mocks.rows.get(suffix) ?? [] });
            });
        },
    };
});

vi.mock('@mj-biz-apps/orders-entities', () => ({
    LoadOrdersEngine: vi.fn().mockResolvedValue(undefined),
    OrdersEngine: {
        Instance: {
            ProductByID: (id: string) => ({
                ID: id,
                ProductTypeID: 'type-1',
                ProductCategoryID: null,
                EntitlementGrantTiming: null,
                EntitlementQuantityMode: null,
                EntitlementValidityMode: null,
            }),
            ProductTypeByID: (id: string) => ({
                ID: id,
                DefaultEntitlementGrantTiming: 'OnConfirm',
                DefaultEntitlementQuantityMode: 'Flat',
                DefaultEntitlementValidityMode: 'Perpetual',
            }),
            CategoryChain: () => [],
            ProductCategoryByID: () => undefined,
        },
    },
}));

vi.mock('../OrdersSettings.js', () => ({
    OrdersSettings: { Load: vi.fn().mockResolvedValue(undefined), RenewalAccessCutoffDaysPastDue: 14 },
}));

import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { CreateEntitlementGrants, type GrantableLine, type GrantableOrder, type TermForLine } from '../EntitlementEngine.js';

const provider = {
    GetEntityObject: vi.fn().mockImplementation(() => {
        const grant: Record<string, unknown> = {
            ID: `grant-${mocks.saved.length + 1}`,
            NewRecord: () => undefined,
            Save: () => {
                mocks.saved.push(grant);
                return Promise.resolve(true);
            },
        };
        return Promise.resolve(grant);
    }),
} as unknown as IMetadataProvider;
const user = {} as UserInfo;

const ORDER: GrantableOrder = {
    ID: 'order-1',
    OrderDate: new Date('2026-10-01T00:00:00Z'),
    Payment: { TotalGross: 100, AmountPaid: 100, Balance: 0, RefundedAmount: 0 } as GrantableOrder['Payment'],
    ShipToPersonID: 'ship-to-person',
    ShipToOrganizationID: null,
    BillToPersonID: null,
    BillToOrganizationID: 'bill-to-org',
};

const line = (over: Partial<GrantableLine> = {}): GrantableLine => ({
    ID: 'line-1',
    ProductID: 'product-1',
    Quantity: 1,
    ShipToPersonID: null,
    ShipToOrganizationID: null,
    RenewsSubscriptionID: null,
    Choices: [],
    ...over,
});

const TERM: TermForLine = { ID: 'term-1', StartDate: new Date('2026-10-01'), EndDate: new Date('2027-09-30') };

beforeEach(() => {
    mocks.rows.clear();
    mocks.saved.length = 0;
    mocks.rows.set('Product Entitlements', [
        {
            ID: 'pe-1',
            ProductID: 'product-1',
            EntitlementType: 'Access',
            Code: 'ACCESS',
            Name: 'Access',
            Quantity: 1,
            ValidityMode: null,
            ValidityDurationDays: null,
            AccessLeadHours: null,
            AccessLagHours: null,
            IsActive: true,
            ChoiceGroupKey: null,
            ChoiceOptionValue: null,
        },
    ]);
});

describe('entitlement grant beneficiary', () => {
    it("falls back to the order's ship-to before its bill-to", async () => {
        await CreateEntitlementGrants(ORDER, [line()], new Map(), provider, user);
        expect(mocks.saved).toHaveLength(1);
        expect(mocks.saved[0].BeneficiaryPersonID).toBe('ship-to-person');
        expect(mocks.saved[0].BeneficiaryOrganizationID).toBe('bill-to-org');
    });

    it("prefers the line's own ship-to", async () => {
        await CreateEntitlementGrants(ORDER, [line({ ShipToPersonID: 'line-person' })], new Map(), provider, user);
        expect(mocks.saved[0].BeneficiaryPersonID).toBe('line-person');
    });

    it('takes the bill-to when neither the line nor the order names a ship-to', async () => {
        await CreateEntitlementGrants(
            { ...ORDER, ShipToPersonID: null, BillToPersonID: 'buyer-person' },
            [line()],
            new Map(),
            provider,
            user,
        );
        expect(mocks.saved[0].BeneficiaryPersonID).toBe('buyer-person');
        expect(mocks.saved[0].BeneficiaryOrganizationID).toBe('bill-to-org');
    });

    it("gives a renewal's access to the renewed subscription's holder, not the order's parties", async () => {
        // A renewal keeps its target's holder (D61); the line's fallback would name the order's
        // ship-to person instead.
        mocks.rows.set('Subscription Terms', [{ ID: 'term-1', SubscriptionID: 'sub-1' }]);
        mocks.rows.set('Subscriptions', [{ ID: 'sub-1', HolderOrganizationID: 'holder-org', BeneficiaryPersonID: 'holder-person' }]);
        await CreateEntitlementGrants(
            ORDER,
            [line({ RenewsSubscriptionID: 'sub-1' })],
            new Map([['line-1', TERM]]),
            provider,
            user,
        );
        expect(mocks.saved[0].SubscriptionID).toBe('sub-1');
        expect(mocks.saved[0].BeneficiaryPersonID).toBe('holder-person');
        expect(mocks.saved[0].BeneficiaryOrganizationID).toBe('holder-org');
    });

    it("keeps an organization inferred onto the subscription from the person's affiliation", async () => {
        // The subscription pass fills a blank organization from the person's affiliation (D64); the
        // grant must carry that organization too, not the order's bill-to.
        mocks.rows.set('Subscription Terms', [{ ID: 'term-1', SubscriptionID: 'sub-1' }]);
        mocks.rows.set('Subscriptions', [{ ID: 'sub-1', HolderOrganizationID: 'employer-org', BeneficiaryPersonID: 'ship-to-person' }]);
        await CreateEntitlementGrants(ORDER, [line()], new Map([['line-1', TERM]]), provider, user);
        expect(mocks.saved[0].BeneficiaryPersonID).toBe('ship-to-person');
        expect(mocks.saved[0].BeneficiaryOrganizationID).toBe('employer-org');
    });
});
