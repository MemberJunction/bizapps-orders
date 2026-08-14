import { Component, EventEmitter, Input, Output } from '@angular/core';
import type { FormContext, FormNavigationEvent } from '@memberjunction/ng-base-forms';
import type { mjBizAppsOrdersProductEntity } from '@mj-biz-apps/orders-entities';

/**
 * Droppable Product Tax, Charges & Accounting GL Widget.
 */
@Component({
    standalone: false,
    selector: 'bizapps-product-accounting-widget',
    templateUrl: './product-accounting-widget.component.html',
    styleUrls: ['./product-accounting-widget.component.css'],
})
export class BizAppsProductAccountingWidgetComponent {
    @Input() public Product!: mjBizAppsOrdersProductEntity;
    @Input() public EditMode = false;
    @Input() public FormContext?: FormContext;

    @Output() public Navigate = new EventEmitter<FormNavigationEvent>();
}
