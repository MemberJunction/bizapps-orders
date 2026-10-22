/**
 * `Orders.CancelExternalInvoice` — withdraw an unpaid invoice from the rail (golive #147).
 *
 * BLOCKED, NOT WARNED, WHEN MONEY HAS BEEN APPLIED. A paid or part-paid invoice is reversed through
 * the refund path (O-US5); cancelling it here would leave cash against a document the customer no
 * longer holds. The check reads our `PaymentLine`s for the unit AND the rail's own view — a payment
 * applied on Bill.com that the poller has not seen yet is refused with "run the poll".
 *
 * NO ACCOUNTING EVENT. The order and the instalment are untouched.
 *
 * AN INSTALMENT'S RAIL FACTS STAY AS HISTORY. This used to clear the instalment's `SentAt` and
 * `ExternalInvoiceRef` so it read as unsent and could be re-issued. Craig ruled otherwise on golive
 * #242 and Jeremy agreed: an issued instalment is never re-issued — cancelling it raises a credit
 * memo and a REPLACEMENT row under the next number. (An earlier note here said the old behaviour
 * could not have worked anyway because the rail refuses the duplicate; probed 2026-09-29, it does
 * not — Bill.com accepts a number once the invoice holding it is archived, which is why the rule
 * lives in our code and not in the rail's.) A unit billed
 * as a whole has no replacement row, so it does read as unsent again, and re-issuing it is a
 * deliberate act (`AllowReissue`, design D-B7), never the sweep's.
 *
 * @module @mj-biz-apps/orders-core-entities-server
 */
import { BaseEntity, BaseRemotableOperation, CompositeKey, LogError, RunView, type IMetadataProvider, type IRunViewProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    OrdersCancelExternalInvoiceOperation as OrdersCancelExternalInvoiceOperationBase,
    type OrdersCancelExternalInvoiceInput,
    type OrdersCancelExternalInvoiceOutput,
} from '@mj-biz-apps/orders-entities';

import { EXTERNAL_INVOICE_ENTITY, ORDER_HEADER_ENTITY, PAYMENT_LINE_ENTITY } from './entity-names.js';
import { DecideCancel, money } from './ExternalInvoiceBehavior.js';
import { ResolveInvoiceRail } from './InvoiceRailResolver.js';
import { PaidOnBillingUnit, updateExternalInvoice, type ExternalInvoiceRow } from './IssueExternalInvoiceOperation.js';
import { EscapeText, RequireUUID } from './sql-guards.js';

