import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BaseFormsModule } from '@memberjunction/ng-base-forms';
import { EntityViewerModule } from '@memberjunction/ng-entity-viewer';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { DeferredRevenueWaterfallModule } from '@mj-biz-apps/accounting-ng';
import { CustomFormsModule } from '../custom/custom-forms.module';
import { PaymentHeaderPanel } from './payment-header.panel';
import { PaymentJournalsPanel } from './payment-journals.panel';
import { SubscriptionHeaderPanel } from './subscription-header.panel';
import { SubscriptionTermsPanel } from './subscription-terms.panel';
import { SubscriptionRevRecPanel } from './subscription-revrec.panel';
import { SubscriptionTermHeaderPanel } from './subscription-term-header.panel';
import { SubscriptionTermRevRecPanel } from './subscription-term-revrec.panel';
import { ProductHeaderPanel } from './product-header.panel';
import {
    ProductAccountingPanel,
    ProductFulfillmentPanel,
    ProductPricingPanel,
    ProductPromosPanel,
    ProductSubscriptionsPanel,
} from './product-widget.panels';
import { PriceListHeaderPanel } from './price-list-header.panel';
import { PriceListSimulatorPanel } from './price-list-simulator.panel';
import { PromotionHeaderPanel } from './promotion-header.panel';

const PANELS = [
    PaymentHeaderPanel,
    PaymentJournalsPanel,
    SubscriptionHeaderPanel,
    SubscriptionTermsPanel,
    SubscriptionRevRecPanel,
    SubscriptionTermHeaderPanel,
    SubscriptionTermRevRecPanel,
    ProductHeaderPanel,
    ProductPricingPanel,
    ProductPromosPanel,
    ProductAccountingPanel,
    ProductFulfillmentPanel,
    ProductSubscriptionsPanel,
    PriceListHeaderPanel,
    PriceListSimulatorPanel,
    PromotionHeaderPanel,
];

/**
 * Payment / Subscription form contributions. Importing this module fires
 * @RegisterClassEx so generated forms pick up the widgets.
 */
@NgModule({
    declarations: [...PANELS],
    imports: [
        CommonModule,
        BaseFormsModule,
        EntityViewerModule,
        MJButtonDirective,
        DeferredRevenueWaterfallModule,
        CustomFormsModule,
    ],
    exports: [...PANELS],
})
export class OrdersDocumentFormsModule {}
