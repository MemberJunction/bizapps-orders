/**
 * OrderEntityServer — books balanced journal entries into BizApps Accounting when an order is
 * first Confirmed (amendment §4, S4) — ONE JE PER COMPANY (MOD-11 / F1.2, 2026-07-13).
 *
 * Fires inside the order's Save(): when Status is 'Confirmed' and the order has not booked yet
 * (order-level guard: no JournalEntryID AND no ConfirmedAt), it resolves each line's revenue
 * account + each company's AR account (OrdersEngine), assembles one single-company draft per
 * company, and books the WHOLE SET through ONE call to the in-process
 * `Accounting.CreateJournalEntries` op — every header + line + dimension across every company
 * writes in a single TransactionGroup, ALL entries or none (Amith's transaction rule; there is
 * no partial-booking state and no compensation path). On success it stamps ConfirmedAt (the
 * order-level booked marker), sets JournalEntryID when the order booked exactly ONE entry (the
 * single-company common case — multi-company lineage lives on JournalEntry.OrderID /
 * JournalEntryLink), and advances the order to `Posted` (2026-07-08 D1).
 *
 * FAILURE POLICY (v1): if resolution or the set op fails, Save() returns false — the Confirm is
 * BLOCKED and the reason is logged. There is never a Confirmed-but-unbooked (or partially
 * booked) order; a retry happens naturally on the next save (the guard is still open).
 *
 * CONNECTS TO:
 *   ENGINE:   ./OrdersEngine (buildDraftsForOrder)
 *   OP:       @mj-biz-apps/accounting-core-entities-server (CreateJournalEntriesOperation)
 *   ENTITY:   @mj-biz-apps/orders-entities (mjBizAppsOrdersOrderEntity)
 */
