/**
 * payment-builder.ts — construct payments through the ENTITY API.
 *
 * Same reasoning as `order-builder.ts`: `PaymentHeaderEntityServer.Save` is what enforces the
 * allocation invariant and `PaymentLineEntityServer.Save` is what books the cash leg, so a check
 * that inserted rows directly would test the schema and skip the behaviour it exists to verify.
 *
 * ── WHY THIS FILE CHANGED SHAPE (D68) ─────────────────────────────────────────────────────────
 * It used to expose `CreatePayment` and `ApplyPayment` as independent steps, mirroring the old
 * capture-then-allocate flow. That flow no longer exists: a captured payment's `Amount` must equal
 * the sum of its lines, so a payment and its allocations are ONE unit of work. Capturing first and
 * allocating afterwards would pass through a state the invariant forbids.
 *
 * `CreatePayment` therefore takes its allocations up front. `ApplyPayment` survives for `Pending`
 * payments — the draft state where a payment may legitimately sit half-allocated — and for the
 * un-apply path against an already-captured payment.
 */
import { Metadata } from '@memberjunction/core';
import type { BaseEntity, UserInfo } from '@memberjunction/core';
import type {
    mjBizAppsOrdersPaymentHeaderEntity,
    mjBizAppsOrdersPaymentLineEntity,
} from '@mj-biz-apps/orders-entities';
import type { PaymentHeaderEntityServer } from '@mj-biz-apps/orders-core-entities-server';

const PAYMENT_HEADER_ENTITY = 'MJ_BizApps_Orders: Payment Headers';
const PAYMENT_LINE_ENTITY = 'MJ_BizApps_Orders: Payment Lines';

/** An entity with untyped field access — the same shape order-builder uses. */

/** One allocation to write with the payment. */
export interface AllocationSpec {
    OrderHeaderID: string;
    Amount: number;
    /** Optional line-level targeting — supported by the schema, used by the split-payment checks. */
    OrderLineID?: string | null;
}

export interface PaymentSpec {
    PaymentNumber: string;
    ReceivingCompanyID: string;
    PaymentTypeID: string;
    Amount: number;
    /** The provider's cut. Booked separately only when a Processing Fee account resolves. */
    ProcessingFeeAmount?: number;
    /** Defaults to `Captured` — the status that books. Pass `Pending` for an unbooked draft. */
    Status?: mjBizAppsOrdersPaymentHeaderEntity['Status'];
    PaymentDate?: Date;
    BillToOrganizationID?: string | null;
    BillToPersonID?: string | null;
    PaymentDetailID?: string | null;
    /**
     * The configured gateway account this payment is collected through (D19/D37). Optional, and that
     * matters: a back-office correction, an account-credit transfer or a historical import has none,
     * and the capture path skips the driver entirely rather than refusing.
     */
    PaymentProviderID?: string | null;
    /** OUR PaymentIntent row. The gateway's own string lives on it, not on the header. */
    PaymentIntentID?: string | null;
    /**
     * The allocations. Required for a `Captured` payment — its Amount must equal their sum (D68).
     * A `Pending` payment may omit them and add them later, exactly as a Draft order may have no
     * lines yet.
     */
    Allocations?: AllocationSpec[];
}

export interface SavedPayment {
    Payment: PaymentHeaderEntityServer;
    Saved: boolean;
    Message: string;
}

/**
 * Create a payment together with its allocations, in one transaction.
 *
 * `Captured` books the cash leg for every allocation on the way through — one journal entry per
 * company owning a line on the settled order, plus the intercompany legs when more than one does.
 */
export async function CreatePayment(user: UserInfo, spec: PaymentSpec): Promise<SavedPayment> {
    const md = new Metadata();
    const payment = await md.GetEntityObject<PaymentHeaderEntityServer>(PAYMENT_HEADER_ENTITY, user);
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
    if (spec.PaymentProviderID) payment.PaymentProviderID = spec.PaymentProviderID;
    if (spec.PaymentIntentID) payment.PaymentIntentID = spec.PaymentIntentID;

    const lines: mjBizAppsOrdersPaymentLineEntity[] = [];
    for (const alloc of spec.Allocations ?? []) {
        const line = await md.GetEntityObject<mjBizAppsOrdersPaymentLineEntity>(PAYMENT_LINE_ENTITY, user);
        line.NewRecord();
        line.OrderHeaderID = alloc.OrderHeaderID;
        line.Amount = alloc.Amount;
        if (alloc.OrderLineID) line.OrderLineID = alloc.OrderLineID;
        line.AllocatedAt = new Date();
        line.AllocatedByUserID = user?.ID ?? null;
        lines.push(line);
    }
    payment.Lines = lines;

    const saved = await payment.Save();
    return {
        Payment: payment,
        Saved: saved,
        Message: payment.LatestResult?.CompleteMessage ?? '',
    };
}

/**
 * Add a single allocation to an EXISTING payment.
 *
 * Legitimate for a `Pending` payment (still a draft), and for negative amounts against a captured
 * one (un-applying). Returns `Saved: false` with the reason when a guard refuses it — that is a
 * normal outcome the caller asserts on, not an exception.
 */
export async function ApplyPayment(
    user: UserInfo,
    paymentID: string,
    orderID: string,
    amount: number,
    orderLineID?: string | null,
): Promise<{ Line: mjBizAppsOrdersPaymentLineEntity; Saved: boolean; Message: string }> {
    const md = new Metadata();
    const line = await md.GetEntityObject<mjBizAppsOrdersPaymentLineEntity>(PAYMENT_LINE_ENTITY, user);
    line.NewRecord();
    line.PaymentHeaderID = paymentID;
    line.OrderHeaderID = orderID;
    line.Amount = amount;
    if (orderLineID) line.OrderLineID = orderLineID;
    line.AllocatedAt = new Date();
    line.AllocatedByUserID = user?.ID ?? null;

    const saved = await line.Save();
    return { Line: line, Saved: saved, Message: line.LatestResult?.CompleteMessage ?? '' };
}

/**
 * Capture a `Pending` payment that already carries its allocations.
 *
 * The two-step draft path: create Pending, allocate, then capture. The invariant is checked at this
 * transition, so this is where a half-allocated payment is refused.
 */
export async function CapturePayment(
    user: UserInfo,
    paymentID: string,
): Promise<{ Payment: PaymentHeaderEntityServer; Saved: boolean; Message: string }> {
    const md = new Metadata();
    const payment = await md.GetEntityObject<PaymentHeaderEntityServer>(PAYMENT_HEADER_ENTITY, user);
    await payment.Load(paymentID);
    payment.Status = 'Captured';
    const saved = await payment.Save();
    return { Payment: payment, Saved: saved, Message: payment.LatestResult?.CompleteMessage ?? '' };
}
