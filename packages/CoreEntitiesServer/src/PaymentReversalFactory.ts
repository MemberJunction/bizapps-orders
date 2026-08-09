/**
 * Building the payment that takes money back out — the one way, used by both callers.
 *
 * TWO THINGS REVERSE A PAYMENT, and until bank debits arrived only one of them existed:
 *
 *   `Orders.RefundPayment`   somebody DECIDED to give the money back
 *   `PaymentSettlement`      the BANK took it back, days after we booked it as received
 *
 * They differ entirely in why they happen and not at all in what they must write. Both produce a new
 * `PaymentHeader` with `Status='Refunded'` and `ReversesPaymentHeaderID` pointing at the original,
 * carrying negative `PaymentLine`s that un-apply the cash from the orders the original settled. That
 * shape is not incidental — `Status='Refunded'` is precisely what makes `PaymentHeaderEntityServer`
 * book the MIRROR of the capture entry (D53), and the negative lines are what move each order's
 * `Balance` back up. A second implementation that got any part of it subtly different would produce a
 * reversal that balances, posts, and is wrong, which is the failure mode nothing downstream catches.
 *
 * SO THE MECHANICS LIVE HERE AND THE POLICY LIVES IN THE CALLERS. Whether a refund is allowed, how
 * much is still refundable, whether a returned debit should reverse at all — those are decisions, and
 * they stay with whoever is making them. This module only knows how to write the reversal once the
 * decision is made.
 *
 * WHY `.Set()` AND `BaseEntity` RATHER THAN A TYPED SUBCLASS. `PaymentHeader`'s `Lines` collection is
 * transient — CodeGen cannot emit it, so the generated entity has no property for it — and the whole
 * point of this factory is to hand the header its lines before the single co-ordinated save. That is
 * the same reason `RefundPaymentOperation` and `CapturePaymentOperation` work this way.
 *
 * CONNECTS TO:
 *   CALLERS: ./RefundPaymentOperation.ts · ./PaymentSettlement.ts
 *   BOOKING: ./PaymentHeaderEntityServer.ts — the reversal books through the ordinary save path
 *   DOC:     plans/bizapps-orders-master.md D17, D39, D53, D68
 */
import {
    BaseEntity,
    CompositeKey,
    RunView,
    type IMetadataProvider,
    type IRunViewProvider,
    type UserInfo,
} from '@memberjunction/core';
import {
    mjBizAppsOrdersPaymentDetailEntity,
    mjBizAppsOrdersPaymentLineEntity,
} from '@mj-biz-apps/orders-entities';
import type { PaymentHeaderEntityServer } from './PaymentHeaderEntityServer.js';

const PAYMENT_HEADER_ENTITY = 'MJ_BizApps_Orders: Payment Headers';
const PAYMENT_LINE_ENTITY = 'MJ_BizApps_Orders: Payment Lines';
const PAYMENT_DETAIL_ENTITY = 'MJ_BizApps_Orders: Payment Details';

const money = (v: number): number => Math.round((v + Number.EPSILON) * 100) / 100;

/** The fields of the original payment a reversal has to carry forward. */
export interface ReversiblePayment {
    ID: string;
    PaymentNumber: string;
    ReceivingCompanyID: string;
    BillToOrganizationID: string | null;
    BillToPersonID: string | null;
    PaymentTypeID: string;
    PaymentDetailID: string | null;
}

/** One order the original payment was applied to, and by how much. */
export interface AppliedAllocation {
    OrderHeaderID: string;
    Amount: number;
}

/** Why this reversal is being written, and what to stamp on it. */
export interface PaymentReversalRequest {
    /** Positive magnitude, as `Amount` is stored on both a capture and a reversal. */
    Amount: number;
    Reason: string | null;
    /** The gateway's own refund/return id, when the money moved through one. */
    ProviderRefundID?: string | null;
    /** Defaults to `Refund of {original}`. Settlement overrides it to name the return. */
    Description?: string;
}

