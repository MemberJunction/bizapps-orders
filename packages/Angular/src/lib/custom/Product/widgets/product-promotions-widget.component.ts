import { Component, EventEmitter, Input, Output } from '@angular/core';
import type { FormContext, FormNavigationEvent } from '@memberjunction/ng-base-forms';
import type { RunViewParams } from '@memberjunction/core';
import type { mjBizAppsOrdersProductEntity } from '@mj-biz-apps/orders-entities';

/**
 * Droppable Product Promotions & Discounts Widget.
 *
 * Surfaces active discount campaigns, coupon codes, and stacking rules
 * applicable to the current product catalog entry.
 */
@Component({
    standalone: false,
    selector: 'bizapps-product-promotions-widget',
    templateUrl: './product-promotions-widget.component.html',
    styleUrls: ['./product-promotions-widget.component.css'],
})
export class BizAppsProductPromotionsWidgetComponent {
    @Input() public Product!: mjBizAppsOrdersProductEntity;
    @Input() public EditMode = false;
    @Input() public FormContext?: FormContext;

    @Output() public Navigate = new EventEmitter<FormNavigationEvent>();

    public get PromotionsViewParams(): RunViewParams | null {
        return {
            EntityName: 'MJ_BizApps_Orders: Promotions',
            OrderBy: 'Priority DESC, __mj_CreatedAt DESC',
            MaxRows: 50,
            ResultType: 'entity_object',
        };
    }
}
