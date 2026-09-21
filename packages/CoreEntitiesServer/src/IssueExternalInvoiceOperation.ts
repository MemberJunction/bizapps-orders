/**
 * `Orders.IssueExternalInvoice` — one billing unit, one invoice on the company's AR rail, once.
 *
 * WHAT A BILLING UNIT IS (design §4.1). An order billed as a whole has one unit per selling company
 * and is invoiceable at Confirmed; an order billed on a schedule has one unit per row and is
 * invoiceable once `Orders.IssueInstalmentInvoice` has frozen the row's number. For an order with no
 * schedule "locked" and "invoiceable" are the same moment — which is what golive #242 requires.
 *
 * THE SEND IS DECOUPLED FROM BOTH EVENTS (D-B1). Nothing in the confirm transaction or the instalment
 * issue calls this; the sweep and the order form do, and both may call it twice. Idempotency is a
 * unique filtered index on the live unit (`UQ_ExternalInvoice_LiveUnit`), claimed by a `Sending` row
 * BEFORE the rail is called — so a double click fails here, not at Bill.com, and a crash between the
 * rail's create and our commit leaves a visible `Sending` claim rather than an orphaned invoice.
 *
 * WHAT THIS NEVER DOES. It does not move `Balance` or `PaymentStatus`, and it books no journal entry
 * (#146 AC3). Payment is a separate event, captured by the poller.
 *
 * SCHEDULE SUPPORT IS CONDITIONAL. PR #220's `OrderHeaderPaymentSchedule` may not exist on the
 * database yet; when the entity is absent every order is treated as billed as a whole, and naming an
 * instalment is refused with a clear message.
 *
 * @module @mj-biz-apps/orders-core-entities-server
 */
import { BaseEntity, BaseRemotableOperation, CompositeKey, LogError, RunView, type IMetadataProvider, type IRunViewProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    OrdersIssueExternalInvoiceOperation as OrdersIssueExternalInvoiceOperationBase,
    type OrdersIssueExternalInvoiceInput,
    type OrdersIssueExternalInvoiceOutput,
    type OrdersIssueExternalInvoiceResultCode,
    Today,
} from '@mj-biz-apps/orders-entities';

import type { BaseInvoiceRail, RailCustomerFacts } from './BaseInvoiceRail.js';
import {
    EXTERNAL_CUSTOMER_ENTITY,
    EXTERNAL_INVOICE_ENTITY,
    ORDER_HEADER_ENTITY,
    ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY,
    ORDER_LINE_ENTITY,
    ORGANIZATION_ENTITY,
    PERSON_ENTITY,
} from './entity-names.js';
import {
    BuildExternalInvoicePayload,
    DecideInvoiceable,
    money,
    type BillingUnitKey,
    type ExternalInvoiceStatus,
    type ExternalInvoiceUnitFacts,
} from './ExternalInvoiceBehavior.js';
import { FindInvoiceRailForCompany } from './InvoiceRailResolver.js';
import { DocumentNumber as CompanyDocumentNumber } from './InvoiceBehavior.js';
import { BuildInvoiceDocuments } from './InvoiceBuilder.js';
import { EscapeText, RequireUUID } from './sql-guards.js';

// ── Rows as RunView returns them ─────────────────────────────────────────────────────────────────

interface OrderRow extends Record<string, unknown> {
    ID: string;
    OrderNumber: string;
    Status: string;
    CompanyID: string;
    BillToOrganizationID: string | null;
    BillToPersonID: string | null;
    BillToOrganization: string | null;
    BillToPerson: string | null;
    ConfirmedAt: string | Date | null;
    DueDate: string | Date | null;
    ExternalDocumentNumber: string | null;
}

interface ScheduleRow extends Record<string, unknown> {
    ID: string;
    OrderHeaderID: string;
    CompanyID: string;
    InstallmentNumber: number;
    DueDate: string | Date | null;
    Amount: number;
    Status: string;
    DocumentNumber: string | null;
    InvoicedAt: string | Date | null;
}

