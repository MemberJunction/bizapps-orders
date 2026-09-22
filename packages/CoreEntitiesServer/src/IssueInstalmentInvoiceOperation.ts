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
 * THE LEDGER HALF IS WHERE THE VALUE ARRIVES (D91). A company billed by instalment books nothing
 * at confirm, so `EmitInstalmentInvoiceEntry` (`InstalmentInvoiceEntry.ts`) raises this
 * instalment's slice of the value entry — Dr AR / Cr Deferred Revenue, with its share of the
 * discount, tax and charges — inside this transaction, so the number, the stamp and the entry
 * commit or roll back together. It reads nothing itself: the order's lines and the company's
 * sibling rows are read here and passed in.
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
    type mjBizAppsOrdersOrderLineEntity,
} from '@mj-biz-apps/orders-entities';

import { ORDER_HEADER_ENTITY, ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY, ORDER_LINE_ENTITY } from './entity-names.js';
import { BuildGLAccountResolver, EntityIDFor } from './AccountingBridge.js';
import { EmitInstalmentInvoiceEntry, type InstalmentLineFacts } from './InstalmentInvoiceEntry.js';
import { OrderJournalEntryFactory } from './OrderJournalEntryFactory.js';
import { InstalmentDocumentNumber } from './InvoiceBehavior.js';
import type { OrderHeaderPaymentScheduleEntityServer } from './OrderHeaderPaymentScheduleEntityServer.js';
import { ExplainShortfalls, ScheduleShortfalls } from './PaymentScheduleBehavior.js';
import { RequireUUID } from './sql-guards.js';

/** Order statuses that carry a booked receivable. */
const BOOKED_STATUSES = new Set(['Confirmed', 'Posted', 'Fulfilled']);

/** Entity names the billing-entry factory needs; not in entity-names.ts, matching OrderEntityServer. */
const CHARGE_TYPE_ENTITY = 'MJ_BizApps_Orders: Charge Types';
const SUBSCRIPTION_TERM_ENTITY = 'MJ_BizApps_Orders: Subscription Terms';

interface ScheduleRow extends Record<string, unknown> {
    ID: string;
    OrderHeaderID: string;
    CompanyID: string;
    Company?: string;
    InstallmentNumber: number;
    DueDate: string;
    Amount: number;
    Status: string;
    AmountPaid: number;
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
        // own InstallmentNumber, and how many instalments its company has.
        const companyIDs = [...new Set((lines.Results ?? []).map((l) => String(l.CompanyID).toLowerCase()))].sort();
        const companyIndex = Math.max(0, companyIDs.indexOf(String(row.CompanyID).toLowerCase()));
        const mine = (s: ScheduleRow): boolean =>
            String(s.CompanyID).toLowerCase() === String(row.CompanyID).toLowerCase();

        // THE COUNT INCLUDES CANCELLED ROWS, DELIBERATELY (golive #242, Robert). The suffix exists
        // to disambiguate, and a cancelled instalment does not give its number back: archiving an
        // invoice in Bill.com keeps the number, and re-presenting it 422s as a duplicate. Counting
        // only live rows meant that cancelling a company's single instalment and adding a
        // replacement produced the bare ORD-1234 a second time — the same number on two documents,
        // one of which the customer may already hold.
        const companyRows = (siblings.Results ?? []).filter(mine);
        // The billing slice, by contrast, is taken against LIVE rows only: a cancelled instalment
        // bills nothing and must not take a share of any line.
        const live = companyRows.filter((s) => s.Status !== 'Canceled');
        const documentNumber = InstalmentDocumentNumber(
            order.OrderNumber,
            companyIndex,
            Math.max(1, companyIDs.length),
            Number(row.InstallmentNumber),
            companyRows.length,
        );

        // AND REFUSE IF THAT NUMBER IS ALREADY ON THE ORDER. The count rule above prevents the
        // collision this ticket found; this catches every other route to one — a hand-stamped row,
        // an imported schedule, a renumbering — before the number is frozen and sent, rather than
        // after Bill.com rejects it.
        const clash = (siblings.Results ?? []).find(
            (s) => s.DocumentNumber === documentNumber && String(s.ID).toLowerCase() !== String(row.ID).toLowerCase(),
        );
        if (clash) {
            return this.refuse(
                `Instalment ${row.InstallmentNumber} of order ${order.OrderNumber} would be numbered ` +
                    `${documentNumber}, which instalment ${clash.InstallmentNumber} of the same order already ` +
                    `holds. Two documents cannot share a number — the customer's AP system and Bill.com both ` +
                    `match on it. Renumber the instalments so each is distinct, then issue again.`,
                echo,
            );
        }
        const invoicedAt = new Date();

