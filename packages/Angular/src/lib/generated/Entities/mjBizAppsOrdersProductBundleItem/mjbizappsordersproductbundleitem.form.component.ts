import { Component } from '@angular/core';
import { mjBizAppsOrdersProductBundleItemEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Product Bundle Items') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsordersproductbundleitem-form',
    templateUrl: './mjbizappsordersproductbundleitem.form.component.html'
})
export class mjBizAppsOrdersProductBundleItemFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersProductBundleItemEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'bundleConfiguration', sectionName: 'Bundle Configuration', isExpanded: true },
            { sectionKey: 'componentDetails', sectionName: 'Component Details', isExpanded: true },
            { sectionKey: 'pricingAndOrdering', sectionName: 'Pricing and Ordering', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

