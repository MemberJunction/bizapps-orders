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

// Custom Form Components
import { BizAppsProductFormComponent, LoadProductFormComponent } from './Product/product-form.component';
import { BizAppsOrderHeaderFormComponent, LoadOrderHeaderFormComponent } from './OrderHeader/order-header-form.component';
import { MJOOrderLinesEditorComponent } from './OrderHeader/order-lines-editor.component';
import { BizAppsSubscriptionFormComponent, LoadSubscriptionFormComponent } from './Subscription/subscription-form.component';
import { BizAppsPaymentHeaderFormComponent, LoadPaymentHeaderFormComponent } from './PaymentHeader/payment-header-form.component';

@NgModule({
    declarations: [
        BizAppsProductFormComponent,
        BizAppsOrderHeaderFormComponent,
        BizAppsSubscriptionFormComponent,
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
    ],
    exports: [
        BizAppsProductFormComponent,
        BizAppsOrderHeaderFormComponent,
        BizAppsSubscriptionFormComponent,
        BizAppsPaymentHeaderFormComponent,
    ],
})
export class CustomFormsModule {}

/** Tree-shaking prevention anchor function */
export function LoadCustomForms(): void {
    LoadProductFormComponent();
    LoadOrderHeaderFormComponent();
    LoadSubscriptionFormComponent();
    LoadPaymentHeaderFormComponent();
}
