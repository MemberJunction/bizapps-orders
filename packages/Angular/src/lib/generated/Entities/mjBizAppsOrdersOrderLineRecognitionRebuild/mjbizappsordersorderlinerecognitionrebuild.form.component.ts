import { Component } from '@angular/core';
import { mjBizAppsOrdersOrderLineRecognitionRebuildEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Order Line Recognition Rebuilds') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsordersorderlinerecognitionrebuild-form',
    templateUrl: './mjbizappsordersorderlinerecognitionrebuild.form.component.html'
})
export class mjBizAppsOrdersOrderLineRecognitionRebuildFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersOrderLineRecognitionRebuildEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'recognitionRebuildDetails', sectionName: 'Recognition Rebuild Details', isExpanded: true },
            { sectionKey: 'journalEntries', sectionName: 'Journal Entries', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

