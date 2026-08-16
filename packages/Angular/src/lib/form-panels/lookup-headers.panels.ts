import { Component } from '@angular/core';
import { RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import type {
    mjBizAppsOrdersChargeTypeEntity,
    mjBizAppsOrdersPaymentProviderEntity,
    mjBizAppsOrdersPaymentTypeEntity,
    mjBizAppsOrdersProductCategoryEntity,
    mjBizAppsOrdersProductTypeEntity,
    mjBizAppsOrdersRevenueRecognitionTypeEntity,
    mjBizAppsOrdersSalesAuthorityEntity,
    mjBizAppsOrdersStoredValueAccountEntity,
    mjBizAppsOrdersSubscriptionTypeEntity,
} from '@mj-biz-apps/orders-entities';
import { FormatMoney } from '../panels/money-format';
import {
    ActiveChipLabel,
    FormatPercentFraction,
    FormatShortDate,
    YesNo,
} from './document-form.helpers';
import type { MJODocHeroChip, MJODocHeroStat } from './document-hero.component';

@Component({
    standalone: false,
    selector: 'mjo-product-type-header-panel',
    template: `<mjo-doc-hero [Title]="Title" Icon="fa-solid fa-layer-group" [Chips]="Chips" [Stats]="Stats"></mjo-doc-hero>`,
    styleUrls: ['./document-hero.css'],
})
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:ProductTypes:header',
    metadata: {
        entity: 'MJ_BizApps_Orders: Product Types',
        slot: 'before-fields',
        sortKey: 100,
        contributionKey: 'header',
    },
})
export class ProductTypeHeaderPanel extends BaseFormPanel<mjBizAppsOrdersProductTypeEntity> {
    public get Title(): string {
        return this.Record.Name || 'New product type';
    }
    public get Chips(): MJODocHeroChip[] {
        return [
            { Text: this.Record.Code || 'CODE TBD', Kind: '' },
            { Text: ActiveChipLabel(this.Record.IsActive), Kind: this.Record.IsActive ? 'ok' : 'muted' },
            { Text: this.Record.RequiresFulfillment ? 'Requires fulfillment' : 'No fulfillment', Kind: '' },
        ];
    }
    public get Stats(): MJODocHeroStat[] {
        return [
            { Label: 'Default rev-rec', Value: this.Record.DefaultRevenueRecognitionType || '—' },
            { Label: 'Default tax', Value: this.Record.DefaultIsTaxable ? 'Taxable' : 'Exempt' },
            { Label: 'Default sub type', Value: this.Record.DefaultSubscriptionType || '—' },
            { Label: 'Grant timing', Value: this.Record.DefaultEntitlementGrantTiming || '—' },
        ];
    }
}

@Component({
    standalone: false,
    selector: 'mjo-product-category-header-panel',
    template: `<mjo-doc-hero [Title]="Title" Icon="fa-solid fa-folder-tree" [Chips]="Chips" [Stats]="Stats"></mjo-doc-hero>`,
    styleUrls: ['./document-hero.css'],
})
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:ProductCategories:header',
    metadata: {
        entity: 'MJ_BizApps_Orders: Product Categories',
        slot: 'before-fields',
        sortKey: 100,
        contributionKey: 'header',
    },
})
export class ProductCategoryHeaderPanel extends BaseFormPanel<mjBizAppsOrdersProductCategoryEntity> {
    public get Title(): string {
        return this.Record.Name || 'New product category';
    }
    public get Chips(): MJODocHeroChip[] {
        return [
            { Text: this.Record.Code || 'CODE TBD', Kind: '' },
            { Text: ActiveChipLabel(this.Record.IsActive), Kind: this.Record.IsActive ? 'ok' : 'muted' },
        ];
    }
    public get Stats(): MJODocHeroStat[] {
        return [
            { Label: 'Company', Value: this.Record.Company || '—' },
            { Label: 'Parent', Value: this.Record.ParentProductCategory || 'Catalog root' },
            { Label: 'Default tax', Value: this.Record.DefaultIsTaxable == null ? '—' : (this.Record.DefaultIsTaxable ? 'Taxable' : 'Exempt') },
            { Label: 'Grant timing', Value: this.Record.DefaultEntitlementGrantTiming || '—' },
        ];
    }
}

