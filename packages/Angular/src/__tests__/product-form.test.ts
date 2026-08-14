import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { mjBizAppsOrdersProductFormComponent } from '../lib/generated/Entities/mjBizAppsOrdersProduct/mjbizappsordersproduct.form.component';
import { BizAppsProductFormComponent } from '../lib/custom/Product/product-form.component';
import '../public-api';

describe('BizAppsProductFormComponent Custom Form Registration', () => {
    it('subclasses the generated mjBizAppsOrdersProductFormComponent', () => {
        expect(BizAppsProductFormComponent.prototype instanceof mjBizAppsOrdersProductFormComponent).toBe(true);
    });

    it('registers with BaseFormComponent under key "MJ_BizApps_Orders: Products"', () => {
        const registrations = MJGlobal.Instance.ClassFactory.GetAllRegistrations(
            BaseFormComponent,
            'MJ_BizApps_Orders: Products'
        );
        expect(registrations.length).toBeGreaterThanOrEqual(1);

        const customReg = registrations.find(r => r.SubClass === BizAppsProductFormComponent);
        expect(customReg).toBeDefined();
    });

    it('wins ClassFactory lookup priority over the generated component', () => {
        const activeReg = MJGlobal.Instance.ClassFactory.GetRegistration(
            BaseFormComponent,
            'MJ_BizApps_Orders: Products'
        );
        expect(activeReg).toBeDefined();
        expect(activeReg?.SubClass).toBe(BizAppsProductFormComponent);
    });

    it('HasEventExtension detects event product types correctly', () => {
        const instance = Object.create(BizAppsProductFormComponent.prototype) as BizAppsProductFormComponent;
        // Default without record or type is false
        expect(instance.HasEventExtension).toBe(false);

        // When ProductType virtual field includes "Event"
        instance.record = {
            ProductType: 'Conference Event Ticket',
            ISAChild: null,
        } as unknown as typeof instance.record;
        expect(instance.HasEventExtension).toBe(true);

        // When ProductType virtual field is standard
        instance.record = {
            ProductType: 'Standard Physical Good',
            ISAChild: null,
        } as unknown as typeof instance.record;
        expect(instance.HasEventExtension).toBe(false);
    });
});
