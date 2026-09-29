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
 * IT READS THE INVOICE BACK AND REFUSES THREE WAYS, because a person is typing a reference off a
 * screen and every one of these is a plausible slip:
 *   · ARCHIVED — an invoice the rail has withdrawn is not one the customer holds. This is the slip
 *     the total check cannot catch: a previously cancelled invoice for THIS unit ties exactly, by
 *     construction, so adopting it would mark the unit Sent for ever against a document nobody has.
 *     The unit would then be skipped by the sweep, refused by `CanSend`, and never billed.
 *   · A DIFFERENT DOCUMENT — the rail carries our own `DocumentNumber` as its invoice number (the
 *     send sets it), so a reference belonging to some other invoice is identifiable without guessing.
 *     Compared only when the rail reports one; a rail that does not is left to the total check.
 *   · A TOTAL THAT DOES NOT TIE — the same figure the send path proves, from the other direction.
 *
 * @module @mj-biz-apps/orders-core-entities-server
 */
import { BaseRemotableOperation, LogError, RunView, type IMetadataProvider, type IRunViewProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    OrdersAdoptExternalInvoiceOperation as OrdersAdoptExternalInvoiceOperationBase,
    type OrdersAdoptExternalInvoiceInput,
    type OrdersAdoptExternalInvoiceOutput,
} from '@mj-biz-apps/orders-entities';

import { DecideAdoption, money } from './ExternalInvoiceBehavior.js';
import { ResolveInvoiceRail } from './InvoiceRailResolver.js';
import { ORDER_HEADER_ENTITY } from './entity-names.js';
import {
    LoadExternalInvoiceByID,
    stampHeaderDocumentNumber,
    stampScheduleRow,
    updateExternalInvoice,
    type HeaderStampTarget,
} from './IssueExternalInvoiceOperation.js';
import { RequireUUID } from './sql-guards.js';

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
            const verdict = DecideAdoption({
                ExternalInvoiceRef: ref,
                DocumentNumber: row.DocumentNumber,
                UnitAmount: amount,
                RailArchived: snap.Value.Archived,
                RailInvoiceNumber: snap.Value.InvoiceNumber,
                RailTotal: total,
                RailName: rail.Config.Name,
            });
            if (!verdict.OK) {
                return {
                    Success: false,
                    // An archived invoice is the rail holding nothing LIVE for this unit, which is the
                    // re-issue answer; the other two are the tie check refusing a mismatch.
                    ResultCode: verdict.Code === 'ARCHIVED' ? 'NOT_FOUND_ON_RAIL' : 'TIE_FAILED',
                    Message: verdict.Code === 'ARCHIVED' ? `${verdict.Reason} Send it again with AllowReissue.` : verdict.Reason,
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

            // THE SAME DENORMALISATION A SEND PERFORMS (step 9 of the issue path, the #239/#242
            // contract). Without it an adopted instalment reads as never sent on its own row and on
            // the order header, which is where a person looks — the worklist is unaffected either way
            // because it keys off this table, so the inconsistency would have been silent.
            if (row.OrderHeaderPaymentScheduleID) {
                await stampScheduleRow(provider, user, String(row.OrderHeaderPaymentScheduleID), {
                    ExternalSystem: rail.Config.TypeCode,
                    ExternalInvoiceRef: ref,
                    SentAt: row.SentAt ? new Date(row.SentAt as unknown as string) : now,
                });
            }
            const header = await loadHeaderStampTarget(String(row.OrderHeaderID), provider, user);
            if (header) await stampHeaderDocumentNumber(provider, user, header, rail.Config.PaymentProviderID, String(row.DocumentNumber));

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

/** Just enough of the order for the display-only header stamp; a miss skips the stamp, never the adopt. */
async function loadHeaderStampTarget(orderID: string, provider: IMetadataProvider, user: UserInfo): Promise<HeaderStampTarget | null> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const r = await rv.RunView<HeaderStampTarget>(
        {
            EntityName: ORDER_HEADER_ENTITY,
            ExtraFilter: `ID = '${RequireUUID(orderID, 'OrderHeaderID')}'`,
            Fields: ['ID', 'OrderNumber', 'ExternalDocumentNumber'],
            ResultType: 'simple',
        },
        user,
    );
    return r.Results?.[0] ?? null;
}

/** Registers {@link AdoptExternalInvoiceOperation}. Called from the server bootstrap. */
export function LoadAdoptExternalInvoiceOperation(): void {
    void AdoptExternalInvoiceOperation;
}
