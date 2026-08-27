import { Component } from '@angular/core';
import { mjBizAppsOrdersCheckoutWidgetEntity } from '@mj-biz-apps/orders-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Checkout Widgets') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsorderscheckoutwidget-form',
    templateUrl: './mjbizappsorderscheckoutwidget.form.component.html'
})
export class mjBizAppsOrdersCheckoutWidgetFormComponent extends BaseFormComponent {
    public record!: mjBizAppsOrdersCheckoutWidgetEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'widgetConfiguration', sectionName: 'Widget Configuration', isExpanded: true },
            { sectionKey: 'customizationAndLogic', sectionName: 'Customization and Logic', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersCheckoutSessions', sectionName: 'Checkout Sessions', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersOrderHeaders', sectionName: 'Order Headers', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersCheckoutWidgetDistributions', sectionName: 'Checkout Widget Distributions', isExpanded: false }
        ]);
    }
}

