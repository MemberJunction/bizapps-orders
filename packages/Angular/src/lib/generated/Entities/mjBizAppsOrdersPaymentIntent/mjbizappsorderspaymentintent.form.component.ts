import { Component } from '@angular/core';
import { mjBizAppsOrdersPaymentIntentEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Payment Intents') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsorderspaymentintent-form',
    templateUrl: './mjbizappsorderspaymentintent.form.component.html'
})
export class mjBizAppsOrdersPaymentIntentFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersPaymentIntentEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'providerInformation', sectionName: 'Provider Information', isExpanded: true },
            { sectionKey: 'paymentLifecycle', sectionName: 'Payment Lifecycle', isExpanded: true },
            { sectionKey: 'associatedRecords', sectionName: 'Associated Records', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersPaymentHeaders', sectionName: 'Payment Headers', isExpanded: false }
        ]);
    }
}

