import { Component } from '@angular/core';
import { mjBizAppsOrdersSalesRuleEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Sales Rules') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsorderssalesrule-form',
    templateUrl: './mjbizappsorderssalesrule.form.component.html'
})
export class mjBizAppsOrdersSalesRuleFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersSalesRuleEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'ruleDefinition', sectionName: 'Rule Definition', isExpanded: true },
            { sectionKey: 'scopeAndTargeting', sectionName: 'Scope and Targeting', isExpanded: true },
            { sectionKey: 'logicAndConfiguration', sectionName: 'Logic and Configuration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

