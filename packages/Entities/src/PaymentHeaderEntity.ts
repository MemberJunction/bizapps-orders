/**
 * Shared (client + server) subclass for Payment Headers.
 *
 * Declares the optional `PaymentDetailID` embed — the receipt's own frozen
 * instrument snapshot (D39 copy-on-use). `PaymentHeaderEntityServer` extends
 * this class. Remove the declaration when CodeGen emits it from metadata.
 */
import { BaseEntity, EmbeddedRecord, EntitySaveOptions, ValidationErrorInfo, ValidationErrorType, ValidationResult } from '@memberjunction/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
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

    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        this.SyncPaymentDetailFromHeader();
        return super.Save(options);
    }

    /**
     * Move to `status` by saving, and put the previous status back if the save is refused
     * (golive #283).
     *
     * Without the restore a refused capture stays on the object as an unsaved edit: the screen
     * reads Captured and locks, though nothing was written. The reason is on `LatestResult`.
     */
    public async SaveStatus(status: PaymentHeaderEntity['Status']): Promise<boolean> {
        const previous = this.Status;
        this.Status = status;
        const saved = await this.Save();
        if (!saved) this.Status = previous;
        return saved;
    }

    /**
     * The detail's company and tender are the header's, so copy them at save time rather than
     * only when the detail is first created (golive #283). The detail is created by the first
     * instrument field typed; a reference entered before the Receiving Company was chosen left
     * the detail's `CompanyID` null for good, and the save failed on the detail.
     *
     * A saved detail is never edited (golive #303). The database refuses any change to a saved
     * detail's company or tender, because a detail is a point-in-time snapshot that an order's
     * payment intent may share. When either differs, the payment gets a new detail carrying the
     * same instrument fields, and the saved one is left as it was.
     */
    public SyncPaymentDetailFromHeader(): void {
        let detail = this.PaymentDetailID_Object;
        if (!detail) return;
        const companyChanged = Boolean(this.ReceivingCompanyID) && !UUIDsEqual(detail.CompanyID, this.ReceivingCompanyID);
        const tenderChanged = Boolean(this.PaymentTypeID) && !UUIDsEqual(detail.PaymentTypeID, this.PaymentTypeID);
        if (!companyChanged && !tenderChanged) return;
        if (detail.IsSaved) detail = this.replacePaymentDetail(detail);
        if (companyChanged) detail.CompanyID = this.ReceivingCompanyID;
        if (tenderChanged) detail.PaymentTypeID = this.PaymentTypeID;
    }

    /**
     * Swap a saved detail for a new one with the same writable fields. `Clear()` then
     * `PaymentDetailID_EnsureObject()` resets the same object to a new record, so the values are
     * read before and written back after. The saved row stays in the database untouched.
     */
    private replacePaymentDetail(saved: mjBizAppsOrdersPaymentDetailEntity): mjBizAppsOrdersPaymentDetailEntity {
        const values: Record<string, unknown> = {};
        for (const field of saved.Fields) {
            if (!field.ReadOnly) values[field.Name] = field.Value;
        }
        this.ClearPaymentDetail();
        const replacement = this.PaymentDetailID_EnsureObject();
        for (const [name, value] of Object.entries(values)) {
            replacement.Set(name, value);
        }
        return replacement;
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
