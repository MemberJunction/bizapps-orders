import { Component, OnInit } from '@angular/core';
import { RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import type {
    mjBizAppsOrdersChargeTypeEntity,
    mjBizAppsOrdersPriceListAssignmentEntity,
    mjBizAppsOrdersPriceListEntity,
    mjBizAppsOrdersProductPriceEntity,
    mjBizAppsOrdersPromotionCodeEntity,
    mjBizAppsOrdersPromotionEntity,
    mjBizAppsOrdersPromotionTargetEntity,
    mjBizAppsOrdersSalesAuthorityEntity,
} from '@mj-biz-apps/orders-entities';
import { MJO_ENTITIES } from '../data/entity-names';
import { FormatMoney } from '../panels/money-format';
import { FormatCoverageWindow, FormatPercentFraction, PromotionValueLabel, YesNo } from './document-form.helpers';
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
    selector: 'mjo-price-list-overview-panel',
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
    key: 'form-panel:PriceLists:overview',
    metadata: { entity: 'MJ_BizApps_Orders: Price Lists', ...OVERVIEW_META },
})
export class PriceListOverviewPanel extends BaseFormPanel<mjBizAppsOrdersPriceListEntity> implements OnInit {
    public Cards: MJOOverviewCard[] = [];

    public async ngOnInit(): Promise<void> {
        if (!this.Record?.IsSaved) return;
        const p = this.FormComponent.ProviderToUse;
        const [prices, assignments] = await Promise.all([
            LoadOverviewRows<Pick<mjBizAppsOrdersProductPriceEntity, 'Product' | 'PricingModel' | 'Amount' | 'Status'>>(
                p, MJO_ENTITIES.ProductPrice, `PriceListID='${this.Record.ID}'`, ['Product', 'PricingModel', 'Amount', 'Status'],
            ),
            LoadOverviewRows<Pick<mjBizAppsOrdersPriceListAssignmentEntity, 'Organization' | 'Person' | 'Priority' | 'Status'>>(
                p, MJO_ENTITIES.PriceListAssignment, `PriceListID='${this.Record.ID}'`, ['Organization', 'Person', 'Priority', 'Status'],
            ),
        ]);
        this.Cards = [
            {
                Title: 'Who sees this list',
                Icon: 'fa-solid fa-user-tag',
                Headers: ['Party', 'Priority', 'Status'],
                Rows: assignments.map((a) => [
                    a.Organization || a.Person || 'Default (no party)',
                    String(a.Priority),
                    a.Status,
                ]),
            },
            {
                Title: 'Sample prices',
                Icon: 'fa-solid fa-list',
                Headers: ['Product', 'Model', 'Amount', 'Status'],
                Rows: prices.map((row) => [row.Product ?? '', row.PricingModel, FormatMoney(row.Amount), row.Status]),
            },
            {
                Title: 'Resolution reminder',
                Icon: 'fa-solid fa-route',
                Span: 2,
                Note: 'A Product has no price column. The walk is assignment (who) → list → ProductPrice (currency, qty, window) → optional PriceTier. The simulator pane prices a quantity against this list.',
                Facts: [
                    { Label: 'Validity', Value: FormatCoverageWindow(this.Record.EffectiveFrom, this.Record.EffectiveTo) },
                    { Label: 'Status', Value: this.Record.Status || '—' },
                    { Label: 'Prices', Value: String(prices.length) },
                    { Label: 'Assignments', Value: String(assignments.length) },
                ],
            },
        ];
        this.FormComponent.cdr.detectChanges();
    }
}

@Component({
    standalone: false,
    selector: 'mjo-promotion-overview-panel',
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
    key: 'form-panel:Promotions:overview',
    metadata: { entity: 'MJ_BizApps_Orders: Promotions', ...OVERVIEW_META },
})
export class PromotionOverviewPanel extends BaseFormPanel<mjBizAppsOrdersPromotionEntity> implements OnInit {
    public Cards: MJOOverviewCard[] = [];

