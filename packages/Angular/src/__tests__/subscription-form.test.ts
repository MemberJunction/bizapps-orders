import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import type { mjBizAppsOrdersSubscriptionEntity } from '@mj-biz-apps/orders-entities';
import { mjBizAppsOrdersSubscriptionFormComponent } from '../lib/generated/Entities/mjBizAppsOrdersSubscription/mjbizappsorderssubscription.form.component';
import { BizAppsSubscriptionFormComponent } from '../lib/custom/Subscription/subscription-form.component';
import '../public-api';

describe('BizAppsSubscriptionFormComponent Custom Form Registration & Getters', () => {
    it('subclasses the generated mjBizAppsOrdersSubscriptionFormComponent', () => {
        expect(BizAppsSubscriptionFormComponent.prototype instanceof mjBizAppsOrdersSubscriptionFormComponent).toBe(true);
    });

    it('registers with BaseFormComponent under key "MJ_BizApps_Orders: Subscriptions"', () => {
        const registrations = MJGlobal.Instance.ClassFactory.GetAllRegistrations(
            BaseFormComponent,
            'MJ_BizApps_Orders: Subscriptions'
        );
        expect(registrations.length).toBeGreaterThanOrEqual(1);

        const customReg = registrations.find(r => r.SubClass === BizAppsSubscriptionFormComponent);
        expect(customReg).toBeDefined();
    });

    it('wins ClassFactory lookup priority over the generated component', () => {
        const activeReg = MJGlobal.Instance.ClassFactory.GetRegistration(
            BaseFormComponent,
            'MJ_BizApps_Orders: Subscriptions'
        );
        expect(activeReg).toBeDefined();
        expect(activeReg?.SubClass).toBe(BizAppsSubscriptionFormComponent);
    });

    it('formats coverage window properly', () => {
        const instance = Object.create(BizAppsSubscriptionFormComponent.prototype) as BizAppsSubscriptionFormComponent;
        instance.record = {
            StartDate: new Date('2026-01-01T00:00:00Z'),
            EndDate: new Date('2026-12-31T00:00:00Z'),
        } as unknown as mjBizAppsOrdersSubscriptionEntity;

        expect(instance.FormattedCoverageWindow).toContain('2026');
        expect(instance.FormattedCoverageWindow).toContain('–');

        instance.record = {} as unknown as mjBizAppsOrdersSubscriptionEntity;
        expect(instance.FormattedCoverageWindow).toBe('—');
    });

    it('resolves holder and beneficiary names correctly', () => {
        const instance = Object.create(BizAppsSubscriptionFormComponent.prototype) as BizAppsSubscriptionFormComponent;
        instance.record = {
            HolderOrganization: 'Acme Corp',
            BeneficiaryPerson: 'Jane Doe',
        } as unknown as mjBizAppsOrdersSubscriptionEntity;

        expect(instance.HolderDisplayName).toBe('Acme Corp');
        expect(instance.BeneficiaryDisplayName).toBe('Jane Doe');
    });

    it('computes auto-renew badges and status badges accurately', () => {
        const instance = Object.create(BizAppsSubscriptionFormComponent.prototype) as BizAppsSubscriptionFormComponent;
        instance.record = {
            AutoRenew: true,
            Status: 'Active',
        } as unknown as mjBizAppsOrdersSubscriptionEntity;

        expect(instance.AutoRenewBadgeClass).toContain('mjo-renew-chip--on');
        expect(instance.StatusBadgeClass).toContain('mjo-status-chip--active');

        instance.record = {
            AutoRenew: false,
            Status: 'Paused',
        } as unknown as mjBizAppsOrdersSubscriptionEntity;

        expect(instance.AutoRenewBadgeClass).toContain('mjo-renew-chip--off');
        expect(instance.StatusBadgeClass).toContain('mjo-status-chip--warning');

        instance.record = {
            AutoRenew: true,
            Status: 'Canceled',
        } as unknown as mjBizAppsOrdersSubscriptionEntity;

        expect(instance.StatusBadgeClass).toContain('mjo-status-chip--inactive');
    });
});
