/**
 * Promoting a bank debit into cash — the only place a webhook is allowed to move money.
 *
 * WHY THIS EXISTS AT ALL. `PaymentWebhookHandler` was written deliberately narrow: it records what the
 * gateway said on the `PaymentIntent` and stops there, because a webhook reaching into the ledger
 * would give an unauthenticated endpoint a second path into the books. That was exactly right for
 * cards, where the money has already moved by the time anyone asks and the event only confirms it.
 *
 * A bank debit breaks the assumption underneath it. Nothing has moved when the caller asks; the answer
 * arrives days later, in an event, and there is no other moment at which cash can honestly be booked.
 * So the webhook has to be able to move money — and this module is that capability, kept in one file,
 * reachable only when a driver has declared `SettlesAsynchronously`, and doing exactly three things.
 *
 * IT DOES NOT BOOK ANYTHING ITSELF. That is the part worth being clear about. `Promote` sets a status
 * and saves; `PaymentHeaderEntityServer` notices the transition into `Captured` and books the cash
 * through the same path a card capture uses — including calling back to the driver to ask what
 * actually moved. `Reverse` writes a reversing payment through the same factory `Orders.RefundPayment`
 * uses. Nothing here writes a journal entry, and nothing here knows how one is shaped. The ledger keeps
 * a single author.
 *
 * ORDERING MATTERS, AND IT IS NOT THE OBVIOUS ONE. This runs BEFORE the handler stamps
 * `PaymentIntent.ProviderEventID`, not after. Stamping first would look tidier and would silently
 * strand payments: the stamp is the idempotency key, so an event that was recorded and then failed to
 * settle would be judged `AlreadyApplied` on every retry, and a payment the bank confirmed would sit
 * `Pending` forever with nothing left to move it. Settling first means a failure returns 500 with
 * nothing stamped, the gateway retries, and both steps run again. The re-run is safe because
 * `DecideSettlement` reads the PAYMENT'S state rather than the event's novelty — a promotion that
 * already happened decides `None`.
 *
 * CONNECTS TO:
 *   PURE:    ./PaymentProviderBehavior.ts — DecideSettlement, the decision table
 *   ROUTE:   ./PaymentWebhookHandler.ts — the only caller
 *   WRITES:  ./PaymentHeaderEntityServer.ts (promote) · ./PaymentReversalFactory.ts (reverse)
 *   DOC:     plans/bizapps-orders-master.md D17, D19, D53
 */
import {
    BaseEntity,
    CompositeKey,
    LogError,
    LogStatus,
    RunView,
    type DatabaseProviderBase,
    type IMetadataProvider,
    type IRunViewProvider,
    type UserInfo,
} from '@memberjunction/core';
import { DecideSettlement, type SettlementAction } from './PaymentProviderBehavior.js';
import type { WebhookEvent } from './BasePaymentProvider.js';
import {
    BuildUnapplyLines,
    CreateReversingPayment,
    LoadAppliedAllocations,
    type ReversiblePayment,
} from './PaymentReversalFactory.js';

const PAYMENT_HEADER_ENTITY = 'MJ_BizApps_Orders: Payment Headers';
const PAYMENT_LINE_ENTITY = 'MJ_BizApps_Orders: Payment Lines';

/** The payment a settlement event is about, as far as the decision needs. */
interface SettlingPayment extends ReversiblePayment {
    Status: string;
    Amount: number;
    JournalEntryID: string | null;
}

export interface SettlementOutcome {
    Action: SettlementAction;
    Reason: string;
    /** The payment the event was about, when there was one. */
    PaymentHeaderID?: string;
    /** The reversing payment written, when the action was `Reverse`. */
    ReversalPaymentHeaderID?: string;
}

/**
 * Apply a settlement event to the payment behind its intent.
 *
 * THROWS ON FAULTS, DELIBERATELY. A refusal here is not a business outcome to be reported and
 * forgotten — it means the bank told us something about real money and we failed to record it. The
 * caller turns a throw into a 500 so the gateway asks again, which is the only way that notice is not
 * lost. Decisions that legitimately do nothing (`None`, `Hold`) return normally.
 */
