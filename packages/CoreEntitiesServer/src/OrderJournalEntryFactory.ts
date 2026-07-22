/**
 * OrderJournalEntryFactory — Amith's named booking deliverable (2026-07-21): turn an order into its
 * PER-LINE journal entries. ONE JE PER ORDER LINE, always (MOD-15). For each line it resolves the
 * line's role accounts (OrdersEngine / B1 `GetProductGLAccounts`), assembles the single-company line
 * JE (Dr AR net · Cr revenue · Dr Sales-Discounts contra, netting into revenue when the contra is
 * unlinked · Deferred-Revenue products credit Deferred Revenue — B2 `buildLineJournalEntryDraft`),
 * queues it via accounting's `QueueJournalEntries` seam (validate + queue, NO Submit), and stamps
 * `OrderLine.JournalEntryID` on the line — ALL onto the CALLER-OWNED TransactionGroup, so the order
 * row + every line JE + every line stamp commit as ONE atomic unit (Amith's transaction rule). An
 * order in a booked status without its line JEs is invalid state, so any failure means the caller
 * abandons the (un-submitted) TG and nothing is written. NO intercompany legs (MOD-15.4 — those live
 * on the payment side).
 *
 * Provider discipline: everything runs on the caller's provider (never a fresh global `Metadata`), so
 * the whole unit of work stays on ONE connection.
 *
 * CONNECTS TO:
 *   ENGINE (orders):     ./OrdersEngine (buildLineDraftsForOrder — B1/B2)
 *   ENGINE (accounting): @mj-biz-apps/accounting-core-entities-server (AccountingEngine.QueueJournalEntries)
 *   CALLER:              ./orderBooking (queueOrderBooking)
 */
import { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { AccountingEngine } from '@mj-biz-apps/accounting-core-entities-server';
import type { JEValidationError } from '@mj-biz-apps/accounting-engine-base';
import type { OrderLineDraftBuildResult } from '@mj-biz-apps/orders-engine-base';
import type {
  mjBizAppsOrdersOrderEntity,
  mjBizAppsOrdersOrderLineEntity,
} from '@mj-biz-apps/orders-entities';
import { OrdersEngine } from './OrdersEngine.js';
import type { OrderBookingResult } from './orderBooking.js';

type TransactionGroup = Awaited<ReturnType<IMetadataProvider['CreateTransactionGroup']>>;

const uuidKey = (id: string | null | undefined): string => (id ?? '').trim().toLowerCase();

/**
 * Book an order's per-line journal entries onto the caller-owned TransactionGroup. Returns typed
 * errors instead of throwing so a booking failure is reservoired (never silent); nothing is
 * submitted here — the caller owns Submit and abandons the TG on any error.
 */
export class OrderJournalEntryFactory {
  public async CreateJournalEntries(
    order: mjBizAppsOrdersOrderEntity,
    lines: mjBizAppsOrdersOrderLineEntity[],
    tg: TransactionGroup,
    user: UserInfo | undefined,
    provider: IMetadataProvider,
  ): Promise<OrderBookingResult> {
    const build = await this.resolveLineDrafts(order, lines, user);
    if (build.Errors.length > 0) {
      return { Success: false, JournalEntryIDs: [], Errors: build.Errors };
    }
    if (build.Drafts.length === 0) {
      return { Success: false, JournalEntryIDs: [], Errors: [`Order ${order.OrderNumber}: no bookable lines resolved.`] };
    }

    // Queue each line's JE onto the caller's TG (accounting validates + queues, no Submit).
    const queued = await AccountingEngine.Instance.QueueJournalEntries({ Drafts: build.Drafts }, tg, user as UserInfo, provider);
    if (!queued.Success || (queued.Queued ?? []).length !== build.Drafts.length) {
      return { Success: false, JournalEntryIDs: [], Errors: (queued.Errors ?? []).map(formatError) };
    }
    const ids = (queued.Queued ?? []).map(x => x.JournalEntryID);

    // Stamp each line's JE onto OrderLine.JournalEntryID, queued onto the SAME unit of work.
    const stampError = await this.stampLineJournalEntries(lines, build, ids, tg);
    if (stampError) return { Success: false, JournalEntryIDs: [], Errors: [stampError] };

    return { Success: true, JournalEntryIDs: ids, Errors: [] };
  }

  /** Resolve the per-line drafts, healing cross-process cache staleness with one forced refresh. */
  private async resolveLineDrafts(
    order: mjBizAppsOrdersOrderEntity,
    lines: mjBizAppsOrdersOrderLineEntity[],
    user: UserInfo | undefined,
  ): Promise<OrderLineDraftBuildResult> {
    await OrdersEngine.Instance.Config(false, user);
    let result = OrdersEngine.Instance.Base.buildLineDraftsForOrder(order, lines);
    if (result.Errors.length > 0 || result.Drafts.length === 0) {
      await OrdersEngine.Instance.Config(true, user); // heal a stale catalog/link cache once, then retry
      result = OrdersEngine.Instance.Base.buildLineDraftsForOrder(order, lines);
    }
    return result;
  }

  /**
   * Stamp `OrderLine.JournalEntryID` for each booked line (index-aligned with the queued JE IDs) and
   * queue the OrderLine save onto the caller's TG. Returns an error string on the first failure.
   */
  private async stampLineJournalEntries(
    lines: mjBizAppsOrdersOrderLineEntity[],
    build: OrderLineDraftBuildResult,
    journalEntryIDs: string[],
    tg: TransactionGroup,
  ): Promise<string | null> {
    const lineByID = new Map(lines.map(l => [uuidKey(l.ID), l]));
    for (let i = 0; i < journalEntryIDs.length; i++) {
      const line = lineByID.get(uuidKey(build.OrderLineIDs[i]));
      if (!line) {
        return `Booked journal entry ${journalEntryIDs[i]} has no matching order line ${build.OrderLineIDs[i]}.`;
      }
      line.JournalEntryID = journalEntryIDs[i];
      line.TransactionGroup = tg;
      if (!(await line.Save())) {
        return `Failed to queue OrderLine.JournalEntryID stamp for line ${line.ID}: ${line.LatestResult?.CompleteMessage ?? 'unknown error'}.`;
      }
    }
    return null;
  }
}

/** Render an accounting validation error for the order-side log/result. */
function formatError(e: JEValidationError): string {
  const where = e.DraftIndex != null ? ` (line JE ${e.DraftIndex + 1})` : '';
  return `${e.Code}${where}: ${e.Message}`;
}