@Component({
    standalone: false,
    selector: 'mjo-subscription-type-header-panel',
    template: `<mjo-doc-hero [Title]="Title" Icon="fa-solid fa-arrows-rotate" [Chips]="Chips" [Stats]="Stats"></mjo-doc-hero>`,
    styleUrls: ['./document-hero.css'],
})
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:SubscriptionTypes:header',
    metadata: {
        entity: 'MJ_BizApps_Orders: Subscription Types',
        slot: 'before-fields',
        sortKey: 100,
        contributionKey: 'header',
    },
})
export class SubscriptionTypeHeaderPanel extends BaseFormPanel<mjBizAppsOrdersSubscriptionTypeEntity> {
    public get Title(): string {
        return this.Record.Name || 'New subscription type';
    }
    public get Chips(): MJODocHeroChip[] {
        return [
            { Text: this.Record.Code || 'CODE TBD', Kind: '' },
            { Text: ActiveChipLabel(this.Record.IsActive), Kind: this.Record.IsActive ? 'ok' : 'muted' },
            { Text: this.Record.SubscriberScope || 'Either', Kind: '' },
        ];
    }
    public get Stats(): MJODocHeroStat[] {
        return [
            { Label: 'Billing', Value: this.Record.BillingCadence || '—' },
            { Label: 'Default term', Value: this.Record.DefaultTermMonths != null ? `${this.Record.DefaultTermMonths} mo` : '—' },
            { Label: 'Auto-renew', Value: YesNo(this.Record.AutoRenewDefault) },
            { Label: 'Trial', Value: `${this.Record.TrialDays ?? 0} days` },
        ];
    }
}

@Component({
    standalone: false,
    selector: 'mjo-rev-rec-type-header-panel',
    template: `<mjo-doc-hero [Title]="Title" Icon="fa-solid fa-scale-balanced" [Chips]="Chips" [Stats]="Stats"></mjo-doc-hero>`,
    styleUrls: ['./document-hero.css'],
})
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:RevenueRecognitionTypes:header',
    metadata: {
        entity: 'MJ_BizApps_Orders: Revenue Recognition Types',
        slot: 'before-fields',
        sortKey: 100,
        contributionKey: 'header',
    },
})
export class RevRecTypeHeaderPanel extends BaseFormPanel<mjBizAppsOrdersRevenueRecognitionTypeEntity> {
    public get Title(): string {
        return this.Record.Name || 'New rev-rec type';
    }
    public get Chips(): MJODocHeroChip[] {
        return [
            { Text: this.Record.Code || 'CODE TBD', Kind: '' },
            { Text: this.Record.IsDeferred ? 'Deferred' : 'Immediate', Kind: this.Record.IsDeferred ? 'info' : 'ok' },
            { Text: ActiveChipLabel(this.Record.IsActive), Kind: this.Record.IsActive ? 'ok' : 'muted' },
        ];
    }
    public get Stats(): MJODocHeroStat[] {
        return [
            { Label: 'Service period', Value: this.Record.RequiresServicePeriod ? 'Required' : 'Not required' },
            { Label: 'Driver', Value: this.Record.DriverClass || '—' },
            { Label: 'Sequence', Value: String(this.Record.Sequence ?? 0) },
        ];
    }
}

