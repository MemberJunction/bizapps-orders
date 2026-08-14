import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import type { mjBizAppsOrdersProductEntity, mjBizAppsOrdersEventProductEntity } from '@mj-biz-apps/orders-entities';
import { mjBizAppsOrdersProductFormComponent } from '../lib/generated/Entities/mjBizAppsOrdersProduct/mjbizappsordersproduct.form.component';
import { BizAppsProductFormComponent } from '../lib/custom/Product/product-form.component';
import { BizAppsProductPricingWidgetComponent } from '../lib/custom/Product/widgets/product-pricing-widget.component';
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
        expect(instance.ProductAvatarIcon).toBe('fa-solid fa-repeat');
    });

    it('formats standalone selling price and status badges', () => {
        const instance = Object.create(BizAppsProductFormComponent.prototype) as BizAppsProductFormComponent;

        instance.record = {
            StandaloneSellingPrice: 895,
            Status: 'Active',
            ProductType: 'Standard',
            ISAChild: null,
        } as unknown as mjBizAppsOrdersProductEntity;

        expect(instance.FormattedBasePrice).toBe('$895.00');
        expect(instance.StatusBadgeClass).toContain('mjo-status-chip--active');

        instance.record = {
            StandaloneSellingPrice: null,
            Status: 'Draft',
            ProductType: 'Standard',
            ISAChild: null,
        } as unknown as mjBizAppsOrdersProductEntity;

        expect(instance.FormattedBasePrice).toBe('$0.00');
        expect(instance.StatusBadgeClass).toContain('mjo-status-chip--draft');
    });

    it('simulates volume pricing in BizAppsProductPricingWidgetComponent', () => {
        const widget = new BizAppsProductPricingWidgetComponent();
        widget.Product = {
            StandaloneSellingPrice: 1200,
            IsSaved: true,
            ID: 'prod-1',
        } as unknown as mjBizAppsOrdersProductEntity;

        widget.SimQuantity = 25;
        widget.RecalculateSimulation();
        expect(widget.SimResult.DiscountPercent).toBe(15);
        expect(widget.SimResult.UnitPrice).toBe(1020);
        expect(widget.SimResult.TotalAmount).toBe(25500);

        widget.SimQuantity = 50;
        widget.RecalculateSimulation();
        expect(widget.SimResult.DiscountPercent).toBe(25);
        expect(widget.SimResult.UnitPrice).toBe(900);
        expect(widget.SimResult.TotalAmount).toBe(45000);
        expect(widget.SimResult.TotalSavings).toBe(15000);
    });

    it('OnFormNavigate dispatches record navigation to NavigationService when present', () => {
        const instance = Object.create(BizAppsProductFormComponent.prototype) as BizAppsProductFormComponent;
        instance.Navigate = { emit: () => {} } as any;

        let openedEntity = '';
        let openedKey: any = null;
        (instance as any).navigationService = {
            OpenEntityRecord: (entityName: string, pkey: any) => {
                openedEntity = entityName;
                openedKey = pkey;
            }
        };

        instance.OnFormNavigate({
            Kind: 'record',
            EntityName: 'MJ_BizApps_Orders: Product Categories',
            PrimaryKey: { ToURLSegment: () => 'cat-123' } as any,
        });

        expect(openedEntity).toBe('MJ_BizApps_Orders: Product Categories');
        expect(openedKey.ToURLSegment()).toBe('cat-123');
    });
});
