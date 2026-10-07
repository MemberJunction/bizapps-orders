/**
 * CheckoutStepLog (#326): one row per session per post-payment step, counted per attempt,
 * and never the reason a step fails.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type { mjBizAppsOrdersCheckoutSessionStepEntity } from '@mj-biz-apps/orders-entities';

type Row = {
    NewRecord: ReturnType<typeof vi.fn>;
    Save: ReturnType<typeof vi.fn>;
    LatestResult: { CompleteMessage: string };
    CheckoutSessionID: string;
    StepName: 'Confirm' | 'Capture';
    Status: 'Running' | 'Succeeded' | 'Failed';
    Attempts: number;
    LastError: string | null;
    Retryable: boolean | null;
    LastAttemptSource: 'Checkout' | 'Webhook' | 'Replay';
    LastReplayedByUserID: string | null;
    FirstAttemptAt: Date;
    LastAttemptAt: Date;
    SucceededAt: Date | null;
};

const m = vi.hoisted(() => ({
    RunView: vi.fn(),
    GetEntityObject: vi.fn(),
    LogError: vi.fn(),
}));

vi.mock('@memberjunction/core', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/core')>()),
    LogError: (...args: unknown[]) => m.LogError(...args),
    Metadata: class {
        GetEntityObject = (...args: unknown[]) => m.GetEntityObject(...args);
    },
    RunView: class {
        RunView = (...args: unknown[]) => m.RunView(...args);
    },
}));

import { CheckoutStepLog, STALE_RUNNING_MINUTES } from '../CheckoutStepLog.js';

const user = { ID: 'system-user' } as unknown as UserInfo;
const SESSION = '5E1B2C3D-0000-4000-8000-000000000001';

function row(overrides: Partial<Row> = {}): Row {
    return {
        NewRecord: vi.fn(),
        Save: vi.fn().mockResolvedValue(true),
        LatestResult: { CompleteMessage: '' },
        CheckoutSessionID: SESSION,
        StepName: 'Capture',
        Status: 'Failed',
        Attempts: 1,
        LastError: 'earlier',
        Retryable: true,
        LastAttemptSource: 'Checkout',
        LastReplayedByUserID: null,
        FirstAttemptAt: new Date('2026-09-01T00:00:00Z'),
        LastAttemptAt: new Date('2026-09-01T00:00:00Z'),
        SucceededAt: null,
        ...overrides,
    };
}

/** The fake row stands in for the generated entity; only the members read or written here exist. */
const entity = (r: Row) => r as unknown as mjBizAppsOrdersCheckoutSessionStepEntity;

const found = (...rows: Row[]) => ({ Success: true, Results: rows });

beforeEach(() => {
    m.RunView.mockReset();
    m.GetEntityObject.mockReset();
    m.LogError.mockReset();
});

describe('CheckoutStepLog.Begin', () => {
    it('creates the row on the first attempt: Running, one attempt, first and last attempt stamped', async () => {
        const created = row({ Attempts: undefined as unknown as number, Status: undefined as unknown as Row['Status'] });
        m.RunView.mockResolvedValue(found());
        m.GetEntityObject.mockResolvedValue(created);

        const attempt = await CheckoutStepLog.Begin(SESSION, 'Capture', 'Checkout', user);

        expect(created.NewRecord).toHaveBeenCalledTimes(1);
        expect(created.CheckoutSessionID).toBe(SESSION);
        expect(created.StepName).toBe('Capture');
        expect(created.Status).toBe('Running');
        expect(created.Attempts).toBe(1);
        expect(created.LastAttemptSource).toBe('Checkout');
        expect(created.FirstAttemptAt).toBe(created.LastAttemptAt);
        expect(attempt).toEqual({ Step: created, PreviousStatus: null, PreviousRetryable: null });
    });

    it('counts a later attempt on the same row and hands back how the previous one ended', async () => {
        const existing = row({ Status: 'Failed', Attempts: 2, Retryable: false });
        const firstAttemptAt = existing.FirstAttemptAt;
        m.RunView.mockResolvedValue(found(existing));

        const attempt = await CheckoutStepLog.Begin(SESSION, 'Capture', 'Replay', user, 'operator-1');

        expect(m.GetEntityObject).not.toHaveBeenCalled();
        expect(existing.Attempts).toBe(3);
        expect(existing.Status).toBe('Running');
        expect(existing.LastAttemptSource).toBe('Replay');
        expect(existing.LastReplayedByUserID).toBe('operator-1');
        expect(existing.FirstAttemptAt).toBe(firstAttemptAt);
        expect(attempt.PreviousStatus).toBe('Failed');
        expect(attempt.PreviousRetryable).toBe(false);
    });

    it('filters on the session and the step, escaped', async () => {
        m.RunView.mockResolvedValue(found(row()));
        await CheckoutStepLog.Begin("x' OR 1=1 --", 'Capture', 'Webhook', user);
        const params = m.RunView.mock.calls[0][0] as { ExtraFilter: string; EntityName: string };
        expect(params.EntityName).toBe('MJ_BizApps_Orders: Checkout Session Steps');
        expect(params.ExtraFilter).toBe("CheckoutSessionID = 'x'' OR 1=1 --' AND StepName = 'Capture'");
    });

    it('adopts the row a concurrent first attempt created when the unique key refuses its own insert', async () => {
        const mine = row();
        mine.Save.mockResolvedValue(false);
        const theirs = row({ Status: 'Running', Attempts: 1 });
        m.RunView.mockResolvedValueOnce(found()).mockResolvedValueOnce(found(theirs));
        m.GetEntityObject.mockResolvedValue(mine);

        const attempt = await CheckoutStepLog.Begin(SESSION, 'Capture', 'Webhook', user);

        expect(attempt.Step).toBe(theirs);
        expect(theirs.Attempts).toBe(2);
    });

    it('never throws: a record that cannot be written leaves the attempt running without one', async () => {
        m.RunView.mockRejectedValue(new Error('database gone'));
        const attempt = await CheckoutStepLog.Begin(SESSION, 'Confirm', 'Checkout', user);
        expect(attempt.Step).toBeNull();
        expect(m.LogError).toHaveBeenCalled();
    });
});

