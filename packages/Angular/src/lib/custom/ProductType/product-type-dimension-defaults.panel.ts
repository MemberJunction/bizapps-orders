import { Component } from '@angular/core';
import { RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import { mjBizAppsOrdersProductTypeEntity } from '@mj-biz-apps/orders-entities';

/**
 * Form-panel extension that mounts the Dimension Defaults editor in the
 * `after-fields` slot of the generated Product Types form.
 */
@RegisterClassEx(BaseFormPanel, {
  key: 'form-panel:ProductTypes:dimensionDefaults',
  metadata: {
    entity: 'MJ_BizApps_Orders: Product Types',
    slot: 'after-fields',
    sortKey: 80,
    contributionKey: 'dimensionDefaults',
  },
})
@Component({
  standalone: false,
  selector: 'bizapps-product-type-dimension-defaults-panel',
  template: `
    <div style="margin-top: 16px;">
      <bizapps-dimension-defaults
        [Record]="Record"
        TargetEntityName="MJ_BizApps_Orders: Product Types"
        [EditMode]="FormComponent.EditMode"
        [FormContext]="FormContext"
        (Navigate)="FormComponent.Navigate.emit($event)">
      </bizapps-dimension-defaults>
    </div>
  `,
})
export class ProductTypeDimensionDefaultsPanel extends BaseFormPanel<mjBizAppsOrdersProductTypeEntity> {}
