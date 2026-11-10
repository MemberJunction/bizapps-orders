import { Component, OnInit } from '@angular/core';
import { RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import type {
    mjBizAppsOrdersEventProductEntity,
    mjBizAppsOrdersProductCategoryEntity,
    mjBizAppsOrdersProductEntitlementEntity,
    mjBizAppsOrdersProductEntity,
    mjBizAppsOrdersProductPriceEntity,
    mjBizAppsOrdersProductTypeEntity,
    mjBizAppsOrdersRevenueRecognitionTypeEntity,
    mjBizAppsOrdersSubscriptionTypeEntity,
} from '@mj-biz-apps/orders-entities';
import { ParseRevenueBand, RevenueBandRangeText, ToISODate, Today } from '@mj-biz-apps/orders-entities';
import { MJO_ENTITIES } from '../data/entity-names';
import { FormatMoney } from '../panels/money-format';
import { LoadProductLookupNames } from '../panels/product-lookup-names';
import { FormatShortInstantDate, YesNo } from './document-form.helpers';
import type { MJOOverviewCard } from './overview-cards.component';
import { CountOverviewRows, LoadOverviewRows } from './overview-load';

const OVERVIEW_META = {
    slot: 'after-fields' as const,
    sortKey: 200,
    contributionKey: 'overview',
    inclusion: 'Primary' as const,
};

@Component({
    standalone: false,
    selector: 'mjo-product-type-overview-panel',
    template: `
        @if (Record.IsSaved) {
            <mj-collapsible-panel SectionKey="overview" SectionName="Overview" Icon="fa-solid fa-chart-pie"
                [Form]="FormComponent" [FormContext]="FormContext" [DefaultExpanded]="true">
                <mjo-overview-cards [Cards]="Cards"></mjo-overview-cards>
            </mj-collapsible-panel>
        }
    `,
    styleUrls: ['./document-hero.css'],
})
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:ProductTypes:overview',
    metadata: { entity: 'MJ_BizApps_Orders: Product Types', ...OVERVIEW_META },
})
export class ProductTypeOverviewPanel extends BaseFormPanel<mjBizAppsOrdersProductTypeEntity> implements OnInit {
    public Cards: MJOOverviewCard[] = [];

    public async ngOnInit(): Promise<void> {
        if (!this.Record?.IsSaved) return;
        const products = await LoadOverviewRows<{ Name: string; SKU: string | null; Status: string }>(
            this.FormComponent.ProviderToUse,
            MJO_ENTITIES.Product,
            `ProductTypeID='${this.Record.ID}'`,
            ['Name', 'SKU', 'Status'],
        );
        const active = products.filter((p) => p.Status === 'Active').length;
        this.Cards = [
            {
                Title: 'Defaults stamped on new products',
                Icon: 'fa-solid fa-stamp',
                Facts: [
                    { Label: 'Revenue recognition', Value: this.Record.DefaultRevenueRecognitionType || '—' },
                    { Label: 'Taxable', Value: YesNo(this.Record.DefaultIsTaxable) },
                    { Label: 'Subscription type', Value: this.Record.DefaultSubscriptionType || '—' },
                    { Label: 'Grant timing', Value: this.Record.DefaultEntitlementGrantTiming || '—' },
                    { Label: 'Requires fulfillment', Value: YesNo(this.Record.RequiresFulfillment) },
                    { Label: 'Extension entity', Value: this.Record.ProductExtensionEntity || '— none —' },
                ],
            },
            {
                Title: 'Product mix',
                Icon: 'fa-solid fa-boxes-stacked',
                Headers: ['Product', 'SKU', 'Status'],
                Rows: products.map((p) => [p.Name, p.SKU || '—', p.Status]),
                Note: `${products.length} products · ${active} active`,
            },
            {
                Title: 'Why this type exists',
                Icon: 'fa-solid fa-circle-info',
                Span: 2,
                Note: this.Record.Description ||
                    'A Product Type is the policy a new Product inherits — rev-rec, tax, subscription shape, entitlement timing. Existing products keep what they captured.',
            },
        ];
        this.FormComponent.cdr.detectChanges();
    }
}

