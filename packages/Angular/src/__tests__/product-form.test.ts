import '@angular/compiler';
import { describe, it, expect, vi } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { BaseFormComponent, BaseFormPanel } from '@memberjunction/ng-base-forms';
import type { mjBizAppsOrdersProductEntity } from '@mj-biz-apps/orders-entities';
import { mjBizAppsOrdersProductFormComponent } from '../lib/generated/Entities/mjBizAppsOrdersProduct/mjbizappsordersproduct.form.component';
import { BizAppsProductFormComponent } from '../lib/custom/Product/product-form.component';
import {
    BizAppsProductSaveGuardFormComponent,
    EVENT_PRODUCT_EXTENSION_ENTITY,
    EVENT_REV_REC_CONFIRM_MESSAGE,
    ShouldConfirmEventRevRec,
} from '../lib/custom/Product/product-save-guard-form.component';
import { OrdersEngine } from '@mj-biz-apps/orders-entities';
import { BizAppsProductPricingWidgetComponent } from '../lib/custom/Product/widgets/product-pricing-widget.component';
import { ProductHeaderPanel } from '../lib/form-panels/product-header.panel';
import '../public-api';

describe('BizAppsProductFormComponent Custom Form Registration & Getters', () => {
    it('subclasses the generated mjBizAppsOrdersProductFormComponent', () => {
        expect(BizAppsProductFormComponent.prototype instanceof mjBizAppsOrdersProductFormComponent).toBe(true);
    });

    // Changed for golive #211: the save-guard subclass now outranks the generated form. It reuses
    // the generated TEMPLATE, so the rendered form is unchanged; BizAppsProductFormComponent (the
    // custom template Amith unregistered) stays unregistered.
    it('registers the save-guard subclass over the generated Product form', () => {
        const activeReg = MJGlobal.Instance.ClassFactory.GetRegistration(
            BaseFormComponent,
            'MJ_BizApps_Orders: Products'
        );
        expect(activeReg?.SubClass?.name).toBe('BizAppsProductSaveGuardFormComponent');
        expect(BizAppsProductSaveGuardFormComponent.prototype instanceof mjBizAppsOrdersProductFormComponent).toBe(true);

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

        // Subtype detected via ProductTypeRecord.ProductExtensionEntity
        instance.ProductTypeRecord = {
            ProductExtensionEntity: 'MJ_BizApps_Orders: Event Products',
        } as unknown as import('@mj-biz-apps/orders-entities').mjBizAppsOrdersProductTypeEntity;
        expect(instance.HasEventExtension).toBe(true);

        // Subtype detected via attached ISAChild
        instance.ProductTypeRecord = null;
        instance.record = {
            ISAChild: {
                EntityInfo: { Name: 'MJ_BizApps_Orders: Event Products' },
            },
        } as unknown as mjBizAppsOrdersProductEntity;
        expect(instance.HasEventExtension).toBe(true);

        // Non-event subtype or plain product
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

    it('simulates volume pricing from the base ProductPrice, not StandaloneSellingPrice', () => {
        const widget = new BizAppsProductPricingWidgetComponent();
        widget.Product = {
            StandaloneSellingPrice: 9999,
            IsSaved: true,
            ID: 'prod-1',
        } as unknown as mjBizAppsOrdersProductEntity;
        widget.AllPriceRecords = [
            {
                ID: 'pp-base',
                PriceListID: null,
                MinQuantity: 1,
                Amount: 1200,
                Status: 'Active',
            } as never,
        ];

        expect(widget.BaseListPrice).toBe(1200);

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

    it('does not treat Product.StandaloneSellingPrice as list price', () => {
        const widget = new BizAppsProductPricingWidgetComponent();
        widget.Product = {
            StandaloneSellingPrice: 1200,
            IsSaved: true,
            ID: 'prod-1',
        } as unknown as mjBizAppsOrdersProductEntity;
        widget.AllPriceRecords = [];
        expect(widget.BaseListPrice).toBe(0);
        widget.SimQuantity = 25;
        widget.RecalculateSimulation();
        expect(widget.SimResult.UnitPrice).toBe(0);
        expect(widget.SimResult.TotalAmount).toBe(0);
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

describe('Event product save guard (golive #211)', () => {
    const UP_FRONT = 'rr-upfront';       // IsDeferred = false
    const ALL_BACK_END = 'rr-allbackend'; // IsDeferred = true
    const deferredByID: Record<string, boolean> = { [UP_FRONT]: false, [ALL_BACK_END]: true };
    const isDeferredByID = (id: string) => deferredByID[id];

    it('prompts for an event product whose own type is non-deferred', () => {
        expect(ShouldConfirmEventRevRec({
            hasEventExtension: true,
            revRecTypeID: UP_FRONT,
            productTypeDefaultRevRecID: ALL_BACK_END,
            isDeferredByID,
        })).toBe(true);
    });

    it('stays quiet for an event product on a deferred type', () => {
        expect(ShouldConfirmEventRevRec({
            hasEventExtension: true,
            revRecTypeID: ALL_BACK_END,
            productTypeDefaultRevRecID: UP_FRONT,
            isDeferredByID,
        })).toBe(false);
    });

    it('stays quiet for a non-event product on a non-deferred type', () => {
        expect(ShouldConfirmEventRevRec({
            hasEventExtension: false,
            revRecTypeID: UP_FRONT,
            productTypeDefaultRevRecID: null,
            isDeferredByID,
        })).toBe(false);
    });

    it('prompts when a blank type inherits a non-deferred default from the product type', () => {
        expect(ShouldConfirmEventRevRec({
            hasEventExtension: true,
            revRecTypeID: '   ',
            productTypeDefaultRevRecID: UP_FRONT,
            isDeferredByID,
        })).toBe(true);
    });

    it('stays quiet when there is no effective type at all — booking fails loudly on its own', () => {
        expect(ShouldConfirmEventRevRec({
            hasEventExtension: true,
            revRecTypeID: null,
            productTypeDefaultRevRecID: null,
            isDeferredByID,
        })).toBe(false);
    });

    it('stays quiet for a type id the engine cannot resolve', () => {
        expect(ShouldConfirmEventRevRec({
            hasEventExtension: true,
            revRecTypeID: 'rr-unknown',
            productTypeDefaultRevRecID: null,
            isDeferredByID,
        })).toBe(false);
    });

    it('resolves both lookups from the live record, not the form cache', async () => {
        const instance = Object.create(BizAppsProductSaveGuardFormComponent.prototype) as BizAppsProductSaveGuardFormComponent;
        // The record was switched to Up Front in this session; a cached RevenueRecRecord would
        // still say All Back End. Only the live ids may be read.
        instance.record = {
            ProductTypeID: 'pt-event',
            RevenueRecognitionTypeID: UP_FRONT,
            ISAChild: null,
        } as never;
        (instance as unknown as { RevenueRecRecord: unknown }).RevenueRecRecord = { ID: ALL_BACK_END, IsDeferred: true };

        const engine = {
            EnsureLoaded: async () => undefined,
            ProductTypeByID: (id: string) =>
                id === 'pt-event'
                    ? { ProductExtensionEntity: EVENT_PRODUCT_EXTENSION_ENTITY, DefaultRevenueRecognitionTypeID: ALL_BACK_END }
                    : undefined,
            RevenueRecognitionTypeByID: (id: string) => ({ ID: id, IsDeferred: deferredByID[id] }),
        };
        const spy = vi.spyOn(OrdersEngine, 'Instance', 'get').mockReturnValue(engine as never);
        try {
            await expect((instance as never as { NeedsEventRevRecConfirmation(): Promise<boolean> }).NeedsEventRevRecConfirmation()).resolves.toBe(true);
        } finally {
            spy.mockRestore();
        }
    });

    it('declining writes nothing and returns false; confirming saves', async () => {
        const instance = Object.create(BizAppsProductSaveGuardFormComponent.prototype) as BizAppsProductSaveGuardFormComponent;
        const seam = instance as unknown as {
            NeedsEventRevRecConfirmation(): Promise<boolean>;
            ConfirmService: { Confirm(options: unknown): Promise<boolean> };
        };
        seam.NeedsEventRevRecConfirmation = async () => true;

        let asked: { message?: string; confirmText?: string } | null = null;
        let answer = false;
        seam.ConfirmService = {
            Confirm: async (options) => {
                asked = options as { message?: string };
                return answer;
            },
        };

        let superCalls = 0;
        const realSuperSave = BaseFormComponent.prototype.SaveRecord;
        BaseFormComponent.prototype.SaveRecord = async () => {
            superCalls++;
            return true;
        };
        try {
            await expect(instance.SaveRecord(true)).resolves.toBe(false);
            expect(superCalls).toBe(0);
            // MJ's dialog, not window.confirm — it is asked with the issue's wording and a
            // labelled affirmative button.
            expect(asked!.message).toBe(EVENT_REV_REC_CONFIRM_MESSAGE);
            expect(asked!.confirmText).toBe('Save anyway');

            answer = true;
            await expect(instance.SaveRecord(true)).resolves.toBe(true);
            expect(superCalls).toBe(1);
        } finally {
            BaseFormComponent.prototype.SaveRecord = realSuperSave;
        }
    });

    it('saves without asking when the product is not an event product', async () => {
        const instance = Object.create(BizAppsProductSaveGuardFormComponent.prototype) as BizAppsProductSaveGuardFormComponent;
        const seam = instance as unknown as {
            NeedsEventRevRecConfirmation(): Promise<boolean>;
            ConfirmService: { Confirm(options: unknown): Promise<boolean> };
        };
        seam.NeedsEventRevRecConfirmation = async () => false;
        seam.ConfirmService = {
            Confirm: async () => {
                throw new Error('must not prompt');
            },
        };

        let superCalls = 0;
        const realSuperSave = BaseFormComponent.prototype.SaveRecord;
        BaseFormComponent.prototype.SaveRecord = async () => {
            superCalls++;
            return true;
        };
        try {
            await expect(instance.SaveRecord(true)).resolves.toBe(true);
            expect(superCalls).toBe(1);
        } finally {
            BaseFormComponent.prototype.SaveRecord = realSuperSave;
        }
    });
});
