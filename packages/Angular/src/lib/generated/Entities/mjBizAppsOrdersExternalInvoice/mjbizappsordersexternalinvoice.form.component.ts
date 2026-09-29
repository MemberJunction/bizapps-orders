import { Component } from '@angular/core';
import { mjBizAppsOrdersExternalInvoiceEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: External Invoices') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsordersexternalinvoice-form',
    templateUrl: './mjbizappsordersexternalinvoice.form.component.html'
})
export class mjBizAppsOrdersExternalInvoiceFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersExternalInvoiceEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

