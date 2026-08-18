import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { BaseFormComponent, BaseFormPanel } from '@memberjunction/ng-base-forms';
import type { mjBizAppsOrdersPriceListEntity } from '@mj-biz-apps/orders-entities';
import { mjBizAppsOrdersPriceListFormComponent } from '../lib/generated/Entities/mjBizAppsOrdersPriceList/mjbizappsorderspricelist.form.component';
import { BizAppsPriceListFormComponent } from '../lib/custom/PriceList/price-list-form.component';
import { PriceListHeaderPanel } from '../lib/form-panels/price-list-header.panel';
import '../public-api';

describe('BizAppsPriceListFormComponent Custom Form Registration & Pricing Simulator', () => {
    it('subclasses the generated mjBizAppsOrdersPriceListFormComponent', () => {
        expect(BizAppsPriceListFormComponent.prototype instanceof mjBizAppsOrdersPriceListFormComponent).toBe(true);
    });

    it('leaves the generated Price List form as the registered form', () => {
        const activeReg = MJGlobal.Instance.ClassFactory.GetRegistration(
            BaseFormComponent,
            'MJ_BizApps_Orders: Price Lists'
        );
        expect(activeReg?.SubClass?.name).toBe('mjBizAppsOrdersPriceListFormComponent');
        const customReg = MJGlobal.Instance.ClassFactory.GetAllRegistrations(
            BaseFormComponent,
            'MJ_BizApps_Orders: Price Lists'
        ).find(r => r.SubClass === BizAppsPriceListFormComponent);
        expect(customReg).toBeUndefined();
    });

    it('registers the identity header as a form contribution', () => {
        const regs = MJGlobal.Instance.ClassFactory.GetAllRegistrations(BaseFormPanel);
        expect(regs.some(r => r.SubClass === PriceListHeaderPanel)).toBe(true);
    });

    it('calculates volume pricing mode accurately', () => {
        const form = Object.create(BizAppsPriceListFormComponent.prototype) as BizAppsPriceListFormComponent;
        form.SimBasePrice = 100;
        form.SimQuantity = 25;
        form.SimCalculationMode = 'volume';
        form.RecalculateSim();

        expect(form.SimResult.EffectiveUnitPrice).toBe(85);
        expect(form.SimResult.TotalOrderAmount).toBe(2125);
        expect(form.SimResult.DiscountPercent).toBe(15);
        expect(form.SimResult.SavingsAmount).toBe(375);
    });

    it('calculates graduated tiered pricing mode accurately', () => {
        const form = Object.create(BizAppsPriceListFormComponent.prototype) as BizAppsPriceListFormComponent;
        form.SimBasePrice = 100;
        form.SimQuantity = 25;
        form.SimCalculationMode = 'tiered';
        form.RecalculateSim();

        // Tier 1: 19 units @ $100 = $1900
        // Tier 2: 6 units (20..25) @ $85 = $510
        // Total = $2410
        expect(form.SimResult.TotalOrderAmount).toBe(2410);
        expect(form.SimResult.EffectiveUnitPrice).toBeCloseTo(96.4, 1);
        expect(form.SimResult.SavingsAmount).toBe(90);
    });

    it('formats validity window properly', () => {
        const form = Object.create(BizAppsPriceListFormComponent.prototype) as BizAppsPriceListFormComponent;

        form.record = {
            EffectiveFrom: new Date('2026-01-01'),
            EffectiveTo: new Date('2026-12-31'),
        } as unknown as mjBizAppsOrdersPriceListEntity;

        expect(form.FormattedValidityWindow).toContain('2026');

        form.record = {
            EffectiveFrom: null,
            EffectiveTo: null,
        } as unknown as mjBizAppsOrdersPriceListEntity;

        expect(form.FormattedValidityWindow).toBe('Perpetual / Ongoing');
    });
});