export interface PaymentReversalResult {
    ID: string;
    Number: string;
    JournalEntryID?: string;
}

/**
 * The orders a captured payment settled, and by how much.
 *
 * Only POSITIVE lines: a payment that has already been partly reversed carries negative lines too, and
 * counting them would shrink the base a further reversal is spread across.
 */
export async function LoadAppliedAllocations(
    provider: IMetadataProvider,
    user: UserInfo,
    paymentID: string,
): Promise<AppliedAllocation[]> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const result = await rv.RunView<AppliedAllocation>(
        {
            EntityName: PAYMENT_LINE_ENTITY,
            ExtraFilter: `PaymentHeaderID='${paymentID}'`,
            Fields: ['OrderHeaderID', 'Amount'],
            ResultType: 'simple',
            // The lines may have been written moments ago by the capture this is reversing, and a
            // cached read that missed them would spread the reversal across too few orders.
            BypassCache: true,
        },
        user,
    );
    return (result?.Results ?? []).filter((r) => Number(r.Amount) > 0);
}

/**
 * Un-apply the reversed cash from the orders the original settled.
 *
 * PROPORTIONAL, so a payment split across three orders reverses across the same three rather than
 * dumping the whole thing on whichever happened to be first — which would leave two orders looking
 * paid and one looking wildly overdue. The final line absorbs the rounding remainder so the un-applied
 * total is exact rather than a penny short, which the allocation invariant would reject.
 */
export async function BuildUnapplyLines(
    provider: IMetadataProvider,
    user: UserInfo,
    applications: AppliedAllocation[],
    reversalAmount: number,
): Promise<mjBizAppsOrdersPaymentLineEntity[]> {
    const built: mjBizAppsOrdersPaymentLineEntity[] = [];
    const appliedTotal = applications.reduce((s, a) => s + Number(a.Amount), 0);
    if (appliedTotal <= 0) return built;

    let allocated = 0;
    for (let i = 0; i < applications.length; i++) {
        const app = applications[i];
        const isLast = i === applications.length - 1;
        const share = isLast
            ? money(reversalAmount - allocated)
            : money((Number(app.Amount) / appliedTotal) * reversalAmount);
        allocated = money(allocated + share);
        if (share <= 0) continue;

        const line = await provider.GetEntityObject<mjBizAppsOrdersPaymentLineEntity>(PAYMENT_LINE_ENTITY, user);
        line.NewRecord();
        line.OrderHeaderID = app.OrderHeaderID;
        // NEGATIVE: this removes cash from the order, which is what moves Balance back up.
        line.Amount = -share;
        line.AllocatedAt = new Date();
        line.AllocatedByUserID = user?.ID ?? null;
        built.push(line);
    }
    return built;
}

/**
 * A fresh instrument snapshot for the reversal, never the original's row (D39).
 *
 * `PaymentDetail` is a point-in-time record of the instrument as it was. Sharing one row between the
 * capture and its reversal would mean editing either rewrites the other's history.
 */
export async function CopyPaymentDetail(
    provider: IMetadataProvider,
    user: UserInfo,
    sourceID: string,
): Promise<string> {
    const source = await provider.GetEntityObject<mjBizAppsOrdersPaymentDetailEntity>(
        PAYMENT_DETAIL_ENTITY,
        CompositeKey.FromID(sourceID),
        user,
    );
    const copy = await provider.GetEntityObject<mjBizAppsOrdersPaymentDetailEntity>(PAYMENT_DETAIL_ENTITY, user);
    copy.NewRecord();
    // `CopyFrom` skips primary keys by default, which is the only exclusion this needs: the
    // `__mj_*` columns the hand-rolled loop also skipped are ReadOnly and are not parameters of
    // spCreatePaymentDetail, so copying them cannot reach the insert.
    copy.CopyFrom(source);
    if (!(await copy.Save())) {
        throw new Error(
            `Failed to copy the payment instrument: ${copy.LatestResult?.CompleteMessage ?? 'unknown error'}`,
        );
    }
    return copy.ID;
}

