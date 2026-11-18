import { Component } from '@angular/core';
import { mjBizAppsOrdersProductSuccessorOptionValueEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Product Successor Option Values') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsordersproductsuccessoroptionvalue-form',
    templateUrl: './mjbizappsordersproductsuccessoroptionvalue.form.component.html'
})
export class mjBizAppsOrdersProductSuccessorOptionValueFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersProductSuccessorOptionValueEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'productSuccessorConfiguration', sectionName: 'Product Successor Configuration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

