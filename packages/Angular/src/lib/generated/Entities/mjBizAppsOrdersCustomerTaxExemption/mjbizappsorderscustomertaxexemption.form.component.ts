import { Component } from '@angular/core';
import { mjBizAppsOrdersCustomerTaxExemptionEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Customer Tax Exemptions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsorderscustomertaxexemption-form',
    templateUrl: './mjbizappsorderscustomertaxexemption.form.component.html'
})
export class mjBizAppsOrdersCustomerTaxExemptionFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersCustomerTaxExemptionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'entityAssociation', sectionName: 'Entity Association', isExpanded: true },
            { sectionKey: 'exemptionDetails', sectionName: 'Exemption Details', isExpanded: true },
            { sectionKey: 'exemptionTimeline', sectionName: 'Exemption Timeline', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

