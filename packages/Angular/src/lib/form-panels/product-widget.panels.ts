import { Component } from '@angular/core';
import { RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import type { mjBizAppsOrdersProductEntity } from '@mj-biz-apps/orders-entities';

@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:Products:pricing',
    metadata: {
        entity: 'MJ_BizApps_Orders: Products',
        slot: 'after-fields',
        sortKey: 90,
        contributionKey: 'pricing',
    },
})
@Component({
    standalone: false,
    selector: 'mjo-product-pricing-panel',
    template: `
        <mj-collapsible-panel
            SectionKey="pricing"
            SectionName="Pricing"
            Icon="fa-solid fa-tags"
            [Form]="FormComponent"
            [FormContext]="FormContext"
            [DefaultExpanded]="true">
            <bizapps-product-pricing-widget
                [Product]="Record"
                [EditMode]="EditMode"
                [FormContext]="FormContext"
                (Navigate)="FormComponent.OnFormNavigate($event)">
            </bizapps-product-pricing-widget>
        </mj-collapsible-panel>
    `,
})
export class ProductPricingPanel extends BaseFormPanel<mjBizAppsOrdersProductEntity> {}

@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:Products:promos',
    metadata: {
        entity: 'MJ_BizApps_Orders: Products',
        slot: 'after-fields',
        sortKey: 70,
        contributionKey: 'promos',
    },
})
@Component({
    standalone: false,
    selector: 'mjo-product-promos-panel',
    template: `
        <mj-collapsible-panel
            SectionKey="promos"
            SectionName="Promotions"
            Icon="fa-solid fa-ticket"
            [Form]="FormComponent"
            [FormContext]="FormContext">
            <bizapps-product-promotions-widget
                [Product]="Record"
                [EditMode]="EditMode"
                [FormContext]="FormContext"
                (Navigate)="FormComponent.OnFormNavigate($event)">
            </bizapps-product-promotions-widget>
        </mj-collapsible-panel>
    `,
})
export class ProductPromosPanel extends BaseFormPanel<mjBizAppsOrdersProductEntity> {}

@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:Products:accounting',
    metadata: {
        entity: 'MJ_BizApps_Orders: Products',
        slot: 'after-fields',
        sortKey: 60,
        contributionKey: 'accounting',
    },
})
@Component({
    standalone: false,
    selector: 'mjo-product-accounting-panel',
    template: `
        <mj-collapsible-panel
            SectionKey="accounting"
            SectionName="Accounting"
            Icon="fa-solid fa-book"
            [Form]="FormComponent"
            [FormContext]="FormContext">
            <bizapps-product-accounting-widget
                [Product]="Record"
                [EditMode]="EditMode"
                [FormContext]="FormContext"
                (Navigate)="FormComponent.OnFormNavigate($event)">
            </bizapps-product-accounting-widget>
        </mj-collapsible-panel>
    `,
})
export class ProductAccountingPanel extends BaseFormPanel<mjBizAppsOrdersProductEntity> {}

@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:Products:fulfillment',
    metadata: {
        entity: 'MJ_BizApps_Orders: Products',
        slot: 'after-fields',
        sortKey: 50,
        contributionKey: 'fulfillment',
    },
})
@Component({
    standalone: false,
    selector: 'mjo-product-fulfillment-panel',
    template: `
        <mj-collapsible-panel
            SectionKey="fulfillment"
            SectionName="Fulfillment"
            Icon="fa-solid fa-truck"
            [Form]="FormComponent"
            [FormContext]="FormContext">
            <bizapps-product-fulfillment-widget
                [Product]="Record"
                [EditMode]="EditMode"
                [FormContext]="FormContext"
                (Navigate)="FormComponent.OnFormNavigate($event)">
            </bizapps-product-fulfillment-widget>
        </mj-collapsible-panel>
    `,
})
export class ProductFulfillmentPanel extends BaseFormPanel<mjBizAppsOrdersProductEntity> {}

@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:Products:subscriptions',
    metadata: {
        entity: 'MJ_BizApps_Orders: Products',
        slot: 'after-fields',
        sortKey: 40,
        contributionKey: 'subscriptions',
    },
})
@Component({
    standalone: false,
    selector: 'mjo-product-subscriptions-panel',
    template: `
        <mj-collapsible-panel
            SectionKey="subscriptions"
            SectionName="Subscription defaults"
            Icon="fa-solid fa-repeat"
            [Form]="FormComponent"
            [FormContext]="FormContext">
            <bizapps-product-subscription-widget
                [Product]="Record"
                [EditMode]="EditMode"
                [FormContext]="FormContext"
                (Navigate)="FormComponent.OnFormNavigate($event)">
            </bizapps-product-subscription-widget>
        </mj-collapsible-panel>
    `,
})
export class ProductSubscriptionsPanel extends BaseFormPanel<mjBizAppsOrdersProductEntity> {}