@Component({
    standalone: false,
    selector: 'mjo-product-category-overview-panel',
    template: `
        @if (Record.IsSaved) {
            <mj-collapsible-panel SectionKey="overview" SectionName="Overview" Icon="fa-solid fa-chart-pie"
                [Form]="FormComponent" [FormContext]="FormContext" [DefaultExpanded]="true">
                <mjo-overview-cards [Cards]="Cards"></mjo-overview-cards>
            </mj-collapsible-panel>
        }
    `,
    styleUrls: ['./document-hero.css'],
})
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:ProductCategories:overview',
    metadata: { entity: 'MJ_BizApps_Orders: Product Categories', ...OVERVIEW_META },
})
export class ProductCategoryOverviewPanel extends BaseFormPanel<mjBizAppsOrdersProductCategoryEntity> implements OnInit {
    public Cards: MJOOverviewCard[] = [];

    public async ngOnInit(): Promise<void> {
        if (!this.Record?.IsSaved) return;
        const p = this.FormComponent.ProviderToUse;
        const [products, children, promos] = await Promise.all([
            LoadOverviewRows<{ Name: string; ProductType: string; Status: string }>(
                p, MJO_ENTITIES.Product, `ProductCategoryID='${this.Record.ID}'`, ['Name', 'ProductType', 'Status'],
            ),
            LoadOverviewRows<{ Name: string; Code: string | null; IsActive: boolean }>(
                p, MJO_ENTITIES.ProductCategory, `ParentProductCategoryID='${this.Record.ID}'`, ['Name', 'Code', 'IsActive'],
            ),
            LoadOverviewRows<{ PromotionID: string }>(
                p, MJO_ENTITIES.PromotionTarget, `ProductCategoryID='${this.Record.ID}'`, ['PromotionID'],
            ),
        ]);
        this.Cards = [
            {
                Title: 'Tree position',
                Icon: 'fa-solid fa-sitemap',
                Facts: [
                    { Label: 'Company', Value: this.Record.Company || '—' },
                    { Label: 'Parent', Value: this.Record.ParentProductCategory || 'Catalog root' },
                    { Label: 'Children', Value: String(children.length) },
                    { Label: 'Default taxable', Value: this.Record.DefaultIsTaxable == null ? '—' : YesNo(this.Record.DefaultIsTaxable) },
                    { Label: 'Default tax category', Value: this.Record.DefaultTaxCategory || '—' },
                    { Label: 'Grant timing', Value: this.Record.DefaultEntitlementGrantTiming || '—' },
                ],
            },
            {
                Title: 'Products in this category',
                Icon: 'fa-solid fa-box',
                Headers: ['Product', 'Type', 'Status'],
                Rows: products.map((row) => [row.Name, row.ProductType, row.Status]),
            },
            {
                Title: 'Child categories',
                Icon: 'fa-solid fa-folder',
                Items: children.map((c) => ({
                    Title: c.Name,
                    Detail: c.Code || 'No code',
                    Badge: c.IsActive ? 'Active' : 'Inactive',
                    BadgeKind: c.IsActive ? 'ok' : 'muted',
                })),
            },
            {
                Title: 'Promotions targeting this branch',
                Icon: 'fa-solid fa-ticket',
                Note: promos.length === 0
                    ? 'No promotion targets this category yet.'
                    : `${promos.length} promotion target${promos.length === 1 ? '' : 's'} point here.`,
            },
        ];
        this.FormComponent.cdr.detectChanges();
    }
}

/** The columns the product overview reads from a price row. */
export type OverviewPriceRow = Pick<
    mjBizAppsOrdersProductPriceEntity,
    'Name' | 'PriceList' | 'Amount' | 'Status' | 'Priority' | 'Applicability' | 'EffectiveTo'
>;

