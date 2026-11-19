import { Component } from '@angular/core';
import { mjBizAppsOrdersSalesAuthorityMixTierEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Sales Authority Mix Tiers') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsorderssalesauthoritymixtier-form',
    templateUrl: './mjbizappsorderssalesauthoritymixtier.form.component.html'
})
export class mjBizAppsOrdersSalesAuthorityMixTierFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersSalesAuthorityMixTierEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'mixTierConfiguration', sectionName: 'Mix Tier Configuration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