export async function SettlePaymentForEvent(
    event: WebhookEvent,
    paymentIntentID: string,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<SettlementOutcome> {
    const payment = await loadPaymentForIntent(provider, user, paymentIntentID);
    const alreadyReversed = payment ? await hasReversal(provider, user, payment.ID) : false;

    // WHETHER THIS PAYMENT PUT CASH IN THE LEDGER IS A QUESTION ABOUT ITS ALLOCATIONS, NOT ITS HEADER.
    //
    // This read used to be `Boolean(payment.JournalEntryID)`, and that stopped being the same question
    // twice over. The cash leg moved to the allocation (D13), so the header's journal entry is only
    // ever the PROCESSING FEE — and D82 turned the fee entry off for every tender by default. Between
    // them, `JournalEntryID` is now null on essentially every payment that ever books.
    //
    // The decision table reads `HeaderBooked` to choose between reversing a returned debit and holding
    // it for a person ("Captured but carries no journal entry, so what to reverse is unclear"). With
    // the old signal every returned ACH debit took the Hold branch: the cash stayed in the ledger, the
    // order stayed marked paid, and the only outward sign was a settlement waiting on a human who was
    // never told. Asking the allocations restores the question the table was written to ask.
    const booked = payment ? await hasBookedAllocations(provider, user, payment.ID) : false;

    const decision = DecideSettlement({
        EventStatus: event.Status,
        HeaderStatus: payment?.Status,
        HeaderBooked: booked,
        AlreadyReversed: alreadyReversed,
    });

    const base: SettlementOutcome = {
        Action: decision.Action,
        Reason: decision.Reason,
        PaymentHeaderID: payment?.ID,
    };

    switch (decision.Action) {
        case 'Promote':
            await promote(provider, user, payment!, event);
            LogStatus(`Payment ${payment!.PaymentNumber} captured from bank-debit event ${event.EventID}.`);
            return base;

        case 'Fail':
            await markFailed(provider, user, payment!, event);
            LogStatus(
                `Payment ${payment!.PaymentNumber} failed from bank-debit event ${event.EventID}` +
                    `${event.FailureReason ? ` (${event.FailureReason})` : ''}.`,
            );
            return base;

        case 'Reverse': {
            const reversalID = await reverse(provider, user, payment!, event);
            LogStatus(
                `Payment ${payment!.PaymentNumber} was returned by the bank and has been reversed ` +
                    `from event ${event.EventID}.`,
            );
            return { ...base, ReversalPaymentHeaderID: reversalID };
        }

        case 'Hold':
            // LOUD, because nothing else will be. A held event is money whose state we have declined to
            // guess at, and the only thing standing between that and a silent discrepancy is this line.
            LogError(
                `Bank-debit event ${event.EventID} was NOT applied to payment ` +
                    `${payment?.PaymentNumber ?? '(none)'}: ${decision.Reason}. This needs a person.`,
            );
            return base;

        default:
            LogStatus(`Bank-debit event ${event.EventID}: ${decision.Reason}`);
            return base;
    }
}

// ─── Reads ─────────────────────────────────────────────────────────────────────────────────────

async function loadPaymentForIntent(
    provider: IMetadataProvider,
    user: UserInfo,
    paymentIntentID: string,
): Promise<SettlingPayment | null> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const result = await rv.RunView<SettlingPayment>(
        {
            EntityName: PAYMENT_HEADER_ENTITY,
            ExtraFilter: `PaymentIntentID='${paymentIntentID}'`,
            Fields: [
                'ID',
                'PaymentNumber',
                'ReceivingCompanyID',
                'BillToOrganizationID',
                'BillToPersonID',
                'PaymentTypeID',
                'PaymentDetailID',
                'Amount',
                'Status',
                'JournalEntryID',
            ],
            ResultType: 'simple',
            // The status is the whole decision, and it may have been written by the previous delivery
            // of a related event moments ago. A cached read here re-promotes an already-captured
            // payment or reverses one twice.
            BypassCache: true,
        },
        user,
    );
    return result?.Results?.[0] ?? null;
}

/**
 * True when any of this payment's allocations has booked — i.e. the cash is in the ledger.
 *
 * `PaymentLine.BookedAt` is the allocation's own idempotency key, set in the same transaction that
 * writes its journal entry, so it is the authority on whether the money exists. Reading one booked
 * row is enough: allocations book together with the capture.
 *
 * `BypassCache` for the same reason the header read has it — the promotion that booked these lines
 * may have happened moments ago, on a previous delivery of a related event.
 */
