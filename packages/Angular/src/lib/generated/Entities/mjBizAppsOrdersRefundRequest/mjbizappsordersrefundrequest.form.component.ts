import { Component } from '@angular/core';
import { mjBizAppsOrdersRefundRequestEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Refund Requests') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsordersrefundrequest-form',
    templateUrl: './mjbizappsordersrefundrequest.form.component.html'
})
export class mjBizAppsOrdersRefundRequestFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersRefundRequestEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'refundRequestDetails', sectionName: 'Refund Request Details', isExpanded: true },
            { sectionKey: 'approvalWorkflow', sectionName: 'Approval Workflow', isExpanded: true },
            { sectionKey: 'issuanceAndFulfillment', sectionName: 'Issuance and Fulfillment', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

