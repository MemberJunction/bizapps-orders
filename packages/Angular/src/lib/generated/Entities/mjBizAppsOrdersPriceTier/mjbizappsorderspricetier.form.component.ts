import { Component } from '@angular/core';
import { mjBizAppsOrdersPriceTierEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Price Tiers') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsorderspricetier-form',
    templateUrl: './mjbizappsorderspricetier.form.component.html'
})
export class mjBizAppsOrdersPriceTierFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersPriceTierEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'pricingConfiguration', sectionName: 'Pricing Configuration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

