import { Component } from '@angular/core';
import { RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import type { mjBizAppsOrdersProductEntity } from '@mj-biz-apps/orders-entities';

/**
 * Rail placement on MJ 6.2. MJ 6.2 files every panel at `before-fields`/`after-fields` with no
 * inclusion, and every panel that replaces a generated field section, inside the Details rail
 * item. Before 6.2 Promotions, Accounting, Fulfillment and Subscriptions were rail items of their
 * own after Details. They mount at `after-related` to stay that way (the related band sorts by
 * `sortKey`, descending), and the generated sections they stand in for are claimed by the header
 * panel, which is not a rail item. Pricing declares `inclusion: 'Primary'`, so it leads.
 */

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
        // After-related: see the rail note at the top of this file.
        slot: 'after-related',
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
        // After-related: see the rail note at the top of this file.
        slot: 'after-related',
        sortKey: 60,
        contributionKey: 'accounting',
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
    // and take the GL links with it. That is not a risk: IsTaxable is a NOT NULL bit and
    // RevenueRecognitionTypeID is NOT NULL, so a saved record always has a renderable field
    // here, and an unsaved one opens in edit mode where fields render regardless. In read mode
    // RevenueRecognitionTypeID renders as mjo-product-rev-rec-field instead, which leaves
    // IsTaxable as the field the section always sees.
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
                <!-- Read mode shows the name resolved by id, the value the header shows, instead of
                     the record's virtual name, which can lag the id (bc-aidp-next-golive#436). -->
                @if (EditMode) {
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
                } @else {
                    <mjo-product-rev-rec-field
                        [Record]="Record"
                        (Navigate)="FormComponent.OnFormNavigate($event)">
                    </mjo-product-rev-rec-field>
                }
                <!--
                    Never hidden when empty: with CompanyID gone to Details and RevenueRecognitionTypeID
                    rendered by mjo-product-rev-rec-field in read mode, these two are the only
                    mj-form-fields the section projects. A section whose every projected field hides
                    as empty hides itself and drops off the rail, GL cards and all. A tax status is
                    also worth reading when it is "not taxable" or has no category.
                -->
                <mj-form-field
                    [Record]="Record"
                    [ShowLabel]="true"
                    FieldName="IsTaxable"
                    Type="checkbox"
                    [EditMode]="EditMode"
                    [FormContext]="FormContext"
                    [HideWhenEmptyInReadOnlyMode]="false"
                    (Navigate)="FormComponent.OnFormNavigate($event)">
                </mj-form-field>
                <mj-form-field
                    [Record]="Record"
                    [ShowLabel]="true"
                    FieldName="TaxCategory"
                    Type="textbox"
                    [EditMode]="EditMode"
                    [FormContext]="FormContext"
                    [HideWhenEmptyInReadOnlyMode]="false"
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
        // After-related: see the rail note at the top of this file.
        slot: 'after-related',
        sortKey: 50,
        contributionKey: 'fulfillment',
        // Status, AvailableFrom and AvailableTo moved to the Lifecycle panel (golive#433);
        // SuccessorProductID stays here. The Details panel claims `catalogLifecycle`.
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

/**
 * Details: the selling company, Status, the availability window and IsSellableNew.
 *
 * Status decides whether a product is sellable: the deal and order pickers show Active products
 * only. It sat under Fulfillment, where nobody looked for it (golive#433), then in a Lifecycle
 * panel of its own. It now sits with the company and the dates in one Details panel, directly
 * under the header. The header's Draft banner activates in one click; this is where any other
 * status is set.
 *
 * WHY THIS CLAIMS `details` AND `catalogLifecycle`. CodeGen emits a `details` section with no
 * fields for Products, and mj-collapsible-panel hides a section only when every field it projects
 * is unreadable, never when it projects none, so the generated Details rendered as an empty panel.
 * Claiming it puts this panel in its place. The generated `catalogLifecycle` section is claimed too,
 * or Status, the dates and IsSellableNew render twice; its SuccessorProductID is in Fulfillment.
 * Both claims keep this panel in the Details rail item, which is where it belongs.
 */
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:Products:details',
    metadata: {
        entity: 'MJ_BizApps_Orders: Products',
        // Right under the header, above the generated Product Classification section.
        slot: 'before-fields',
        sortKey: 200,
        contributionKey: 'details',
        replacesSectionKey: 'details',
        replacesSectionKeys: ['catalogLifecycle'],
    },
})
@Component({
    standalone: false,
    selector: 'mjo-product-details-panel',
    // Declared directly under mj-collapsible-panel so its hide-when-empty check sees them (golive#184).
    template: `
        <!--
            SectionKey is NOT "details": the form hides every section whose key a panel claims, and
            this panel claims the generated "details", so sharing the key would hide this panel too.
        -->
        <mj-collapsible-panel
            SectionKey="productDetails"
            SectionName="Details"
            Icon="fa-solid fa-circle-info"
            [Form]="FormComponent"
            [FormContext]="FormContext">
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
                FieldName="CompanyID"
                Type="textbox"
                [EditMode]="EditMode"
                [FormContext]="FormContext"
                LinkType="Record"
                (Navigate)="FormComponent.OnFormNavigate($event)">
            </mj-form-field>
            <!-- Off for products kept for existing orders, imports and renewals: the add-product
                 pickers stop offering them, and pricing still accepts them (golive#360). -->
            <mj-form-field
                [Record]="Record"
                [ShowLabel]="true"
                FieldName="IsSellableNew"
                Type="checkbox"
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
        </mj-collapsible-panel>
    `,
})
export class ProductDetailsPanel extends BaseFormPanel<mjBizAppsOrdersProductEntity> {}

@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:Products:subscriptions',
    metadata: {
        entity: 'MJ_BizApps_Orders: Products',
        // After-related: see the rail note at the top of this file.
        slot: 'after-related',
        sortKey: 40,
        contributionKey: 'subscriptions',
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
                <!-- Bands of one offering share a family, so confirm can tell a different band
                     from a new subscription (golive #276). -->
                <mj-form-field
                    [Record]="Record"
                    [ShowLabel]="true"
                    FieldName="SubscriptionFamilyID"
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
                <mj-form-field
                    [Record]="Record"
                    [ShowLabel]="true"
                    FieldName="RenewalIncreasePercent"
                    Type="number"
                    [EditMode]="EditMode"
                    [FormContext]="FormContext"
                    (Navigate)="FormComponent.OnFormNavigate($event)">
                </mj-form-field>
            </bizapps-product-subscription-widget>
        </mj-collapsible-panel>
    `,
})
export class ProductSubscriptionsPanel extends BaseFormPanel<mjBizAppsOrdersProductEntity> {}
