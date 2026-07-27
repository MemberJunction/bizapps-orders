import { Component } from '@angular/core';
import { mjBizAppsOrdersRevRecScheduleLineEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Rev Rec Schedule Lines') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsordersrevrecscheduleline-form',
    templateUrl: './mjbizappsordersrevrecscheduleline.form.component.html'
})
export class mjBizAppsOrdersRevRecScheduleLineFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersRevRecScheduleLineEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'scheduleInformation', sectionName: 'Schedule Information', isExpanded: true },
            { sectionKey: 'recognitionTimeline', sectionName: 'Recognition Timeline', isExpanded: true },
            { sectionKey: 'financialDetails', sectionName: 'Financial Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

