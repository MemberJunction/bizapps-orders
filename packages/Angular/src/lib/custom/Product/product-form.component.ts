import { Component, inject } from '@angular/core';
import { BaseFormComponent, type FormNavigationEvent } from '@memberjunction/ng-base-forms';
import { Metadata } from '@memberjunction/core';
import { UserInfoEngine } from '@memberjunction/core-entities';
import { NavigationService } from '@memberjunction/ng-shared';
import { DispatchFormNavigation } from '../form-navigation-helper';
import {
    mjBizAppsOrdersProductEntity,
    mjBizAppsOrdersEventProductEntity,
    mjBizAppsOrdersProductTypeEntity,
    mjBizAppsOrdersRevenueRecognitionTypeEntity,
} from '@mj-biz-apps/orders-entities';
import { mjBizAppsOrdersProductFormComponent } from '../../generated/Entities/mjBizAppsOrdersProduct/mjbizappsordersproduct.form.component';
import { LoadProductListPriceLabel } from '../../panels/catalog-list-price';

export type ProductFormPane = 'overview' | 'pricing' | 'promos' | 'accounting' | 'fulfillment' | 'subscriptions' | 'bundles' | 'systemMetadata';

const ACTIVE_PANE_SETTING = 'mj.orders.productForm.activePane';

/**
 * Custom Product form component with Responsive Left Navigation and Droppable Widgets.
 *
 * Extends the generated form component so it wins @RegisterClass priority in
 * MemberJunction's ClassFactory.
 *
 * Structure:
 * 1. Product Hero Identity Header: Dynamic type-aware avatar, title, entity/SKU/status
 *    badge strip, and list price from ProductPrice (Rev-rec and tax live on Accounting).
 * 2. Responsive Left Navigation Workspace: Replaces heavy accordion stacking with a clean
 *    left navigation rail permitting instant navigation between modular droppable widgets.
 * 3. Dynamic Specialized Profile: Automatically mounts domain-specific fields (such as
 *    EventProduct dates, venue, capacity, attendee requirements) using clean business terminology.
 * 4. Modular Encapsulated Sub-Widgets: Pricing Simulator, Promotion manager, Tax & GL links,
 *    Delivery protocol, and Subscription defaults.
 */
@Component({
    standalone: false,
    selector: 'bizapps-product-form',
    templateUrl: './product-form.component.html',
    styleUrls: ['./product-form.component.css'],
})
export class BizAppsProductFormComponent extends mjBizAppsOrdersProductFormComponent {
    public declare record: mjBizAppsOrdersProductEntity;

    public ActivePane: ProductFormPane = 'overview';

    /** Loaded or initialized EventProduct specialized profile child entity (if applicable) */
    public EventProductChild: mjBizAppsOrdersEventProductEntity | null = null;
    public EventProductLoading = false;
    public ProductTypeRecord: mjBizAppsOrdersProductTypeEntity | null = null;
    public RevenueRecRecord: mjBizAppsOrdersRevenueRecognitionTypeEntity | null = null;
    public ListPriceLabel = 'No price';

    protected navigationService = inject(NavigationService, { optional: true });

    override async ngOnInit(): Promise<void> {
        await super.ngOnInit();

        this.initSections([
            { sectionKey: 'productIdentification', sectionName: 'Product Identification', isExpanded: true },
            { sectionKey: 'productClassification', sectionName: 'Product Classification & Lifecycle', isExpanded: true },
            { sectionKey: 'eventDetailsExtension', sectionName: 'Event & Venue Details', isExpanded: true },
            { sectionKey: 'productPrices', sectionName: 'Product Pricing, Price Lists & Volume Tiers', isExpanded: true },
            { sectionKey: 'productEntitlements', sectionName: 'Entitlement Grants & Subscriptions', isExpanded: true },
            { sectionKey: 'financialAndAccounting', sectionName: 'Financial & General Ledger Resolution', isExpanded: true },
            { sectionKey: 'productBundleItems', sectionName: 'Bundle Components & Kit Items', isExpanded: false },
        ]);

        const savedPane = UserInfoEngine.Instance.GetSetting(ACTIVE_PANE_SETTING);
        if (savedPane && this.isValidPane(savedPane)) {
            this.ActivePane = savedPane;
        }

        await this.syncSubtypeExtension();
        this.ListPriceLabel = await LoadProductListPriceLabel(this.record?.ID);
    }

    public SelectPane(pane: ProductFormPane): void {
        this.ActivePane = pane;
        UserInfoEngine.Instance.SetSettingDebounced(ACTIVE_PANE_SETTING, pane);
    }

    private isValidPane(val: string): val is ProductFormPane {
        return ['overview', 'pricing', 'promos', 'accounting', 'fulfillment', 'subscriptions', 'bundles', 'systemMetadata'].includes(val);
    }

