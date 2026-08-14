import { Component } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { Metadata } from '@memberjunction/core';
import {
    mjBizAppsOrdersProductEntity,
    mjBizAppsOrdersEventProductEntity,
    mjBizAppsOrdersProductTypeEntity,
    mjBizAppsOrdersRevenueRecognitionTypeEntity,
} from '@mj-biz-apps/orders-entities';
import { mjBizAppsOrdersProductFormComponent } from '../../generated/Entities/mjBizAppsOrdersProduct/mjbizappsordersproduct.form.component';
import { FormatMoney } from '../../panels/money-format';

/**
 * Custom Product form component overriding the CodeGen-generated form.
 *
 * Extends the generated form component so it wins @RegisterClass priority in
 * MemberJunction's ClassFactory.
 *
 * Key capabilities:
 * 1. Product Hero Identity Header: Dynamic type-aware avatar, title, entity/SKU/IsA/status
 *    badge strip, and live 5-metric summary bar (SSP, Type, Rev-Rec, Capacity, Price Lists).
 * 2. Dynamic IS-A Subtype Extension: Inspects the product's ProductType.
 *    If the ProductType has a ProductExtensionEntity (e.g. 'MJ_BizApps_Orders: Event Products'),
 *    the form automatically binds and surfaces the EventProduct subtype's fields
 *    (EventStartsAt, EventEndsAt, VenueName, VenueAddressID, Capacity, RequiresAttendeeInfo).
 * 3. Integrated Child Entities: Provides dedicated collapsible panels and data grids for
 *    natural child records: Product Prices (price lists / volume tiers), Product Entitlements,
 *    and Product Bundle Items.
 * 4. Standard MJ Form Architecture: Uses record-form-container, collapsible panels, and form fields
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
    public RevenueRecRecord: mjBizAppsOrdersRevenueRecognitionTypeEntity | null = null;

    override async ngOnInit(): Promise<void> {
        await super.ngOnInit();

        this.initSections([
            { sectionKey: 'productIdentification', sectionName: 'Product Identification', isExpanded: true },
            { sectionKey: 'productClassification', sectionName: 'Product Classification & Lifecycle', isExpanded: true },
            { sectionKey: 'eventDetailsExtension', sectionName: 'Event & Venue Details (IsA Extension: EventProduct)', isExpanded: true },
            { sectionKey: 'productPrices', sectionName: 'Product Pricing, Price Lists & Volume Tiers', isExpanded: true },
            { sectionKey: 'productEntitlements', sectionName: 'Entitlement Grants & Subscriptions', isExpanded: true },
            { sectionKey: 'financialAndAccounting', sectionName: 'Financial & General Ledger Resolution', isExpanded: true },
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
        const typeName = (this.record?.ProductType as string) ?? this.ProductTypeRecord?.Name ?? '';
        return typeName.toLowerCase().includes('event') || typeName.toLowerCase().includes('conference') || typeName.toLowerCase().includes('summit') || this.record?.ISAChild != null;
    }

    /**
     * Resolves the display name for the product type.
     */
    public get ProductTypeName(): string {
        if (this.ProductTypeRecord?.Name) {
            return this.ProductTypeRecord.Name;
        }
        if (this.record?.ProductType) {
            return this.record.ProductType;
        }
        return '—';
    }

    /**
     * Resolves the display name for the revenue recognition rule.
     */
    public get RevenueRecognitionName(): string {
        if (this.RevenueRecRecord?.Name) {
            return this.RevenueRecRecord.Name;
        }
        if (this.record?.RevenueRecognitionType) {
            return this.record.RevenueRecognitionType;
        }
        return '—';
    }

    /**
     * Returns the type-tailored FontAwesome icon for the product hero avatar.
     */
    public get ProductAvatarIcon(): string {
        const typeName = (this.ProductTypeName).toLowerCase();
        if (this.HasEventExtension || typeName.includes('event') || typeName.includes('conference') || typeName.includes('summit') || typeName.includes('ticket')) {
            return 'fa-solid fa-ticket';
        }
        if (this.record?.SubscriptionTypeID || typeName.includes('sub') || typeName.includes('saas') || typeName.includes('recurring')) {
            return 'fa-solid fa-arrows-rotate';
        }
        if (typeName.includes('physical') || typeName.includes('book') || typeName.includes('merch') || typeName.includes('good')) {
            return 'fa-solid fa-box-archive';
        }
        if (typeName.includes('digital') || typeName.includes('license') || typeName.includes('asset') || typeName.includes('download')) {
            return 'fa-solid fa-file-arrow-down';
        }
        return 'fa-solid fa-cube';
    }

    /**
     * Returns the status chip CSS class reflecting catalog lifecycle.
     */
    public get StatusBadgeClass(): string {
        const status = this.record?.Status ?? 'Draft';
        switch (status) {
            case 'Active':
                return 'mjo-status-chip mjo-status-chip--active';
            case 'Draft':
                return 'mjo-status-chip mjo-status-chip--draft';
            case 'Discontinued':
            case 'EOL':
                return 'mjo-status-chip mjo-status-chip--inactive';
            default:
                return 'mjo-status-chip';
        }
    }

    /**
     * Formatted Standalone Selling Price for the summary metric bar.
     */
    public get FormattedSSP(): string {
        if (this.record?.StandaloneSellingPrice == null) return '—';
        return FormatMoney(this.record.StandaloneSellingPrice);
    }

    /**
     * Formatted capacity or stock description for the summary metric bar.
     */
    public get FormattedCapacity(): string {
        if (this.HasEventExtension) {
            if (this.EventProductChild?.Capacity != null && this.EventProductChild.Capacity > 0) {
                return `${this.EventProductChild.Capacity.toLocaleString()} Attendees`;
            }
            return 'Unlimited (Event)';
        }
        if (this.record?.SubscriptionTypeID) {
            return 'Unlimited (Digital)';
        }
        return '—';
    }

    /**
     * Inspects the product's type and ensures the IS-A child entity is loaded and available.
     */
    public async syncSubtypeExtension(): Promise<void> {
        if (!this.record) return;

        const md = new Metadata();

        // 1. Resolve ProductType metadata if available
        if (this.record.ProductTypeID && !this.ProductTypeRecord) {
            try {
                const pt = await md.GetEntityObject<mjBizAppsOrdersProductTypeEntity>('MJ_BizApps_Orders: Product Types');
                const loaded = await pt.Load(this.record.ProductTypeID);
                if (loaded) {
                    this.ProductTypeRecord = pt;
                }
            } catch {
                // Ignore failure to load lookup; fallback logic applies
            }
        }

        // 2. Resolve RevenueRecognitionType metadata if available
        if (this.record.RevenueRecognitionTypeID && !this.RevenueRecRecord) {
            try {
                const rr = await md.GetEntityObject<mjBizAppsOrdersRevenueRecognitionTypeEntity>('MJ_BizApps_Orders: Revenue Recognition Types');
                const loaded = await rr.Load(this.record.RevenueRecognitionTypeID);
                if (loaded) {
                    this.RevenueRecRecord = rr;
                }
            } catch {
                // Ignore failure to load lookup; fallback logic applies
            }
        }

        // 3. Resolve or initialize the IS-A child entity
        if (this.record.ISAChild && this.record.ISAChild.EntityInfo?.Name === 'MJ_BizApps_Orders: Event Products') {
            this.EventProductChild = this.record.ISAChild as mjBizAppsOrdersEventProductEntity;
        } else if (this.HasEventExtension && this.record.ID) {
            this.EventProductLoading = true;
            try {
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
