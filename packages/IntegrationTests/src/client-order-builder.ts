/**
 * Client-side order / payment construction over GraphQLDataProvider.
 *
 * Confirm is Status = 'Confirmed' + Save() — the graph crosses the wire as MJ.SaveEntityGraph
 * and the server subclass books. No Fx(), no *EntityServer, no @mj-biz-apps/orders-server.
 */
import { FieldValueCollection, Metadata, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import {
    OrderHeaderEntity,
    mjBizAppsOrdersEventOrderLineEntity,
    mjBizAppsOrdersOrderLineEntity,
    mjBizAppsOrdersPaymentDetailEntity,
    mjBizAppsOrdersPaymentHeaderEntity,
    mjBizAppsOrdersPaymentLineEntity,
} from '@mj-biz-apps/orders-entities';
import {
    EVENT_ORDER_LINE_ENTITY,
    ORDER_HEADER_ENTITY,
    ORDER_LINE_ENTITY,
    PAYMENT_DETAIL_ENTITY,
    PAYMENT_HEADER_ENTITY,
    PAYMENT_LINE_ENTITY,
} from './entity-names.js';
import { ClientWorldState, type ClientPaymentType } from './client-world.js';

export interface ClientLineSpec {
    ProductID: string;
    Quantity: number;
    UnitPrice?: number;
    ShipToOrganizationID?: string;
    ShipToPersonID?: string;
    ShipToAddressID?: string;
    ServicePeriodStart?: string;
    ServicePeriodEnd?: string;
    /** After confirm, persist an Event Order Line with this PersonID. */
    EventPersonID?: string;
}

export interface ClientOrderSpec {
    CompanyID: string;
    Notes: string;
    Description?: string;
    Lines: ClientLineSpec[];
    OrderDate?: Date;
    BillToOrganizationID?: string;
    BillToPersonID?: string;
    ShipToOrganizationID?: string;
    ShipToPersonID?: string;
    ShipToAddressID?: string;
    InitialPaymentTypeID?: string;
    InitialPaymentAmount?: number;
    InitialPaymentReference?: string;
}

export interface ClientBuiltOrder {
    Order: OrderHeaderEntity;
    Lines: mjBizAppsOrdersOrderLineEntity[];
}

export interface ClientConfirmResult extends ClientBuiltOrder {
    Saved: boolean;
    Message: string;
}

export async function BuildClientOrder(
    user: UserInfo,
    spec: ClientOrderSpec,
    provider?: IMetadataProvider,
): Promise<ClientBuiltOrder> {
    const md = provider ?? new Metadata();
    const order = await md.GetEntityObject<OrderHeaderEntity>(ORDER_HEADER_ENTITY, user);
    order.NewRecord();
    applyHeader(order, spec);
    const lines = await createLines(md, user, spec.Lines);
    for (const line of lines) {
        order.Lines.Add(line);
    }
    return { Order: order, Lines: lines };
}

export async function ConfirmClientOrder(
    user: UserInfo,
    spec: ClientOrderSpec,
    provider?: IMetadataProvider,
): Promise<ClientConfirmResult> {
    const built = await BuildClientOrder(user, spec, provider);
    built.Order.Status = 'Confirmed';
    const saved = await built.Order.Save();
    const message = built.Order.LatestResult?.CompleteMessage ?? '';
    if (saved) {
        await persistEventAttendees(user, built, spec.Lines, provider);
    }
    return { ...built, Saved: saved, Message: message };
}

export interface ClientPaymentSpec {
    PaymentNumber: string;
    ReceivingCompanyID: string;
    PaymentTypeID: string;
    Amount: number;
    OrderHeaderID: string;
    Notes?: string;
    PaymentDate?: Date;
    BillToOrganizationID?: string;
    BillToPersonID?: string;
    PaymentDetailID?: string;
}

export interface ClientPaymentResult {
    Payment: mjBizAppsOrdersPaymentHeaderEntity;
    Saved: boolean;
    Message: string;
}

export async function CreateClientPayment(
    user: UserInfo,
    spec: ClientPaymentSpec,
    provider?: IMetadataProvider,
): Promise<ClientPaymentResult> {
    const md = provider ?? new Metadata();
    const payment = await md.GetEntityObject<mjBizAppsOrdersPaymentHeaderEntity>(
        PAYMENT_HEADER_ENTITY,
        user,
    );
    payment.NewRecord();
    payment.PaymentNumber = spec.PaymentNumber;
    payment.ReceivingCompanyID = spec.ReceivingCompanyID;
    payment.PaymentTypeID = spec.PaymentTypeID;
    payment.Amount = spec.Amount;
    payment.PaymentDate = spec.PaymentDate ?? new Date();
    payment.Status = 'Captured';
    if (spec.Notes) payment.Notes = spec.Notes;
    if (spec.BillToOrganizationID) payment.BillToOrganizationID = spec.BillToOrganizationID;
    if (spec.BillToPersonID) payment.BillToPersonID = spec.BillToPersonID;
    if (spec.PaymentDetailID) payment.PaymentDetailID = spec.PaymentDetailID;

    const line = await md.GetEntityObject<mjBizAppsOrdersPaymentLineEntity>(PAYMENT_LINE_ENTITY, user);
    line.NewRecord();
    line.OrderHeaderID = spec.OrderHeaderID;
    line.Amount = spec.Amount;
    line.AllocatedAt = new Date();
    line.AllocatedByUserID = user.ID;
    payment.Lines.Add(line);

    const saved = await payment.Save();
    return {
        Payment: payment,
        Saved: saved,
        Message: payment.LatestResult?.CompleteMessage ?? '',
    };
}

export async function CreateReferenceDetail(
    user: UserInfo,
    companyID: string,
    paymentTypeID: string,
    reference: string,
    provider?: IMetadataProvider,
): Promise<string> {
    const md = provider ?? new Metadata();
    const detail = await md.GetEntityObject<mjBizAppsOrdersPaymentDetailEntity>(
        PAYMENT_DETAIL_ENTITY,
        user,
    );
    detail.NewRecord();
    detail.CompanyID = companyID;
    detail.PaymentTypeID = paymentTypeID;
    detail.ReferenceNumber = reference;
    if (!(await detail.Save())) {
        throw new Error(
            `payment instrument save failed: ${detail.LatestResult?.CompleteMessage ?? 'unknown'}`,
        );
    }
    return detail.ID;
}

export function TenderByCode(code: 'Cash' | 'Check' | 'Wire'): ClientPaymentType {
    const tender = ClientWorldState().PaymentTypes[code];
    if (!tender) {
        throw new Error(`Payment Type '${code}' is not in the resolved world`);
    }
    return tender;
}

function applyHeader(order: OrderHeaderEntity, spec: ClientOrderSpec): void {
    order.OrderType = 'Sale';
    order.OrderDate = spec.OrderDate ?? new Date();
    order.Status = 'Draft';
    order.CompanyID = spec.CompanyID;
    order.Notes = spec.Notes;
    if (spec.Description) order.Description = spec.Description;
    if (spec.BillToOrganizationID) order.BillToOrganizationID = spec.BillToOrganizationID;
    if (spec.BillToPersonID) order.BillToPersonID = spec.BillToPersonID;
    if (spec.ShipToOrganizationID) order.ShipToOrganizationID = spec.ShipToOrganizationID;
    if (spec.ShipToPersonID) order.ShipToPersonID = spec.ShipToPersonID;
    if (spec.ShipToAddressID) order.ShipToAddressID = spec.ShipToAddressID;
    if (spec.InitialPaymentTypeID) order.InitialPaymentTypeID = spec.InitialPaymentTypeID;
    if (spec.InitialPaymentAmount != null) order.InitialPaymentAmount = spec.InitialPaymentAmount;
    if (spec.InitialPaymentReference) order.InitialPaymentReference = spec.InitialPaymentReference;
}

async function createLines(
    md: IMetadataProvider | Metadata,
    user: UserInfo,
    specs: ClientLineSpec[],
): Promise<mjBizAppsOrdersOrderLineEntity[]> {
    const lines: mjBizAppsOrdersOrderLineEntity[] = [];
    let lineNumber = 1;
    for (const spec of specs) {
        const line = await md.GetEntityObject<mjBizAppsOrdersOrderLineEntity>(ORDER_LINE_ENTITY, user);
        line.NewRecord();
        line.ProductID = spec.ProductID;
        line.LineNumber = lineNumber++;
        line.Quantity = spec.Quantity;
        if (spec.UnitPrice !== undefined) line.UnitPrice = spec.UnitPrice;
        if (spec.ShipToOrganizationID) line.ShipToOrganizationID = spec.ShipToOrganizationID;
        if (spec.ShipToPersonID) line.ShipToPersonID = spec.ShipToPersonID;
        if (spec.ShipToAddressID) line.ShipToAddressID = spec.ShipToAddressID;
        if (spec.ServicePeriodStart) line.ServicePeriodStart = new Date(spec.ServicePeriodStart);
        if (spec.ServicePeriodEnd) line.ServicePeriodEnd = new Date(spec.ServicePeriodEnd);
        lines.push(line);
    }
    return lines;
}

async function persistEventAttendees(
    user: UserInfo,
    built: ClientBuiltOrder,
    specs: ClientLineSpec[],
    provider?: IMetadataProvider,
): Promise<void> {
    const needed = specs
        .map((spec, index) => ({ spec, line: built.Lines[index] }))
        .filter((row) => !!row.spec.EventPersonID && !!row.line?.ID);
    if (needed.length === 0) return;

    const md = provider ?? new Metadata();
    await built.Order.EnsureLinesLoaded();
    for (const row of needed) {
        await saveEventLine(md, user, row.line.ID, row.spec.EventPersonID!);
    }
}

async function saveEventLine(
    md: IMetadataProvider | Metadata,
    user: UserInfo,
    lineID: string,
    personID: string,
): Promise<void> {
    const ext = await md.GetEntityObject<mjBizAppsOrdersEventOrderLineEntity>(
        EVENT_ORDER_LINE_ENTITY,
        user,
    );
    ext.NewRecord(new FieldValueCollection([{ FieldName: 'ID', Value: lineID }]));
    ext.PersonID = personID;
    if (!(await ext.Save())) {
        throw new Error(
            `Event Order Line save failed for ${lineID}: ${ext.LatestResult?.CompleteMessage ?? 'unknown'}`,
        );
    }
}
