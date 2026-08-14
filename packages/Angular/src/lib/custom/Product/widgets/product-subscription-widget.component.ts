import { Component, EventEmitter, Input, Output } from '@angular/core';
import type { FormContext, FormNavigationEvent } from '@memberjunction/ng-base-forms';
import type { RunViewParams } from '@memberjunction/core';
import type { mjBizAppsOrdersProductEntity } from '@mj-biz-apps/orders-entities';

/**
 * Droppable Product Subscription Defaults & Entitlement Grants Widget.
 */
@Component({
    standalone: false,
    selector: 'bizapps-product-subscription-widget',
    templateUrl: './product-subscription-widget.component.html',
    styleUrls: ['./product-subscription-widget.component.css'],
})
export class BizAppsProductSubscriptionWidgetComponent {
    @Input() public Product!: mjBizAppsOrdersProductEntity;
    @Input() public EditMode = false;
    @Input() public FormContext?: FormContext;

    @Output() public Navigate = new EventEmitter<FormNavigationEvent>();

    public get ProductEntitlementsViewParams(): RunViewParams | null {
        if (!this.Product?.IsSaved || !this.Product?.ID) return null;
        return {
            EntityName: 'MJ_BizApps_Orders: Product Entitlements',
            ExtraFilter: `ProductID = '${this.Product.ID}'`,
            OrderBy: '__mj_CreatedAt DESC',
            ResultType: 'entity_object',
        };
    }
}