        // THE BILLING ENTRY'S FACTS, READ HERE (D91). The emitter queries nothing; every number it
        // posts is decided by the factory's own arithmetic, so it is built here and handed over.
        // Read before the transaction opens: these are pure reads and a failure should refuse the
        // invoice rather than roll one back.
        const lineEntities = await rv.RunView<mjBizAppsOrdersOrderLineEntity>(
            { EntityName: ORDER_LINE_ENTITY, ExtraFilter: `OrderHeaderID = '${RequireUUID(order.ID, 'OrderHeaderID')}'`, OrderBy: 'LineNumber', ResultType: 'entity_object' },
            user,
        );
        if (!lineEntities.Success) {
            return this.refuse(`Could not read order ${order.OrderNumber}'s lines to bill this instalment: ${lineEntities.ErrorMessage ?? 'unknown error'}`, echo);
        }
        const factory = new OrderJournalEntryFactory(
            await BuildGLAccountResolver(provider, user),
            EntityIDFor(ORDER_LINE_ENTITY),
            EntityIDFor(SUBSCRIPTION_TERM_ENTITY),
            EntityIDFor(CHARGE_TYPE_ENTITY),
            provider,
            user,
        );
        let instalmentLines: InstalmentLineFacts[];
        try {
            instalmentLines = await factory.BuildInstalmentLineFacts(lineEntities.Results ?? [], row.CompanyID, invoicedAt);
        } catch (err) {
            return this.refuse(err instanceof Error ? err.message : String(err), echo);
        }
        if (!instalmentLines.length) {
            return this.refuse(`Order ${order.OrderNumber} has no lines for the company this instalment bills, so there is nothing to invoice.`, echo);
        }

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

            const { JournalEntryID: journalEntryID, BilledByLine } = await EmitInstalmentInvoiceEntry(
                {
                    OrderHeaderPaymentScheduleID: row.ID,
                    OrderHeaderID: order.ID,
                    OrderNumber: order.OrderNumber,
                    CompanyID: row.CompanyID,
                    InstallmentNumber: Number(row.InstallmentNumber),
                    DocumentNumber: documentNumber,
                    Amount: Number(row.Amount),
                    InvoicedAt: invoicedAt,
                    AmountPaid: Number(row.AmountPaid ?? 0),
                    // `live` is this company's non-Canceled rows; the billing slice is taken
                    // against them in InstallmentNumber order so every instalment's pieces of a
                    // line sum to that line's full amount.
                    Siblings: [...live]
                        .sort((a, b) => Number(a.InstallmentNumber) - Number(b.InstallmentNumber))
                        .map((r) => ({
                            ID: r.ID,
                            InstallmentNumber: Number(r.InstallmentNumber),
                            Amount: Number(r.Amount),
                            Status: r.Status,
                        })),
                    Lines: instalmentLines,
                },
                provider,
                user,
            );
            if (journalEntryID) {
                entity.JournalEntryID = journalEntryID;
                if (!(await entity.Save())) {
                    throw new Error(entity.LatestResult?.CompleteMessage ?? 'The billing entry could not be recorded on the instalment.');
                }
            }

            // ADVANCE BilledToDate IN THIS TRANSACTION (D92). The totals are the ledger's own
            // summary of itself, so they are written by the same act that books the entry and roll
            // back with it. A separate writer — a trigger, a later sweep — is how a total and the
            // journal lines it summarises drift apart, and nothing downstream would report it.
            for (const [orderLineID, billed] of BilledByLine) {
                // Signed: a reversal line's piece is negative and must still be applied, so the
                // guard is "did this bill anything", not "is it positive".
                if (billed === 0) continue;
                const lineEntity = await provider.GetEntityObject<mjBizAppsOrdersOrderLineEntity>(ORDER_LINE_ENTITY, user);
                if (!(await lineEntity.Load(orderLineID))) {
                    throw new Error(`Order line ${orderLineID} could not be loaded to advance its BilledToDate.`);
                }
                lineEntity.BilledToDate = Number(lineEntity.BilledToDate ?? 0) + billed;
                if (!(await lineEntity.Save())) {
                    throw new Error(
                        lineEntity.LatestResult?.CompleteMessage ??
                            `BilledToDate could not be advanced on order line ${orderLineID}.`,
                    );
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
