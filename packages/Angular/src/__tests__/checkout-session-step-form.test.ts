import '@angular/compiler';
import '../public-api';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { OrdersReplayCheckoutStepOperation } from '@mj-biz-apps/orders-entities';
import {
    BizAppsCheckoutSessionStepFormComponent,
    CHECKOUT_REPLAY_AUTH,
    IsStepReplayEligible,
} from '../lib/custom/CheckoutSessionStep/checkout-session-step-form.component';

const here = import.meta.dirname;
const html = readFileSync(
    join(here, '../lib/custom/CheckoutSessionStep/checkout-session-step-form.component.html'),
    'utf8',
);

function makeForm(options: {
    authorized: boolean;
    record: {
        CheckoutSessionID: string;
        StepName: 'Capture' | 'Confirm';
        Status: 'Running' | 'Succeeded' | 'Failed';
        Attempts: number;
        LastError: string | null;
        LastAttemptAt: Date;
    };
}): BizAppsCheckoutSessionStepFormComponent {
    const form = Object.create(BizAppsCheckoutSessionStepFormComponent.prototype) as BizAppsCheckoutSessionStepFormComponent;
    form.Replaying = false;
    form.ReplayMessage = null;
    form.ReplaySucceeded = null;
    Object.defineProperty(form, 'record', { value: options.record, writable: true, configurable: true });
    Object.defineProperty(form, 'cdr', { value: { markForCheck: vi.fn() }, configurable: true });
    const roleId = 'role-checkout-operator';
    Object.defineProperty(form, 'ProviderToUse', {
        get: () => ({
            CurrentUser: {
                ID: 'user-1',
                UserRoles: options.authorized ? [{ RoleID: roleId }] : [],
            },
            Authorizations: [
                {
                    ID: 'auth-replay',
                    Name: CHECKOUT_REPLAY_AUTH,
                    ParentID: null,
                    IsActive: true,
                    Roles: [{ RoleID: roleId, Type: 'Allow' }],
                    UserCanExecute: () => options.authorized,
                },
            ],
        }),
        configurable: true,
    });
    return form;
}

describe('Checkout Session Step custom form (#853)', () => {
    afterEach(() => vi.restoreAllMocks());

    it('registers BizAppsCheckoutSessionStepFormComponent as the highest-priority form for Checkout Session Steps', () => {
        const reg = MJGlobal.Instance.ClassFactory.GetRegistration(
            BaseFormComponent,
            'MJ_BizApps_Orders: Checkout Session Steps',
        );
        expect(reg?.SubClass).toBe(BizAppsCheckoutSessionStepFormComponent);
    });

    it('gates the replay section in the template behind CanUseReplay', () => {
        expect(html).toContain('@if (CanUseReplay)');
        expect(html).toContain('(click)="ReplayStep()"');
        expect(html).toContain('[disabled]="!CanReplay"');
    });

    it('checks replay eligibility for Failed and stale Running Capture steps only', () => {
        const now = new Date('2026-11-03T12:00:00Z');
        const fiveMinAgo = new Date('2026-11-03T11:55:00Z');
        const twentyMinAgo = new Date('2026-11-03T11:40:00Z');

        expect(IsStepReplayEligible({ StepName: 'Capture', Status: 'Failed', LastAttemptAt: fiveMinAgo }, now)).toBe(true);
        expect(IsStepReplayEligible({ StepName: 'Capture', Status: 'Running', LastAttemptAt: twentyMinAgo }, now)).toBe(true);
        expect(IsStepReplayEligible({ StepName: 'Capture', Status: 'Running', LastAttemptAt: fiveMinAgo }, now)).toBe(false);
        expect(IsStepReplayEligible({ StepName: 'Capture', Status: 'Succeeded', LastAttemptAt: twentyMinAgo }, now)).toBe(false);
        expect(IsStepReplayEligible({ StepName: 'Confirm', Status: 'Failed', LastAttemptAt: twentyMinAgo }, now)).toBe(false);
    });

    it('hides/disables replay when the user lacks MJ.BizApps.Orders.Checkout.Replay', async () => {
        const execSpy = vi.spyOn(OrdersReplayCheckoutStepOperation.prototype, 'Execute');
        const form = makeForm({
            authorized: false,
            record: {
                CheckoutSessionID: '11111111-2222-4333-8444-555555555555',
                StepName: 'Capture',
                Status: 'Failed',
                Attempts: 1,
                LastError: 'Transient deadlock',
                LastAttemptAt: new Date(),
            },
        });

        expect(form.CanUseReplay).toBe(false);
        expect(form.CanReplay).toBe(false);
        await form.ReplayStep();
        expect(execSpy).not.toHaveBeenCalled();
    });

    it('invokes OrdersReplayCheckoutStepOperation and updates the step record on replay', async () => {
        const execSpy = vi.spyOn(OrdersReplayCheckoutStepOperation.prototype, 'Execute').mockResolvedValue({
            Success: true,
            Output: {
                Success: true,
                Outcome: 'Replayed',
                Message: 'Capture booked.',
                CheckoutSessionID: '11111111-2222-4333-8444-555555555555',
                StepName: 'Capture',
                Status: 'Succeeded',
                Attempts: 2,
                LastError: null,
            },
        } as never);

        const form = makeForm({
            authorized: true,
            record: {
                CheckoutSessionID: '11111111-2222-4333-8444-555555555555',
                StepName: 'Capture',
                Status: 'Failed',
                Attempts: 1,
                LastError: 'Transient deadlock',
                LastAttemptAt: new Date(),
            },
        });

        expect(form.CanUseReplay).toBe(true);
        expect(form.CanReplay).toBe(true);

        await form.ReplayStep();

        expect(execSpy).toHaveBeenCalledWith({
            CheckoutSessionID: '11111111-2222-4333-8444-555555555555',
            StepName: 'Capture',
        });
        expect(form.record.Status).toBe('Succeeded');
        expect(form.record.Attempts).toBe(2);
        expect(form.record.LastError).toBeNull();
        expect(form.ReplaySucceeded).toBe(true);
        expect(form.ReplayMessage).toBe('Capture booked.');
        expect(form.CanReplay).toBe(false);
    });
});