/**
 * The prices a customer can receive today, in the order the Pricing panel lists them: highest priority
 * first (that is what wins), revenue bands lowest band first within a priority, then by name. Inactive
 * and expired rows are left out; the card says how many. Exported for the unit test.
 */
export function ActiveOverviewPrices(rows: OverviewPriceRow[]): OverviewPriceRow[] {
    const today = Today();
    const bandMin = (r: OverviewPriceRow) => ParseRevenueBand(r.Applicability)?.Min ?? null;
    return rows
        .filter((r) => r.Status === 'Active' && (ToISODate(r.EffectiveTo) ?? today) >= today)
        .sort((a, b) => {
            const byPriority = (Number(b.Priority) || 0) - (Number(a.Priority) || 0);
            if (byPriority !== 0) return byPriority;
            const am = bandMin(a);
            const bm = bandMin(b);
            if (am != null || bm != null) return (am ?? -Infinity) - (bm ?? -Infinity);
            return (a.Name ?? '').localeCompare(b.Name ?? '');
        });
}

/** "All customers", "Annual revenue $2M – $5M", or "Member Pricing · Annual revenue Under $2M". */
export function OverviewPriceScope(row: OverviewPriceRow): string {
    const band = ParseRevenueBand(row.Applicability);
    const who = band ? `Annual revenue ${RevenueBandRangeText(band)}` : row.Applicability?.trim() ? 'Conditional' : 'All customers';
    return row.PriceList ? `${row.PriceList} · ${who}` : who;
}

@Component({
    standalone: false,
    selector: 'mjo-product-overview-panel',
    template: `
        @if (Record.IsSaved) {
            <mj-collapsible-panel SectionKey="overview" SectionName="Overview" Icon="fa-solid fa-chart-pie"
                [Form]="FormComponent" [FormContext]="FormContext" [DefaultExpanded]="true">
                <mjo-overview-cards [Cards]="Cards"></mjo-overview-cards>
            </mj-collapsible-panel>
        }
    `,
    styleUrls: ['./document-hero.css'],
})
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:Products:overview',
    metadata: { entity: 'MJ_BizApps_Orders: Products', ...OVERVIEW_META },
})
export class ProductOverviewPanel extends BaseFormPanel<mjBizAppsOrdersProductEntity> implements OnInit {
    public Cards: MJOOverviewCard[] = [];

