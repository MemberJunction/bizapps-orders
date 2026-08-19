/**
 * @fileoverview `OrderLineEntity` — shared entity subclass for Order Lines.
 *
 * @module @mj-biz-apps/orders-entities
 */
import { BaseEntity, ValidationResult } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { mjBizAppsOrdersOrderLineEntity } from './generated/entity_subclasses';
import { OrderLineExtensionCompanion } from './OrderLineExtensionCompanion';

@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Order Lines')
export class OrderLineEntity extends mjBizAppsOrdersOrderLineEntity {
    /**
     * Extension entity (e.g. `EventOrderLine`) companion riding with this line.
     */
    public readonly Extension = this.RegisterCompanion(new OrderLineExtensionCompanion(this));

    /**
     * Runs validation on this line and fans out to the extension companion.
     */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.Extension.Validate(result);
        return result;
    }
}