/**
 * The next number in the shared payment series.
 *
 * The SAME counter the capture path uses, so a reversal sits in the same series as everything else
 * rather than in a parallel one nobody thinks to search.
 */
export async function NextPaymentNumber(provider: IMetadataProvider): Promise<string> {
    const db = provider as unknown as { ExecuteSQL(sql: string): Promise<unknown> };
    const rows = (await db.ExecuteSQL(`
        DECLARE @seq TABLE (Seq INT);
        UPDATE __mj_BizAppsOrders.PaymentSequence WITH (UPDLOCK, HOLDLOCK)
        SET NextSequenceNumber = NextSequenceNumber + 1
        OUTPUT deleted.NextSequenceNumber INTO @seq(Seq)
        WHERE ID = 1;
        SELECT Seq FROM @seq;`)) as Array<{ Seq: number }>;

    const seq = rows?.[0]?.Seq;
    if (!seq) {
        throw new Error('Could not obtain the next payment number — PaymentSequence (ID=1) is missing.');
    }
    return `PAY-${String(seq).padStart(6, '0')}`;
}

/**
 * Write the reversing payment, header and un-apply lines in ONE save.
 *
 * ONE SAVE IS THE REQUIREMENT, not an optimisation. `PaymentHeaderEntityServer` checks the allocation
 * invariant across the header and its lines together (D68) and books the mirrored entries as the lines
 * go down. Saving the header first would present a reversal for the full amount with no allocations
 * against it — which the invariant correctly rejects — and any failure between the two steps would
 * leave that state in the database permanently.
 *
 * THE FEE IS NOT MIRRORED. A processor does not hand its cut back when a payment reverses, so a
 * reversal that carried the original's fee would credit back money nobody received.
 */
export async function CreateReversingPayment(
    provider: IMetadataProvider,
    user: UserInfo,
    original: ReversiblePayment,
    request: PaymentReversalRequest,
    lines: mjBizAppsOrdersPaymentLineEntity[],
): Promise<PaymentReversalResult> {
    const reversal = await provider.GetEntityObject<PaymentHeaderEntityServer>(PAYMENT_HEADER_ENTITY, user);
    reversal.NewRecord();
    reversal.PaymentNumber = await NextPaymentNumber(provider);
    reversal.ReceivingCompanyID = original.ReceivingCompanyID;
    reversal.BillToOrganizationID = original.BillToOrganizationID;
    reversal.BillToPersonID = original.BillToPersonID;
    reversal.PaymentDate = new Date();
    reversal.PaymentTypeID = original.PaymentTypeID;
    reversal.Amount = request.Amount;
    reversal.ProcessingFeeAmount = 0;
    reversal.ReversesPaymentHeaderID = original.ID;
    reversal.ReversalReason = request.Reason ?? null;
    reversal.ProviderRefundID = request.ProviderRefundID ?? null;
    reversal.Status = 'Refunded';
    reversal.Description = request.Description ?? `Refund of ${original.PaymentNumber}`;

    if (original.PaymentDetailID) {
        reversal.PaymentDetailID = await CopyPaymentDetail(provider, user, original.PaymentDetailID);
    }

    // Attached, not assigned — the collection stamps PaymentHeaderID.
    for (const line of lines) reversal.Lines.Add(line);

    if (!(await reversal.Save())) {
        throw new Error(
            `Failed to create the reversal of ${original.PaymentNumber}: ` +
                `${reversal.LatestResult?.CompleteMessage ?? 'unknown error'}`,
        );
    }

    return {
        ID: reversal.ID,
        Number: reversal.PaymentNumber,
        JournalEntryID: reversal.JournalEntryID ?? undefined,
    };
}