    public async ngOnInit(): Promise<void> {
        if (!this.Record?.IsSaved) return;
        const p = this.FormComponent.ProviderToUse;
        const [prices, entitlements, events, orderCount, names] = await Promise.all([
            LoadOverviewRows<OverviewPriceRow>(
                p,
                MJO_ENTITIES.ProductPrice,
                `ProductID='${this.Record.ID}'`,
                ['Name', 'PriceList', 'Amount', 'Status', 'Priority', 'Applicability', 'EffectiveTo'],
                24,
                'Priority DESC, Amount ASC, Name ASC',
            ),
            LoadOverviewRows<Pick<mjBizAppsOrdersProductEntitlementEntity, 'Name' | 'Code' | 'EntitlementType' | 'IsActive'>>(
                p, MJO_ENTITIES.ProductEntitlement, `ProductID='${this.Record.ID}'`, ['Name', 'Code', 'EntitlementType', 'IsActive'],
            ),
            LoadOverviewRows<Pick<mjBizAppsOrdersEventProductEntity, 'VenueName' | 'Capacity' | 'EventStartsAt' | 'EventEndsAt'>>(
                p, MJO_ENTITIES.EventProduct, `ID='${this.Record.ID}'`, ['VenueName', 'Capacity', 'EventStartsAt', 'EventEndsAt'], 1,
            ),
            CountOverviewRows(p, MJO_ENTITIES.OrderLine, `ProductID='${this.Record.ID}'`),
            LoadProductLookupNames(this.Record),
        ]);
        const event = events[0];
        const active = ActiveOverviewPrices(prices);
        const hidden = prices.length - active.length;
        // Type, category, company, availability, list price, revenue recognition and tax sit in the
        // header strip above, so the prices get the full width here and a long ladder stays readable.
        const cards: MJOOverviewCard[] = [
            {
                Title: 'Active prices',
                Icon: 'fa-solid fa-tags',
                Span: 2,
                Headers: ['Price', 'Applies to', 'Amount'],
                NumericColumns: [2],
                Rows: active.map((row) => [row.Name?.trim() || 'Price', OverviewPriceScope(row), FormatMoney(row.Amount)]),
                Note: hidden > 0 ? `${hidden} inactive or expired price${hidden === 1 ? '' : 's'} not shown. See the Pricing panel.` : undefined,
            },
            {
                Title: 'Entitlements',
                Icon: 'fa-solid fa-key',
                Note: entitlements.length ? 'Granted when an order for this product is confirmed.' : undefined,
                Items: entitlements.map((e) => ({
                    Title: e.Name || e.Code,
                    Detail: `${e.EntitlementType} · ${e.Code}`,
                    Badge: e.IsActive ? 'Active' : 'Inactive',
                    BadgeKind: e.IsActive ? 'ok' : 'muted',
                })),
            },
            {
                Title: 'Sales summary',
                Icon: 'fa-solid fa-chart-column',
                Facts: [
                    { Label: 'Order lines sold', Value: String(orderCount) },
                    { Label: 'Replaced by', Value: names.Successor },
                ],
            },
        ];
        if (event) {
            cards.unshift({
                Title: 'Event details',
                Icon: 'fa-solid fa-location-dot',
                Facts: [
                    { Label: 'Starts', Value: FormatShortInstantDate(event.EventStartsAt) || '—' },
                    { Label: 'Ends', Value: FormatShortInstantDate(event.EventEndsAt) || '—' },
                    { Label: 'Venue', Value: event.VenueName || '—' },
                    { Label: 'Capacity', Value: event.Capacity != null ? String(event.Capacity) : '—' },
                ],
                Note: 'Capacity and attendees are maintained on the event record.',
            });
        }
        this.Cards = cards;
        this.FormComponent.cdr.detectChanges();
    }
}

@Component({
    standalone: false,
    selector: 'mjo-subscription-type-overview-panel',
    template: `
        @if (Record.IsSaved) {
            <mj-collapsible-panel SectionKey="overview" SectionName="Overview" Icon="fa-solid fa-chart-pie"
                [Form]="FormComponent" [FormContext]="FormContext" [DefaultExpanded]="true">
                <mjo-overview-cards [Cards]="Cards"></mjo-overview-cards>
            </mj-collapsible-panel>
        }
    `,
    styleUrls: ['./document-hero.css'],
})
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:SubscriptionTypes:overview',
    metadata: { entity: 'MJ_BizApps_Orders: Subscription Types', ...OVERVIEW_META },
})
export class SubscriptionTypeOverviewPanel extends BaseFormPanel<mjBizAppsOrdersSubscriptionTypeEntity> implements OnInit {
    public Cards: MJOOverviewCard[] = [];

