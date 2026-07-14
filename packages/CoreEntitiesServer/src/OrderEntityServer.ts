/**
 * OrderEntityServer — books balanced journal entries into BizApps Accounting when an order is
 * first Confirmed (amendment §4, S4) — ONE JE PER COMPANY (MOD-11 / F1.2, 2026-07-13).
 *
 * Fires inside the order's Save(): when Status is 'Confirmed' and the order has not booked yet
 * (order-level guard: no JournalEntryID AND no ConfirmedAt), it resolves each line's revenue
 * account + each company's AR account (OrdersEngine), assembles one single-company draft per
 * company, and books them AS A SET through the in-process `Accounting.CreateJournalEntry` op —
 * ALL succeed or the Confirm fails (a partial multi-company booking is compensated: already-
 * created Pending JEs are deleted, loudly logged if that cleanup itself fails). On success it
 * stamps ConfirmedAt (the order-level booked marker), sets JournalEntryID when the order booked
 * exactly ONE entry (the single-company common case — multi-company lineage lives on
 * JournalEntry.OrderID / JournalEntryLink), and advances the order to `Posted` (2026-07-08 D1).
 *
 * FAILURE POLICY (v1): if resolution or any op fails, Save() returns false — the Confirm is
 * BLOCKED and the reason is logged. There is never a Confirmed-but-unbooked order; a retry
 * happens naturally on the next save (the guard is still open).
 *
 * CONNECTS TO:
 *   ENGINE:   ./OrdersEngine (buildDraftsForOrder)
 *   OP:       @mj-biz-apps/accounting-core-entities-server (CreateJournalEntryOperation)
 *   ENTITY:   @mj-biz-apps/orders-entities (mjBizAppsOrdersOrderEntity)
 */
import { BaseEntity, CompositeKey, EntitySaveOptions, LogError, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { CreateJournalEntryOperation } from '@mj-biz-apps/accounting-core-entities-server';
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
   * null, so it retries here.
   */
  private shouldBookJournalEntries(): boolean {
    return this.Status === 'Confirmed' && !this.JournalEntryID && !this.ConfirmedAt;
  }

  /** Resolve accounts, book one JE per company as a set, stamp lineage. False = block the Confirm. */
  private async bookOrderJournalEntries(): Promise<boolean> {
    const user = this.ContextCurrentUser;
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
   * Execute the drafts as an all-or-nothing SET (MOD-11): book sequentially; on any failure,
   * compensate by deleting the Pending JEs already created, then block the Confirm. On full
   * success, stamp ConfirmedAt (+ JournalEntryID when exactly one JE was booked).
   */
  private async executeBookingSet(drafts: JournalEntryDraft[], user: UserInfo | undefined): Promise<boolean> {
    const createdIDs: string[] = [];
    for (const draft of drafts) {
      const result = await new CreateJournalEntryOperation().Execute(draft, { user });
      const out = result.Output;
      if (!result.Success || !out?.Success || !out.JournalEntryID) {
        const detail = (out?.Errors ?? []).map(e => `${e.Code}: ${e.Message}`).join('; ');
        LogError(
          `OrderEntityServer: journal entry booking failed for order ${this.OrderNumber} ` +
            `(draft ${createdIDs.length + 1}/${drafts.length}; ${result.ResultCode ?? ''} ${result.ErrorMessage ?? ''} ${detail}).`
        );
        await this.compensateBookedEntries(createdIDs, user);
        return false;
      }
      createdIDs.push(out.JournalEntryID);
    }
    if (createdIDs.length === 1) this.JournalEntryID = createdIDs[0];
    this.ConfirmedAt = new Date();
    return true;
  }

  /** Delete the Pending JEs a partially-failed set created — the order must never book partially. */
  private async compensateBookedEntries(createdIDs: string[], user: UserInfo | undefined): Promise<void> {
    const md = new Metadata();
    for (const id of createdIDs) {
      try {
        const je = await md.GetEntityObject<BaseEntity>(ACCOUNTING_JE_ENTITY, user);
        // Generic BaseEntity exposes InnerLoad(CompositeKey); the typed Load lives on generated subclasses.
        const loaded = await je.InnerLoad(CompositeKey.FromID(id));
        const deleted = loaded && (await je.Delete());
        if (!deleted) {
          LogError(
            `OrderEntityServer: COMPENSATION FAILED — Pending JournalEntry ${id} from the partial booking of ` +
              `order ${this.OrderNumber} could not be deleted (${je.LatestResult?.CompleteMessage ?? 'load failed'}). ` +
              `Manual cleanup required; the order remains unbooked.`
          );
        }
      } catch (e) {
        LogError(
          `OrderEntityServer: COMPENSATION FAILED for JournalEntry ${id} (order ${this.OrderNumber}): ` +
            `${e instanceof Error ? e.message : String(e)}. Manual cleanup required.`
        );
      }
    }
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
