import { Component, ChangeDetectorRef, inject } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { Metadata } from '@memberjunction/core';
import {
    mjBizAppsOrdersProductEntity,
    mjBizAppsOrdersEventProductEntity,
    mjBizAppsOrdersProductTypeEntity,
} from '@mj-biz-apps/orders-entities';
import { mjBizAppsOrdersProductFormComponent } from '../../generated/Entities/mjBizAppsOrdersProduct/mjbizappsordersproduct.form.component';

/**
 * Custom Product form component overriding the CodeGen-generated form.
 *
 * Extends the generated form component so it wins @RegisterClass priority in
 * MemberJunction's ClassFactory.
 *
 * Key capabilities:
 * 1. Dynamic IS-A Subtype Extension: Inspects the product's ProductType.
 *    If the ProductType has a ProductExtensionEntity (e.g. 'MJ_BizApps_Orders: Event Products'),
 *    the form automatically binds and surfaces the EventProduct subtype's fields
 *    (EventStartsAt, EventEndsAt, VenueName, VenueAddressID, Capacity, RequiresAttendeeInfo).
 * 2. Integrated Child Entities: Provides dedicated collapsible panels and data grids for
 *    natural child records: Product Prices (price lists / volume tiers), Product Entitlements,
 *    and Product Bundle Items.
 * 3. Standard MJ Form Architecture: Uses record-form-container, collapsible panels, and form fields
 *    with complete keyboard navigation, audit history, and dirty tracking.
 */
@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Products')
@Component({
    standalone: false,
    selector: 'bizapps-product-form',
    templateUrl: './product-form.component.html',
    styleUrls: ['./product-form.component.css'],
})
export class BizAppsProductFormComponent extends mjBizAppsOrdersProductFormComponent {
    public declare record: mjBizAppsOrdersProductEntity;

    /** Loaded or initialized EventProduct IS-A child entity (if applicable) */
    public EventProductChild: mjBizAppsOrdersEventProductEntity | null = null;
    public EventProductLoading = false;
    public ProductTypeRecord: mjBizAppsOrdersProductTypeEntity | null = null;

    override async ngOnInit(): Promise<void> {
        await super.ngOnInit();

        this.initSections([
            { sectionKey: 'productIdentification', sectionName: 'Product Identification', isExpanded: true },
            { sectionKey: 'productClassification', sectionName: 'Product Classification', isExpanded: true },
            { sectionKey: 'eventDetailsExtension', sectionName: 'Event & Venue Details (EventProduct Subtype)', isExpanded: true },
            { sectionKey: 'financialAndAccounting', sectionName: 'Financial and Accounting', isExpanded: true },
            { sectionKey: 'catalogLifecycle', sectionName: 'Catalog Lifecycle', isExpanded: false },
            { sectionKey: 'subscriptionAndEntitlements', sectionName: 'Subscription and Entitlements', isExpanded: true },
            { sectionKey: 'productPrices', sectionName: 'Product Prices & Price Lists', isExpanded: true },
            { sectionKey: 'productEntitlements', sectionName: 'Granted Entitlements', isExpanded: true },
            { sectionKey: 'productBundleItems', sectionName: 'Bundle Components & Kit Items', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
        ]);

        await this.syncSubtypeExtension();
    }

    /**
     * Determines whether the current product's type specifies an EventProduct extension.
     */
    public get HasEventExtension(): boolean {
        if (this.ProductTypeRecord?.ProductExtensionEntity === 'MJ_BizApps_Orders: Event Products') {
            return true;
        }
        // Fallback: check virtual ProductType name or auto-chained child
        const typeName = (this.record?.ProductType as string) ?? '';
        return typeName.toLowerCase().includes('event') || typeName.toLowerCase().includes('conference') || this.record?.ISAChild != null;
    }

    /**
     * Inspects the product's type and ensures the IS-A child entity is loaded and available.
     */
    public async syncSubtypeExtension(): Promise<void> {
        if (!this.record) return;

        // 1. Resolve ProductType metadata if available
        if (this.record.ProductTypeID) {
            try {
                const md = new Metadata();
                const pt = await md.GetEntityObject<mjBizAppsOrdersProductTypeEntity>('MJ_BizApps_Orders: Product Types');
                const loaded = await pt.Load(this.record.ProductTypeID);
                if (loaded) {
                    this.ProductTypeRecord = pt;
                }
            } catch {
                // Ignore failure to load lookup; fallback logic applies
            }
        }

        // 2. Resolve or initialize the IS-A child entity
        if (this.record.ISAChild && this.record.ISAChild.EntityInfo?.Name === 'MJ_BizApps_Orders: Event Products') {
            this.EventProductChild = this.record.ISAChild as mjBizAppsOrdersEventProductEntity;
        } else if (this.HasEventExtension && this.record.ID) {
            this.EventProductLoading = true;
            try {
                const md = new Metadata();
                const ep = await md.GetEntityObject<mjBizAppsOrdersEventProductEntity>('MJ_BizApps_Orders: Event Products');
                if (this.record.IsSaved) {
                    const loaded = await ep.Load(this.record.ID);
                    if (loaded) {
                        this.EventProductChild = ep;
                    } else {
                        // Extension row doesn't exist yet: initialize with matching PK
                        ep.NewRecord();
                        ep.Set('ID', this.record.ID);
                        this.EventProductChild = ep;
                    }
                } else {
                    ep.NewRecord();
                    ep.Set('ID', this.record.ID);
                    this.EventProductChild = ep;
                }
            } finally {
                this.EventProductLoading = false;
                this.cdr.markForCheck();
            }
        }
    }

    /**
     * Called when a child record or related widget mutates data.
     */
    public async OnWidgetDataChanged(): Promise<void> {
        if (!this.record.Dirty) {
            await this.record.InnerLoad(this.record.PrimaryKey);
            this.cdr.detectChanges();
        }
    }
}

/** Tree-shaking prevention anchor function */
export function LoadProductFormComponent(): void {
    // Anchors BizAppsProductFormComponent in bundlers
}
