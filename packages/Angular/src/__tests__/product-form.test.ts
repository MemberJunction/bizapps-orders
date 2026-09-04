import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { BaseFormComponent, BaseFormPanel } from '@memberjunction/ng-base-forms';
import type { mjBizAppsOrdersProductEntity, mjBizAppsOrdersProductPriceEntity } from '@mj-biz-apps/orders-entities';
import { mjBizAppsOrdersProductFormComponent } from '../lib/generated/Entities/mjBizAppsOrdersProduct/mjbizappsordersproduct.form.component';
import { BizAppsProductFormComponent } from '../lib/custom/Product/product-form.component';
import { BizAppsProductPricingWidgetComponent } from '../lib/custom/Product/widgets/product-pricing-widget.component';
import { ProductHeaderPanel } from '../lib/form-panels/product-header.panel';
import '../public-api';

const here = import.meta.dirname;

describe('BizAppsProductFormComponent Custom Form Registration & Getters', () => {
    it('subclasses the generated mjBizAppsOrdersProductFormComponent', () => {
        expect(BizAppsProductFormComponent.prototype instanceof mjBizAppsOrdersProductFormComponent).toBe(true);
    });

    it('leaves the generated Product form as the registered form', () => {
        const activeReg = MJGlobal.Instance.ClassFactory.GetRegistration(
            BaseFormComponent,
            'MJ_BizApps_Orders: Products'
        );
        expect(activeReg?.SubClass?.name).toBe('mjBizAppsOrdersProductFormComponent');
        const customReg = MJGlobal.Instance.ClassFactory.GetAllRegistrations(
            BaseFormComponent,
            'MJ_BizApps_Orders: Products'
        ).find(r => r.SubClass === BizAppsProductFormComponent);
        expect(customReg).toBeUndefined();
    });

    it('registers the identity header as a form contribution', () => {
        const regs = MJGlobal.Instance.ClassFactory.GetAllRegistrations(BaseFormPanel);
        expect(regs.some(r => r.SubClass === ProductHeaderPanel)).toBe(true);
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

    it('formats list price from ProductPrice label and status badges', () => {
        const instance = Object.create(BizAppsProductFormComponent.prototype) as BizAppsProductFormComponent;

        instance.record = {
            Status: 'Active',
            ProductType: 'Standard',
            ISAChild: null,
        } as unknown as mjBizAppsOrdersProductEntity;
        instance.ListPriceLabel = '$895.00';

        expect(instance.FormattedBasePrice).toBe('$895.00');
        expect(instance.StatusBadgeClass).toContain('mjo-status-chip--active');

        instance.record = {
            Status: 'Draft',
            ProductType: 'Standard',
            ISAChild: null,
        } as unknown as mjBizAppsOrdersProductEntity;
        instance.ListPriceLabel = 'No price';

        expect(instance.FormattedBasePrice).toBe('No price');
        expect(instance.StatusBadgeClass).toContain('mjo-status-chip--draft');
    });

    it('simulates volume pricing in BizAppsProductPricingWidgetComponent', () => {
        const widget = new BizAppsProductPricingWidgetComponent();
        widget.Product = {
            IsSaved: true,
            ID: 'prod-1',
        } as unknown as mjBizAppsOrdersProductEntity;
        widget.AllPriceRecords = [{
            PriceListID: null,
            MinQuantity: 1,
            Amount: 1200,
        }] as unknown as mjBizAppsOrdersProductPriceEntity[];

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

    it('hero shows list price from ProductPrice and does not treat Rev-rec or Tax as a price', () => {
        const header = readFileSync(
            join(here, '../lib/form-panels/product-header.panel.html'),
            'utf8',
        );
        expect(header).toContain('List price');
        expect(header).toContain('{{ Price }}');
        expect(header).not.toContain('Rev-rec');
        expect(header).not.toContain('IsTaxable');
        expect(header).not.toContain('Taxable');
    });

    it('When editor binds mj-filter-builder sources, not a dotted fields fallback', () => {
        const html = readFileSync(
            join(here, '../lib/custom/Product/widgets/product-pricing-widget.component.html'),
            'utf8',
        );
        expect(html).toContain('[sources]="WhenBuilderSources"');
        expect(html).not.toContain('[fields]="WhenFields"');
        expect(html).not.toContain('QuoteOrgType');
        expect(html).toContain('QuoteParties');
        expect(html).toContain('SearchQuoteParty');
    });

    it('renders When sentences with Source.Field labels from the applicability bag', () => {
        const widget = new BizAppsProductPricingWidgetComponent();
        const record = {
            Applicability: JSON.stringify({
                logic: 'and',
                filters: [{ field: 'BillToOrganization.Type', operator: 'eq', value: 'Member' }],
            }),
        } as unknown as mjBizAppsOrdersProductPriceEntity;
        expect(widget.WhenSentence(record)).toBe('Bill-to organization · Type equals Member');
        expect(widget.QuoteParties.map((p) => p.key)).toEqual([
            'BillToPerson',
            'BillToOrganization',
            'ShipToPerson',
            'ShipToOrganization',
            'BillToAddress',
            'ShipToAddress',
        ]);
    });
});
