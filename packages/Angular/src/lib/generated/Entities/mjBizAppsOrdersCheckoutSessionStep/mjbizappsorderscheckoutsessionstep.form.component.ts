import { Component } from '@angular/core';
import { mjBizAppsOrdersCheckoutSessionStepEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Checkout Session Steps') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsorderscheckoutsessionstep-form',
    templateUrl: './mjbizappsorderscheckoutsessionstep.form.component.html'
})
export class mjBizAppsOrdersCheckoutSessionStepFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersCheckoutSessionStepEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

