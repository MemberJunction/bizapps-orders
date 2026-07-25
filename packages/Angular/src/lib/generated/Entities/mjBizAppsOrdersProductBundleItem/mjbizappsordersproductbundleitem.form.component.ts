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
            { sectionKey: 'bundleComponents', sectionName: 'Bundle Components', isExpanded: true },
            { sectionKey: 'configuration', sectionName: 'Configuration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

