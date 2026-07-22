/**
 * orderBooking — the shared server-side booking step for the Confirm UNIT OF WORK (F1.2b).
 *
 * `queueOrderBooking` books an order's PER-LINE journal entries (MOD-15, Amith 2026-07-21) via the
 * `OrderJournalEntryFactory` — one JE per order line, each queued onto a TransactionGroup the CALLER
 * owns (accounting's `QueueJournalEntries` seam: validate + queue, NO Submit), with each line's
 * `OrderLine.JournalEntryID` stamped onto the same TG. It then stamps the ORDER's booked fields IN
 * MEMORY (`Status='Posted'`, `ConfirmedAt`, `PostedAt`) — the Order carries NO JournalEntryID (its
 * "journal entry" is the aggregate of its lines' JEs). It does NOT save the order row and does NOT
 * submit the TG. The caller (the `Orders.ConfirmOrder` op, or `OrderEntityServer.Save`) queues the
 * order-row save onto the SAME TG and submits ONCE, so the order row + every line JE + every line
 * stamp commit atomically — all or nothing (Amith's transaction rule).
 *
 * Sharing this one step is what makes both confirm entry points (the remotable op AND a direct order
 * Save) compose the identical, single-transaction unit of work.
 *
 * CONNECTS TO:
 *   FACTORY:  ./OrderJournalEntryFactory (per-line JE creation + OrderLine.JournalEntryID stamps)
 *   ENGINE:   ./OrdersEngine (NetDaysForTerms, RequiresFulfillment)
 *   CALLERS:  ./ConfirmOrderOperation · ./OrderEntityServer
 */
import { IMetadataProvider, RunView, UserInfo } from '@memberjunction/core';
import { deriveDueDate } from '@mj-biz-apps/orders-engine-base';
import type {
  mjBizAppsOrdersOrderEntity,
  mjBizAppsOrdersOrderLineEntity,
} from '@mj-biz-apps/orders-entities';
import { OrderJournalEntryFactory } from './OrderJournalEntryFactory.js';
import { OrdersEngine } from './OrdersEngine.js';

const ORDER_LINE_ENTITY = 'MJ_BizApps_Orders: Order Lines';

/** Outcome of queuing an order's booking onto a caller-owned TransactionGroup. */
export interface OrderBookingResult {
  Success: boolean;
  /** The per-line JE IDs queued (available pre-Submit) — line lineage lives on OrderLine.JournalEntryID. */
  JournalEntryIDs: string[];
  /** Resolution/validation errors that blocked booking (nothing queued when present). */
  Errors: string[];
}

/** Load an order's lines (entity objects), ordered by LineNumber. */
export async function loadOrderLines(
  orderID: string,
  user: UserInfo | undefined,
): Promise<mjBizAppsOrdersOrderLineEntity[]> {
  const rv = new RunView();
  const res = await rv.RunView<mjBizAppsOrdersOrderLineEntity>(
    { EntityName: ORDER_LINE_ENTITY, ExtraFilter: `OrderID='${orderID}'`, OrderBy: 'LineNumber ASC', ResultType: 'entity_object' },
    user,
  );
  return res.Success ? res.Results ?? [] : [];
}

/**
 * Book the order's per-line JEs onto `tg` (the factory validates + queues + stamps each line, no
 * Submit); on success stamp the order's booked fields in memory. Returns typed errors instead of
 * throwing — a booking failure never silently vanishes, and the caller can abandon the (un-submitted)
 * TG.
 */
export async function queueOrderBooking(
  order: mjBizAppsOrdersOrderEntity,
  lines: mjBizAppsOrdersOrderLineEntity[],
  tg: Awaited<ReturnType<IMetadataProvider['CreateTransactionGroup']>>,
  user: UserInfo | undefined,
  provider: IMetadataProvider,
): Promise<OrderBookingResult> {
  // Pre-booking gates shared by BOTH confirm entry points (direct save + the op).
  if (order.Status === 'Voided') {
    return { Success: false, JournalEntryIDs: [], Errors: [`Order ${order.OrderNumber} is Voided; it cannot be confirmed/booked.`] };
  }
  if (!order.CustomerOrganizationID) {
    return { Success: false, JournalEntryIDs: [], Errors: [`Order ${order.OrderNumber} requires a customer (CustomerOrganizationID) to confirm.`] };
  }

  // Order-level booked state + per-line fulfillment markers are computed IN MEMORY *before* the
  // factory persists the lines, so each OrderLine is saved exactly ONCE (its JournalEntryID stamp
  // AND any FulfillmentStatus='Pending' ride the same per-line save) — no double-queue onto the TG.
  // The Order carries NO JournalEntryID (MOD-15); its booked guard is ConfirmedAt. The caller queues
  // the order-row save + submits.
  const now = new Date();
  order.Status = 'Posted';
  order.ConfirmedAt = now;
  order.PostedAt = now;
  prepareFulfillment(order, lines);
  applyDueDate(order);

  // Book each line's JE + stamp OrderLine.JournalEntryID (persisting the in-memory FulfillmentStatus
  // too), all onto the caller's TG. On failure the caller abandons the (un-submitted) TG.
  return new OrderJournalEntryFactory().CreateJournalEntries(order, lines, tg, user, provider);
}

/** DueDate at Confirm/Post (F1.4): base (PostedAt || OrderDate) + terms' net days, unless manually set. */
function applyDueDate(order: mjBizAppsOrdersOrderEntity): void {
  if (order.DueDate) return; // a manually-supplied DueDate is respected
  const netDays = OrdersEngine.Instance.Base.NetDaysForTerms(order.PaymentTermsTypeID);
  const due = deriveDueDate(order.PostedAt ?? order.OrderDate ?? new Date(), netDays);
  if (due) order.DueDate = due;
}

/**
 * Fulfillment auto-advance on reaching Posted (UPD-3 / MOD-8, no JE either way) — computed IN MEMORY
 * only: if NO line's product type requires fulfillment, auto-advance the order to Fulfilled;
 * otherwise hold at Posted and mark each fulfillment-required line 'Pending'. The actual persistence
 * rides the factory's per-line save (order row saved by the caller) — this never touches the DB or
 * the TG itself, so each OrderLine is queued exactly once. The per-line Fulfiller flip
 * Pending→Fulfilled (and the last-line auto-advance) is OrderLine-save-driven (F1 fulfillment queue).
 */
function prepareFulfillment(
  order: mjBizAppsOrdersOrderEntity,
  lines: mjBizAppsOrdersOrderLineEntity[],
): void {
  const base = OrdersEngine.Instance.Base;
  const requiredLines = lines.filter(l => base.RequiresFulfillment(l.ProductID));
  if (requiredLines.length === 0) {
    order.Status = 'Fulfilled'; // nothing to fulfill → complete now (no JE)
    return;
  }
  for (const line of requiredLines) {
    if (line.FulfillmentStatus !== 'Pending') line.FulfillmentStatus = 'Pending';
  }
}
