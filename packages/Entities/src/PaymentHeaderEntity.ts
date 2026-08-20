/**
 * Shared (client + server) subclass for Payment Headers.
 *
 * Declares the optional `PaymentDetailID` embed — the receipt's own frozen
 * instrument snapshot (D39 copy-on-use). `PaymentHeaderEntityServer` extends
 * this class. Remove the declaration when CodeGen emits it from metadata.
 */
import { BaseEntity, EmbeddedRecord, ValidationErrorInfo, ValidationErrorType, ValidationResult } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    mjBizAppsOrdersPaymentHeaderEntity,
    mjBizAppsOrdersPaymentDetailEntity,
} from './generated/entity_subclasses';
import { IsSavePopulatedFieldError } from './save-populated-fields';

const ENTITY = 'MJ_BizApps_Orders: Payment Headers';
const DETAIL_ENTITY = 'MJ_BizApps_Orders: Payment Details';

@RegisterClass(BaseEntity, ENTITY)
export class PaymentHeaderEntity extends mjBizAppsOrdersPaymentHeaderEntity {
    public ClearPaymentDetail(): void {
        this.GetCompanion<EmbeddedRecord>('PaymentDetailID_Object')?.Clear();
    }

    public get ReferenceNumber(): string | null {
        return this.PaymentDetailID_Object?.ReferenceNumber ?? null;
    }

    public set ReferenceNumber(value: string | null) {
        const trimmed = (value ?? '').trim();
        const ref = trimmed.length ? trimmed : null;
        if (ref) {
            const detail = this.PaymentDetailID_EnsureObject();
            detail.ReferenceNumber = ref;
            if (this.ReceivingCompanyID && !detail.CompanyID) {
                detail.CompanyID = this.ReceivingCompanyID;
            }
            if (this.PaymentTypeID && !detail.PaymentTypeID) {
                detail.PaymentTypeID = this.PaymentTypeID;
            }
        } else if (this.PaymentDetailID_Object) {
            this.PaymentDetailID_Object.ReferenceNumber = null;
            if (this.isPaymentDetailEmpty(this.PaymentDetailID_Object)) {
                this.ClearPaymentDetail();
            }
        }
    }

    public isPaymentDetailEmpty(detail: mjBizAppsOrdersPaymentDetailEntity): boolean {
        return (
            !detail.ReferenceNumber?.trim() &&
            !detail.Brand?.trim() &&
            !detail.Last4?.trim() &&
            !detail.HolderName?.trim() &&
            !detail.BankName?.trim() &&
            !detail.RoutingLast4?.trim() &&
            !detail.AccountLast4?.trim() &&
            !detail.BankAccountType &&
            !detail.ExpiryMonth &&
            !detail.ExpiryYear &&
            !detail.Notes?.trim() &&
            !detail.ProviderInstrumentRef?.trim() &&
            !detail.ProviderCustomerRef?.trim() &&
            !detail.StoredValueAccountID
        );
    }

    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.dropSavePopulatedFieldErrors(result);
        return result;
    }

    private dropSavePopulatedFieldErrors(result: ValidationResult): void {
        const kept = result.Errors.filter(
            (error) =>
                !IsSavePopulatedFieldError(
                    error.Source ?? '',
                    this.IsSaved,
                    () => false,
                ),
        );
        if (kept.length === result.Errors.length) return;
        result.Errors = kept;
        result.Success = kept.every((error) => error.Type !== ValidationErrorType.Failure);
    }
}
