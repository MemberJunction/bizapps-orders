import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import type { mjBizAppsOrdersProductEntity, mjBizAppsOrdersEventProductEntity } from '@mj-biz-apps/orders-entities';
import { mjBizAppsOrdersProductFormComponent } from '../lib/generated/Entities/mjBizAppsOrdersProduct/mjbizappsordersproduct.form.component';
import { BizAppsProductFormComponent } from '../lib/custom/Product/product-form.component';
import '../public-api';

describe('BizAppsProductFormComponent Custom Form Registration & Getters', () => {
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
        expect(instance.HasEventExtension).toBe(false);

        instance.record = {
            ProductType: 'Conference Event Ticket',
            ISAChild: null,
        } as unknown as mjBizAppsOrdersProductEntity;
        expect(instance.HasEventExtension).toBe(true);

        instance.record = {
            ProductType: 'Standard Physical Good',
            ISAChild: null,
        } as unknown as mjBizAppsOrdersProductEntity;
        expect(instance.HasEventExtension).toBe(false);
    });

    it('computes type-tailored avatar icons accurately', () => {
        const instance = Object.create(BizAppsProductFormComponent.prototype) as BizAppsProductFormComponent;

        // Event
        instance.record = { ProductType: 'Annual Summit Ticket', ISAChild: null } as unknown as mjBizAppsOrdersProductEntity;
        expect(instance.ProductAvatarIcon).toBe('fa-solid fa-ticket');

        // Subscription
        instance.record = { ProductType: 'SaaS Pro Monthly', SubscriptionTypeID: 'sub-1', ISAChild: null } as unknown as mjBizAppsOrdersProductEntity;
        expect(instance.ProductAvatarIcon).toBe('fa-solid fa-arrows-rotate');

        // Physical
        instance.record = { ProductType: 'Physical Book Hardcover', SubscriptionTypeID: null, ISAChild: null } as unknown as mjBizAppsOrdersProductEntity;
        expect(instance.ProductAvatarIcon).toBe('fa-solid fa-box-archive');

        // Digital
        instance.record = { ProductType: 'Digital License Key', SubscriptionTypeID: null, ISAChild: null } as unknown as mjBizAppsOrdersProductEntity;
        expect(instance.ProductAvatarIcon).toBe('fa-solid fa-file-arrow-down');
    });

    it('formats standalone selling price and status badges', () => {
        const instance = Object.create(BizAppsProductFormComponent.prototype) as BizAppsProductFormComponent;

        instance.record = {
            StandaloneSellingPrice: 895,
            Status: 'Active',
            ProductType: 'Standard',
            ISAChild: null,
        } as unknown as mjBizAppsOrdersProductEntity;

        expect(instance.FormattedSSP).toBe('$895.00');
        expect(instance.StatusBadgeClass).toContain('mjo-status-chip--active');

        instance.record = {
            StandaloneSellingPrice: null,
            Status: 'Draft',
            ProductType: 'Standard',
            ISAChild: null,
        } as unknown as mjBizAppsOrdersProductEntity;

        expect(instance.FormattedSSP).toBe('—');
        expect(instance.StatusBadgeClass).toContain('mjo-status-chip--draft');
    });

    it('formats capacity for event and digital products', () => {
        const instance = Object.create(BizAppsProductFormComponent.prototype) as BizAppsProductFormComponent;

        // Event with capacity
        instance.record = { ProductType: 'Conference Ticket', ISAChild: null } as unknown as mjBizAppsOrdersProductEntity;
        instance.EventProductChild = { Capacity: 500 } as unknown as mjBizAppsOrdersEventProductEntity;
        expect(instance.FormattedCapacity).toBe('500 Attendees');

        // Subscription
        instance.record = { ProductType: 'SaaS Plan', SubscriptionTypeID: 'sub-1', ISAChild: null } as unknown as mjBizAppsOrdersProductEntity;
        instance.EventProductChild = null;
        expect(instance.FormattedCapacity).toBe('Unlimited (Digital)');
    });
});
