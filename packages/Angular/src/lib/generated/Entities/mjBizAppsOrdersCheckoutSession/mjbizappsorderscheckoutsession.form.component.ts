import { Component } from '@angular/core';
import { mjBizAppsOrdersCheckoutSessionEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Checkout Sessions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsorderscheckoutsession-form',
    templateUrl: './mjbizappsorderscheckoutsession.form.component.html'
})
export class mjBizAppsOrdersCheckoutSessionFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersCheckoutSessionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'checkoutConfiguration', sectionName: 'Checkout Configuration', isExpanded: true },
            { sectionKey: 'sessionInformation', sectionName: 'Session Information', isExpanded: true },
            { sectionKey: 'customerInformation', sectionName: 'Customer Information', isExpanded: true },
            { sectionKey: 'orderAndPayment', sectionName: 'Order and Payment', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