import { BaseEntity, EntitySaveOptions, LogError, RunView, UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { CreateJournalEntriesOperation } from '@mj-biz-apps/accounting-core-entities-server';
import type { JournalEntryDraft } from '@mj-biz-apps/accounting-engine-base';
import {
  mjBizAppsOrdersOrderEntity,
  mjBizAppsOrdersOrderLineEntity,
} from '@mj-biz-apps/orders-entities';
import { OrdersEngine } from './OrdersEngine.js';

const ORDER_LINE_ENTITY = 'MJ_BizApps_Orders: Order Lines';
const ACCOUNTING_JE_ENTITY = 'MJ_BizApps_Accounting: Journal Entries';

@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Orders')
export class OrderEntityServer extends mjBizAppsOrdersOrderEntity {
  public override async Save(options?: EntitySaveOptions): Promise<boolean> {
    if (this.shouldBookJournalEntries()) {
      const booked = await this.bookOrderJournalEntries();
      if (!booked) return false; // block the Confirm — reason is logged; retries on next save
      // The journal entries are now in the accounting subledger, so the order advances to `Posted`
      // (2026-07-08 Robert decision D1: `Posted` = "the JEs are in"; `Confirmed` triggers the posting
      // operation, so the transition is immediate). The flow stays linear — the next step is Fulfilled.
      this.Status = 'Posted';
    }
    return super.Save(options);
  }

  /**
   * Book once — the ORDER-LEVEL idempotency guard (F1.2): a booked order has ConfirmedAt set
   * (always) and JournalEntryID set (single-JE case only). A failed prior attempt left both
   * null, so it retries here. (The second guard half — any-JE-exists — runs inside
   * bookOrderJournalEntries, since it needs a query.)
   */
  private shouldBookJournalEntries(): boolean {
    return this.Status === 'Confirmed' && !this.JournalEntryID && !this.ConfirmedAt;
  }

  /**
   * The any-JE-exists half of the F1.2 guard: if entries already exist for this order (a prior
   * attempt's JE set committed but the ORDER row's save then failed, so ConfirmedAt never
   * persisted), do NOT book again — adopt the existing set instead. This window closes fully when
   * the Confirm unit-of-work rework lands (order row + JE set in ONE TransactionGroup — feature
   * plan F1.2b); until then this check prevents double-booking.
   */
  private async findExistingBookedEntries(user: UserInfo | undefined): Promise<string[]> {
    const rv = new RunView();
    const res = await rv.RunView<{ ID: string }>(
      { EntityName: ACCOUNTING_JE_ENTITY, ExtraFilter: `OrderID='${this.ID}'`, Fields: ['ID'], ResultType: 'simple', BypassCache: true },
      user
    );
    return res.Success ? (res.Results ?? []).map(r => r.ID) : [];
  }

  /** Resolve accounts, book one JE per company as a set, stamp lineage. False = block the Confirm. */
  private async bookOrderJournalEntries(): Promise<boolean> {
    const user = this.ContextCurrentUser;
    const existing = await this.findExistingBookedEntries(user);
    if (existing.length > 0) {
      LogError(
        `OrderEntityServer: order ${this.OrderNumber} already has ${existing.length} booked journal ` +
          `entr${existing.length === 1 ? 'y' : 'ies'} (a prior attempt's order-row save must have failed). ` +
          `Adopting the existing set instead of re-booking.`
      );
      if (existing.length === 1) this.JournalEntryID = existing[0];
      this.ConfirmedAt = new Date();
      return true;
    }
    const lines = await this.loadLines(user);
    if (lines.length === 0) {
      LogError(`OrderEntityServer: order ${this.OrderNumber} has no lines; cannot book journal entries.`);
      return false;
    }
    const drafts = await this.resolveDrafts(lines, user);
    if (!drafts) return false;
    return this.executeBookingSet(drafts, user);
  }

  /** Build the per-company drafts, healing cross-process cache staleness with one forced refresh. */
  private async resolveDrafts(
    lines: mjBizAppsOrdersOrderLineEntity[],
    user: UserInfo | undefined
  ): Promise<JournalEntryDraft[] | null> {
    // No explicit provider: inside MJAPI the engine resolves the request's default provider — the
    // same one this entity Save runs under.
    await OrdersEngine.Instance.Config(false, user);
    let result = OrdersEngine.Instance.buildDraftsForOrder(this, lines);
    if (!result.Drafts) {
      await OrdersEngine.Instance.Config(true, user);
      result = OrdersEngine.Instance.buildDraftsForOrder(this, lines);
    }
    if (!result.Drafts || result.Drafts.length === 0) {
      LogError(`OrderEntityServer: cannot book order ${this.OrderNumber}: ${result.Errors.join(' ')}`);
      return null;
    }
    return result.Drafts;
  }

  /**
   * Book the drafts as ONE atomic unit of work (MOD-11 + Amith's transaction rule): a single
   * `Accounting.CreateJournalEntries` call writes every entry across every company in one
   * TransactionGroup — the DB commits all of them or none, so there is nothing to compensate.
   * On success, stamp ConfirmedAt (+ JournalEntryID when exactly one JE was booked).
   */
  private async executeBookingSet(drafts: JournalEntryDraft[], user: UserInfo | undefined): Promise<boolean> {
    const result = await new CreateJournalEntriesOperation().Execute({ Drafts: drafts }, { user });
    const out = result.Output;
    if (!result.Success || !out?.Success || (out.Results ?? []).length !== drafts.length) {
      const detail = (out?.Errors ?? [])
        .map(e => `${e.Code}${e.DraftIndex != null ? ` (draft ${e.DraftIndex + 1}/${drafts.length})` : ''}: ${e.Message}`)
        .join('; ');
      LogError(
        `OrderEntityServer: journal entry set booking failed for order ${this.OrderNumber} ` +
          `(${result.ResultCode ?? ''} ${result.ErrorMessage ?? ''} ${detail}). Nothing was written (atomic set).`
      );
      return false;
    }
    const createdIDs = (out.Results ?? []).map(r => r.JournalEntryID).filter((id): id is string => !!id);
    if (createdIDs.length === 1) this.JournalEntryID = createdIDs[0];
    this.ConfirmedAt = new Date();
    return true;
  }

  /** Load the order's lines (entity objects), ordered by LineNumber. */
  private async loadLines(user: UserInfo | undefined): Promise<mjBizAppsOrdersOrderLineEntity[]> {
    const rv = new RunView();
    const res = await rv.RunView<mjBizAppsOrdersOrderLineEntity>(
      {
        EntityName: ORDER_LINE_ENTITY,
        ExtraFilter: `OrderID='${this.ID}'`,
        OrderBy: 'LineNumber ASC',
        ResultType: 'entity_object',
      },
      user
    );
    return res.Success ? res.Results ?? [] : [];
  }
}

/** Tree-shaking anchor — imported by the server bootstrap so @RegisterClass fires. */
export function LoadBizAppsOrdersOrderServer(): void {
  // No-op: importing this module registers OrderEntityServer above.
}
