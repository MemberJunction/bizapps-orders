import { Component } from '@angular/core';
import { mjBizAppsOrdersSubscriptionTermEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Subscription Terms') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsorderssubscriptionterm-form',
    templateUrl: './mjbizappsorderssubscriptionterm.form.component.html'
})
export class mjBizAppsOrdersSubscriptionTermFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersSubscriptionTermEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'subscriptionContext', sectionName: 'Subscription Context', isExpanded: true },
            { sectionKey: 'termTimeline', sectionName: 'Term Timeline', isExpanded: true },
            { sectionKey: 'financials', sectionName: 'Financials', isExpanded: true },
            { sectionKey: 'termStatus', sectionName: 'Term Status', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