    public async ngOnInit(): Promise<void> {
        if (!this.Record?.IsSaved) return;
        const p = this.FormComponent.ProviderToUse;
        const [products, liveCount] = await Promise.all([
            LoadOverviewRows<{ Name: string; SKU: string | null }>(
                p, MJO_ENTITIES.Product, `SubscriptionTypeID='${this.Record.ID}'`, ['Name', 'SKU'],
            ),
            CountOverviewRows(p, MJO_ENTITIES.Subscription, `SubscriptionTypeID='${this.Record.ID}'`),
        ]);
        this.Cards = [
            {
                Title: 'Lifecycle policy',
                Icon: 'fa-solid fa-route',
                Facts: [
                    { Label: 'Start mode', Value: this.Record.StartMode || '—' },
                    { Label: 'Trial', Value: `${this.Record.TrialDays ?? 0} days` },
                    { Label: 'Grace', Value: `${this.Record.GracePeriodDays ?? 0} days` },
                    { Label: 'Cancellation', Value: this.Record.CancellationMode || '—' },
                    { Label: 'Refund on cancel', Value: this.Record.CancellationRefundMode || '—' },
                    { Label: 'Reactivation', Value: this.Record.ReactivationMode || '—' },
                ],
            },
            {
                Title: 'Money cadences',
                Icon: 'fa-solid fa-clock',
                Facts: [
                    { Label: 'Billing cadence', Value: this.Record.BillingCadence || '—' },
                    { Label: 'Recognition cadence', Value: this.Record.RecognitionCadence || '—' },
                    { Label: 'Partial period', Value: this.Record.PartialPeriodMode || '—' },
                    { Label: 'Renewal lead', Value: this.Record.RenewalLeadDays != null ? `${this.Record.RenewalLeadDays} days` : '—' },
                    { Label: 'Concurrency', Value: this.Record.ConcurrencyMode || '—' },
                    { Label: 'Benefit model', Value: this.Record.BenefitModel || '—' },
                ],
            },
            {
                Title: 'Products that use this type',
                Icon: 'fa-solid fa-box',
                Items: products.map((row) => ({ Title: row.Name, Detail: row.SKU || 'No SKU' })),
            },
            {
                Title: 'Live book',
                Icon: 'fa-solid fa-chart-pie',
                Facts: [{ Label: 'Subscriptions', Value: String(liveCount) }],
                Note: 'Changing a type does not rewrite live subscriptions. Terms already billed keep the captured policy.',
            },
        ];
        this.FormComponent.cdr.detectChanges();
    }
}

@Component({
    standalone: false,
    selector: 'mjo-rev-rec-type-overview-panel',
    template: `
        @if (Record.IsSaved) {
            <mj-collapsible-panel SectionKey="overview" SectionName="Overview" Icon="fa-solid fa-chart-pie"
                [Form]="FormComponent" [FormContext]="FormContext" [DefaultExpanded]="true">
                <mjo-overview-cards [Cards]="Cards"></mjo-overview-cards>
            </mj-collapsible-panel>
        }
    `,
    styleUrls: ['./document-hero.css'],
})
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:RevenueRecognitionTypes:overview',
    metadata: { entity: 'MJ_BizApps_Orders: Revenue Recognition Types', ...OVERVIEW_META },
})
export class RevRecTypeOverviewPanel extends BaseFormPanel<mjBizAppsOrdersRevenueRecognitionTypeEntity> implements OnInit {
    public Cards: MJOOverviewCard[] = [];

    public async ngOnInit(): Promise<void> {
        if (!this.Record?.IsSaved) return;
        const products = await LoadOverviewRows<{ Name: string; SKU: string | null }>(
            this.FormComponent.ProviderToUse,
            MJO_ENTITIES.Product,
            `RevenueRecognitionTypeID='${this.Record.ID}'`,
            ['Name', 'SKU'],
        );
        this.Cards = [
            {
                Title: 'How money is earned',
                Icon: 'fa-solid fa-book',
                Note: this.Record.IsDeferred
                    ? 'On confirm the line books a receivable and a deferred-revenue liability. Each period of the service window releases a slice to revenue.'
                    : 'Immediate types skip the liability and book revenue on the order date.',
                Facts: [
                    { Label: 'Is deferred', Value: YesNo(this.Record.IsDeferred) },
                    { Label: 'Requires service period', Value: YesNo(this.Record.RequiresServicePeriod) },
                    { Label: 'Driver class', Value: this.Record.DriverClass || '—' },
                    { Label: 'Sequence', Value: String(this.Record.Sequence ?? 0) },
                ],
            },
            {
                Title: 'Products on this treatment',
                Icon: 'fa-solid fa-box',
                Headers: ['Product', 'SKU'],
                Rows: products.map((row) => [row.Name, row.SKU || '—']),
            },
        ];
        this.FormComponent.cdr.detectChanges();
    }
}
