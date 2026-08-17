/**
 * Shared (client + server) subclass for Payment Headers.
 *
 * Declares the optional `PaymentDetailID` embed — the receipt's own frozen
 * instrument snapshot (D39 copy-on-use). `PaymentHeaderEntityServer` extends
 * this class. Remove the declaration when CodeGen emits it from metadata.
 */
import { BaseEntity } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    mjBizAppsOrdersPaymentHeaderEntity,
    mjBizAppsOrdersPaymentDetailEntity,
} from './generated/entity_subclasses';

const ENTITY = 'MJ_BizApps_Orders: Payment Headers';
const DETAIL_ENTITY = 'MJ_BizApps_Orders: Payment Details';

@RegisterClass(BaseEntity, ENTITY)
export class PaymentHeaderEntity extends mjBizAppsOrdersPaymentHeaderEntity {
    /**
     * This payment's own instrument snapshot. Null until Ensure() or Load()
     * finds a PaymentDetailID. OnClear delete: exclusive per UQ_PaymentHeader_PaymentDetail.
     */
    public readonly PaymentDetailEmb = this.DeclareEmbeddedRecord<mjBizAppsOrdersPaymentDetailEntity>({
        ForeignKeyField: 'PaymentDetailID',
        RelatedEntity: DETAIL_ENTITY,
        OnClear: 'delete',
    });

    public get PaymentDetailID_Object(): mjBizAppsOrdersPaymentDetailEntity | null {
        return this.PaymentDetailEmb.Value;
    }

    public PaymentDetailID_EnsureObject(): mjBizAppsOrdersPaymentDetailEntity {
        return this.PaymentDetailEmb.Ensure();
    }

    public ClearPaymentDetail(): void {
        this.PaymentDetailEmb.Clear();
    }
}
