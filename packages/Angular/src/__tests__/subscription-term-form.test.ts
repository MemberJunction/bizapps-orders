import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import type { mjBizAppsOrdersSubscriptionTermEntity } from '@mj-biz-apps/orders-entities';
import { mjBizAppsOrdersSubscriptionTermFormComponent } from '../lib/generated/Entities/mjBizAppsOrdersSubscriptionTerm/mjbizappsorderssubscriptionterm.form.component';
import { BizAppsSubscriptionTermFormComponent } from '../lib/custom/SubscriptionTerm/subscription-term-form.component';
import '../public-api';

describe('BizAppsSubscriptionTermFormComponent Custom Form Registration & Getters', () => {
    it('subclasses the generated mjBizAppsOrdersSubscriptionTermFormComponent', () => {
        expect(BizAppsSubscriptionTermFormComponent.prototype instanceof mjBizAppsOrdersSubscriptionTermFormComponent).toBe(true);
    });

    it('registers with BaseFormComponent under key "MJ_BizApps_Orders: Subscription Terms"', () => {
        const registrations = MJGlobal.Instance.ClassFactory.GetAllRegistrations(
            BaseFormComponent,
            'MJ_BizApps_Orders: Subscription Terms'
        );
        expect(registrations.length).toBeGreaterThanOrEqual(1);

        const customReg = registrations.find(r => r.SubClass === BizAppsSubscriptionTermFormComponent);
        expect(customReg).toBeDefined();
    });

    it('wins ClassFactory lookup priority over the generated component', () => {
        const activeReg = MJGlobal.Instance.ClassFactory.GetRegistration(
            BaseFormComponent,
            'MJ_BizApps_Orders: Subscription Terms'
        );
        expect(activeReg).toBeDefined();
        expect(activeReg?.SubClass).toBe(BizAppsSubscriptionTermFormComponent);
    });

    it('formats coverage window properly', () => {
        const instance = Object.create(BizAppsSubscriptionTermFormComponent.prototype) as BizAppsSubscriptionTermFormComponent;
        instance.record = {
            StartDate: new Date('2026-08-14T00:00:00Z'),
            EndDate: new Date('2027-08-13T00:00:00Z'),
        } as unknown as mjBizAppsOrdersSubscriptionTermEntity;

        expect(instance.FormattedCoverageWindow).toContain('2026');
        expect(instance.FormattedCoverageWindow).toContain('2027');
        expect(instance.FormattedCoverageWindow).toContain('–');

        instance.record = {} as unknown as mjBizAppsOrdersSubscriptionTermEntity;
        expect(instance.FormattedCoverageWindow).toBe('—');
    });

    it('formats money and computes status badges accurately', () => {
        const instance = Object.create(BizAppsSubscriptionTermFormComponent.prototype) as BizAppsSubscriptionTermFormComponent;
        instance.record = {
            Amount: 240,
            Status: 'Active',
            TermNumber: 1,
        } as unknown as mjBizAppsOrdersSubscriptionTermEntity;

        expect(instance.FormatMoney(240)).toBe('$240.00');
        expect(instance.StatusBadgeClass).toContain('mjo-status-chip--active');

        instance.record = {
            Amount: 120,
            Status: 'Scheduled',
            TermNumber: 2,
        } as unknown as mjBizAppsOrdersSubscriptionTermEntity;

        expect(instance.StatusBadgeClass).toContain('mjo-status-chip--info');
    });
});
