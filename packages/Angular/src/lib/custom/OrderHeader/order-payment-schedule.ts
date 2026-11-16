/**
 * @fileoverview What the order form's Payment tab says about when this order raises AR.
 *
 * An order with a payment schedule raises Accounts Receivable one instalment at a time, when each
 * instalment is invoiced; an order without one raises the whole order value when it is confirmed.
 * The journals only show AR that has already been raised, so without these lines a reader cannot
 * tell from the order which of the two is happening, or when the next increase comes.
 *
 * Pure functions over the row fields, so the wording is testable without Angular or a database.
 *
 * @module @mj-biz-apps/orders-ng
 */

import type { mjBizAppsOrdersOrderHeaderPaymentScheduleEntity } from '@mj-biz-apps/orders-entities';
import { FormatInstantDate } from '../../panels/money-format';

/** The schedule row fields the AR column reads. */
export type InstalmentARFacts = Pick<mjBizAppsOrdersOrderHeaderPaymentScheduleEntity, 'Status' | 'InvoicedAt' | 'JournalEntryID'>;

/**
 * The note shown when the order has no schedule rows.
 *
 * @param booked Whether the order has been confirmed (its value entry already posted).
 */
export function NoScheduleARNote(booked: boolean): string {
    return booked
        ? 'No payment schedule: the full order value was raised to AR when the order was confirmed.'
        : 'No payment schedule: confirming raises the full order value to AR.';
}

/**
 * When one instalment raises AR.
 *
 * A row with a journal entry has been invoiced, and that entry is the AR increase. A `Scheduled`
 * row raises AR when it is invoiced. A row canceled before invoicing never raises any.
 */
export function InstalmentARLabel(row: InstalmentARFacts): string {
    if (row.JournalEntryID) return row.InvoicedAt ? `Raised ${FormatInstantDate(row.InvoicedAt)}` : 'Raised';
    if (row.Status === 'Scheduled') return 'When invoiced';
    return 'Not raised';
}
