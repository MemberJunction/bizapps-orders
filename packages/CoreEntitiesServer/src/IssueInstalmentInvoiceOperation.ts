/**
 * `Orders.IssueInstalmentInvoice` — the act that turns a scheduled instalment into a receivable
 * document (plan §6.1, D87; W5).
 *
 * ISSUING IS AN EVENT, NOT A RENDER. The document itself stays a derivation — `InvoiceBuilder` with
 * a `PaymentScheduleID` renders it any number of times — but the NUMBER on it must never move, so
 * it is computed once here and frozen on the row, with `InvoicedAt` and who did it. The row then
 * reads `Invoiced`, which the immutability trigger turns into a lock on its money and its identity.
 *
 * REFUSALS, in order: the row must exist and be `Scheduled` (an `Invoiced` or `Paid` row returns its
 * existing number and changes nothing — issuing twice is not an error and does not issue twice);
 * the order must be Confirmed or beyond, because an unbooked order has no receivable to invoice;
 * and the order's schedule must tie to its lines, because an instalment on a schedule that is a
 * cent short is a document for the wrong amount.
 *
 * THE LEDGER HALF IS A SEAM. `EmitInstalmentReclassEntry` (`InstalmentReclass.ts`) is where the
 * `Dr AR / Cr Unbilled` entry will be booked once AIDP-25 (#240) ships the Unbilled role; today it
 * returns null and `JournalEntryID` stays empty. The call sits inside this transaction so that when
 * it does book, the number, the stamp and the entry commit or roll back together.
 */
import {
    BaseRemotableOperation,
    DatabaseProviderBase,
    LogError,
    RunView,
    type IMetadataProvider,
    type UserInfo,
} from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    OrdersIssueInstalmentInvoiceOperation as OrdersIssueInstalmentInvoiceOperationBase,
    type OrdersIssueInstalmentInvoiceInput,
    type OrdersIssueInstalmentInvoiceOutput,
    ToISODate,
} from '@mj-biz-apps/orders-entities';

import { ORDER_HEADER_ENTITY, ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY, ORDER_LINE_ENTITY } from './entity-names.js';
import { EmitInstalmentReclassEntry } from './InstalmentReclass.js';
import { InstalmentDocumentNumber } from './InvoiceBehavior.js';
import type { OrderHeaderPaymentScheduleEntityServer } from './OrderHeaderPaymentScheduleEntityServer.js';
import { ExplainShortfalls, ScheduleShortfalls } from './PaymentScheduleBehavior.js';
import { RequireUUID } from './sql-guards.js';

/** Order statuses that carry a booked receivable. */
const BOOKED_STATUSES = new Set(['Confirmed', 'Posted', 'Fulfilled']);

interface ScheduleRow extends Record<string, unknown> {
    ID: string;
    OrderHeaderID: string;
    CompanyID: string;
    Company?: string;
    InstallmentNumber: number;
    DueDate: string;
    Amount: number;
    Status: string;
    DocumentNumber: string | null;
    InvoicedAt: string | null;
    JournalEntryID: string | null;
}

