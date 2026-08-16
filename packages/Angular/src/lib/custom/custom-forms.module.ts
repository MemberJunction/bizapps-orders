/**
 * Custom form components and overrides for BizApps Orders.
 * Components declared here are loaded AFTER the generated forms module so their
 * @RegisterClass decorators win priority over the generated forms in ClassFactory.
 */
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// MemberJunction Form Primitives
import { BaseFormsModule } from '@memberjunction/ng-base-forms';
import { EntityViewerModule } from '@memberjunction/ng-entity-viewer';
import { LinkDirectivesModule } from '@memberjunction/ng-link-directives';
import { MJButtonDirective, MJTabNavComponent } from '@memberjunction/ng-ui-components';
import { DeferredRevenueWaterfallModule } from '../form-panels/deferred-revenue-waterfall.stub';

// Custom Form Components
import { BizAppsProductFormComponent, LoadProductFormComponent } from './Product/product-form.component';
import { BizAppsProductPricingWidgetComponent } from './Product/widgets/product-pricing-widget.component';
import { BizAppsProductPromotionsWidgetComponent } from './Product/widgets/product-promotions-widget.component';
import { BizAppsProductAccountingWidgetComponent } from './Product/widgets/product-accounting-widget.component';
import { BizAppsProductFulfillmentWidgetComponent } from './Product/widgets/product-fulfillment-widget.component';
import { BizAppsProductSubscriptionWidgetComponent } from './Product/widgets/product-subscription-widget.component';
import { BizAppsPriceListFormComponent, LoadPriceListFormComponent } from './PriceList/price-list-form.component';
import { BizAppsPromotionFormComponent, LoadPromotionFormComponent } from './Promotion/promotion-form.component';
import { BizAppsOrderHeaderFormComponent, LoadOrderHeaderFormComponent } from './OrderHeader/order-header-form.component';
import { MJOOrderLinesEditorComponent } from './OrderHeader/order-lines-editor.component';
import { BizAppsSubscriptionFormComponent, LoadSubscriptionFormComponent } from './Subscription/subscription-form.component';
import { BizAppsSubscriptionTermFormComponent, LoadSubscriptionTermFormComponent } from './SubscriptionTerm/subscription-term-form.component';
import { BizAppsPaymentHeaderFormComponent, LoadPaymentHeaderFormComponent } from './PaymentHeader/payment-header-form.component';

@NgModule({
    declarations: [
        BizAppsProductFormComponent,
        BizAppsProductPricingWidgetComponent,
        BizAppsProductPromotionsWidgetComponent,
        BizAppsProductAccountingWidgetComponent,
        BizAppsProductFulfillmentWidgetComponent,
        BizAppsProductSubscriptionWidgetComponent,
        BizAppsPriceListFormComponent,
        BizAppsPromotionFormComponent,
        BizAppsOrderHeaderFormComponent,
        BizAppsSubscriptionFormComponent,
        BizAppsSubscriptionTermFormComponent,
        BizAppsPaymentHeaderFormComponent,
    ],
    imports: [
        CommonModule,
        FormsModule,
        BaseFormsModule,
        EntityViewerModule,
        LinkDirectivesModule,
        MJButtonDirective,
        MJTabNavComponent,
        MJOOrderLinesEditorComponent,
        DeferredRevenueWaterfallModule,
    ],
    exports: [
        BizAppsProductFormComponent,
        BizAppsProductPricingWidgetComponent,
        BizAppsProductPromotionsWidgetComponent,
        BizAppsProductAccountingWidgetComponent,
        BizAppsProductFulfillmentWidgetComponent,
        BizAppsProductSubscriptionWidgetComponent,
        BizAppsPriceListFormComponent,
        BizAppsPromotionFormComponent,
        BizAppsOrderHeaderFormComponent,
        BizAppsSubscriptionFormComponent,
        BizAppsSubscriptionTermFormComponent,
        BizAppsPaymentHeaderFormComponent,
    ],
})
export class CustomFormsModule {}

/** Tree-shaking prevention anchor function */
export function LoadCustomForms(): void {
    LoadProductFormComponent();
    LoadPriceListFormComponent();
    LoadPromotionFormComponent();
    LoadOrderHeaderFormComponent();
    LoadSubscriptionFormComponent();
    LoadSubscriptionTermFormComponent();
    LoadPaymentHeaderFormComponent();
}
