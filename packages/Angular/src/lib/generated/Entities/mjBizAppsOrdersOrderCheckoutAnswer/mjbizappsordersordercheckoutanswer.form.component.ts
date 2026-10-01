import { Component } from '@angular/core';
import { mjBizAppsOrdersOrderCheckoutAnswerEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Order Checkout Answers') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsordersordercheckoutanswer-form',
    templateUrl: './mjbizappsordersordercheckoutanswer.form.component.html'
})
export class mjBizAppsOrdersOrderCheckoutAnswerFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersOrderCheckoutAnswerEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

