import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import type { mjBizAppsOrdersPromotionEntity } from '@mj-biz-apps/orders-entities';
import { mjBizAppsOrdersPromotionFormComponent } from '../lib/generated/Entities/mjBizAppsOrdersPromotion/mjbizappsorderspromotion.form.component';
import { BizAppsPromotionFormComponent } from '../lib/custom/Promotion/promotion-form.component';
import '../public-api';

describe('BizAppsPromotionFormComponent Custom Form Registration & Getters', () => {
    it('subclasses the generated mjBizAppsOrdersPromotionFormComponent', () => {
        expect(BizAppsPromotionFormComponent.prototype instanceof mjBizAppsOrdersPromotionFormComponent).toBe(true);
    });

    it('registers with BaseFormComponent under key "MJ_BizApps_Orders: Promotions"', () => {
        const registrations = MJGlobal.Instance.ClassFactory.GetAllRegistrations(
            BaseFormComponent,
            'MJ_BizApps_Orders: Promotions'
        );
        expect(registrations.length).toBeGreaterThanOrEqual(1);

        const customReg = registrations.find(r => r.SubClass === BizAppsPromotionFormComponent);
        expect(customReg).toBeDefined();
    });

    it('wins ClassFactory lookup priority over the generated component', () => {
        const activeReg = MJGlobal.Instance.ClassFactory.GetRegistration(
            BaseFormComponent,
            'MJ_BizApps_Orders: Promotions'
        );
        expect(activeReg).toBeDefined();
        expect(activeReg?.SubClass).toBe(BizAppsPromotionFormComponent);
    });

    it('formats discount values and status badges correctly', () => {
        const form = Object.create(BizAppsPromotionFormComponent.prototype) as BizAppsPromotionFormComponent;

        form.record = {
            Value: 20,
            PromotionType: 'Percentage Discount',
            Status: 'Active',
            AllowsStacking: true,
            StackSequence: 1,
        } as unknown as mjBizAppsOrdersPromotionEntity;

        expect(form.FormattedValue).toBe('20% Off');
        expect(form.StatusBadgeClass).toContain('mjo-status-chip--active');
        expect(form.StackingBadgeLabel).toBe('Stackable (Seq #1)');

        form.record = {
            Value: 50,
            PromotionType: 'Fixed Amount',
            Status: 'Paused',
            AllowsStacking: false,
            StackSequence: 0,
        } as unknown as mjBizAppsOrdersPromotionEntity;

        expect(form.FormattedValue).toBe('$50.00 Off');
        expect(form.StatusBadgeClass).toContain('mjo-status-chip--paused');
        expect(form.StackingBadgeLabel).toBe('Exclusive (Non-stackable)');
    });
});
