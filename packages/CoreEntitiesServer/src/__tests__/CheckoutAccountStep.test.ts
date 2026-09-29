/**
 * The post-payment account step (#292): the host seam registered through the ClassFactory, the
 * outcome recorded on the session, and the one-time password call.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MJGlobal } from '@memberjunction/global';

const KEY = 'k'.repeat(36);
const SID = '6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b';

const mocks = vi.hoisted(() => {
    const session = {
        ID: '6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b',
        ClientSessionKey: '',
        Status: 'Confirmed',
        DraftOrderID: 'order-1' as string | null,
        PersonID: 'person-1' as string | null,
        CheckoutWidgetID: 'widget-1',
        Email: 'buyer@example.com' as string | null,
        MetadataJSON: null as string | null,
        __mj_CreatedAt: new Date('2026-09-29T12:00:00Z'),
        LatestResult: { CompleteMessage: '' },
        Load: vi.fn(),
        Save: vi.fn(),
    };
    const record = (fields: Record<string, unknown>) => ({
        InnerLoad: vi.fn().mockResolvedValue(true),
        Get: (name: string) => fields[name],
    });
    return { session, record, sessionExists: true };
});

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: vi.fn(),
        Metadata: class {
            GetEntityObject = vi.fn().mockImplementation((name: string) => {
                if (name === 'MJ_BizApps_Orders: Checkout Sessions') return Promise.resolve(mocks.session);
                if (name === 'MJ_BizApps_Common: People') return Promise.resolve(mocks.record({ FirstName: 'Jane', LastName: 'Doe' }));
                return Promise.resolve(mocks.record({ CompanyID: 'comp-1' }));
            });
        },
    };
});

import {
    CheckoutAccountStep,
    EnsureCheckoutAccount,
    MAX_CHECKOUT_PASSWORD_ATTEMPTS,
    SetCheckoutAccountPassword,
    type CheckoutAccountContext,
    type CheckoutAccountResult,
    type CheckoutPasswordResult,
} from '../CheckoutAccountStep.js';

/** Stands in for a host registration; the handlers are swapped per test. */
const host = {
    ensure: vi.fn<(ctx: CheckoutAccountContext) => Promise<CheckoutAccountResult>>(),
    setPassword: vi.fn<(ctx: CheckoutAccountContext & { Password: string }) => Promise<CheckoutPasswordResult>>(),
};

class TestAccountStep extends CheckoutAccountStep {
    public override EnsureAccount(ctx: CheckoutAccountContext): Promise<CheckoutAccountResult> {
        return host.ensure(ctx);
    }
    public override SetPassword(ctx: CheckoutAccountContext & { Password: string }): Promise<CheckoutPasswordResult> {
        return host.setPassword(ctx);
    }
}

const stored = () => JSON.parse(mocks.session.MetadataJSON ?? '{}').Account;

