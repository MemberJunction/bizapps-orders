import { Component } from '@angular/core';
import { mjBizAppsOrdersPromotionTargetEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Promotion Targets') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsorderspromotiontarget-form',
    templateUrl: './mjbizappsorderspromotiontarget.form.component.html'
})
export class mjBizAppsOrdersPromotionTargetFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersPromotionTargetEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'promotionDefinition', sectionName: 'Promotion Definition', isExpanded: true },
            { sectionKey: 'targetSelection', sectionName: 'Target Selection', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

