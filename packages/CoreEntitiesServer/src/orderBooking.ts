/**
 * orderBooking — the shared server-side booking step for the Confirm UNIT OF WORK (F1.2b).
 *
 * `queueOrderBooking` resolves an order's per-company journal-entry drafts (OrdersEngine) and
 * queues them onto a TransactionGroup the CALLER owns, via accounting's `QueueJournalEntries`
 * seam (validate + queue, NO Submit). It then stamps the order's booked fields IN MEMORY
 * (`Status='Posted'`, `ConfirmedAt`, `JournalEntryID` when a single JE booked) — it does NOT save
 * the order row and does NOT submit the TG. The caller (the `Orders.ConfirmOrder` op, or
 * `OrderEntityServer.Save`) queues the order-row save onto the SAME TG and submits ONCE, so the
 * order row + the whole JE set commit atomically — all or nothing (Amith's transaction rule, MOD-11).
 *
 * Sharing this one step is what makes both confirm entry points (the remotable op AND a direct
 * order Save) compose the identical, single-transaction unit of work.
 *
 * CONNECTS TO:
 *   ENGINE (orders):     ./OrdersEngine (buildDraftsForOrder)
 *   ENGINE (accounting): @mj-biz-apps/accounting-core-entities-server (AccountingEngine.QueueJournalEntries)
 *   CALLERS:             ./ConfirmOrderOperation · ./OrderEntityServer
 */
import { IMetadataProvider, RunView, UserInfo } from '@memberjunction/core';
import { AccountingEngine } from '@mj-biz-apps/accounting-core-entities-server';
import type { JEValidationError, JournalEntryDraft } from '@mj-biz-apps/accounting-engine-base';
import { deriveDueDate } from '@mj-biz-apps/orders-engine-base';
import type {
  mjBizAppsOrdersOrderEntity,
  mjBizAppsOrdersOrderLineEntity,
} from '@mj-biz-apps/orders-entities';
import { OrdersEngine } from './OrdersEngine.js';

const ORDER_LINE_ENTITY = 'MJ_BizApps_Orders: Order Lines';

/** Outcome of queuing an order's booking onto a caller-owned TransactionGroup. */
export interface OrderBookingResult {
  Success: boolean;
  /** The JE IDs queued (available pre-Submit) — order-level lineage lives on JournalEntry.OrderID. */
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
 * Resolve the order's per-company drafts and queue them onto `tg` (accounting validates + queues,
 * no Submit); on success stamp the order's booked fields in memory. Heals cross-process cache
 * staleness with one forced refresh. Returns typed errors instead of throwing — a booking failure
 * never silently vanishes, and the caller can abandon the (un-submitted) TG.
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
  const drafts = await resolveDrafts(order, lines, user);
  if (!drafts) {
    return { Success: false, JournalEntryIDs: [], Errors: [`Order ${order.OrderNumber}: no bookable drafts resolved.`] };
  }
  const q = await AccountingEngine.Instance.QueueJournalEntries({ Drafts: drafts }, tg, user as UserInfo, provider);
  if (!q.Success || (q.Queued ?? []).length !== drafts.length) {
    return { Success: false, JournalEntryIDs: [], Errors: (q.Errors ?? []).map(formatError) };
  }
  const ids = (q.Queued ?? []).map(x => x.JournalEntryID);
  const now = new Date();
  order.Status = 'Posted';
  order.ConfirmedAt = now;
  order.PostedAt = now;
  if (ids.length === 1) order.JournalEntryID = ids[0];
  applyDueDate(order);
  await applyFulfillment(order, lines, tg);
  return { Success: true, JournalEntryIDs: ids, Errors: [] };
}

/** DueDate at Confirm/Post (F1.4): base (PostedAt || OrderDate) + terms' net days, unless manually set. */
function applyDueDate(order: mjBizAppsOrdersOrderEntity): void {
  if (order.DueDate) return; // a manually-supplied DueDate is respected
  const netDays = OrdersEngine.Instance.Base.NetDaysForTerms(order.PaymentTermsTypeID);
  const due = deriveDueDate(order.PostedAt ?? order.OrderDate ?? new Date(), netDays);
  if (due) order.DueDate = due;
}

/**
 * Fulfillment auto-advance on reaching Posted (UPD-3 / MOD-8, no JE either way): if NO line's product
 * type requires fulfillment, auto-advance the order to Fulfilled; otherwise hold at Posted and mark
 * each fulfillment-required line 'Pending' (queued onto the SAME unit of work). The per-line Fulfiller
 * flip Pending→Fulfilled (and the last-line auto-advance) is OrderLine-save-driven (F1 fulfillment queue).
 */
async function applyFulfillment(
  order: mjBizAppsOrdersOrderEntity,
  lines: mjBizAppsOrdersOrderLineEntity[],
  tg: Awaited<ReturnType<IMetadataProvider['CreateTransactionGroup']>>,
): Promise<void> {
  const base = OrdersEngine.Instance.Base;
  const requiredLines = lines.filter(l => base.RequiresFulfillment(l.ProductID));
  if (requiredLines.length === 0) {
    order.Status = 'Fulfilled'; // nothing to fulfill → complete now (no JE)
    return;
  }
  for (const line of requiredLines) {
    if (line.FulfillmentStatus !== 'Pending') {
      line.FulfillmentStatus = 'Pending';
      line.TransactionGroup = tg; // commit the fulfillment marker in the same atomic unit of work
      await line.Save();
    }
  }
}

/** Build the per-company drafts, healing cross-process cache staleness with one forced refresh. */
async function resolveDrafts(
  order: mjBizAppsOrdersOrderEntity,
  lines: mjBizAppsOrdersOrderLineEntity[],
  user: UserInfo | undefined,
): Promise<JournalEntryDraft[] | null> {
  await OrdersEngine.Instance.Config(false, user);
  let result = OrdersEngine.Instance.buildDraftsForOrder(order, lines);
  if (!result.Drafts) {
    await OrdersEngine.Instance.Config(true, user);
    result = OrdersEngine.Instance.buildDraftsForOrder(order, lines);
  }
  return result.Drafts && result.Drafts.length > 0 ? result.Drafts : null;
}

/** Render an accounting validation error for the order-side log/result. */
function formatError(e: JEValidationError): string {
  const where = e.DraftIndex != null ? ` (draft ${e.DraftIndex + 1})` : '';
  return `${e.Code}${where}: ${e.Message}`;
}