describe('CheckoutStepLog.Succeed / Fail', () => {
    it('Succeed stamps SucceededAt and clears the last error', async () => {
        const step = row({ Status: 'Running' });
        await CheckoutStepLog.Succeed({ Step: entity(step), PreviousStatus: 'Failed', PreviousRetryable: true });
        expect(step.Status).toBe('Succeeded');
        expect(step.SucceededAt).toBeInstanceOf(Date);
        expect(step.LastError).toBeNull();
        expect(step.Retryable).toBeNull();
        expect(step.Save).toHaveBeenCalledTimes(1);
    });

    it('Fail records why and whether a later attempt can succeed unchanged', async () => {
        const step = row({ Status: 'Running', LastError: null, Retryable: null });
        await CheckoutStepLog.Fail({ Step: entity(step), PreviousStatus: null, PreviousRetryable: null }, 'no bill-to party', false);
        expect(step.Status).toBe('Failed');
        expect(step.LastError).toBe('no bill-to party');
        expect(step.Retryable).toBe(false);
    });

    it('a failed save is logged, not thrown', async () => {
        const step = row({ Status: 'Running' });
        step.Save.mockRejectedValue(new Error('timeout'));
        await expect(CheckoutStepLog.Fail({ Step: entity(step), PreviousStatus: null, PreviousRetryable: null }, 'x')).resolves.toBeUndefined();
        expect(m.LogError).toHaveBeenCalled();
    });

    it('both are no-ops when the attempt has no row', async () => {
        await CheckoutStepLog.Succeed({ Step: null, PreviousStatus: null, PreviousRetryable: null });
        await CheckoutStepLog.Fail({ Step: null, PreviousStatus: null, PreviousRetryable: null }, 'x');
        expect(m.LogError).not.toHaveBeenCalled();
    });
});

describe('CheckoutStepLog.CloseIfOpen', () => {
    it('marks a recorded failed step Succeeded without counting an attempt', async () => {
        const step = row({ Status: 'Failed', Attempts: 2 });
        m.RunView.mockResolvedValue(found(step));
        await CheckoutStepLog.CloseIfOpen(SESSION, 'Capture', user);
        expect(step.Status).toBe('Succeeded');
        expect(step.Attempts).toBe(2);
    });

    it('leaves a succeeded step alone and writes nothing when the step was never recorded', async () => {
        const step = row({ Status: 'Succeeded' });
        m.RunView.mockResolvedValueOnce(found(step)).mockResolvedValueOnce(found());
        await CheckoutStepLog.CloseIfOpen(SESSION, 'Capture', user);
        await CheckoutStepLog.CloseIfOpen(SESSION, 'Capture', user);
        expect(step.Save).not.toHaveBeenCalled();
        expect(m.GetEntityObject).not.toHaveBeenCalled();
    });
});

describe('CheckoutStepLog classification', () => {
    it('a terminal failure is new unless the previous attempt already ended Failed and not retryable', () => {
        expect(CheckoutStepLog.IsNewTerminalFailure({ Step: null, PreviousStatus: null, PreviousRetryable: null })).toBe(true);
        expect(CheckoutStepLog.IsNewTerminalFailure({ Step: null, PreviousStatus: 'Failed', PreviousRetryable: true })).toBe(true);
        expect(CheckoutStepLog.IsNewTerminalFailure({ Step: null, PreviousStatus: 'Failed', PreviousRetryable: false })).toBe(false);
    });

    it('a Running row is stale only once its last attempt is older than the threshold', () => {
        const now = new Date('2026-09-28T12:00:00Z');
        const at = (minutesAgo: number) => new Date(now.getTime() - minutesAgo * 60_000);
        expect(CheckoutStepLog.IsStaleRunning(entity(row({ Status: 'Running', LastAttemptAt: at(STALE_RUNNING_MINUTES - 1) })), now)).toBe(false);
        expect(CheckoutStepLog.IsStaleRunning(entity(row({ Status: 'Running', LastAttemptAt: at(STALE_RUNNING_MINUTES + 1) })), now)).toBe(true);
        expect(CheckoutStepLog.IsStaleRunning(entity(row({ Status: 'Failed', LastAttemptAt: at(60) })), now)).toBe(false);
    });
});
