/**
 * Orders.ReplayCheckoutStep (#326): authorized, a no-op on a succeeded step, refused while an
 * attempt may be in flight, and a single re-drive of a failed capture.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';

const m = vi.hoisted(() => ({
    HasAuth: vi.fn(),
    Find: vi.fn(),
    IsStaleRunning: vi.fn(),
    ReplayCapture: vi.fn(),
    SystemUser: { ID: 'system-user' } as { ID: string } | null,
}));

vi.mock('@memberjunction/generic-database-provider', () => ({
    UserCache: { Instance: { GetSystemUser: () => m.SystemUser } },
}));

vi.mock('@mj-biz-apps/orders-entities', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@mj-biz-apps/orders-entities')>()),
    UserHasAuthorization: (...args: unknown[]) => m.HasAuth(...args),
}));

vi.mock('../CheckoutStepLog.js', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../CheckoutStepLog.js')>()),
    CheckoutStepLog: {
        Find: (...args: unknown[]) => m.Find(...args),
        IsStaleRunning: (...args: unknown[]) => m.IsStaleRunning(...args),
    },
}));

vi.mock('../CheckoutSessionService.js', () => ({
    CheckoutSessionService: { ReplayCapture: (...args: unknown[]) => m.ReplayCapture(...args) },
}));

import { CHECKOUT_REPLAY_AUTH, ReplayCheckoutStepOperation } from '../ReplayCheckoutStepOperation.js';

const SESSION = '5E1B2C3D-0000-4000-8000-000000000001';
const operator = { ID: 'operator-1' } as unknown as UserInfo;
const provider = {} as IMetadataProvider;

type Step = { CheckoutSessionID: string; StepName: string; Status: string; Attempts: number; LastError: string | null; LastAttemptAt: Date };
const step = (overrides: Partial<Step> = {}): Step => ({
    CheckoutSessionID: SESSION,
    StepName: 'Capture',
    Status: 'Failed',
    Attempts: 1,
    LastError: 'intent status is Pending',
    LastAttemptAt: new Date('2026-09-01T00:00:00Z'),
    ...overrides,
});

class Probe extends ReplayCheckoutStepOperation {
    public Run(input: { CheckoutSessionID: string; StepName: string }) {
        return this.InternalExecute(input, provider, operator);
    }
}
const replay = (stepName = 'Capture') => new Probe().Run({ CheckoutSessionID: SESSION, StepName: stepName });

beforeEach(() => {
    m.HasAuth.mockReset().mockReturnValue(true);
    m.Find.mockReset();
    m.IsStaleRunning.mockReset().mockReturnValue(false);
    m.ReplayCapture.mockReset();
    m.SystemUser = { ID: 'system-user' };
});

describe('Orders.ReplayCheckoutStep', () => {
    it('refuses a caller without the replay authorization before reading anything', async () => {
        m.HasAuth.mockReturnValue(false);
        const out = await replay();
        expect(out).toMatchObject({ Success: false, Outcome: 'Refused' });
        expect(out.Message).toContain(CHECKOUT_REPLAY_AUTH);
        expect(m.HasAuth).toHaveBeenCalledWith(CHECKOUT_REPLAY_AUTH, operator, provider);
        expect(m.Find).not.toHaveBeenCalled();
    });

    it('refuses an unknown step name', async () => {
        const out = await replay('GuestClaim');
        expect(out).toMatchObject({ Success: false, Outcome: 'Refused' });
        expect(m.Find).not.toHaveBeenCalled();
    });

    it('refuses a step that was never recorded', async () => {
        m.Find.mockResolvedValue(null);
        const out = await replay();
        expect(out).toMatchObject({ Success: false, Outcome: 'Refused' });
        expect(m.ReplayCapture).not.toHaveBeenCalled();
    });

    it('does nothing for a step that already succeeded', async () => {
        m.Find.mockResolvedValue(step({ Status: 'Succeeded', Attempts: 2, LastError: null }));
        const out = await replay();
        expect(out).toMatchObject({ Success: true, Outcome: 'AlreadySucceeded', Status: 'Succeeded', Attempts: 2 });
        expect(m.ReplayCapture).not.toHaveBeenCalled();
    });

    it('refuses a step still running inside the stale window', async () => {
        m.Find.mockResolvedValue(step({ Status: 'Running' }));
        const out = await replay();
        expect(out).toMatchObject({ Success: false, Outcome: 'Refused', Status: 'Running' });
        expect(m.ReplayCapture).not.toHaveBeenCalled();
    });

    it('replays a Running step once it is stale', async () => {
        m.Find.mockResolvedValue(step({ Status: 'Running' }));
        m.IsStaleRunning.mockReturnValue(true);
        m.ReplayCapture.mockResolvedValue({ Attempted: true, Booked: true });
        const out = await replay();
        expect(out.Outcome).toBe('Replayed');
        expect(m.ReplayCapture).toHaveBeenCalledTimes(1);
    });

    it('refuses Confirm: the buyer retries it, not the operator', async () => {
        m.Find.mockResolvedValue(step({ StepName: 'Confirm' }));
        const out = await replay('Confirm');
        expect(out).toMatchObject({ Success: false, Outcome: 'Refused', StepName: 'Confirm' });
        expect(m.ReplayCapture).not.toHaveBeenCalled();
    });

    it('re-drives a failed capture once, as the system user, naming the operator, and reports the record after it', async () => {
        m.Find
            .mockResolvedValueOnce(step({ Status: 'Failed', Attempts: 1 }))
            .mockResolvedValueOnce(step({ Status: 'Succeeded', Attempts: 2, LastError: null }));
        m.ReplayCapture.mockResolvedValue({ Attempted: true, Booked: true });

        const out = await replay();

        expect(m.ReplayCapture).toHaveBeenCalledTimes(1);
        expect(m.ReplayCapture).toHaveBeenCalledWith(SESSION, m.SystemUser, 'operator-1');
        expect(out).toMatchObject({ Success: true, Outcome: 'Replayed', Status: 'Succeeded', Attempts: 2, LastError: null });
    });

    it('reports a replay that failed again, with its error', async () => {
        m.Find
            .mockResolvedValueOnce(step())
            .mockResolvedValueOnce(step({ Attempts: 2, LastError: 'no bill-to party' }));
        m.ReplayCapture.mockResolvedValue({ Attempted: true, Booked: false, ErrorMessage: 'no bill-to party', Retryable: false });
        const out = await replay();
        expect(out).toMatchObject({ Success: false, Outcome: 'Replayed', Status: 'Failed', Attempts: 2, LastError: 'no bill-to party' });
        expect(out.Message).toContain('no bill-to party');
    });

    it('passes on a refusal from the service when the session has no confirmed order', async () => {
        m.Find.mockResolvedValue(step());
        m.ReplayCapture.mockResolvedValue('Checkout session has no confirmed order');
        const out = await replay();
        expect(out).toMatchObject({ Success: false, Outcome: 'Refused', Message: 'Checkout session has no confirmed order' });
    });
});
