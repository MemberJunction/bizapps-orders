/**
 * A payment's date, and correcting it (bc-aidp-next-golive#448).
 *
 * A wire that arrived on 30 October and was entered on 2 November carried the day it was entered,
 * and its cash entry took that date, so a batch posted on 30 October left it out. Two corrections:
 *
 *   - At entry: an order's initial payment takes its "received on" day when one is given, and the
 *     order's date otherwise (`InitialPaymentDay`).
 *   - After the fact: finance changes a captured payment's date. The payment's journal entries move
 *     with it, through accounting's `Accounting.RedatePendingJournalEntries`, which refuses once any
 *     of them is batched. Changing the date needs the authorization that operation checks.
 *
 * Shared by the server (the authority) and the screens (which only decide what shows).
 */
import type { AuthorizationInfo, BaseEntity, IMetadataProvider, UserInfo } from '@memberjunction/core';
import { AsDateValue, ToISODate } from './date-cell';
import { UserHasAuthorization } from './pricing/priceOverride';

/**
 * Who may change a captured payment's date: the holders of accounting's batch-operator
 * Authorization (the Finance role), the one `Accounting.RedatePendingJournalEntries` requires.
 */
export const PAYMENT_DATE_CHANGE_AUTH = 'MJ.BizApps.Accounting.JournalEntryBatches.Operate';

/** Payment statuses that have journal entries behind them (trigger 51005 freezes the rest of their money). */
export const PAYMENT_STATUSES_WITH_ENTRIES: ReadonlySet<string> = new Set(['Captured', 'Refunded', 'Disputed']);

/** True when `user` may change a captured payment's date. Fails closed. */
export function UserCanChangePaymentDate(
    user: UserInfo | null | undefined,
    provider?: IMetadataProvider | { Authorizations?: AuthorizationInfo[] },
): boolean {
    return UserHasAuthorization(PAYMENT_DATE_CHANGE_AUTH, user, provider);
}

/**
 * True when this save moves a saved payment that has journal entries to another day — the change
 * whose entries must move with it. Judged by the status the row was saved with, so the capture
 * itself (Pending to Captured) is not a correction.
 */
export function IsPaymentDateCorrection(payment: BaseEntity): boolean {
    if (!payment.IsSaved) return false;
    const status = payment.GetFieldByName('Status');
    const date = payment.GetFieldByName('PaymentDate');
    if (!status || !date?.Dirty) return false;
    const savedStatus = String(status.OldValue ?? '');
    return PAYMENT_STATUSES_WITH_ENTRIES.has(savedStatus) && ToISODate(date.OldValue) !== ToISODate(date.Value);
}

/**
 * Why this save may not correct the payment's date, or null when it may (or is not a correction).
 * The server refuses the save with it; accounting checks the same authorization again.
 */
export function PaymentDateCorrectionRefusal(
    payment: BaseEntity,
    user: UserInfo | null | undefined,
    provider?: IMetadataProvider | { Authorizations?: AuthorizationInfo[] },
): string | null {
    if (!IsPaymentDateCorrection(payment) || UserCanChangePaymentDate(user, provider)) return null;
    return `Changing the date of a captured payment requires the ${PAYMENT_DATE_CHANGE_AUTH} authorization (the Finance role).`;
}

/**
 * The day an order's initial payment is dated: the day finance says the money arrived, or the
 * order's own day when none is given (g448.2). Null when neither names a day; the caller falls back
 * to today's business day.
 */
export function InitialPaymentDay(orderDate: unknown, receivedDate: unknown): Date | null {
    return AsDateValue(receivedDate) ?? AsDateValue(orderDate);
}