describe('checkout account step', () => {
    let createInstance: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        Object.assign(mocks.session, {
            ClientSessionKey: KEY,
            Status: 'Confirmed',
            DraftOrderID: 'order-1',
            PersonID: 'person-1',
            Email: 'buyer@example.com',
            MetadataJSON: JSON.stringify({ Lines: [{ ProductID: 'p', Quantity: 1 }] }),
        });
        mocks.session.Load.mockReset().mockImplementation(() => Promise.resolve(mocks.sessionExists));
        mocks.session.Save.mockReset().mockResolvedValue(true);
        mocks.sessionExists = true;
        host.ensure.mockReset().mockResolvedValue({ Outcome: 'Created' });
        host.setPassword.mockReset().mockResolvedValue({ Success: true });
        createInstance = vi.spyOn(MJGlobal.Instance.ClassFactory, 'CreateInstance').mockReturnValue(new TestAccountStep());
    });

    afterEach(() => {
        createInstance.mockRestore();
    });

    describe('EnsureCheckoutAccount', () => {
        it('with no step registered reports no account and touches nothing', async () => {
            createInstance.mockReturnValue(new CheckoutAccountStep());
            const res = await EnsureCheckoutAccount(SID, KEY);
            expect(res).toEqual({ Success: true });
            expect(mocks.session.Load).not.toHaveBeenCalled();
            expect(mocks.session.Save).not.toHaveBeenCalled();
        });

        it('tells the host who bought, and records a created account as open for a password', async () => {
            const res = await EnsureCheckoutAccount(SID, KEY);
            expect(host.ensure).toHaveBeenCalledWith(
                expect.objectContaining({
                    Email: 'buyer@example.com',
                    FirstName: 'Jane',
                    LastName: 'Doe',
                    PersonID: 'person-1',
                    OrderID: 'order-1',
                    CompanyID: 'comp-1',
                    SessionID: SID,
                    SessionCreatedAt: new Date('2026-09-29T12:00:00Z'),
                })
            );
            expect(res.Account).toEqual({ Outcome: 'Created', Message: undefined, CanSetPassword: true });
            expect(stored()).toMatchObject({ Outcome: 'Created', PasswordSet: false, PasswordAttempts: 0 });
            // What the checkout stored before is kept.
            expect(JSON.parse(mocks.session.MetadataJSON ?? '{}').Lines).toEqual([{ ProductID: 'p', Quantity: 1 }]);
        });

        it('reports an existing account with the host message and no password', async () => {
            host.ensure.mockResolvedValue({ Outcome: 'Exists', Message: 'Sign in on our website.' });
            const res = await EnsureCheckoutAccount(SID, KEY);
            expect(res.Account).toEqual({ Outcome: 'Exists', Message: 'Sign in on our website.', CanSetPassword: false });
        });

        it('records a host that throws as Failed, with a message for the buyer', async () => {
            host.ensure.mockRejectedValue(new Error('identity provider down'));
            const res = await EnsureCheckoutAccount(SID, KEY);
            expect(res.Success).toBe(true);
            expect(res.Account?.Outcome).toBe('Failed');
            expect(res.Account?.Message).toContain('could not set up your account');
            expect(res.Account?.Message).not.toContain('identity provider');
        });

        it('records NotApplicable and answers as if no step were registered, without asking again', async () => {
            host.ensure.mockResolvedValue({ Outcome: 'NotApplicable' });
            expect(await EnsureCheckoutAccount(SID, KEY)).toEqual({ Success: true });
            expect(stored().Outcome).toBe('NotApplicable');
            expect(await EnsureCheckoutAccount(SID, KEY)).toEqual({ Success: true });
            expect(host.ensure).toHaveBeenCalledTimes(1);
        });

        it('treats an answer outside the known outcomes as Failed', async () => {
            host.ensure.mockResolvedValue({ Outcome: 'Maybe' } as unknown as CheckoutAccountResult);
            expect((await EnsureCheckoutAccount(SID, KEY)).Account?.Outcome).toBe('Failed');
        });

        it('returns a recorded Created or Exists without asking the host again', async () => {
            await EnsureCheckoutAccount(SID, KEY);
            host.ensure.mockResolvedValue({ Outcome: 'Exists' });
            const again = await EnsureCheckoutAccount(SID, KEY);
            expect(host.ensure).toHaveBeenCalledTimes(1);
            expect(again.Account?.Outcome).toBe('Created');
        });

        it('asks the host again after a failure', async () => {
            host.ensure.mockResolvedValueOnce({ Outcome: 'Failed' }).mockResolvedValueOnce({ Outcome: 'Created' });
            await EnsureCheckoutAccount(SID, KEY);
            const again = await EnsureCheckoutAccount(SID, KEY);
            expect(host.ensure).toHaveBeenCalledTimes(2);
            expect(again.Account?.Outcome).toBe('Created');
        });

        it('refuses a session id that is not a UUID without loading anything', async () => {
            const res = await EnsureCheckoutAccount("x' OR 1=1 --", KEY);
            expect(res).toEqual({ Success: false, ErrorMessage: 'Checkout session not found' });
            expect(mocks.session.Load).not.toHaveBeenCalled();
        });

        it('refuses a wrong client key', async () => {
            const res = await EnsureCheckoutAccount(SID, 'x'.repeat(36));
            expect(res.Success).toBe(false);
            expect(host.ensure).not.toHaveBeenCalled();
        });

        it('refuses a checkout that has not confirmed its order', async () => {
            mocks.session.Status = 'Open';
            mocks.session.DraftOrderID = null;
            const res = await EnsureCheckoutAccount(SID, KEY);
            expect(res).toEqual({ Success: false, ErrorMessage: 'This checkout has not completed yet.' });
            expect(host.ensure).not.toHaveBeenCalled();
        });

        it('fails without asking the host when the session has no e-mail', async () => {
            mocks.session.Email = null;
            const res = await EnsureCheckoutAccount(SID, KEY);
            expect(res.Account?.Outcome).toBe('Failed');
            expect(host.ensure).not.toHaveBeenCalled();
        });
    });

    describe('SetCheckoutAccountPassword', () => {
        it('passes the password to the host once, for the account this checkout created', async () => {
            await EnsureCheckoutAccount(SID, KEY);
            const res = await SetCheckoutAccountPassword(SID, KEY, 'correct horse battery');
            expect(res.Success).toBe(true);
            expect(host.setPassword).toHaveBeenCalledWith(expect.objectContaining({ Email: 'buyer@example.com', Password: 'correct horse battery' }));
            expect(res.Account?.CanSetPassword).toBe(false);
            expect(mocks.session.MetadataJSON).not.toContain('correct horse battery');

            const second = await SetCheckoutAccountPassword(SID, KEY, 'another one');
            expect(second.Success).toBe(false);
            expect(host.setPassword).toHaveBeenCalledTimes(1);
        });

        it('refuses when the account already existed', async () => {
            host.ensure.mockResolvedValue({ Outcome: 'Exists' });
            await EnsureCheckoutAccount(SID, KEY);
            const res = await SetCheckoutAccountPassword(SID, KEY, 'pw');
            expect(res.Success).toBe(false);
            expect(res.ErrorMessage).toContain('cannot be set here');
            expect(host.setPassword).not.toHaveBeenCalled();
        });

        it('refuses before the account step has run', async () => {
            const res = await SetCheckoutAccountPassword(SID, KEY, 'pw');
            expect(res.Success).toBe(false);
            expect(host.setPassword).not.toHaveBeenCalled();
        });

        it('refuses a wrong client key', async () => {
            await EnsureCheckoutAccount(SID, KEY);
            const res = await SetCheckoutAccountPassword(SID, 'x'.repeat(36), 'pw');
            expect(res.Success).toBe(false);
            expect(host.setPassword).not.toHaveBeenCalled();
        });

        it.each([['empty', ''], ['not a string', 42], ['too long', 'p'.repeat(257)]])('refuses a password that is %s', async (_name, pw) => {
            await EnsureCheckoutAccount(SID, KEY);
            const res = await SetCheckoutAccountPassword(SID, KEY, pw);
            expect(res.Success).toBe(false);
            expect(host.setPassword).not.toHaveBeenCalled();
            expect(res.Account?.CanSetPassword).toBe(true);
        });

        it('shows the host refusal, lets the buyer try again, and closes after the last attempt', async () => {
            await EnsureCheckoutAccount(SID, KEY);
            host.setPassword.mockResolvedValue({ Success: false, Message: 'Use at least 10 characters.' });
            for (let i = 1; i <= MAX_CHECKOUT_PASSWORD_ATTEMPTS; i++) {
                const res = await SetCheckoutAccountPassword(SID, KEY, 'short');
                expect(res.ErrorMessage).toBe('Use at least 10 characters.');
                expect(res.Account?.CanSetPassword).toBe(i < MAX_CHECKOUT_PASSWORD_ATTEMPTS);
            }
            const closed = await SetCheckoutAccountPassword(SID, KEY, 'long enough now');
            expect(closed.Success).toBe(false);
            expect(host.setPassword).toHaveBeenCalledTimes(MAX_CHECKOUT_PASSWORD_ATTEMPTS);
        });

        it('treats a host that throws as a refused attempt', async () => {
            await EnsureCheckoutAccount(SID, KEY);
            host.setPassword.mockRejectedValue(new Error('boom'));
            const res = await SetCheckoutAccountPassword(SID, KEY, 'pw');
            expect(res.Success).toBe(false);
            expect(res.ErrorMessage).toContain('could not be set');
            expect(stored().PasswordAttempts).toBe(1);
        });

        it('refuses a session the step does not apply to', async () => {
            host.ensure.mockResolvedValue({ Outcome: 'NotApplicable' });
            await EnsureCheckoutAccount(SID, KEY);
            const res = await SetCheckoutAccountPassword(SID, KEY, 'pw');
            expect(res.Success).toBe(false);
            expect(res.Account).toBeUndefined();
            expect(host.setPassword).not.toHaveBeenCalled();
        });

        it('closes the password once the window has passed', async () => {
            vi.useFakeTimers({ now: new Date('2026-09-29T12:10:00Z'), toFake: ['Date'] });
            try {
                const created = await EnsureCheckoutAccount(SID, KEY);
                expect(created.Account?.CanSetPassword).toBe(true);
                vi.setSystemTime(new Date('2026-09-29T12:14:59Z'));
                expect((await EnsureCheckoutAccount(SID, KEY)).Account?.CanSetPassword).toBe(true);
                vi.setSystemTime(new Date('2026-09-29T12:15:01Z'));
                expect((await EnsureCheckoutAccount(SID, KEY)).Account?.CanSetPassword).toBe(false);
                const res = await SetCheckoutAccountPassword(SID, KEY, 'correct horse battery');
                expect(res.Success).toBe(false);
                expect(res.ErrorMessage).toContain('has passed');
                expect(host.setPassword).not.toHaveBeenCalled();
            } finally {
                vi.useRealTimers();
            }
        });

        it('uses the host step\'s own window', async () => {
            class LongWindowStep extends TestAccountStep {
                public override get PasswordWindowMinutes(): number {
                    return 30;
                }
            }
            createInstance.mockReturnValue(new LongWindowStep());
            vi.useFakeTimers({ now: new Date('2026-09-29T12:00:00Z'), toFake: ['Date'] });
            try {
                await EnsureCheckoutAccount(SID, KEY);
                vi.setSystemTime(new Date('2026-09-29T12:20:00Z'));
                expect((await SetCheckoutAccountPassword(SID, KEY, 'correct horse battery')).Success).toBe(true);
            } finally {
                vi.useRealTimers();
            }
        });

        it('with no step registered, refuses', async () => {
            createInstance.mockReturnValue(new CheckoutAccountStep());
            const res = await SetCheckoutAccountPassword(SID, KEY, 'pw');
            expect(res).toEqual({ Success: false, ErrorMessage: 'This checkout does not create accounts.' });
        });
    });
});
