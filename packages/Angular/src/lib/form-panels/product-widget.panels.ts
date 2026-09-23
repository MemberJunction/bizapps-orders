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
        inclusion: 'Primary',
        relatedEntity: 'MJ_BizApps_Orders: Product Prices',
        relatedJoinField: 'ProductID',
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
        // Claims the generated `financialAndAccounting` section, which rendered the same
        // Rev-Rec / IsTaxable / TaxCategory fields a second time. CompanyID moved into this
        // panel so nothing is lost; StandaloneSellingPrice is deliberately deprecated off
        // generated forms and is not carried over.
        replacesSectionKey: 'financialAndAccounting',
    },
})
@Component({
    standalone: false,
    selector: 'mjo-product-accounting-panel',
    // The mj-form-fields are declared HERE, not inside the widget, for the same reason as
    // fulfillment and subscriptions: mj-collapsible-panel reads its fields through
    // @ContentChildren, which cannot see a field declared inside a child component's view.
    // That query is also what drives the rail badge — a section that sees no fields reports
    // no required-and-empty count before a save and claims none of the field-named errors
    // after a failed one, so Accounting never badged even while CompanyID and
    // RevenueRecognitionTypeID sat empty and red (golive #255).
    //
    // This used to keep its fields in the widget so the panel could never hide-when-empty
    // and take the GL links with it. That is not a risk: CompanyID and
    // RevenueRecognitionTypeID are NOT NULL, so a saved record always has a renderable field
    // here, and an unsaved one opens in edit mode where fields render regardless.
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
                <mj-form-field
                    [Record]="Record"
                    [ShowLabel]="true"
                    FieldName="CompanyID"
                    Type="textbox"
                    [EditMode]="EditMode"
                    [FormContext]="FormContext"
                    LinkType="Record"
                    (Navigate)="FormComponent.OnFormNavigate($event)">
                </mj-form-field>
                <mj-form-field
                    [Record]="Record"
                    [ShowLabel]="true"
                    FieldName="RevenueRecognitionTypeID"
                    Type="textbox"
                    [EditMode]="EditMode"
                    [FormContext]="FormContext"
                    LinkType="Record"
                    (Navigate)="FormComponent.OnFormNavigate($event)">
                </mj-form-field>
                <mj-form-field
                    [Record]="Record"
                    [ShowLabel]="true"
                    FieldName="IsTaxable"
                    Type="checkbox"
                    [EditMode]="EditMode"
                    [FormContext]="FormContext"
                    (Navigate)="FormComponent.OnFormNavigate($event)">
                </mj-form-field>
                <mj-form-field
                    [Record]="Record"
                    [ShowLabel]="true"
                    FieldName="TaxCategory"
                    Type="textbox"
                    [EditMode]="EditMode"
                    [FormContext]="FormContext"
                    (Navigate)="FormComponent.OnFormNavigate($event)">
                </mj-form-field>
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
        // Claims the generated `catalogLifecycle` section, which rendered
        // SuccessorProductID / AvailableFrom / AvailableTo a second time. Its one remaining
        // field (Status) moved into this panel so nothing is lost.
        replacesSectionKey: 'catalogLifecycle',
    },
})
@Component({
    standalone: false,
    selector: 'mjo-product-fulfillment-panel',
    // The mj-form-fields are declared HERE, not inside the widget, so
    // mj-collapsible-panel's @ContentChildren hide-when-empty check can see them.
    // The widget is the card shell and projects them. See golive#184.
    template: `
        <mj-collapsible-panel
            SectionKey="fulfillment"
            SectionName="Fulfillment"
            Icon="fa-solid fa-truck"
            [Form]="FormComponent"
            [FormContext]="FormContext">
            <bizapps-product-fulfillment-widget>
                <mj-form-field
                    [Record]="Record"
                    [ShowLabel]="true"
                    FieldName="Status"
                    Type="select"
                    [EditMode]="EditMode"
                    [FormContext]="FormContext"
                    (Navigate)="FormComponent.OnFormNavigate($event)">
                </mj-form-field>
                <mj-form-field
                    [Record]="Record"
                    [ShowLabel]="true"
                    FieldName="AvailableFrom"
                    Type="datepicker"
                    [EditMode]="EditMode"
                    [FormContext]="FormContext"
                    (Navigate)="FormComponent.OnFormNavigate($event)">
                </mj-form-field>
                <mj-form-field
                    [Record]="Record"
                    [ShowLabel]="true"
                    FieldName="AvailableTo"
                    Type="datepicker"
                    [EditMode]="EditMode"
                    [FormContext]="FormContext"
                    (Navigate)="FormComponent.OnFormNavigate($event)">
                </mj-form-field>
                <mj-form-field
                    [Record]="Record"
                    [ShowLabel]="true"
                    FieldName="EntitlementGrantTiming"
                    Type="select"
                    [EditMode]="EditMode"
                    [FormContext]="FormContext"
                    (Navigate)="FormComponent.OnFormNavigate($event)">
                </mj-form-field>
                <mj-form-field
                    [Record]="Record"
                    [ShowLabel]="true"
                    FieldName="EntitlementQuantityMode"
                    Type="select"
                    [EditMode]="EditMode"
                    [FormContext]="FormContext"
                    (Navigate)="FormComponent.OnFormNavigate($event)">
                </mj-form-field>
                <mj-form-field
                    [Record]="Record"
                    [ShowLabel]="true"
                    FieldName="EntitlementValidityMode"
                    Type="select"
                    [EditMode]="EditMode"
                    [FormContext]="FormContext"
                    (Navigate)="FormComponent.OnFormNavigate($event)">
                </mj-form-field>
                <mj-form-field
                    [Record]="Record"
                    [ShowLabel]="true"
                    FieldName="SuccessorProductID"
                    Type="textbox"
                    [EditMode]="EditMode"
                    [FormContext]="FormContext"
                    LinkType="Record"
                    (Navigate)="FormComponent.OnFormNavigate($event)">
                </mj-form-field>
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
        // Claims the generated `subscriptionAndEntitlements` section — every one of its four
        // fields is already rendered by this panel or the fulfillment panel.
        replacesSectionKey: 'subscriptionAndEntitlements',
    },
})
@Component({
    standalone: false,
    selector: 'mjo-product-subscriptions-panel',
    // The mj-form-fields are declared HERE, not inside the widget, so
    // mj-collapsible-panel's @ContentChildren hide-when-empty check can see them.
    // The widget is the card shell and projects them. See golive#184.
    template: `
        <mj-collapsible-panel
            SectionKey="subscriptions"
            SectionName="Subscription"
            Icon="fa-solid fa-repeat"
            [Form]="FormComponent"
            [FormContext]="FormContext">
            <bizapps-product-subscription-widget>
                <mj-form-field
                    [Record]="Record"
                    [ShowLabel]="true"
                    FieldName="SubscriptionTypeID"
                    Type="textbox"
                    [EditMode]="EditMode"
                    [FormContext]="FormContext"
                    LinkType="Record"
                    (Navigate)="FormComponent.OnFormNavigate($event)">
                </mj-form-field>
                <mj-form-field
                    [Record]="Record"
                    [ShowLabel]="true"
                    FieldName="EntitlementValidityMode"
                    Type="select"
                    [EditMode]="EditMode"
                    [FormContext]="FormContext"
                    (Navigate)="FormComponent.OnFormNavigate($event)">
                </mj-form-field>
            </bizapps-product-subscription-widget>
        </mj-collapsible-panel>
    `,
})
export class ProductSubscriptionsPanel extends BaseFormPanel<mjBizAppsOrdersProductEntity> {}
