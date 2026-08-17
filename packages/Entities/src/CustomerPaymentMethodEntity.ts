/**
 * Shared (client + server) subclass for Customer Payment Methods.
 *
 * Declares the required `PaymentDetailID` embed here — the wallet is a thin host
 * and the instrument snapshot lives on Payment Details (D38/D39). CodeGen will
 * emit the same members onto the generated class once `EntityField.EmbeddedRecord`
 * is set on a database that has that MJ column; remove this declaration then.
 */
import { BaseEntity } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    mjBizAppsOrdersCustomerPaymentMethodEntity,
    mjBizAppsOrdersPaymentDetailEntity,
} from './generated/entity_subclasses';

const ENTITY = 'MJ_BizApps_Orders: Customer Payment Methods';
const DETAIL_ENTITY = 'MJ_BizApps_Orders: Payment Details';

@RegisterClass(BaseEntity, ENTITY)
export class CustomerPaymentMethodEntity extends mjBizAppsOrdersCustomerPaymentMethodEntity {
    /**
     * Exclusive instrument snapshot. OnClear delete: a wallet does not share its
     * PaymentDetail (UQ_CustomerPaymentMethod_PaymentDetail).
     */
    public readonly PaymentDetailEmb = this.DeclareEmbeddedRecord<mjBizAppsOrdersPaymentDetailEntity>({
        ForeignKeyField: 'PaymentDetailID',
        RelatedEntity: DETAIL_ENTITY,
        OnClear: 'delete',
    });

    public get PaymentDetailID_Object(): mjBizAppsOrdersPaymentDetailEntity {
        return this.PaymentDetailEmb.Value!;
    }

    public PaymentDetailID_EnsureObject(): mjBizAppsOrdersPaymentDetailEntity {
        return this.PaymentDetailEmb.Ensure();
    }
}