    public async ngOnInit(): Promise<void> {
        if (!this.Record?.IsSaved) return;
        const p = this.FormComponent.ProviderToUse;
        const [codes, targets, redemptions] = await Promise.all([
            LoadOverviewRows<Pick<mjBizAppsOrdersPromotionCodeEntity, 'Code' | 'Status' | 'MaxRedemptions'>>(
                p, MJO_ENTITIES.PromotionCode, `PromotionID='${this.Record.ID}'`, ['Code', 'Status', 'MaxRedemptions'],
            ),
            LoadOverviewRows<Pick<mjBizAppsOrdersPromotionTargetEntity, 'Product' | 'ProductCategory' | 'IncludeDescendants'>>(
                p, MJO_ENTITIES.PromotionTarget, `PromotionID='${this.Record.ID}'`, ['Product', 'ProductCategory', 'IncludeDescendants'],
            ),
            CountOverviewRows(p, MJO_ENTITIES.OrderAdjustment, `PromotionID='${this.Record.ID}'`),
        ]);
        this.Cards = [
            {
                Title: 'Qualifiers',
                Icon: 'fa-solid fa-filter',
                Facts: [
                    { Label: 'Discount', Value: PromotionValueLabel(this.Record.Value, this.Record.PromotionType) },
                    { Label: 'Applies at', Value: this.Record.AppliesAt || '—' },
                    { Label: 'Minimum order', Value: this.Record.MinimumOrderAmount != null ? FormatMoney(this.Record.MinimumOrderAmount) : 'None' },
                    { Label: 'Minimum qty', Value: this.Record.MinimumQuantity != null ? String(this.Record.MinimumQuantity) : '—' },
                    { Label: 'Stacking', Value: this.Record.AllowsStacking ? 'Allowed' : 'Refused' },
                    { Label: 'Schedule', Value: FormatCoverageWindow(this.Record.EffectiveFrom, this.Record.EffectiveTo) },
                ],
            },
            {
                Title: 'Targets',
                Icon: 'fa-solid fa-bullseye',
                Items: targets.map((t) => ({
                    Title: t.Product || t.ProductCategory || 'Unscoped',
                    Detail: t.Product ? 'Product' : t.ProductCategory ? 'Category' : '—',
                    Badge: t.IncludeDescendants ? 'Descendants' : undefined,
                    BadgeKind: 'info',
                })),
            },
            {
                Title: 'Codes',
                Icon: 'fa-solid fa-barcode',
                Headers: ['Code', 'Status', 'Max uses'],
                Rows: codes.map((c) => [c.Code, c.Status, c.MaxRedemptions != null ? String(c.MaxRedemptions) : 'Unlimited']),
            },
            {
                Title: 'Redemptions',
                Icon: 'fa-solid fa-receipt',
                Facts: [
                    { Label: 'Order adjustments', Value: String(redemptions) },
                    { Label: 'Max overall', Value: this.Record.MaxRedemptions != null ? String(this.Record.MaxRedemptions) : 'Unlimited' },
                    { Label: 'Max / customer', Value: this.Record.MaxRedemptionsPerCustomer != null ? String(this.Record.MaxRedemptionsPerCustomer) : 'Unlimited' },
                ],
            },
        ];
        this.FormComponent.cdr.detectChanges();
    }
}

@Component({
    standalone: false,
    selector: 'mjo-charge-type-overview-panel',
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
    key: 'form-panel:ChargeTypes:overview',
    metadata: { entity: 'MJ_BizApps_Orders: Charge Types', ...OVERVIEW_META },
})
export class ChargeTypeOverviewPanel extends BaseFormPanel<mjBizAppsOrdersChargeTypeEntity> implements OnInit {
    public Cards: MJOOverviewCard[] = [];

    public async ngOnInit(): Promise<void> {
        if (!this.Record?.IsSaved) return;
        const used = await CountOverviewRows(
            this.FormComponent.ProviderToUse,
            MJO_ENTITIES.OrderCharge,
            `ChargeTypeID='${this.Record.ID}'`,
        );
        this.Cards = [
            {
                Title: 'How it calculates',
                Icon: 'fa-solid fa-calculator',
                Facts: [
                    { Label: 'Category', Value: this.Record.Category || '—' },
                    { Label: 'Basis', Value: this.Record.Basis || '—' },
                    { Label: 'Allows override', Value: this.Record.AllowsOverride ? 'Yes — reason required' : 'No' },
                    { Label: 'Sequence', Value: String(this.Record.Sequence ?? 0) },
                ],
                Note: this.Record.Description || undefined,
            },
            {
                Title: 'Usage',
                Icon: 'fa-solid fa-receipt',
                Facts: [{ Label: 'Charges of this type', Value: String(used) }],
            },
        ];
        this.FormComponent.cdr.detectChanges();
    }
}

@Component({
    standalone: false,
    selector: 'mjo-sales-authority-overview-panel',
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
    key: 'form-panel:SalesAuthorities:overview',
    metadata: { entity: 'MJ_BizApps_Orders: Sales Authorities', ...OVERVIEW_META },
})
export class SalesAuthorityOverviewPanel extends BaseFormPanel<mjBizAppsOrdersSalesAuthorityEntity> implements OnInit {
    public Cards: MJOOverviewCard[] = [];

    public async ngOnInit(): Promise<void> {
        if (!this.Record?.IsSaved) return;
        const auths = await CountOverviewRows(
            this.FormComponent.ProviderToUse,
            MJO_ENTITIES.OrderAdjustment,
            `AuthorizedBySalesAuthorityID='${this.Record.ID}'`,
        );
        this.Cards = [
            {
                Title: 'Limits',
                Icon: 'fa-solid fa-gauge',
                Facts: [
                    { Label: 'Max discount', Value: FormatPercentFraction(this.Record.MaxDiscountPct) },
                    { Label: 'Max order value', Value: FormatMoney(this.Record.MaxOrderValue) },
                    { Label: 'Allowed terms', Value: this.Record.AllowedPaymentTermsTypeIDs ? 'Restricted set' : 'All terms' },
                    { Label: 'Allowed categories', Value: this.Record.AllowedProductCategoryIDs ? 'Restricted set' : 'All categories' },
                    { Label: 'Active', Value: YesNo(this.Record.IsActive) },
                    { Label: 'Authorizations', Value: String(auths) },
                ],
            },
            {
                Title: 'How this is used',
                Icon: 'fa-solid fa-stamp',
                Note: 'Order adjustments that needed a sales-authority stamp point back here. A deactivated row stops new discounts; historical authorizations stay.',
            },
        ];
        this.FormComponent.cdr.detectChanges();
    }
}
