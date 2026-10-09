import { Component } from '@angular/core';
import { mjBizAppsOrdersPaymentWebhookDeliveryEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Payment Webhook Deliveries') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsorderspaymentwebhookdelivery-form',
    templateUrl: './mjbizappsorderspaymentwebhookdelivery.form.component.html'
})
export class mjBizAppsOrdersPaymentWebhookDeliveryFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersPaymentWebhookDeliveryEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