    /**
     * Determines whether the current product's type specifies an EventProduct specialized profile.
     */
    public get HasEventExtension(): boolean {
        if (this.ProductTypeRecord?.ProductExtensionEntity === 'MJ_BizApps_Orders: Event Products') {
            return true;
        }
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
     * Resolves the venue and timing summary for Event products.
     */
    public get EventScheduleSummary(): string {
        if (!this.HasEventExtension) return '—';
        const venue = this.EventProductChild?.VenueName || 'Venue TBD';
        const start = this.EventProductChild?.EventStartsAt
            ? new Date(this.EventProductChild.EventStartsAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : 'Date TBD';
        return `${venue} · ${start}`;
    }

    public get FormattedBasePrice(): string {
        return this.ListPriceLabel;
    }

    /**
     * FontAwesome icon reflecting the specific product category or type.
     */
    public get ProductAvatarIcon(): string {
        const typeName = this.ProductTypeName.toLowerCase();
        if (typeName.includes('event') || typeName.includes('conference') || typeName.includes('summit')) {
            return 'fa-solid fa-ticket';
        }
        if (typeName.includes('subscription') || typeName.includes('saas') || typeName.includes('recurring')) {
            return 'fa-solid fa-repeat';
        }
        if (typeName.includes('service') || typeName.includes('consulting')) {
            return 'fa-solid fa-handshake-angle';
        }
        if (typeName.includes('digital') || typeName.includes('course')) {
            return 'fa-solid fa-graduation-cap';
        }
        return 'fa-solid fa-box-open';
    }

    /**
     * Returns the CSS class for the status pill badge.
     */
    public get StatusBadgeClass(): string {
        const status: mjBizAppsOrdersProductEntity['Status'] | undefined = this.record?.Status;
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
     * Synchronizes and initializes the specialized profile child entity (e.g. EventProduct).
     */
    private async syncSubtypeExtension(): Promise<void> {
        if (!this.record) return;

        const md = new Metadata();

        // 1. Resolve ProductType record if needed
        if (this.record.ProductTypeID && (!this.ProductTypeRecord || this.ProductTypeRecord.ID !== this.record.ProductTypeID)) {
            try {
                const pt = await md.GetEntityObject<mjBizAppsOrdersProductTypeEntity>('MJ_BizApps_Orders: Product Types', md.CurrentUser);
                if (await pt.Load(this.record.ProductTypeID)) {
                    this.ProductTypeRecord = pt;
                }
            } catch (err) {
                console.warn('Could not load ProductType for product form:', err);
            }
        }

        // 2. Resolve RevenueRecognitionType record if needed
        if (this.record.RevenueRecognitionTypeID && (!this.RevenueRecRecord || this.RevenueRecRecord.ID !== this.record.RevenueRecognitionTypeID)) {
            try {
                const rrt = await md.GetEntityObject<mjBizAppsOrdersRevenueRecognitionTypeEntity>('MJ_BizApps_Orders: Revenue Recognition Types', md.CurrentUser);
                if (await rrt.Load(this.record.RevenueRecognitionTypeID)) {
                    this.RevenueRecRecord = rrt;
                }
            } catch (err) {
                console.warn('Could not load RevenueRecognitionType for product form:', err);
            }
        }

        // 3. Mount EventProduct specialized profile if applicable
        if (this.HasEventExtension && !this.EventProductChild) {
            this.EventProductLoading = true;
            try {
                if (this.record.ISAChild && this.record.ISAChild.EntityInfo.Name === 'MJ_BizApps_Orders: Event Products') {
                    this.EventProductChild = this.record.ISAChild as mjBizAppsOrdersEventProductEntity;
                } else if (this.record.IsSaved && this.record.ID) {
                    const ep = await md.GetEntityObject<mjBizAppsOrdersEventProductEntity>('MJ_BizApps_Orders: Event Products', md.CurrentUser);
                    if (await ep.Load(this.record.ID)) {
                        this.EventProductChild = ep;
                    } else {
                        await ep.NewRecord();
                        ep.ID = this.record.ID;
                        this.EventProductChild = ep;
                    }
                } else {
                    const ep = await md.GetEntityObject<mjBizAppsOrdersEventProductEntity>('MJ_BizApps_Orders: Event Products', md.CurrentUser);
                    await ep.NewRecord();
                    this.EventProductChild = ep;
                }
            } catch (err) {
                console.error('Failed to initialize EventProduct specialized profile:', err);
            } finally {
                this.EventProductLoading = false;
                this.cdr.detectChanges();
            }
        }
    }

    /**
     * Handles navigation requests from record links, sub-widgets, and related grids.
     * Dispatches directly to NavigationService.OpenEntityRecord to open in Explorer tabs.
     */
    override OnFormNavigate(event: FormNavigationEvent): void {
        this.Navigate.emit(event);
        DispatchFormNavigation(event, this.navigationService);
    }

    /**
     * Called when a child record or related widget mutates data.
     */
    public async OnWidgetDataChanged(): Promise<void> {
        if (!this.record.Dirty) {
            await this.record.InnerLoad(this.record.PrimaryKey);
            await this.syncSubtypeExtension();
            this.cdr.detectChanges();
        }
    }
}

/** Tree-shaking prevention anchor function */
export function LoadProductFormComponent(): void {
    // Anchors BizAppsProductFormComponent in bundlers
}