@Component({
    standalone: false,
    selector: 'mjo-charge-type-header-panel',
    template: `<mjo-doc-hero [Title]="Title" Icon="fa-solid fa-plus-minus" [Chips]="Chips" [Stats]="Stats"></mjo-doc-hero>`,
    styleUrls: ['./document-hero.css'],
})
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:ChargeTypes:header',
    metadata: {
        entity: 'MJ_BizApps_Orders: Charge Types',
        slot: 'before-fields',
        sortKey: 100,
        contributionKey: 'header',
    },
})
export class ChargeTypeHeaderPanel extends BaseFormPanel<mjBizAppsOrdersChargeTypeEntity> {
    public get Title(): string {
        return this.Record.Name || 'New charge type';
    }
    public get Chips(): MJODocHeroChip[] {
        return [
            { Text: this.Record.Code || 'CODE TBD', Kind: '' },
            { Text: this.Record.Category || '—', Kind: '' },
            { Text: this.Record.AllowsOverride ? 'Override ok' : 'No override', Kind: this.Record.AllowsOverride ? 'info' : '' },
            { Text: ActiveChipLabel(this.Record.IsActive), Kind: this.Record.IsActive ? 'ok' : 'muted' },
        ];
    }
    public get Stats(): MJODocHeroStat[] {
        return [
            { Label: 'Category', Value: this.Record.Category || '—' },
            { Label: 'Basis', Value: this.Record.Basis || '—' },
            { Label: 'Allows override', Value: YesNo(this.Record.AllowsOverride) },
            { Label: 'Sequence', Value: String(this.Record.Sequence ?? 0) },
        ];
    }
}

@Component({
    standalone: false,
    selector: 'mjo-sales-authority-header-panel',
    template: `<mjo-doc-hero [Title]="Title" Icon="fa-solid fa-user-shield" [Chips]="Chips" [Stats]="Stats"></mjo-doc-hero>`,
    styleUrls: ['./document-hero.css'],
})
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:SalesAuthorities:header',
    metadata: {
        entity: 'MJ_BizApps_Orders: Sales Authorities',
        slot: 'before-fields',
        sortKey: 100,
        contributionKey: 'header',
    },
})
export class SalesAuthorityHeaderPanel extends BaseFormPanel<mjBizAppsOrdersSalesAuthorityEntity> {
    public get Title(): string {
        return this.Record.SalesRepUser || 'New sales authority';
    }
    public get Chips(): MJODocHeroChip[] {
        return [
            { Text: ActiveChipLabel(this.Record.IsActive), Kind: this.Record.IsActive ? 'ok' : 'muted' },
            { Text: `Max ${FormatPercentFraction(this.Record.MaxDiscountPct)}`, Kind: 'warn' },
        ];
    }
    public get Stats(): MJODocHeroStat[] {
        return [
            { Label: 'Max discount', Value: FormatPercentFraction(this.Record.MaxDiscountPct) },
            { Label: 'Max order', Value: FormatMoney(this.Record.MaxOrderValue) },
            { Label: 'Terms', Value: this.Record.AllowedPaymentTermsTypeIDs ? 'Limited' : 'All' },
            { Label: 'Categories', Value: this.Record.AllowedProductCategoryIDs ? 'Limited' : 'All' },
        ];
    }
}

@Component({
    standalone: false,
    selector: 'mjo-stored-value-header-panel',
    template: `<mjo-doc-hero [Title]="Title" Icon="fa-solid fa-gift" [Chips]="Chips" [Stats]="Stats"></mjo-doc-hero>`,
    styleUrls: ['./document-hero.css'],
})
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:StoredValueAccounts:header',
    metadata: {
        entity: 'MJ_BizApps_Orders: Stored Value Accounts',
        slot: 'before-fields',
        sortKey: 100,
        contributionKey: 'header',
    },
})
export class StoredValueHeaderPanel extends BaseFormPanel<mjBizAppsOrdersStoredValueAccountEntity> {
    public get Title(): string {
        return this.Record.Code || 'New stored value';
    }
    public get Chips(): MJODocHeroChip[] {
        const status = this.Record.Status || 'Active';
        const kind = status === 'Active' ? 'ok' : status === 'Suspended' || status === 'Expired' ? 'warn' : 'muted';
        return [
            { Text: status, Kind: kind },
        ];
    }
    public get Stats(): MJODocHeroStat[] {
        return [
            { Label: 'Remaining', Value: FormatMoney(this.Record.CurrentBalance) },
            { Label: 'Initial', Value: FormatMoney(this.Record.InitialAmount) },
            { Label: 'Expires', Value: this.Record.ExpiresAt ? FormatShortDate(this.Record.ExpiresAt) : 'Never' },
            { Label: 'Holder', Value: this.Record.BeneficiaryPerson || this.Record.BeneficiaryOrganization || '—' },
        ];
    }
}