async function hasBookedAllocations(
    provider: IMetadataProvider,
    user: UserInfo,
    paymentID: string,
): Promise<boolean> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const result = await rv.RunView<{ ID: string }>(
        {
            EntityName: PAYMENT_LINE_ENTITY,
            ExtraFilter: `PaymentHeaderID='${paymentID}' AND BookedAt IS NOT NULL`,
            Fields: ['ID'],
            MaxRows: 1,
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    return (result?.Results?.length ?? 0) > 0;
}

/** True when a reversing payment already points at this one. */
async function hasReversal(provider: IMetadataProvider, user: UserInfo, paymentID: string): Promise<boolean> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const result = await rv.RunView<{ ID: string }>(
        {
            EntityName: PAYMENT_HEADER_ENTITY,
            ExtraFilter: `ReversesPaymentHeaderID='${paymentID}' AND Status='Refunded'`,
            Fields: ['ID'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    return (result?.Results?.length ?? 0) > 0;
}

// ─── Writes ────────────────────────────────────────────────────────────────────────────────────

/**
 * Pending → Captured, which is what books the cash.
 *
 * NOTHING IS SET BUT THE STATUS. `PaymentHeaderEntityServer` calls the driver on this transition to
 * ask what actually moved, and overwrites `Amount`, `ProcessingFeeAmount` and `NetAmount` from the
 * answer. Setting them from the webhook payload here would put our reading of the event in a race with
 * the gateway's own record of the charge — and the gateway wins that argument every time, so writing
 * ours would be work whose only possible outcome is being overwritten or being wrong.
 */
async function promote(
    provider: IMetadataProvider,
    user: UserInfo,
    payment: SettlingPayment,
    event: WebhookEvent,
): Promise<void> {
    const header = await provider.GetEntityObject<BaseEntity>(
        PAYMENT_HEADER_ENTITY,
        CompositeKey.FromID(payment.ID),
        user,
    );
    header.Set('Status', 'Captured');

    if (!(await header.Save())) {
        throw new Error(
            `Could not capture payment ${payment.PaymentNumber} from event ${event.EventID}: ` +
                `${header.LatestResult?.CompleteMessage ?? 'unknown error'}`,
        );
    }
}

/**
 * Pending → Failed. Nothing was booked, so nothing needs reversing.
 *
 * The bank's own words go on `Notes` rather than `ReversalReason` — that column belongs to reversals,
 * and a failed payment did not reverse anything. Appending rather than replacing keeps whatever a
 * person had already written there.
 */
async function markFailed(
    provider: IMetadataProvider,
    user: UserInfo,
    payment: SettlingPayment,
    event: WebhookEvent,
): Promise<void> {
    const header = await provider.GetEntityObject<BaseEntity>(
        PAYMENT_HEADER_ENTITY,
        CompositeKey.FromID(payment.ID),
        user,
    );
    header.Set('Status', 'Failed');

    if (event.FailureReason) {
        const existing = (header.Get('Notes') as string | null) ?? '';
        const note = `Bank debit did not clear: ${event.FailureReason}`;
        header.Set('Notes', existing ? `${existing}\n${note}` : note);
    }

    if (!(await header.Save())) {
        throw new Error(
            `Could not mark payment ${payment.PaymentNumber} as failed from event ${event.EventID}: ` +
                `${header.LatestResult?.CompleteMessage ?? 'unknown error'}`,
        );
    }
}

/**
 * Captured → reversed by a new payment, because the bank took the money back.
 *
 * THE FULL AMOUNT, ALWAYS. A return is not a partial refund — the bank does not return part of a
 * debit — so the reversal mirrors what was booked rather than anything on the event. Reading the
 * amount off the event would be worse than useless here: a `charge.failed` payload reports the
 * charge's amount, which is the same number when all is well and a silent under-reversal when it is
 * not.
 */
async function reverse(
    provider: IMetadataProvider,
    user: UserInfo,
    payment: SettlingPayment,
    event: WebhookEvent,
): Promise<string> {
    const applications = await LoadAppliedAllocations(provider, user, payment.ID);
    if (!applications.length) {
        throw new Error(
            `Payment ${payment.PaymentNumber} was returned by the bank but is not applied to any order, ` +
                `so there is nothing to un-apply. This should be impossible for a captured payment.`,
        );
    }

    const amount = Math.round(Math.abs(Number(payment.Amount ?? 0)) * 100) / 100;
    const reason = event.FailureReason
        ? `Bank debit returned: ${event.FailureReason}`
        : 'Bank debit returned by the customer’s bank';

    const dbProvider = provider as unknown as DatabaseProviderBase;
    await dbProvider.BeginTransaction();
    try {
        const lines = await BuildUnapplyLines(provider, user, applications, amount);
        const reversal = await CreateReversingPayment(
            provider,
            user,
            payment,
            {
                Amount: amount,
                Reason: reason,
                ProviderRefundID: event.ProviderChargeID ?? null,
                Description: `Return of ${payment.PaymentNumber}`,
            },
            lines,
        );
        await dbProvider.CommitTransaction();
        return reversal.ID;
    } catch (err) {
        try {
            await dbProvider.RollbackTransaction();
        } catch (rollbackErr) {
            LogError(`Rollback failed after a bank-debit reversal error: ${rollbackErr}`);
        }
        throw err;
    }
}
