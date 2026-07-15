/**
 * ConfirmOrderOperation — the Confirm UNIT OF WORK (`Orders.ConfirmOrder`, F1.2b).
 *
 * The order's status/guard-field update commits in the SAME TransactionGroup as its journal-entry
 * set: the op opens ONE TransactionGroup, queues the per-company JEs onto it (accounting's
 * `QueueJournalEntries` seam — validate, no Submit), queues the order-row save onto the same TG,
 * and submits ONCE — order + all JEs, or nothing. This retires the interim "any-JE-exists"
 * adoption window (an order can no longer be booked-but-unposted): a JE failure rolls back the
 * order row, and an order-row failure rolls back the JEs.
 *
 * TransactionGroups do NOT cross the GraphQL boundary, so the unit of work MUST compose server-side
 * — which is exactly why Confirm is a remotable op (server-side execution, in-process AND over
 * GraphQL via `ExecuteRemoteOperation`) rather than a bare entity save from the browser.
 *
 * A hand-authored, CODE-ONLY Remote Operation (no metadata row — same pattern as accounting's
 * CreateJournalEntriesOperation): `@RegisterClass(BaseRemotableOperation, 'Orders.ConfirmOrder')`.
 *
 * CONNECTS TO:
 *   BOOKING:  ./orderBooking (queueOrderBooking, loadOrderLines)
 *   ENTITY:   @mj-biz-apps/orders-entities (mjBizAppsOrdersOrderEntity)
 *   SIBLING:  ./OrderEntityServer (the direct-save entry composes the identical unit of work)
 */
import { BaseRemotableOperation, IMetadataProvider, LogError, RunView, UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import type { mjBizAppsOrdersOrderEntity } from '@mj-biz-apps/orders-entities';
import { loadOrderLines, queueOrderBooking } from './orderBooking.js';

const ORDER_ENTITY = 'MJ_BizApps_Orders: Orders';
const ACCOUNTING_JE_ENTITY = 'MJ_BizApps_Accounting: Journal Entries';

/** Input: the order to confirm+book. */
export interface ConfirmOrderInput {
  OrderID: string;
}

/** Output: the resulting order status + the JE IDs booked (empty when already confirmed elsewhere). */
export interface ConfirmOrderOutput {
  Success: boolean;
  Status?: string;
  JournalEntryIDs?: string[];
  Errors?: string[];
}

@RegisterClass(BaseRemotableOperation, 'Orders.ConfirmOrder')
export class ConfirmOrderOperation extends BaseRemotableOperation<ConfirmOrderInput, ConfirmOrderOutput> {
  public readonly OperationKey = 'Orders.ConfirmOrder';

  protected async InternalExecute(
    input: ConfirmOrderInput,
    provider: IMetadataProvider,
    user: UserInfo,
  ): Promise<ConfirmOrderOutput> {
    const order = await provider.GetEntityObject<mjBizAppsOrdersOrderEntity>(ORDER_ENTITY, user);
    if (!(await order.Load(input.OrderID))) {
      return { Success: false, Errors: [`Order ${input.OrderID} not found.`] };
    }
    // Idempotent: a booked order (ConfirmedAt stamped) is already the unit of work's result.
    if (order.ConfirmedAt) {
      return { Success: true, Status: order.Status, JournalEntryIDs: order.JournalEntryID ? [order.JournalEntryID] : [] };
    }
    // Defensive assert (atomic commit removes the old adoption window): JEs must not pre-exist for
    // an unbooked order. If they do, refuse rather than double-book — an operator must reconcile.
    const stray = await this.findExistingEntries(order.ID, user);
    if (stray.length > 0) {
      LogError(`ConfirmOrderOperation: order ${order.OrderNumber} is unbooked yet has ${stray.length} journal entr${stray.length === 1 ? 'y' : 'ies'} — refusing to double-book. Reconcile manually.`);
      return { Success: false, Errors: [`Order ${order.OrderNumber} has ${stray.length} pre-existing journal entries but is not marked confirmed; refusing to double-book.`] };
    }
    const lines = await loadOrderLines(order.ID, user);
    if (lines.length === 0) {
      return { Success: false, Errors: [`Order ${order.OrderNumber} has no lines; cannot confirm.`] };
    }
    return this.commitUnitOfWork(order, lines, user, provider);
  }

  /** Compose + commit the one transaction: queue JEs, queue the order row, submit once. */
  private async commitUnitOfWork(
    order: mjBizAppsOrdersOrderEntity,
    lines: Awaited<ReturnType<typeof loadOrderLines>>,
    user: UserInfo,
    provider: IMetadataProvider,
  ): Promise<ConfirmOrderOutput> {
    const tg = await provider.CreateTransactionGroup();
    const booking = await queueOrderBooking(order, lines, tg, user, provider);
    if (!booking.Success) {
      // The TG is never submitted on a booking failure — nothing was written.
      LogError(`ConfirmOrderOperation: booking failed for order ${order.OrderNumber}: ${booking.Errors.join('; ')}`);
      return { Success: false, Errors: booking.Errors };
    }
    order.TransactionGroup = tg; // queue the order-row save onto the SAME unit of work
    if (!(await order.Save())) {
      return { Success: false, Errors: [`Order row failed to queue: ${order.LatestResult?.CompleteMessage ?? 'unknown error'}`] };
    }
    if (!(await tg.Submit())) {
      const detail = order.LatestResult?.CompleteMessage ?? 'transaction group rolled back';
      LogError(`ConfirmOrderOperation: unit of work rolled back for order ${order.OrderNumber}: ${detail}`);
      return { Success: false, Errors: [`Confirm unit of work rolled back: ${detail}`] };
    }
    return { Success: true, Status: 'Posted', JournalEntryIDs: booking.JournalEntryIDs };
  }

  /** Existing journal entries linked to this order (defensive double-book guard). */
  private async findExistingEntries(orderID: string, user: UserInfo | undefined): Promise<string[]> {
    const rv = new RunView();
    const res = await rv.RunView<{ ID: string }>(
      { EntityName: ACCOUNTING_JE_ENTITY, ExtraFilter: `OrderID='${orderID}'`, Fields: ['ID'], ResultType: 'simple', BypassCache: true },
      user,
    );
    return res.Success ? (res.Results ?? []).map(r => r.ID) : [];
  }
}

/** Tree-shaking anchor — called from the app's server bootstrap so `@RegisterClass` is retained. */
export function LoadConfirmOrderOperation(): void {
  // intentionally empty
}
