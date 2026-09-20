/**
 * `Orders.SendExternalInvoices` — the sweep that works the external invoicing worklist.
 *
 * THIS IS THE CALLER THE DESIGN DECOUPLES THE SEND INTO (D-B1). Confirming an order and issuing an
 * instalment both leave a unit "invoiceable and unsent"; this operation, on a schedule and on demand,
 * turns that state into a rail invoice through `IssueOneUnit` — the same code the order form's button
 * runs, so there is one implementation of the send and the sweep cannot drift from it.
 *
 * WHAT IT WILL NOT DO. Re-issue a cancelled unit (a person's call, D-B7), or retry a permanent
 * failure ("this customer has no email") — those stay in the queue for a person. Transient failures
 * (timeout, 5xx, session) are retried by default.
 *
 * MaxCount IS THE FIRST-RUN SAFETY VALVE, and it binds on a preview identically, so the list a person
 * confirms is the pass that follows it. A live pass that left a unit unsent reports Success false.
 *
 * @module @mj-biz-apps/orders-core-entities-server
 */
import { BaseRemotableOperation, LogError, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    OrdersSendExternalInvoicesOperation as OrdersSendExternalInvoicesOperationBase,
    type OrdersSendExternalInvoicesInput,
    type OrdersSendExternalInvoicesOutput,
    type SendExternalInvoicesResult,
} from '@mj-biz-apps/orders-entities';

import { ClassifyIssueFailure } from './ExternalInvoiceBehavior.js';
import { BuildExternalInvoicingWorklist } from './GetExternalInvoicingWorklistOperation.js';
import { IssueOneUnit } from './IssueExternalInvoiceOperation.js';

const DEFAULT_MAX = 25;

@RegisterClass(BaseRemotableOperation, 'Orders.SendExternalInvoices')
export class SendExternalInvoicesOperation extends OrdersSendExternalInvoicesOperationBase {
    protected async InternalExecute(
        input: OrdersSendExternalInvoicesInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<OrdersSendExternalInvoicesOutput> {
        const preview = !!input?.Preview;
        const retryTransient = input?.RetryTransientFailures !== false;
        const maxCount = Math.max(1, Math.floor(Number(input?.MaxCount ?? DEFAULT_MAX)));
        const results: SendExternalInvoicesResult[] = [];
        let sent = 0;
        let failed = 0;
        let skipped = 0;
        try {
            const worklist = await BuildExternalInvoicingWorklist({ CompanyIDs: input?.CompanyIDs ?? null, IncludeFailed: retryTransient }, provider, user);
            const eligible = worklist.filter((row) => {
                if (row.State === 'Unsent') return true;
                if (row.State === 'Failed') return retryTransient && ClassifyIssueFailure(row.LastError) === 'Transient';
                return false; // InFlight: reconcile by hand
            });
            skipped += worklist.length - eligible.length;
            const batch = eligible.slice(0, maxCount);
            skipped += eligible.length - batch.length;

            for (const row of batch) {
                const r = await IssueOneUnit(
                    { OrderHeaderID: row.OrderHeaderID, CompanyID: row.CompanyID, OrderHeaderPaymentScheduleID: row.OrderHeaderPaymentScheduleID },
                    { Preview: preview, AllowReissue: row.State === 'Failed' },
                    provider,
                    user,
                );
                results.push({
                    OrderNumber: row.OrderNumber,
                    DocumentNumber: r.DocumentNumber ?? row.DocumentNumber,
                    CompanyID: row.CompanyID,
                    OrderHeaderPaymentScheduleID: row.OrderHeaderPaymentScheduleID,
                    Amount: r.Amount ?? row.Amount,
                    ResultCode: r.ResultCode,
                    Message: r.Message,
                    ExternalInvoiceRef: r.ExternalInvoiceRef ?? null,
                });
                if (r.ResultCode === 'SENT' || r.ResultCode === 'PREVIEWED' || r.ResultCode === 'ALREADY_SENT') sent++;
                else failed++;
            }

            const live = !preview;
            const message = preview
                ? `Would send ${sent} unit(s); ${skipped} skipped (beyond MaxCount, in flight, or permanent failures).`
                : `${sent} unit(s) sent, ${failed} failed, ${skipped} skipped.`;
            if (live && failed > 0) {
                const detail = results.filter((r) => r.ResultCode !== 'SENT' && r.ResultCode !== 'ALREADY_SENT').slice(0, 3).map((r) => `${r.DocumentNumber}: ${r.ResultCode}`).join('; ');
                return { Success: false, Message: `${message} Failures: ${detail}${failed > 3 ? `, and ${failed - 3} more` : ''}.`, Sent: sent, Failed: failed, Skipped: skipped, PreviewedOnly: preview, Results: results };
            }
            return { Success: true, Message: message, Sent: sent, Failed: failed, Skipped: skipped, PreviewedOnly: preview, Results: results };
        } catch (err) {
            LogError(`Orders.SendExternalInvoices failed: ${err}`);
            return { Success: false, Message: err instanceof Error ? err.message : String(err), Sent: sent, Failed: failed, Skipped: skipped, PreviewedOnly: preview, Results: results };
        }
    }
}

/** Registers {@link SendExternalInvoicesOperation}. Called from the server bootstrap. */
export function LoadSendExternalInvoicesOperation(): void {
    void SendExternalInvoicesOperation;
}
