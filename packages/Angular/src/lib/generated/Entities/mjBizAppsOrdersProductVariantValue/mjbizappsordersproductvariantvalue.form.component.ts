import { Component } from '@angular/core';
import { mjBizAppsOrdersProductVariantValueEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Product Variant Values') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsordersproductvariantvalue-form',
    templateUrl: './mjbizappsordersproductvariantvalue.form.component.html'
})
export class mjBizAppsOrdersProductVariantValueFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersProductVariantValueEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'variantInformation', sectionName: 'Variant Information', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

