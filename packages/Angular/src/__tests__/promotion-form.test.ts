import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { BaseFormComponent, BaseFormPanel } from '@memberjunction/ng-base-forms';
import type { mjBizAppsOrdersPromotionEntity } from '@mj-biz-apps/orders-entities';
import { mjBizAppsOrdersPromotionFormComponent } from '../lib/generated/Entities/mjBizAppsOrdersPromotion/mjbizappsorderspromotion.form.component';
import { BizAppsPromotionFormComponent } from '../lib/custom/Promotion/promotion-form.component';
import { PromotionHeaderPanel } from '../lib/form-panels/promotion-header.panel';
import '../public-api';

describe('BizAppsPromotionFormComponent Custom Form Registration & Getters', () => {
    it('subclasses the generated mjBizAppsOrdersPromotionFormComponent', () => {
        expect(BizAppsPromotionFormComponent.prototype instanceof mjBizAppsOrdersPromotionFormComponent).toBe(true);
    });

    it('leaves the generated Promotion form as the registered form', () => {
        const activeReg = MJGlobal.Instance.ClassFactory.GetRegistration(
            BaseFormComponent,
            'MJ_BizApps_Orders: Promotions'
        );
        expect(activeReg?.SubClass?.name).toBe('mjBizAppsOrdersPromotionFormComponent');
        const customReg = MJGlobal.Instance.ClassFactory.GetAllRegistrations(
            BaseFormComponent,
            'MJ_BizApps_Orders: Promotions'
        ).find(r => r.SubClass === BizAppsPromotionFormComponent);
        expect(customReg).toBeUndefined();
    });

    it('registers the identity header as a form contribution', () => {
        const regs = MJGlobal.Instance.ClassFactory.GetAllRegistrations(BaseFormPanel);
        expect(regs.some(r => r.SubClass === PromotionHeaderPanel)).toBe(true);
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
