/**
 * Shared (client + server) subclass for Payment Headers.
 *
 * Declares the optional `PaymentDetailID` embed — the receipt's own frozen
 * instrument snapshot (D39 copy-on-use). `PaymentHeaderEntityServer` extends
 * this class. Remove the declaration when CodeGen emits it from metadata.
 */
import { BaseEntity, EmbeddedRecord } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    mjBizAppsOrdersPaymentHeaderEntity,
    mjBizAppsOrdersPaymentDetailEntity,
} from './generated/entity_subclasses';

const ENTITY = 'MJ_BizApps_Orders: Payment Headers';
const DETAIL_ENTITY = 'MJ_BizApps_Orders: Payment Details';

@RegisterClass(BaseEntity, ENTITY)
export class PaymentHeaderEntity extends mjBizAppsOrdersPaymentHeaderEntity {
    public ClearPaymentDetail(): void {
        this.GetCompanion<EmbeddedRecord>('PaymentDetailID_Object')?.Clear();
    }
}