/** An `ExternalInvoice` row, as the operations read it. */
export interface ExternalInvoiceRow extends Record<string, unknown> {
    ID: string;
    PaymentProviderID: string;
    OrderHeaderID: string;
    CompanyID: string;
    OrderHeaderPaymentScheduleID: string | null;
    DocumentNumber: string;
    Amount: number;
    DueDate: string | Date | null;
    Status: ExternalInvoiceStatus;
    ExternalCustomerRef: string | null;
    ExternalInvoiceRef: string | null;
    ExternalTotal: number | null;
    ExternalDueAmount: number | null;
    ExternalStatus: string | null;
    SentAt: string | Date | null;
    LastError: string | null;
}

const iso = (v: string | Date | null | undefined): string | null => (v == null ? null : new Date(v).toISOString());
const isoDate = (v: string | Date | null | undefined): string | null => (v == null ? null : new Date(v).toISOString().slice(0, 10));

/** Whether PR #220's schedule entity exists on this database. */
export function ScheduleSupported(provider: IMetadataProvider): boolean {
    return provider.EntityByName(ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY) !== undefined;
}

// ── The operation ────────────────────────────────────────────────────────────────────────────────

@RegisterClass(BaseRemotableOperation, 'Orders.IssueExternalInvoice')
export class IssueExternalInvoiceOperation extends OrdersIssueExternalInvoiceOperationBase {
    protected async InternalExecute(
        input: OrdersIssueExternalInvoiceInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<OrdersIssueExternalInvoiceOutput> {
        try {
            const unit = {
                OrderHeaderID: RequireUUID(input?.OrderHeaderID, 'OrderHeaderID'),
                CompanyID: input?.CompanyID ? RequireUUID(input.CompanyID, 'CompanyID') : null,
                OrderHeaderPaymentScheduleID: input?.OrderHeaderPaymentScheduleID
                    ? RequireUUID(input.OrderHeaderPaymentScheduleID, 'OrderHeaderPaymentScheduleID')
                    : null,
            };
            return await IssueOneUnit(unit, { Preview: !!input?.Preview, AllowReissue: !!input?.AllowReissue }, provider, user);
        } catch (err) {
            LogError(`Orders.IssueExternalInvoice failed: ${err}`);
            return { Success: false, ResultCode: 'ERROR', Message: err instanceof Error ? err.message : String(err) };
        }
    }
}

/** Registers {@link IssueExternalInvoiceOperation}. Called from the server bootstrap. */
export function LoadIssueExternalInvoiceOperation(): void {
    void IssueExternalInvoiceOperation;
}

// ── The work, shared with the sweep ──────────────────────────────────────────────────────────────

export interface IssueUnitOptions {
    Preview: boolean;
    AllowReissue: boolean;
}

/**
 * Issue one unit. `unit.CompanyID` may be null when the order sells for one company or an instalment
 * is named. Exported so `Orders.SendExternalInvoices` can call it per worklist row without going
 * back through the provider.
 */
export async function IssueOneUnit(
    unit: { OrderHeaderID: string; CompanyID: string | null; OrderHeaderPaymentScheduleID: string | null },
    opts: IssueUnitOptions,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<OrdersIssueExternalInvoiceOutput> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const refuse = (code: OrdersIssueExternalInvoiceResultCode, message: string, extra: Partial<OrdersIssueExternalInvoiceOutput> = {}): OrdersIssueExternalInvoiceOutput => ({
        Success: false,
        ResultCode: code,
        Message: message,
        ...extra,
    });

    // 1. The order, its lines' companies, and (when the table exists) its schedule.
    const orderResult = await rv.RunView<OrderRow>(
        { EntityName: ORDER_HEADER_ENTITY, ExtraFilter: `ID = '${unit.OrderHeaderID}'`, ResultType: 'simple' },
        user,
    );
    const order = orderResult.Results?.[0];
    if (!order) return refuse('ERROR', `No order with ID ${unit.OrderHeaderID}.`);

    const lines = await rv.RunView<{ CompanyID: string }>(
        { EntityName: ORDER_LINE_ENTITY, ExtraFilter: `OrderHeaderID = '${unit.OrderHeaderID}'`, Fields: ['CompanyID'], ResultType: 'simple' },
        user,
    );
    const lineCompanies = [...new Set((lines.Results ?? []).map((l) => String(l.CompanyID).toLowerCase()))];

    const scheduleSupported = ScheduleSupported(provider);
    let scheduleRows: ScheduleRow[] = [];
    if (scheduleSupported) {
        const s = await rv.RunView<ScheduleRow>(
            { EntityName: ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY, ExtraFilter: `OrderHeaderID = '${unit.OrderHeaderID}'`, ResultType: 'simple' },
            user,
        );
        scheduleRows = (s.Results ?? []).filter((r) => r.Status !== 'Canceled');
    } else if (unit.OrderHeaderPaymentScheduleID) {
        return refuse('ERROR', 'This database has no payment-schedule table yet (PR #220); an instalment cannot be named.');
    }
    const row = unit.OrderHeaderPaymentScheduleID
        ? scheduleRows.find((r) => String(r.ID).toLowerCase() === unit.OrderHeaderPaymentScheduleID!.toLowerCase())
        : undefined;
    if (unit.OrderHeaderPaymentScheduleID && !row) {
        return refuse('ERROR', `Instalment ${unit.OrderHeaderPaymentScheduleID} is not a live instalment of order ${order.OrderNumber}.`);
    }

    // 2. Which selling company this unit bills for.
    let companyID: string | null = row ? String(row.CompanyID) : unit.CompanyID;
    if (!companyID) {
        if (lineCompanies.length <= 1) companyID = lineCompanies[0] ?? String(order.CompanyID);
        else {
            return refuse(
                'NAME_THE_COMPANY',
                `Order ${order.OrderNumber} sells for ${lineCompanies.length} companies; name the CompanyID to invoice — each company's document is its own rail invoice.`,
            );
        }
    }
    companyID = RequireUUID(companyID, 'CompanyID');

    // 3. The rail. None is the ordinary answer for a company that invoices natively.
    const rail = await FindInvoiceRailForCompany(companyID, provider, user);
    if (!rail) {
        return refuse('NO_RAIL', `${companyNameOr(order, companyID)} has no external invoice rail configured; this order is invoiced natively.`);
    }

    // 4. History and the decision.
    const unitKey: BillingUnitKey = { OrderHeaderID: order.ID, CompanyID: companyID, OrderHeaderPaymentScheduleID: row ? String(row.ID) : null };
    const existing = await LoadExternalInvoiceForUnit(rail.Config.PaymentProviderID, unitKey, provider, user);
    const decision = DecideInvoiceable({
        OrderStatus: String(order.Status),
        HasSchedule: scheduleRows.length > 0,
        ScheduleRowNamed: !!row,
        ScheduleRowStatus: row ? String(row.Status) : null,
        ExistingStatus: existing?.Status ?? null,
        AllowReissue: opts.AllowReissue,
    });
    if (decision.Verdict === 'AlreadySent' && existing) {
        return {
            Success: true,
            ResultCode: 'ALREADY_SENT',
            Message: `${existing.DocumentNumber} is already on ${rail.Config.Name} as ${existing.ExternalInvoiceRef}.`,
            ...echoOf(existing),
        };
    }
    if (decision.Verdict === 'Refuse') {
        return refuse(decision.Code as OrdersIssueExternalInvoiceResultCode, decision.Reason, existing ? echoOf(existing) : {});
    }

    // 5. The document and the payload.
    const built = await BuildInvoiceDocuments(order.ID, provider, user, { OnlyCompanyID: companyID, PaymentScheduleID: row ? String(row.ID) : null });
    if (!built.Success || !built.Documents.length) {
        return refuse('ERROR', built.Message ?? `Order ${order.OrderNumber} produced no document for company ${companyID}.`);
    }
    const doc = built.Documents[0];
    const unitFacts: ExternalInvoiceUnitFacts = row
        ? {
              CompanyID: companyID,
              InstallmentNumber: Number(row.InstallmentNumber),
              InstallmentCount: scheduleRows.filter((r) => String(r.CompanyID).toLowerCase() === companyID!.toLowerCase()).length,
              DueDate: isoDate(row.DueDate),
              Amount: Number(row.Amount),
              DocumentNumber: row.DocumentNumber,
          }
        : {
              CompanyID: companyID,
              InstallmentNumber: 1,
              InstallmentCount: 1,
              DueDate: doc.DueDate,
              Amount: doc.Gross,
              DocumentNumber: CompanyDocumentNumber(order.OrderNumber, Math.max(0, [...lineCompanies].sort().indexOf(companyID.toLowerCase())), Math.max(1, lineCompanies.length)),
          };
    const invoiceDate = isoDate(row?.InvoicedAt ?? order.ConfirmedAt) ?? Today();
    const payload = BuildExternalInvoicePayload(doc, unitFacts, invoiceDate);
    if (payload.OK === false) return refuse('TIE_FAILED', payload.Reason);

    if (opts.Preview) {
        return {
            Success: true,
            ResultCode: 'PREVIEWED',
            Message: `Would send ${payload.Payload.DocumentNumber} for ${payload.Payload.Amount.toFixed(2)} to ${rail.Config.Name}.`,
            DocumentNumber: payload.Payload.DocumentNumber,
            Amount: payload.Payload.Amount,
            DueDate: payload.Payload.DueDate,
            Payload: payload.Payload,
        };
    }

    // 6. The customer on the rail.
    const customer = await ensureCustomer(rail, order, provider, user);
    if (customer.OK === false) {
        const failed = await writeExternalInvoice(
            provider,
            user,
            { ...unitKey, PaymentProviderID: rail.Config.PaymentProviderID, DocumentNumber: payload.Payload.DocumentNumber, Amount: payload.Payload.Amount, DueDate: payload.Payload.DueDate },
            { Status: 'Failed', LastError: customer.Reason },
        );
        return refuse(customer.Code, customer.Reason, { ExternalInvoiceID: failed, DocumentNumber: payload.Payload.DocumentNumber, Amount: payload.Payload.Amount });
    }

    // 7. Claim the unit (Sending) BEFORE the rail is called.
    let externalInvoiceID: string;
    try {
        externalInvoiceID = await writeExternalInvoice(
            provider,
            user,
            { ...unitKey, PaymentProviderID: rail.Config.PaymentProviderID, DocumentNumber: payload.Payload.DocumentNumber, Amount: payload.Payload.Amount, DueDate: payload.Payload.DueDate },
            { Status: 'Sending', ExternalCustomerRef: customer.ExternalCustomerRef },
        );
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (/UQ_ExternalInvoice_LiveUnit/i.test(message)) {
            return refuse('IN_FLIGHT', `Another send for ${payload.Payload.DocumentNumber} is already in flight.`);
        }
        throw err;
    }

    // 8. The rail.
    const issued = await rail.IssueInvoice({ ...payload.Payload, ExternalCustomerRef: customer.ExternalCustomerRef });
    if (issued.Success === false) {
        await updateExternalInvoice(provider, user, externalInvoiceID, { Status: 'Failed', LastError: issued.Reason });
        return refuse('RAIL_REFUSED', issued.Reason, { ExternalInvoiceID: externalInvoiceID, DocumentNumber: payload.Payload.DocumentNumber, Amount: payload.Payload.Amount });
    }
    const ref = issued.Value.ExternalInvoiceRef;

    const back = await rail.GetInvoice(ref);
    const snapshot = back.Success ? back.Value : null;
    if (snapshot && Math.abs(money(snapshot.Total) - payload.Payload.Amount) > 0.005) {
        // A document for the wrong figure must not reach a customer: withdraw it and fail loudly.
        const undo = await rail.CancelInvoice(ref);
        const reason =
            `${rail.Config.Name} totalled ${payload.Payload.DocumentNumber} at ${money(snapshot.Total).toFixed(2)} but the unit is ${payload.Payload.Amount.toFixed(2)}. ` +
            (undo.Success === true ? 'The rail invoice was archived.' : `The rail invoice ${ref} could NOT be archived (${undo.Success === false ? undo.Reason : 'unknown'}); archive it by hand.`);
        await updateExternalInvoice(provider, user, externalInvoiceID, { Status: 'Failed', ExternalInvoiceRef: ref, ExternalTotal: money(snapshot.Total), LastError: reason });
        return refuse('TIE_FAILED', reason, { ExternalInvoiceID: externalInvoiceID, ExternalInvoiceRef: ref, DocumentNumber: payload.Payload.DocumentNumber, Amount: payload.Payload.Amount });
    }

    const sentAt = new Date();
    await updateExternalInvoice(provider, user, externalInvoiceID, {
        Status: 'Sent',
        ExternalInvoiceRef: ref,
        SentAt: sentAt,
        ExternalTotal: snapshot ? money(snapshot.Total) : null,
        ExternalDueAmount: snapshot ? money(snapshot.DueAmount) : null,
        ExternalStatus: snapshot?.Status ?? null,
        LastSyncedAt: snapshot ? sentAt : null,
        LastError: null,
    });

    // 9. Denormalise onto the instalment row (the #239/#242 contract) and, best effort, the header.
    if (row) await stampScheduleRow(provider, user, String(row.ID), { ExternalSystem: rail.Config.TypeCode, ExternalInvoiceRef: ref, SentAt: sentAt });
    await stampHeaderDocumentNumber(provider, user, order, rail.Config.PaymentProviderID, payload.Payload.DocumentNumber);

    return {
        Success: true,
        ResultCode: 'SENT',
        Message: `${payload.Payload.DocumentNumber} sent to ${rail.Config.Name} as ${ref} for ${payload.Payload.Amount.toFixed(2)}.`,
        ExternalInvoiceID: externalInvoiceID,
        ExternalInvoiceRef: ref,
        ExternalCustomerRef: customer.ExternalCustomerRef,
        DocumentNumber: payload.Payload.DocumentNumber,
        Amount: payload.Payload.Amount,
        DueDate: payload.Payload.DueDate,
        SentAt: sentAt.toISOString(),
    };
}

// ── Helpers shared with the other external-invoice operations ────────────────────────────────────

function companyNameOr(order: OrderRow, companyID: string): string {
    const name = order.Company as string | undefined;
    return name && String(order.CompanyID).toLowerCase() === companyID.toLowerCase() ? name : `Company ${companyID}`;
}

function echoOf(row: ExternalInvoiceRow): Partial<OrdersIssueExternalInvoiceOutput> {
    return {
        ExternalInvoiceID: row.ID,
        ExternalInvoiceRef: row.ExternalInvoiceRef,
        ExternalCustomerRef: row.ExternalCustomerRef,
        DocumentNumber: row.DocumentNumber,
        Amount: Number(row.Amount),
        DueDate: isoDate(row.DueDate),
        SentAt: iso(row.SentAt),
    };
}

/** The unit's most relevant row: a live one if any, else the most recent of any status. */
export async function LoadExternalInvoiceForUnit(
    paymentProviderID: string,
    unit: BillingUnitKey,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<ExternalInvoiceRow | null> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const sched = unit.OrderHeaderPaymentScheduleID
        ? `OrderHeaderPaymentScheduleID = '${RequireUUID(unit.OrderHeaderPaymentScheduleID, 'OrderHeaderPaymentScheduleID')}'`
        : 'OrderHeaderPaymentScheduleID IS NULL';
    const r = await rv.RunView<ExternalInvoiceRow>(
        {
            EntityName: EXTERNAL_INVOICE_ENTITY,
            ExtraFilter:
                `PaymentProviderID = '${RequireUUID(paymentProviderID, 'PaymentProviderID')}' AND OrderHeaderID = '${RequireUUID(unit.OrderHeaderID, 'OrderHeaderID')}' ` +
                `AND CompanyID = '${RequireUUID(unit.CompanyID, 'CompanyID')}' AND ${sched}`,
            OrderBy: '__mj_CreatedAt DESC',
            ResultType: 'simple',
        },
        user,
    );
    const rows = r.Results ?? [];
    return rows.find((x) => x.Status === 'Sent' || x.Status === 'Sending') ?? rows[0] ?? null;
}

/** `ExternalInvoice` rows by the rail's invoice ids, for the poller's matching. */
export async function LoadExternalInvoicesByRef(
    paymentProviderID: string,
    refs: readonly string[],
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<ExternalInvoiceRow[]> {
    if (!refs.length) return [];
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const list = refs.map((x) => `'${EscapeText(x)}'`).join(',');
    const r = await rv.RunView<ExternalInvoiceRow>(
        {
            EntityName: EXTERNAL_INVOICE_ENTITY,
            ExtraFilter: `PaymentProviderID = '${RequireUUID(paymentProviderID, 'PaymentProviderID')}' AND Status = 'Sent' AND ExternalInvoiceRef IN (${list})`,
            ResultType: 'simple',
        },
        user,
    );
    return r.Results ?? [];
}

async function writeExternalInvoice(
    provider: IMetadataProvider,
    user: UserInfo,
    unit: BillingUnitKey & { PaymentProviderID: string; DocumentNumber: string; Amount: number; DueDate: string | null },
    fields: Partial<Record<keyof ExternalInvoiceRow | 'IssuedByUserID' | 'LastSyncedAt', unknown>>,
): Promise<string> {
    const entity = await provider.GetEntityObject<BaseEntity>(EXTERNAL_INVOICE_ENTITY, user);
    entity.NewRecord();
    entity.SetMany(
        {
            PaymentProviderID: unit.PaymentProviderID,
            OrderHeaderID: unit.OrderHeaderID,
            CompanyID: unit.CompanyID,
            OrderHeaderPaymentScheduleID: unit.OrderHeaderPaymentScheduleID,
            DocumentNumber: unit.DocumentNumber,
            Amount: unit.Amount,
            DueDate: unit.DueDate ? new Date(unit.DueDate) : null,
            IssuedByUserID: user.ID,
            ...fields,
        },
        true,
    );
    if (!(await entity.Save())) {
        throw new Error(entity.LatestResult?.CompleteMessage ?? 'The external invoice row could not be written.');
    }
    return String(entity.Get('ID'));
}

export async function updateExternalInvoice(
    provider: IMetadataProvider,
    user: UserInfo,
    id: string,
    fields: Record<string, unknown>,
): Promise<void> {
    const entity = await provider.GetEntityObject<BaseEntity>(EXTERNAL_INVOICE_ENTITY, user);
    if (!(await entity.InnerLoad(CompositeKey.FromID(id)))) throw new Error(`External invoice ${id} could not be loaded.`);
    entity.SetMany(fields, true);
    if (!(await entity.Save())) {
        throw new Error(entity.LatestResult?.CompleteMessage ?? `External invoice ${id} could not be updated.`);
    }
}

/** Write the rail facts onto the instalment row (PR #220). The immutability trigger permits exactly these columns. */
export async function stampScheduleRow(
    provider: IMetadataProvider,
    user: UserInfo,
    scheduleID: string,
    fields: { ExternalSystem: string | null; ExternalInvoiceRef: string | null; SentAt: Date | null },
): Promise<void> {
    if (!ScheduleSupported(provider)) return;
    const entity = await provider.GetEntityObject<BaseEntity>(ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY, user);
    if (!(await entity.InnerLoad(CompositeKey.FromID(scheduleID)))) return;
    entity.SetMany(fields, true);
    if (!(await entity.Save())) {
        LogError(`Instalment ${scheduleID} could not be stamped with the rail reference: ${entity.LatestResult?.CompleteMessage ?? 'unknown'}`);
    }
}

/**
 * D-B3: `OrderHeader.ExternalDocumentNumber` gets the rail's invoice number when the order has exactly
 * one live external invoice. Display only, best effort — a refusal here is logged, never fatal.
 */
async function stampHeaderDocumentNumber(provider: IMetadataProvider, user: UserInfo, order: OrderRow, paymentProviderID: string, documentNumber: string | null): Promise<void> {
    try {
        const rv = new RunView(provider as unknown as IRunViewProvider);
        const live = await rv.RunView<{ ID: string; DocumentNumber: string }>(
            {
                EntityName: EXTERNAL_INVOICE_ENTITY,
                ExtraFilter: `PaymentProviderID = '${RequireUUID(paymentProviderID, 'PaymentProviderID')}' AND OrderHeaderID = '${RequireUUID(order.ID, 'OrderHeaderID')}' AND Status = 'Sent'`,
                Fields: ['ID', 'DocumentNumber'],
                ResultType: 'simple',
            },
            user,
        );
        const rows = live.Results ?? [];
        const target = rows.length === 1 ? rows[0].DocumentNumber : null;
        if (rows.length > 1 && order.ExternalDocumentNumber !== documentNumber) return; // several live invoices: leave whatever is there
        if ((order.ExternalDocumentNumber ?? null) === target) return;
        const header = await provider.GetEntityObject<BaseEntity>(ORDER_HEADER_ENTITY, user);
        if (!(await header.InnerLoad(CompositeKey.FromID(order.ID)))) return;
        header.Set('ExternalDocumentNumber', target);
        if (!(await header.Save())) {
            LogError(`Order ${order.OrderNumber}: ExternalDocumentNumber could not be stamped (${header.LatestResult?.CompleteMessage ?? 'unknown'}). Display only; the ExternalInvoice row is authoritative.`);
        }
    } catch (err) {
        LogError(`Order ${order.OrderNumber}: ExternalDocumentNumber stamp skipped: ${err}`);
    }
}

// ── The customer on the rail ─────────────────────────────────────────────────────────────────────

type CustomerOutcome =
    | { OK: true; ExternalCustomerRef: string }
    | { OK: false; Code: 'NO_CUSTOMER_EMAIL' | 'RAIL_REFUSED' | 'ERROR'; Reason: string };

async function ensureCustomer(rail: BaseInvoiceRail, order: OrderRow, provider: IMetadataProvider, user: UserInfo): Promise<CustomerOutcome> {
    const orgID = order.BillToOrganizationID ? RequireUUID(order.BillToOrganizationID, 'BillToOrganizationID') : null;
    const personID = !orgID && order.BillToPersonID ? RequireUUID(order.BillToPersonID, 'BillToPersonID') : null;
    if (!orgID && !personID) return { OK: false, Code: 'ERROR', Reason: `Order ${order.OrderNumber} has no bill-to party; there is nobody to invoice.` };

    const rv = new RunView(provider as unknown as IRunViewProvider);
    const existing = await rv.RunView<{ ExternalCustomerRef: string }>(
        {
            EntityName: EXTERNAL_CUSTOMER_ENTITY,
            ExtraFilter: `PaymentProviderID = '${rail.Config.PaymentProviderID}' AND ${orgID ? `BillToOrganizationID = '${orgID}'` : `BillToPersonID = '${personID}'`}`,
            Fields: ['ExternalCustomerRef'],
            ResultType: 'simple',
        },
        user,
    );
    const known = existing.Results?.[0]?.ExternalCustomerRef;
    if (known) return { OK: true, ExternalCustomerRef: known };

    const facts = await loadPartyFacts(orgID, personID, provider, user);
    if (!facts) return { OK: false, Code: 'ERROR', Reason: `The bill-to party on order ${order.OrderNumber} could not be read.` };

    const created = await rail.EnsureCustomer(facts);
    if (created.Success === false) {
        return { OK: false, Code: /email/i.test(created.Reason) ? 'NO_CUSTOMER_EMAIL' : 'RAIL_REFUSED', Reason: created.Reason };
    }
    const entity = await provider.GetEntityObject<BaseEntity>(EXTERNAL_CUSTOMER_ENTITY, user);
    entity.NewRecord();
    entity.SetMany(
        { PaymentProviderID: rail.Config.PaymentProviderID, BillToOrganizationID: orgID, BillToPersonID: personID, ExternalCustomerRef: created.Value.ExternalCustomerRef, LastSyncedAt: new Date() },
        true,
    );
    if (!(await entity.Save())) {
        // The rail has the customer; losing the mapping only costs a duplicate next time. Log, do not fail the invoice.
        LogError(`ExternalCustomer for ${created.Value.ExternalCustomerRef} could not be saved: ${entity.LatestResult?.CompleteMessage ?? 'unknown'}`);
    }
    return { OK: true, ExternalCustomerRef: created.Value.ExternalCustomerRef };
}

async function loadPartyFacts(orgID: string | null, personID: string | null, provider: IMetadataProvider, user: UserInfo): Promise<RailCustomerFacts | null> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    if (orgID) {
        const r = await rv.RunView<Record<string, unknown>>({ EntityName: ORGANIZATION_ENTITY, ExtraFilter: `ID = '${orgID}'`, ResultType: 'simple' }, user);
        const o = r.Results?.[0];
        if (!o) return null;
        return {
            PartyKind: 'Organization',
            PartyID: orgID,
            Name: String(o.Name ?? o.LegalName ?? 'Customer'),
            Email: (o.Email as string | null) ?? (o.PrimaryEmail as string | null) ?? null,
            AddressLines: [o.PrimaryAddressLine1, o.PrimaryAddressLine2].filter(Boolean).map(String),
            City: (o.PrimaryAddressCity as string | null) ?? null,
            State: (o.PrimaryAddressState as string | null) ?? null,
            PostalCode: (o.PrimaryAddressPostalCode as string | null) ?? null,
            Country: (o.PrimaryAddressCountry as string | null) ?? null,
        };
    }
    const r = await rv.RunView<Record<string, unknown>>({ EntityName: PERSON_ENTITY, ExtraFilter: `ID = '${personID}'`, ResultType: 'simple' }, user);
    const p = r.Results?.[0];
    if (!p) return null;
    return {
        PartyKind: 'Person',
        PartyID: personID!,
        Name: String(p.DisplayName ?? [p.FirstName, p.LastName].filter(Boolean).join(' ') ?? 'Customer'),
        Email: (p.Email as string | null) ?? (p.PrimaryEmail as string | null) ?? null,
        AddressLines: [p.PrimaryAddressLine1, p.PrimaryAddressLine2].filter(Boolean).map(String),
        City: (p.PrimaryAddressCity as string | null) ?? null,
        State: (p.PrimaryAddressState as string | null) ?? null,
        PostalCode: (p.PrimaryAddressPostalCode as string | null) ?? null,
        Country: (p.PrimaryAddressCountry as string | null) ?? null,
    };
}