@Component({
    standalone: false,
    selector: 'mjo-payment-provider-header-panel',
    template: `<mjo-doc-hero [Title]="Title" Icon="fa-solid fa-plug" [Chips]="Chips" [Stats]="Stats"></mjo-doc-hero>`,
    styleUrls: ['./document-hero.css'],
})
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:PaymentProviders:header',
    metadata: {
        entity: 'MJ_BizApps_Orders: Payment Providers',
        slot: 'before-fields',
        sortKey: 100,
        contributionKey: 'header',
    },
})
export class PaymentProviderHeaderPanel extends BaseFormPanel<mjBizAppsOrdersPaymentProviderEntity> {
    public get Title(): string {
        return this.Record.Name || 'New payment provider';
    }
    public get Chips(): MJODocHeroChip[] {
        return [
            { Text: this.Record.PaymentProviderType || 'Provider', Kind: '' },
            { Text: this.Record.IsLiveMode ? 'Live' : 'Test', Kind: this.Record.IsLiveMode ? 'ok' : 'info' },
            { Text: ActiveChipLabel(this.Record.IsActive), Kind: this.Record.IsActive ? 'ok' : 'muted' },
        ];
    }
    public get Stats(): MJODocHeroStat[] {
        return [
            { Label: 'Type', Value: this.Record.PaymentProviderType || '—' },
            { Label: 'Mode', Value: this.Record.IsLiveMode ? 'Live' : 'Test' },
            { Label: 'Company', Value: this.Record.Company || '—' },
        ];
    }
}

@Component({
    standalone: false,
    selector: 'mjo-payment-type-header-panel',
    template: `<mjo-doc-hero [Title]="Title" Icon="fa-solid fa-money-check-dollar" [Chips]="Chips" [Stats]="Stats"></mjo-doc-hero>`,
    styleUrls: ['./document-hero.css'],
})
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:PaymentTypes:header',
    metadata: {
        entity: 'MJ_BizApps_Orders: Payment Types',
        slot: 'before-fields',
        sortKey: 100,
        contributionKey: 'header',
    },
})
export class PaymentTypeHeaderPanel extends BaseFormPanel<mjBizAppsOrdersPaymentTypeEntity> {
    public get Title(): string {
        return this.Record.Name || 'New payment type';
    }
    public get Chips(): MJODocHeroChip[] {
        return [
            { Text: this.Record.Code || 'CODE TBD', Kind: '' },
            { Text: ActiveChipLabel(this.Record.IsActive), Kind: this.Record.IsActive ? 'ok' : 'muted' },
            ...(this.Record.IsReversal ? [{ Text: 'Reversal', Kind: 'warn' as const }] : []),
        ];
    }
    public get Stats(): MJODocHeroStat[] {
        return [
            { Label: 'Requires provider', Value: YesNo(this.Record.RequiresProvider) },
            { Label: 'Requires instrument', Value: YesNo(this.Record.RequiresInstrument) },
            { Label: 'Requires reference', Value: YesNo(this.Record.RequiresReference) },
            { Label: 'Fee inline', Value: YesNo(this.Record.BookProcessingFeeInline) },
        ];
    }
}
