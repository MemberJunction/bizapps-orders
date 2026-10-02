/**
 * Whether a completed checkout's access is ready (#325).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const SID = '6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b';
const ORDER = '7a1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b';
const KEY = 'k'.repeat(36);

const mocks = vi.hoisted(() => ({
    session: {} as Record<string, unknown>,
    rows: [] as Array<{ Status: string }>,
    success: true,
    lastFilter: '',
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: vi.fn(),
        Metadata: class {
            static Provider = {};
            GetEntityObject = vi.fn().mockImplementation(() =>
                Promise.resolve({ ...mocks.session, Load: vi.fn().mockResolvedValue(mocks.session.exists !== false) })
            );
        },
        RunView: class {
            RunView = vi.fn().mockImplementation((p: { ExtraFilter: string }) => {
                mocks.lastFilter = p.ExtraFilter;
                return Promise.resolve({ Success: mocks.success, Results: mocks.rows, ErrorMessage: 'db down' });
            });
        },
    };
});

import { GetCheckoutAccessStatus, SummarizeAccessDeliveries } from '../CheckoutAccessStatus.js';

describe('SummarizeAccessDeliveries', () => {
    it.each([
        [[], 'NotTracked'],
        [['Delivered', 'Delivered'], 'Ready'],
        [['Delivered', 'Pending'], 'Pending'],
        [['Pending', 'DeadLettered'], 'Failed'],
        [['Delivered', 'DeadLettered'], 'Failed'],
    ])('%j is %s', (statuses, expected) => {
        expect(SummarizeAccessDeliveries(statuses as string[])).toBe(expected);
    });
});

describe('GetCheckoutAccessStatus', () => {
    beforeEach(() => {
        mocks.session = { ID: SID, ClientSessionKey: KEY, Status: 'Confirmed', DraftOrderID: ORDER };
        mocks.rows = [];
        mocks.success = true;
        mocks.lastFilter = '';
    });

    it("reads only the gating deliveries of the session's order", async () => {
        mocks.rows = [{ Status: 'Delivered' }];
        expect(await GetCheckoutAccessStatus(SID, KEY)).toEqual({ Success: true, State: 'Ready' });
        expect(mocks.lastFilter).toContain('GatesAccess = 1');
        expect(mocks.lastFilter).toContain(`OrderHeaderID = '${ORDER}'`);
    });

    it('reports NotTracked when no consumer gates access', async () => {
        expect(await GetCheckoutAccessStatus(SID, KEY)).toEqual({ Success: true, State: 'NotTracked' });
    });

    it('refuses a session id that is not a UUID, a wrong key, and an unconfirmed checkout', async () => {
        expect((await GetCheckoutAccessStatus("x' OR 1=1", KEY)).Success).toBe(false);
        expect((await GetCheckoutAccessStatus(SID, 'x'.repeat(36))).ErrorMessage).toBe('Checkout session key does not match');
        mocks.session.Status = 'Open';
        expect((await GetCheckoutAccessStatus(SID, KEY)).ErrorMessage).toBe('This checkout has not completed yet.');
        expect(mocks.lastFilter).toBe('');
    });

    it('reports a failed read as unavailable, not as a state', async () => {
        mocks.success = false;
        expect(await GetCheckoutAccessStatus(SID, KEY)).toEqual({ Success: false, ErrorMessage: 'Access status is not available right now.' });
    });
});
