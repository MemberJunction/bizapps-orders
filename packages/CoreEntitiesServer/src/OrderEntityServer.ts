/**
 * OrderEntityServer — books a balanced journal entry into BizApps Accounting when an order is
 * first Confirmed (amendment §4, S4).
 *
 * Fires inside the order's Save(): when Status is 'Confirmed' and no JE has been booked yet
 * (JournalEntryID is null), it resolves each line's revenue account + each company's AR account
 * (OrdersEngine), assembles the balanced draft, and books it through the in-process
 * `Accounting.CreateJournalEntry` operation — the same op a browser/script would invoke over
 * GraphQL. On success it stamps the order's JournalEntryID (the idempotency guard — a re-save of
 * an already-booked order skips) + ConfirmedAt, and advances the order to `Posted` (2026-07-08
 * decision D1: `Posted` = "the journal entries are in the subledger"; Confirmed triggers posting).
 *
 * FAILURE POLICY (v1): if resolution or the op fails, Save() returns false — the Confirm is
 * BLOCKED and the reason is logged. This is the strongest form of "the financial effect never
 * silently disappears" (amendment §4): there is never a Confirmed-but-unbooked order. A retry
 * happens naturally on the next save (JournalEntryID is still null). A reservoir/retry queue that
 * lets Confirm proceed while alerting is a future enhancement.
 *
 * CONNECTS TO:
 *   ENGINE:   ./OrdersEngine (buildDraftForOrder)
 *   OP:       @mj-biz-apps/accounting-core-entities-server (CreateJournalEntryOperation)
 *   ENTITY:   @mj-biz-apps/orders-entities (mjBizAppsOrdersOrderEntity)
 */
import { BaseEntity, EntitySaveOptions, LogError, RunView, UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { CreateJournalEntryOperation } from '@mj-biz-apps/accounting-core-entities-server';
import {
  mjBizAppsOrdersOrderEntity,
  mjBizAppsOrdersOrderLineEntity,
} from '@mj-biz-apps/orders-entities';
import { OrdersEngine } from './OrdersEngine.js';

const ORDER_LINE_ENTITY = 'MJ_BizApps_Orders: Order Lines';

@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Orders')
export class OrderEntityServer extends mjBizAppsOrdersOrderEntity {
  public override async Save(options?: EntitySaveOptions): Promise<boolean> {
    if (this.shouldBookJournalEntry()) {
      const booked = await this.bookOrderJournalEntry();
      if (!booked) return false; // block the Confirm — reason is logged; retries on next save
      // The journal entries are now in the accounting subledger, so the order advances to `Posted`
      // (2026-07-08 Robert decision D1: `Posted` = "the JEs are in"; `Confirmed` triggers the posting
      // operation, so the transition is immediate). The flow stays linear — the next step is Fulfilled.
      this.Status = 'Posted';
    }
    return super.Save(options);
  }

  /** Book once: Status is Confirmed and no JE stamped yet (a failed prior attempt retries here). */
  private shouldBookJournalEntry(): boolean {
    return this.Status === 'Confirmed' && !this.JournalEntryID;
  }

  /** Resolve accounts, book the balanced JE via the op, stamp lineage. False = block the Confirm. */
  private async bookOrderJournalEntry(): Promise<boolean> {
    const user = this.ContextCurrentUser;
    const lines = await this.loadLines(user);
    if (lines.length === 0) {
      LogError(`OrderEntityServer: order ${this.OrderNumber} has no lines; cannot book a journal entry.`);
      return false;
    }
    const draft = await this.resolveDraft(lines, user);
    if (!draft) return false;
    return this.executeBooking(draft, user);
  }

  /** Build the draft, healing cross-process cache staleness with one forced refresh + retry. */
  private async resolveDraft(
    lines: mjBizAppsOrdersOrderLineEntity[],
    user: UserInfo | undefined
  ): Promise<Awaited<ReturnType<OrdersEngine['buildDraftForOrder']>>['Draft'] | null> {
    // No explicit provider: inside MJAPI the engine resolves the request's default provider — the
    // same one this entity Save runs under. (this.ProviderToUse is typed IEntityDataProvider, not
    // the IMetadataProvider the engine cache wants.)
    await OrdersEngine.Instance.Config(false, user);
    let result = OrdersEngine.Instance.buildDraftForOrder(this, lines);
    if (!result.Draft) {
      await OrdersEngine.Instance.Config(true, user);
      result = OrdersEngine.Instance.buildDraftForOrder(this, lines);
    }
    if (!result.Draft) {
      LogError(`OrderEntityServer: cannot book order ${this.OrderNumber}: ${result.Errors.join(' ')}`);
      return null;
    }
    return result.Draft;
  }

  /** Invoke the remotable op in-process; stamp JournalEntryID + ConfirmedAt on success. */
  private async executeBooking(
    draft: NonNullable<Awaited<ReturnType<OrdersEngine['buildDraftForOrder']>>['Draft']>,
    user: UserInfo | undefined
  ): Promise<boolean> {
    const result = await new CreateJournalEntryOperation().Execute(draft, { user });
    const out = result.Output;
    if (!result.Success || !out?.Success || !out.JournalEntryID) {
      const detail = (out?.Errors ?? []).map(e => `${e.Code}: ${e.Message}`).join('; ');
      LogError(
        `OrderEntityServer: journal entry booking failed for order ${this.OrderNumber} ` +
          `(${result.ResultCode ?? ''} ${result.ErrorMessage ?? ''} ${detail}).`
      );
      return false;
    }
    this.JournalEntryID = out.JournalEntryID;
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
