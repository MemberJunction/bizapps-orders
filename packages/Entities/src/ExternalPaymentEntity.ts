/**
 * @fileoverview `ExternalPaymentEntity` — shared entity subclass for External Payments.
 *
 * Carries the set-aside rule (bc-aidp-next-golive#449) so every tier meets it: the queue page, the
 * generic API, and the poll's own writes. A saved row moves to `Ignored` only from `Held`, `Unmatched`
 * or `Refused` (no cash recorded), and only with a reason; the reason goes on `DispositionReason`,
 * which the poll already keeps for a row a person set aside (`handlePayment`'s Ignore branch).
 *
 * `SetAsideExternalPayments` is the bulk path the queue page calls. It runs the same on the server,
 * and applies the bulk guard in `PlanSetAside` before it saves anything.
 *
 * @module @mj-biz-apps/orders-entities
 */
import { BaseEntity, Metadata, RunView, ValidationErrorInfo, ValidationErrorType, type IRunViewProvider, type UserInfo, type ValidationResult } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { mjBizAppsOrdersExternalPaymentEntity } from './generated/entity_subclasses';
import { PlanSetAside, SetAsideReasonText, SetAsideRowRefusal, SetAsideSaveRefusal } from './external-payment-set-aside';
import { Today } from './date-cell';
import { RequireUUIDs } from './sql-guards';

const ENTITY = 'MJ_BizApps_Orders: External Payments';

@RegisterClass(BaseEntity, ENTITY)
export class ExternalPaymentEntity extends mjBizAppsOrdersExternalPaymentEntity {
    public override Validate(): ValidationResult {
        const result = super.Validate();
        const disposition = this.GetFieldByName('Disposition');
        const refusal = disposition?.Dirty
            ? SetAsideSaveRefusal({
                  Saved: this.IsSaved,
                  From: (disposition.OldValue as string | null) ?? null,
                  To: String(disposition.Value),
                  Reason: (this.Get('DispositionReason') as string | null) ?? null,
                  PaymentHeaderID: (this.Get('PaymentHeaderID') as string | null) ?? null,
              })
            : null;
        if (refusal) {
            result.Success = false;
            result.Errors.push(new ValidationErrorInfo('Disposition', refusal, disposition?.Value, ValidationErrorType.Failure));
        }
        return result;
    }

    /**
     * Mark this exception set aside with a person's reason. Returns the refusal and changes nothing
     * when the row cannot be set aside; the caller saves.
     */
    public SetAside(reason: string, byName?: string | null): string | null {
        if (!reason?.trim()) return 'Setting a payment aside needs a reason.';
        const refusal = SetAsideRowRefusal({ Disposition: this.Disposition, PaymentHeaderID: this.PaymentHeaderID });
        if (refusal) return refusal;
        this.Disposition = 'Ignored';
        this.DispositionReason = SetAsideReasonText(reason, byName, Today());
        return null;
    }
}

export interface SetAsideExternalPaymentsInput {
    /** The selected rows. */
    IDs: string[];
    /** The person's reason, required. */
    Reason: string;
    /** The "paid before" cut day (`YYYY-MM-DD`) the selection was made under, or null. */
    PaidBefore: string | null;
}

export interface SetAsideExternalPaymentsResult {
    /** External payment refs set aside. */
    SetAside: string[];
    /** Rows left out before any save, with why. */
    Excluded: Array<{ ExternalPaymentRef: string; Why: string }>;
    /** Rows whose save failed, with the message. */
    Failed: Array<{ ExternalPaymentRef: string; Why: string }>;
}

/**
 * Set the selected exceptions aside: re-read them, apply the bulk guard (`PlanSetAside`) to what the
 * database holds now rather than what the page last showed, and save each eligible row. Each row is
 * its own save, so one refusal does not undo the others; the result says which went where.
 */
export async function SetAsideExternalPayments(
    input: SetAsideExternalPaymentsInput,
    contextUser?: UserInfo,
    provider?: IRunViewProvider,
): Promise<SetAsideExternalPaymentsResult> {
    const out: SetAsideExternalPaymentsResult = { SetAside: [], Excluded: [], Failed: [] };
    if (!input.Reason?.trim()) throw new Error('Setting payments aside needs a reason.');
    const ids = RequireUUIDs(input.IDs, 'IDs');
    if (!ids.length) return out;

    const rv = new RunView(provider);
    const read = await rv.RunView<ExternalPaymentEntity>(
        { EntityName: ENTITY, ExtraFilter: `ID IN (${ids.map((id) => `'${id}'`).join(',')})`, ResultType: 'entity_object', BypassCache: true },
        contextUser,
    );
    if (!read.Success) throw new Error(read.ErrorMessage || 'The selected payments could not be read.');
    const rows = read.Results ?? [];

    const found = new Set(rows.map((r) => r.ID.toLowerCase()));
    for (const id of ids) if (!found.has(id.toLowerCase())) out.Excluded.push({ ExternalPaymentRef: id, Why: 'It was not found; it may have been removed, or you cannot read it.' });

    const plan = PlanSetAside(rows, { PaidBefore: input.PaidBefore });
    for (const { Row, Why } of plan.Excluded) out.Excluded.push({ ExternalPaymentRef: Row.ExternalPaymentRef, Why });

    const byName = contextUser?.Name ?? new Metadata().CurrentUser?.Name ?? null;
    for (const row of plan.Eligible) {
        const refusal = row.SetAside(input.Reason, byName);
        if (refusal) {
            out.Excluded.push({ ExternalPaymentRef: row.ExternalPaymentRef, Why: refusal });
            continue;
        }
        if (await row.Save()) out.SetAside.push(row.ExternalPaymentRef);
        else out.Failed.push({ ExternalPaymentRef: row.ExternalPaymentRef, Why: row.LatestResult?.CompleteMessage ?? 'The save failed.' });
    }
    return out;
}
