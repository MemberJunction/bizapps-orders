import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BaseFormsModule } from '@memberjunction/ng-base-forms';
import { EntityViewerModule } from '@memberjunction/ng-entity-viewer';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { DeferredRevenueWaterfallModule } from './deferred-revenue-waterfall.stub';
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
import { MJODocHeroComponent } from './document-hero.component';
import { MJOOverviewCardsComponent } from './overview-cards.component';
import {
    ChargeTypeHeaderPanel,
    PaymentProviderHeaderPanel,
    PaymentTypeHeaderPanel,
    ProductCategoryHeaderPanel,
    ProductTypeHeaderPanel,
    RevRecTypeHeaderPanel,
    SalesAuthorityHeaderPanel,
    StoredValueHeaderPanel,
    SubscriptionTypeHeaderPanel,
} from './lookup-headers.panels';
import {
    ProductCategoryOverviewPanel,
    ProductOverviewPanel,
    ProductTypeOverviewPanel,
    RevRecTypeOverviewPanel,
    SubscriptionTypeOverviewPanel,
} from './catalog-overviews.panels';
import {
    ChargeTypeOverviewPanel,
    PriceListOverviewPanel,
    PromotionOverviewPanel,
    SalesAuthorityOverviewPanel,
} from './commercial-overviews.panels';
import {
    PaymentOverviewPanel,
    PaymentProviderOverviewPanel,
    PaymentTypeOverviewPanel,
    StoredValueOverviewPanel,
    SubscriptionOverviewPanel,
    SubscriptionTermOverviewPanel,
} from './document-overviews.panels';

const PANELS = [
    MJODocHeroComponent,
    MJOOverviewCardsComponent,
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
    ProductTypeHeaderPanel,
    ProductCategoryHeaderPanel,
    SubscriptionTypeHeaderPanel,
    RevRecTypeHeaderPanel,
    ChargeTypeHeaderPanel,
    SalesAuthorityHeaderPanel,
    StoredValueHeaderPanel,
    PaymentProviderHeaderPanel,
    PaymentTypeHeaderPanel,
    ProductTypeOverviewPanel,
    ProductCategoryOverviewPanel,
    ProductOverviewPanel,
    SubscriptionTypeOverviewPanel,
    RevRecTypeOverviewPanel,
    PriceListOverviewPanel,
    PromotionOverviewPanel,
    ChargeTypeOverviewPanel,
    SalesAuthorityOverviewPanel,
    PaymentOverviewPanel,
    SubscriptionOverviewPanel,
    SubscriptionTermOverviewPanel,
    StoredValueOverviewPanel,
    PaymentProviderOverviewPanel,
    PaymentTypeOverviewPanel,
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
