import { Component, EventEmitter, Input, Output } from '@angular/core';
import type { FormContext, FormNavigationEvent } from '@memberjunction/ng-base-forms';
import type { mjBizAppsOrdersProductEntity } from '@mj-biz-apps/orders-entities';

/**
 * Droppable Product Fulfillment & Lifecycle Timing Widget.
 */
@Component({
    standalone: false,
    selector: 'bizapps-product-fulfillment-widget',
    templateUrl: './product-fulfillment-widget.component.html',
    styleUrls: ['./product-fulfillment-widget.component.css'],
})
export class BizAppsProductFulfillmentWidgetComponent {
    @Input() public Product!: mjBizAppsOrdersProductEntity;
    @Input() public EditMode = false;
    @Input() public FormContext?: FormContext;

    @Output() public Navigate = new EventEmitter<FormNavigationEvent>();
}