@RegisterClass(BaseRemotableOperation, 'Orders.CancelExternalInvoice')
export class CancelExternalInvoiceOperation extends OrdersCancelExternalInvoiceOperationBase {
    protected async InternalExecute(
        input: OrdersCancelExternalInvoiceInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<OrdersCancelExternalInvoiceOutput> {
        try {
            const id = RequireUUID(input?.ExternalInvoiceID, 'ExternalInvoiceID');
            const reason = String(input?.Reason ?? '').trim();
            if (!reason) return { Success: false, ResultCode: 'ERROR', Message: 'A reason is required; it is recorded on the invoice row.' };

            const rv = new RunView(provider as unknown as IRunViewProvider);
            const rows = await rv.RunView<ExternalInvoiceRow>({ EntityName: EXTERNAL_INVOICE_ENTITY, ExtraFilter: `ID = '${id}'`, ResultType: 'simple' }, user);
            const row = rows.Results?.[0];
            if (!row) return { Success: false, ResultCode: 'ERROR', Message: `No external invoice with ID ${id}.` };

            const rail = await ResolveInvoiceRail(String(row.PaymentProviderID), provider, user);

            // Money applied here, to the unit.
            const paid = await paidOnUnit(row, provider, user);
            // Money applied on the rail, as it sees it.
            const snap = row.ExternalInvoiceRef ? await rail.GetInvoice(row.ExternalInvoiceRef) : null;
            const decision = DecideCancel({
                Status: row.Status,
                PaidAmountOnUnit: paid,
                ExternalDueAmount: snap?.Success && snap.Value ? snap.Value.DueAmount : null,
                ExternalTotal: snap?.Success && snap.Value ? snap.Value.Total : null,
            });
            if (decision.OK === false) return { Success: false, ResultCode: decision.Code as Exclude<typeof decision.Code, 'OK'>, Message: decision.Reason, ExternalInvoiceID: row.ID };

            const archived = await rail.CancelInvoice(String(row.ExternalInvoiceRef));
            if (archived.Success === false) return { Success: false, ResultCode: 'RAIL_REFUSED', Message: archived.Reason, ExternalInvoiceID: row.ID };

            const canceledAt = new Date();
            await updateExternalInvoice(provider, user, row.ID, { Status: 'Canceled', CanceledAt: canceledAt, CancelReason: reason.slice(0, 500), ExternalStatus: 'ARCHIVED', LastSyncedAt: canceledAt });

            // AN INSTALMENT IS NEVER RE-ISSUED. Craig ruled this on golive #242 (2026-09-22) and Jeremy
            // agreed: cancelling an issued instalment produces a credit memo and a REPLACEMENT
            // `Scheduled` row, which takes the next instalment number and so a new document number.
            // Instalment numbers are never reused.
            //
            // This used to clear the schedule row's rail facts so the instalment read as unsent again,
            // and told the person to re-issue it under the frozen number. The rail would in fact have
            // ACCEPTED that (probed 2026-09-29: an archived invoice does not hold its number), which is
            // worse than the refusal first assumed — the customer would have received a second document
            // numbered like the one they already hold. The rail facts now stay as HISTORY: the rail did
            // hold this invoice, and the credit memo references it by number.
            const instalment = !!row.OrderHeaderPaymentScheduleID;
            if (!instalment) {
                // A whole-order unit has no replacement row to come from, and no ruling yet on what a
                // re-issue would be numbered (Andrew is getting that from Craig). Clearing the header's
                // display-only copy is still right: this order no longer has a live rail invoice.
                await clearHeaderDocumentNumber(provider, user, String(row.OrderHeaderID), row.DocumentNumber);
            }

            return {
                Success: true,
                ResultCode: 'CANCELED',
                Message: instalment
                    ? `${row.DocumentNumber} was archived on ${rail.Config.Name}. The instalment keeps this number as history — instalments are never re-issued; cancel the instalment to raise a credit memo and a replacement row with the next number.`
                    : `${row.DocumentNumber} was archived on ${rail.Config.Name}. The unit reads as unsent.`,
                ExternalInvoiceID: row.ID,
                CanceledAt: canceledAt.toISOString(),
            };
        } catch (err) {
            LogError(`Orders.CancelExternalInvoice failed: ${err}`);
            return { Success: false, ResultCode: 'ERROR', Message: err instanceof Error ? err.message : String(err) };
        }
    }
}

/** Registers {@link CancelExternalInvoiceOperation}. Called from the server bootstrap. */
export function LoadCancelExternalInvoiceOperation(): void {
    void CancelExternalInvoiceOperation;
}

/** Sum of captured allocations against the unit: the instalment when named, else the whole order. */
export async function paidOnUnit(row: ExternalInvoiceRow, provider: IMetadataProvider, user: UserInfo): Promise<number> {
    return PaidOnBillingUnit(String(row.OrderHeaderID), row.OrderHeaderPaymentScheduleID ? String(row.OrderHeaderPaymentScheduleID) : null, provider, user);
}

async function clearHeaderDocumentNumber(provider: IMetadataProvider, user: UserInfo, orderID: string, documentNumber: string): Promise<void> {
    try {
        const rv = new RunView(provider as unknown as IRunViewProvider);
        const r = await rv.RunView<{ ExternalDocumentNumber: string | null }>(
            { EntityName: ORDER_HEADER_ENTITY, ExtraFilter: `ID = '${RequireUUID(orderID, 'OrderHeaderID')}' AND ExternalDocumentNumber = '${EscapeText(documentNumber)}'`, Fields: ['ExternalDocumentNumber'], ResultType: 'simple' },
            user,
        );
        if (!r.Results?.length) return;
        const header = await provider.GetEntityObject<BaseEntity>(ORDER_HEADER_ENTITY, user);
        if (!(await header.InnerLoad(CompositeKey.FromID(orderID)))) return;
        header.Set('ExternalDocumentNumber', null);
        if (!(await header.Save())) LogError(`Order ${orderID}: ExternalDocumentNumber could not be cleared after cancel (display only).`);
    } catch (err) {
        LogError(`Order ${orderID}: ExternalDocumentNumber clear skipped: ${err}`);
    }
}
