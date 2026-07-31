import { Component } from '@angular/core';
import { mjBizAppsOrdersRevenueRecognitionScheduleEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Revenue Recognition Schedules') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsordersrevenuerecognitionschedule-form',
    templateUrl: './mjbizappsordersrevenuerecognitionschedule.form.component.html'
})
export class mjBizAppsOrdersRevenueRecognitionScheduleFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersRevenueRecognitionScheduleEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'recognitionConfiguration', sectionName: 'Recognition Configuration', isExpanded: true },
            { sectionKey: 'recognitionTimeline', sectionName: 'Recognition Timeline', isExpanded: true },
            { sectionKey: 'financialTotals', sectionName: 'Financial Totals', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersOrderLines', sectionName: 'Order Lines', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersRevRecScheduleLines', sectionName: 'Rev Rec Schedule Lines', isExpanded: false }
        ]);
    }
}

