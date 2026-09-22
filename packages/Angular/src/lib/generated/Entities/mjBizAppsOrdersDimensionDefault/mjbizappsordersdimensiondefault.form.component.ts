import { Component } from '@angular/core';
import { mjBizAppsOrdersDimensionDefaultEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Dimension Defaults') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsordersdimensiondefault-form',
    templateUrl: './mjbizappsordersdimensiondefault.form.component.html'
})
export class mjBizAppsOrdersDimensionDefaultFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersDimensionDefaultEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

