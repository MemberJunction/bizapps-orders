import { Component } from '@angular/core';
import { mjBizAppsOrdersSubscriptionSequenceEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Subscription Sequences') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsorderssubscriptionsequence-form',
    templateUrl: './mjbizappsorderssubscriptionsequence.form.component.html'
})
export class mjBizAppsOrdersSubscriptionSequenceFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersSubscriptionSequenceEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'configuration', sectionName: 'Configuration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

