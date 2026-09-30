import { Component } from '@angular/core';
import { mjBizAppsOrdersOrderLineChoiceEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Order Line Choices') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsordersorderlinechoice-form',
    templateUrl: './mjbizappsordersorderlinechoice.form.component.html'
})
export class mjBizAppsOrdersOrderLineChoiceFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersOrderLineChoiceEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

