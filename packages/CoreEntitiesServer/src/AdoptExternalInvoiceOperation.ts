/**
 * `Orders.AdoptExternalInvoice` — resolve a claimed unit by attaching the invoice the rail already holds.
 *
 * WHY THIS EXISTS. A send that times out leaves the unit claimed (`Sending`) deliberately: the rail
 * may or may not have committed the invoice, and retrying blindly is how one billing unit becomes two
 * invoices in a customer's inbox. Resolving that is a person's job and it has exactly two answers.
 * The rail has nothing → re-issue with `AllowReissue`, which supersedes the claim. The rail HAS the
 * invoice → bring its reference here.
 *
 * Until this operation existed only the first answer was implementable; the second was a hand edit in
 * Explorer, which the claimed row's own message nonetheless told people to perform.
 *
 * IT READS THE INVOICE BACK AND REFUSES A MISMATCH. Adopting a reference whose total is not this
 * unit's amount would tie our receivable to a customer document for a different figure — the same
 * failure the send path's tie check exists to prevent, arrived at from the other direction.
 *
 * @module @mj-biz-apps/orders-core-entities-server
 */
import { BaseRemotableOperation, LogError, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    OrdersAdoptExternalInvoiceOperation as OrdersAdoptExternalInvoiceOperationBase,
    type OrdersAdoptExternalInvoiceInput,
    type OrdersAdoptExternalInvoiceOutput,
} from '@mj-biz-apps/orders-entities';

import { money } from './ExternalInvoiceBehavior.js';
import { ResolveInvoiceRail } from './InvoiceRailResolver.js';
import { LoadExternalInvoiceByID, updateExternalInvoice } from './IssueExternalInvoiceOperation.js';
import { RequireUUID } from './sql-guards.js';

/** Our tolerance everywhere money is compared: half a cent. */
const TIE_TOLERANCE = 0.005;

@RegisterClass(BaseRemotableOperation, 'Orders.AdoptExternalInvoice')
export class AdoptExternalInvoiceOperation extends OrdersAdoptExternalInvoiceOperationBase {
    protected async InternalExecute(
        input: OrdersAdoptExternalInvoiceInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<OrdersAdoptExternalInvoiceOutput> {
        try {
            const id = RequireUUID(input?.ExternalInvoiceID, 'ExternalInvoiceID');
            const ref = (input?.ExternalInvoiceRef ?? '').trim();
            const preview = !!input?.Preview;
            if (!ref) {
                return { Success: false, ResultCode: 'ERROR', Message: 'ExternalInvoiceRef is required: this operation exists to record the reference the rail already holds.' };
            }

            const row = await LoadExternalInvoiceByID(id, provider, user);
            if (!row) return { Success: false, ResultCode: 'ERROR', Message: `No external invoice with ID ${id}.` };

            if (row.Status === 'Sent') {
                return {
                    Success: row.ExternalInvoiceRef === ref,
                    ResultCode: 'ALREADY_ADOPTED',
                    Message:
                        row.ExternalInvoiceRef === ref
                            ? `${row.DocumentNumber} already carries ${ref}; nothing to do.`
                            : `${row.DocumentNumber} is already Sent as ${row.ExternalInvoiceRef}, not ${ref}. Refusing to repoint a live invoice — cancel it instead if it is wrong.`,
                    ExternalInvoiceID: row.ID,
                    ExternalInvoiceRef: row.ExternalInvoiceRef,
                    DocumentNumber: row.DocumentNumber,
                };
            }
            if (row.Status !== 'Sending') {
                return {
                    Success: false,
                    ResultCode: 'NOT_CLAIMED',
                    Message: `${row.DocumentNumber} is ${row.Status}, not a claimed send. This operation resolves a send that was never confirmed; a ${row.Status.toLowerCase()} unit is issued again instead.`,
                    ExternalInvoiceID: row.ID,
                    DocumentNumber: row.DocumentNumber,
                };
            }

            // The rail's own view decides this, not the person's typing.
            const rail = await ResolveInvoiceRail(String(row.PaymentProviderID), provider, user);
            const snap = await rail.GetInvoice(ref);
            if (snap.Success === false) {
                return { Success: false, ResultCode: 'ERROR', Message: `${rail.Config.Name} could not be read for ${ref}: ${snap.Reason}`, ExternalInvoiceID: row.ID, ExternalInvoiceRef: ref };
            }
            if (!snap.Value) {
                return {
                    Success: false,
                    ResultCode: 'NOT_FOUND_ON_RAIL',
                    Message: `${rail.Config.Name} has no invoice ${ref}. If the rail really holds nothing for this unit, send it again with AllowReissue instead of adopting.`,
                    ExternalInvoiceID: row.ID,
                    ExternalInvoiceRef: ref,
                    DocumentNumber: row.DocumentNumber,
                };
            }

            const total = money(snap.Value.Total);
            const amount = money(Number(row.Amount ?? 0));
            if (Math.abs(total - amount) > TIE_TOLERANCE) {
                return {
                    Success: false,
                    ResultCode: 'TIE_FAILED',
                    Message:
                        `${rail.Config.Name} totals ${ref} at ${total.toFixed(2)} but ${row.DocumentNumber} is ${amount.toFixed(2)}. ` +
                        `Refusing rather than tying this receivable to a customer document for a different figure.`,
                    ExternalInvoiceID: row.ID,
                    ExternalInvoiceRef: ref,
                    DocumentNumber: row.DocumentNumber,
                    ExternalTotal: total,
                    Amount: amount,
                };
            }

            if (preview) {
                return {
                    Success: true,
                    ResultCode: 'PREVIEWED',
                    Message: `Would record ${ref} against ${row.DocumentNumber} for ${amount.toFixed(2)} and mark it Sent.`,
                    ExternalInvoiceID: row.ID,
                    ExternalInvoiceRef: ref,
                    DocumentNumber: row.DocumentNumber,
                    ExternalTotal: total,
                    Amount: amount,
                };
            }

            const now = new Date();
            await updateExternalInvoice(provider, user, String(row.ID), {
                Status: 'Sent',
                ExternalInvoiceRef: ref,
                // The rail issued it at some unknown earlier moment; this is when we learned of it.
                SentAt: row.SentAt ?? now,
                ExternalTotal: total,
                ExternalDueAmount: money(snap.Value.DueAmount),
                ExternalStatus: snap.Value.Status,
                LastSyncedAt: now,
                LastError: null,
            });

            return {
                Success: true,
                ResultCode: 'ADOPTED',
                Message: `${row.DocumentNumber} now carries ${rail.Config.Name} invoice ${ref} for ${amount.toFixed(2)}.`,
                ExternalInvoiceID: row.ID,
                ExternalInvoiceRef: ref,
                DocumentNumber: row.DocumentNumber,
                ExternalTotal: total,
                Amount: amount,
            };
        } catch (err) {
            LogError(`Orders.AdoptExternalInvoice failed: ${err}`);
            return { Success: false, ResultCode: 'ERROR', Message: err instanceof Error ? err.message : String(err) };
        }
    }
}

/** Registers {@link AdoptExternalInvoiceOperation}. Called from the server bootstrap. */
export function LoadAdoptExternalInvoiceOperation(): void {
    void AdoptExternalInvoiceOperation;
}
