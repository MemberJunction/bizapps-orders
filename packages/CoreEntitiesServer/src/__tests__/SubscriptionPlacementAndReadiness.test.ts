/**
 * Two order-level fixes taken from the go-live pass:
 *
 *   - a later order for the same product does not reattach to a CANCELED subscription (golive #384);
 *   - the order form's readiness list names an event line still missing its attendee (golive #382),
 *     the same refusal confirm gives, instead of that refusal arriving only at Confirm.
 *
 * `Object.create` matches the sibling order tests: the server entity without metadata, with the
 * generated accessors shadowed by plain properties.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';

const attendee = vi.hoisted(() => ({ requiring: new Set<string>(), withAttendee: new Set<string>() }));

vi.mock('../AttendeeRequirement.js', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../AttendeeRequirement.js')>()),
    LoadProductsRequiringAttendees: vi.fn(async () => attendee.requiring),
    LoadLinesWithAttendee: vi.fn(async () => attendee.withAttendee),
}));

vi.mock('../ConcessionGate.js', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../ConcessionGate.js')>()),
    FindUnapprovedConcessions: vi.fn(async () => [] as string[]),
}));

import { OrderEntityServer } from '../OrderEntityServer.js';

const USER = { ID: '11111111-2222-4333-8444-555555555555', Name: 'Test User' } as unknown as UserInfo;
const EVENT_PRODUCT = 'e0000000-0000-4000-8000-000000000001';

afterEach(() => {
    attendee.requiring = new Set();
    attendee.withAttendee = new Set();
});

describe('subscription placement skips a canceled subscription (golive #384)', () => {
    it('asks only for subscriptions that are not canceled, or are gateway-billed', async () => {
        const filters: string[] = [];
        const order = Object.create(OrderEntityServer.prototype) as {
            findExistingSubscription(productID: string, match: { OrganizationID: string | null; PersonID: string | null }): Promise<unknown>;
        };
        Object.defineProperty(order, 'ContextCurrentUser', { value: USER });
        Object.defineProperty(order, 'ProviderToUse', {
            value: {
                RunView: async (params: { ExtraFilter?: string }) => {
                    if (params.ExtraFilter) filters.push(params.ExtraFilter);
                    return { Success: true, Results: [] };
                },
            } as unknown as IMetadataProvider,
        });

        await order.findExistingSubscription('aaaaaaaa-1111-4222-8333-444444444444', {
            OrganizationID: 'bbbbbbbb-1111-4222-8333-444444444444',
            PersonID: null,
        });

        expect(filters).toHaveLength(1);
        expect(filters[0]).toContain("(Status <> 'Canceled' OR ProviderSubscriptionID IS NOT NULL)");
    });
});

describe("the readiness list names a missing attendee (golive #382)", () => {
    function draftWithEventLine() {
        const line = {
            IsSaved: true,
            ID: 'd0000000-0000-4000-8000-000000000001',
            LineNumber: 1,
            ProductID: EVENT_PRODUCT,
            Quantity: 1,
            ReversesOrderLineID: null,
            ParentOrderLineID: null,
            ISAChild: null,
            GetFieldByName: () => ({ Dirty: false }),
        };
        const o = Object.create(OrderEntityServer.prototype) as OrderEntityServer;
        for (const [k, v] of Object.entries({
            IsSaved: true,
            ID: 'b0000000-0000-4000-8000-000000000001',
            OrderNumber: 'ORD-1',
            Status: 'Draft',
            ContextCurrentUser: USER,
            ProviderToUse: {},
            Lines: { Items: [line], Count: 1, IsLoaded: true },
            _renewalPricedLines: new Map(),
        })) {
            Object.defineProperty(o, k, { value: v, writable: true });
        }
        Object.defineProperty(o, 'pendingLineNet', { value: () => 0 });
        Object.defineProperty(o, 'loadPersistedRenewalMarks', { value: async () => undefined });
        return o;
    }

    it('lists the event line that has no attendee', async () => {
        attendee.requiring = new Set([EVENT_PRODUCT]);
        const problems = await draftWithEventLine().PreviewConcessionProblems();
        expect(problems).toHaveLength(1);
        expect(problems[0]).toMatch(/attendee/i);
    });

    it('lists nothing once the line has its attendee', async () => {
        attendee.requiring = new Set([EVENT_PRODUCT]);
        attendee.withAttendee = new Set(['d0000000-0000-4000-8000-000000000001']);
        expect(await draftWithEventLine().PreviewConcessionProblems()).toEqual([]);
    });
});
