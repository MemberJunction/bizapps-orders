import { Component } from '@angular/core';
import { RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import { mjBizAppsOrdersProductCategoryEntity } from '@mj-biz-apps/orders-entities';

/**
 * Form-panel extension that mounts the Dimension Defaults editor in the
 * `after-fields` slot of the generated Product Categories form.
 */
@RegisterClassEx(BaseFormPanel, {
  key: 'form-panel:ProductCategories:dimensionDefaults',
  metadata: {
    entity: 'MJ_BizApps_Orders: Product Categories',
    slot: 'after-fields',
    sortKey: 80,
    contributionKey: 'dimensionDefaults',
  },
})
@Component({
  standalone: false,
  selector: 'bizapps-product-category-dimension-defaults-panel',
  template: `
    <div style="margin-top: 16px;">
      <bizapps-dimension-defaults
        [Record]="Record"
        TargetEntityName="MJ_BizApps_Orders: Product Categories"
        [EditMode]="FormComponent.EditMode"
        [FormContext]="FormContext"
        (Navigate)="FormComponent.Navigate.emit($event)">
      </bizapps-dimension-defaults>
    </div>
  `,
})
export class ProductCategoryDimensionDefaultsPanel extends BaseFormPanel<mjBizAppsOrdersProductCategoryEntity> {}
