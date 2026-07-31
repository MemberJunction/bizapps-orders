import { Component } from '@angular/core';
import { mjBizAppsOrdersProductPerformanceObligationEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Product Performance Obligations') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsordersproductperformanceobligation-form',
    templateUrl: './mjbizappsordersproductperformanceobligation.form.component.html'
})
export class mjBizAppsOrdersProductPerformanceObligationFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersProductPerformanceObligationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'productInformation', sectionName: 'Product Information', isExpanded: true },
            { sectionKey: 'performanceObligationDetails', sectionName: 'Performance Obligation Details', isExpanded: true },
            { sectionKey: 'pricingAndAllocation', sectionName: 'Pricing and Allocation', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

