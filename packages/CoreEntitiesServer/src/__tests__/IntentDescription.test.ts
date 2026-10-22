/**
 * Unit tests for the gateway description of a charge (#327). No network, no database.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { UpdateIntentRequest, UpdateIntentResult } from '../BasePaymentProvider.js';

const gateway: { Next: UpdateIntentResult; LastRequest: UpdateIntentRequest | null; Throws: boolean } = {
    Next: { Success: true },
    LastRequest: null,
    Throws: false,
};

vi.mock('../PaymentProviderResolver.js', () => ({
    ResolvePaymentProvider: async () => {
        if (gateway.Throws) throw new Error('no such provider');
        return {
            UpdateIntent: async (request: UpdateIntentRequest) => {
                gateway.LastRequest = request;
                return gateway.Next;
            },
        };
    },
}));

const { FormatIntentDescription, MAX_INTENT_DESCRIPTION_LENGTH, DescribeCheckoutSnapshot, DescribeOrder, SendOrderDescriptionToGateway } =
    await import('../IntentDescription.js');

const USER = { ID: 'user-1' } as unknown as UserInfo;
const ORDER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const PRODUCT_A = '11111111-1111-4111-8111-111111111111';
const PRODUCT_B = '22222222-2222-4222-8222-222222222222';

interface Rows {
    Products: Array<{ ID: string; Name: string }>;
    OrderNumber: string | null;
    LineProducts: string[];
}

function fakeProvider(rows: Rows): IMetadataProvider {
    return {
        RunView: async () => ({ Success: true, Results: rows.Products }),
        RunViews: async () => [
            { Success: true, Results: [{ OrderNumber: rows.OrderNumber }] },
            { Success: true, Results: rows.LineProducts.map((Product) => ({ Product })) },
        ],
    } as unknown as IMetadataProvider;
}

const snapshot = (...productIDs: string[]) => JSON.stringify({ PricedLines: productIDs.map((ProductID) => ({ ProductID })) });

beforeEach(() => {
    gateway.Next = { Success: true };
    gateway.LastRequest = null;
    gateway.Throws = false;
});

describe('FormatIntentDescription', () => {
    it('names the product and the order', () => {
        expect(FormatIntentDescription(['Annual Membership'], 'ORD-2026-0001')).toBe('Annual Membership — Order ORD-2026-0001');
    });

    it('counts further lines as "+N more"', () => {
        expect(FormatIntentDescription(['Annual Membership', 'Conference Pass', 'Webinar'], 'ORD-1')).toBe(
            'Annual Membership +2 more — Order ORD-1',
        );
    });

    it('drops the order half when there is no number yet', () => {
        expect(FormatIntentDescription(['Annual Membership', 'Webinar'])).toBe('Annual Membership +1 more');
    });

    it('drops the product half when no line has a name', () => {
        expect(FormatIntentDescription(['', '  '], 'ORD-1')).toBe('Order ORD-1');
    });

    it('returns null when there is nothing to say', () => {
        expect(FormatIntentDescription([], null)).toBeNull();
        expect(FormatIntentDescription([''], '  ')).toBeNull();
    });

    it('shortens the product name, never the order number', () => {
        const text = FormatIntentDescription(['x'.repeat(500), 'y'], 'ORD-2026-0001')!;
        expect(text.length).toBeLessThanOrEqual(MAX_INTENT_DESCRIPTION_LENGTH);
        expect(text.endsWith('… +1 more — Order ORD-2026-0001')).toBe(true);
    });
});

describe('DescribeCheckoutSnapshot', () => {
    it('describes the priced lines in line order, without an order number', async () => {
        const provider = fakeProvider({
            Products: [
                { ID: PRODUCT_B, Name: 'Conference Pass' },
                { ID: PRODUCT_A, Name: 'Annual Membership' },
            ],
            OrderNumber: null,
            LineProducts: [],
        });
        expect(await DescribeCheckoutSnapshot(snapshot(PRODUCT_A, PRODUCT_B), provider, USER)).toBe('Annual Membership +1 more');
    });

    it('returns null for a missing or malformed snapshot instead of throwing', async () => {
        const provider = fakeProvider({ Products: [], OrderNumber: null, LineProducts: [] });
        expect(await DescribeCheckoutSnapshot(null, provider, USER)).toBeNull();
        expect(await DescribeCheckoutSnapshot('{not json', provider, USER)).toBeNull();
        expect(await DescribeCheckoutSnapshot(snapshot('not-a-uuid'), provider, USER)).toBeNull();
    });
});

describe('DescribeOrder', () => {
    it('describes an order from its lines and number', async () => {
        const provider = fakeProvider({ Products: [], OrderNumber: 'ORD-9', LineProducts: ['Annual Membership', 'Webinar'] });
        expect(await DescribeOrder(ORDER_ID, provider, USER)).toBe('Annual Membership +1 more — Order ORD-9');
    });

    it('refuses a non-UUID order id without querying', async () => {
        const runViews = vi.fn();
        const provider = { RunViews: runViews } as unknown as IMetadataProvider;
        expect(await DescribeOrder("x' OR 1=1 --", provider, USER)).toBeNull();
        expect(runViews).not.toHaveBeenCalled();
    });
});

describe('SendOrderDescriptionToGateway', () => {
    const intent = { PaymentProviderID: 'provider-1', ProviderIntentID: 'pi_1' };
    const provider = () => fakeProvider({ Products: [], OrderNumber: 'ORD-9', LineProducts: ['Annual Membership'] });

    it('sends the full description and the order id', async () => {
        await SendOrderDescriptionToGateway(intent, ORDER_ID, provider(), USER);
        expect(gateway.LastRequest).toEqual({
            ProviderIntentID: 'pi_1',
            Description: 'Annual Membership — Order ORD-9',
            Metadata: { OrderHeaderID: ORDER_ID },
        });
    });

    it('does nothing for an intent with no gateway id', async () => {
        await SendOrderDescriptionToGateway({ PaymentProviderID: 'provider-1', ProviderIntentID: null }, ORDER_ID, provider(), USER);
        expect(gateway.LastRequest).toBeNull();
    });

    it('never throws when the gateway refuses or the provider cannot be resolved', async () => {
        gateway.Next = { Success: false, Reason: 'no' };
        await expect(SendOrderDescriptionToGateway(intent, ORDER_ID, provider(), USER)).resolves.toBeUndefined();
        gateway.Throws = true;
        await expect(SendOrderDescriptionToGateway(intent, ORDER_ID, provider(), USER)).resolves.toBeUndefined();
    });
});