@RegisterClass(BaseRemotableOperation, 'Orders.IssueInstalmentInvoice')
export class IssueInstalmentInvoiceOperation extends OrdersIssueInstalmentInvoiceOperationBase {
    protected async InternalExecute(
        input: OrdersIssueInstalmentInvoiceInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<OrdersIssueInstalmentInvoiceOutput> {
        const scheduleID = RequireUUID(input?.OrderHeaderPaymentScheduleID, 'OrderHeaderPaymentScheduleID');
        const rv = RunView.FromMetadataProvider(provider);

        const rowResult = await rv.RunView<ScheduleRow>(
            { EntityName: ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY, ExtraFilter: `ID = '${scheduleID}'`, ResultType: 'simple' },
            user,
        );
        const row = rowResult.Results?.[0];
        if (!row) return this.refuse(`No instalment with ID ${scheduleID}.`);

        const orderResult = await rv.RunView<{ ID: string; OrderNumber: string; Status: string }>(
            { EntityName: ORDER_HEADER_ENTITY, ExtraFilter: `ID = '${RequireUUID(row.OrderHeaderID, 'OrderHeaderID')}'`, Fields: ['ID', 'OrderNumber', 'Status'], ResultType: 'simple' },
            user,
        );
        const order = orderResult.Results?.[0];
        if (!order) return this.refuse(`Instalment ${scheduleID} belongs to an order that could not be read.`);

        const echo = {
            OrderHeaderPaymentScheduleID: row.ID,
            OrderHeaderID: order.ID,
            OrderNumber: order.OrderNumber,
            InstallmentNumber: Number(row.InstallmentNumber),
            Amount: Number(row.Amount),
            DueDate: ToISODate(row.DueDate),
        };

        // Idempotent: the customer already holds this number.
        if (row.Status === 'Invoiced' || row.Status === 'Paid') {
            return {
                Success: true,
                AlreadyInvoiced: true,
                Message: `Instalment ${row.InstallmentNumber} of order ${order.OrderNumber} was already invoiced as ${row.DocumentNumber}.`,
                DocumentNumber: row.DocumentNumber,
                InvoicedAt: row.InvoicedAt ? new Date(row.InvoicedAt).toISOString() : null,
                JournalEntryID: row.JournalEntryID ?? null,
                ...echo,
            };
        }
        if (row.Status !== 'Scheduled') {
            return this.refuse(`Instalment ${row.InstallmentNumber} of order ${order.OrderNumber} is ${row.Status} and cannot be invoiced.`, echo);
        }
        if (!BOOKED_STATUSES.has(order.Status)) {
            return this.refuse(`Order ${order.OrderNumber} is ${order.Status}; only a Confirmed order has a receivable to invoice.`, echo);
        }

        // The schedule must tie to the lines — the same check the confirm ran, because a Scheduled
        // row may have been edited since.
        const [lines, siblings] = await Promise.all([
            rv.RunView<{ CompanyID: string; LineTotalGross: number }>(
                { EntityName: ORDER_LINE_ENTITY, ExtraFilter: `OrderHeaderID = '${order.ID}'`, Fields: ['CompanyID', 'LineTotalGross'], ResultType: 'simple' },
                user,
            ),
            rv.RunView<ScheduleRow>(
                { EntityName: ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY, ExtraFilter: `OrderHeaderID = '${order.ID}'`, ResultType: 'simple' },
                user,
            ),
        ]);
        if (!lines.Success || !siblings.Success) {
            return this.refuse(`Could not read order ${order.OrderNumber} to check its schedule: ${lines.ErrorMessage ?? siblings.ErrorMessage ?? 'unknown error'}`, echo);
        }
        const shortfalls = ScheduleShortfalls(siblings.Results ?? [], lines.Results ?? []);
        if (shortfalls.length) {
            const names = new Map((siblings.Results ?? []).map((s) => [String(s.CompanyID).toLowerCase(), s.Company ?? s.CompanyID]));
            return this.refuse(ExplainShortfalls(order.OrderNumber, shortfalls, (id) => String(names.get(id) ?? id)), echo);
        }

        // Position is stable: companies in ID order (as the document builder sorts them), the row's
        // own InstallmentNumber, and how many live instalments its company has.
        const companyIDs = [...new Set((lines.Results ?? []).map((l) => String(l.CompanyID).toLowerCase()))].sort();
        const companyIndex = Math.max(0, companyIDs.indexOf(String(row.CompanyID).toLowerCase()));
        const live = (siblings.Results ?? []).filter(
            (s) => s.Status !== 'Canceled' && String(s.CompanyID).toLowerCase() === String(row.CompanyID).toLowerCase(),
        );
        const documentNumber = InstalmentDocumentNumber(
            order.OrderNumber,
            companyIndex,
            Math.max(1, companyIDs.length),
            Number(row.InstallmentNumber),
            live.length,
        );
        const invoicedAt = new Date();

        const dbProvider = provider as unknown as DatabaseProviderBase;
        await dbProvider.BeginTransaction();
        try {
            const entity = await provider.GetEntityObject<OrderHeaderPaymentScheduleEntityServer>(ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY, user);
            if (!(await entity.Load(row.ID))) throw new Error(`Instalment ${row.ID} could not be loaded for update.`);
            entity.DocumentNumber = documentNumber;
            entity.InvoicedAt = invoicedAt;
            entity.InvoicedByUserID = user.ID;
            entity.Status = 'Invoiced';
            if (!(await entity.Save())) {
                throw new Error(entity.LatestResult?.CompleteMessage ?? 'The instalment could not be updated.');
            }

            const journalEntryID = await EmitInstalmentReclassEntry(
                {
                    OrderHeaderPaymentScheduleID: row.ID,
                    OrderHeaderID: order.ID,
                    OrderNumber: order.OrderNumber,
                    CompanyID: row.CompanyID,
                    InstallmentNumber: Number(row.InstallmentNumber),
                    DocumentNumber: documentNumber,
                    Amount: Number(row.Amount),
                    InvoicedAt: invoicedAt,
                },
                provider,
                user,
            );
            if (journalEntryID) {
                entity.JournalEntryID = journalEntryID;
                if (!(await entity.Save())) {
                    throw new Error(entity.LatestResult?.CompleteMessage ?? 'The reclass entry could not be recorded on the instalment.');
                }
            }

            await dbProvider.CommitTransaction();
            return {
                Success: true,
                AlreadyInvoiced: false,
                Message: `Instalment ${row.InstallmentNumber} of order ${order.OrderNumber} issued as ${documentNumber}.`,
                DocumentNumber: documentNumber,
                InvoicedAt: invoicedAt.toISOString(),
                JournalEntryID: journalEntryID,
                ...echo,
            };
        } catch (err) {
            LogError(`Orders.IssueInstalmentInvoice failed for ${scheduleID}: ${err}`);
            try {
                await dbProvider.RollbackTransaction();
            } catch (rollbackErr) {
                LogError(`Rollback failed after IssueInstalmentInvoice error: ${rollbackErr}`);
            }
            return this.refuse(err instanceof Error ? err.message : String(err), echo);
        }
    }

    private refuse(message: string, echo: Partial<OrdersIssueInstalmentInvoiceOutput> = {}): OrdersIssueInstalmentInvoiceOutput {
        return { Success: false, AlreadyInvoiced: false, Message: message, ...echo };
    }
}

/** Registers {@link IssueInstalmentInvoiceOperation}. Called from the server bootstrap. */
export function LoadIssueInstalmentInvoiceOperation(): void {
    void IssueInstalmentInvoiceOperation;
}
