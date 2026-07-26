/**
 * payment-builder.ts — construct payments through the ENTITY API.
 *
 * Same reasoning as `order-builder.ts`: `PaymentHeaderEntityServer.Save` is what books the cash leg
 * and `PaymentLineEntityServer.Save` is what guards over-application, so a check that inserted rows
 * directly would test the schema and skip the behaviour it exists to verify.
 */
import { Metadata } from '@memberjunction/core';
import type { BaseEntity, UserInfo } from '@memberjunction/core';

const PAYMENT_HEADER_ENTITY = 'MJ_BizApps_Orders: Payment Headers';
const PAYMENT_LINE_ENTITY = 'MJ_BizApps_Orders: Payment Lines';

/** An entity with untyped field access — the same shape order-builder uses. */
export type LooseEntity = BaseEntity & Record<string, unknown>;

export interface PaymentSpec {
    PaymentNumber: string;
    ReceivingCompanyID: string;
    PaymentTypeID: string;
    Amount: number;
    /** The provider's cut. Booked separately only when a Processing Fee account resolves. */
    ProcessingFeeAmount?: number;
    /** Defaults to `Captured` — the status that books. Pass `Pending` for an unbooked payment. */
    Status?: string;
    PaymentDate?: Date;
    BillToOrganizationID?: string | null;
    BillToPersonID?: string | null;
    PaymentDetailID?: string | null;
}

export interface SavedPayment {
    Payment: LooseEntity;
    Saved: boolean;
    Message: string;
}

/** Create and save a payment. `Captured` books its journal entry on the way through. */
export async function CreatePayment(user: UserInfo, spec: PaymentSpec): Promise<SavedPayment> {
    const md = new Metadata();
    const payment = await md.GetEntityObject<LooseEntity>(PAYMENT_HEADER_ENTITY, user);
    payment.NewRecord();
    payment.PaymentNumber = spec.PaymentNumber;
    payment.ReceivingCompanyID = spec.ReceivingCompanyID;
    payment.PaymentTypeID = spec.PaymentTypeID;
    payment.Amount = spec.Amount;
    payment.ProcessingFeeAmount = spec.ProcessingFeeAmount ?? 0;
    payment.PaymentDate = spec.PaymentDate ?? new Date();
    payment.Status = spec.Status ?? 'Captured';
    if (spec.BillToOrganizationID) payment.BillToOrganizationID = spec.BillToOrganizationID;
    if (spec.BillToPersonID) payment.BillToPersonID = spec.BillToPersonID;
    if (spec.PaymentDetailID) payment.PaymentDetailID = spec.PaymentDetailID;

    const saved = await payment.Save();
    return {
        Payment: payment,
        Saved: saved,
        Message: (payment.LatestResult?.CompleteMessage as string) ?? '',
    };
}

/**
 * Apply (or, with a negative amount, un-apply) part of a payment to an order.
 * Returns `Saved: false` with the reason when the guard refuses it — that is a normal outcome the
 * caller asserts on, not an exception.
 */
export async function ApplyPayment(
    user: UserInfo,
    paymentID: string,
    orderID: string,
    amount: number,
): Promise<{ Line: LooseEntity; Saved: boolean; Message: string }> {
    const md = new Metadata();
    const line = await md.GetEntityObject<LooseEntity>(PAYMENT_LINE_ENTITY, user);
    line.NewRecord();
    line.PaymentHeaderID = paymentID;
    line.OrderHeaderID = orderID;
    line.Amount = amount;
    line.AllocatedAt = new Date();
    line.AllocatedByUserID = user?.ID ?? null;

    const saved = await line.Save();
    return { Line: line, Saved: saved, Message: (line.LatestResult?.CompleteMessage as string) ?? '' };
}
