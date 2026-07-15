/**
 * OrderEntityServer — books balanced journal entries into BizApps Accounting when an order is
 * first Confirmed (amendment §4, S4) — ONE JE PER COMPANY (MOD-11), as an ATOMIC UNIT OF WORK
 * (F1.2b, 2026-07-15).
 *
 * A direct save of an order to `Confirmed` (outside a caller-owned TransactionGroup) composes the
 * SAME atomic unit of work as the `Orders.ConfirmOrder` remotable op: the per-company JE set is
 * queued onto ONE fresh TransactionGroup (accounting's `QueueJournalEntries` seam — validate, no
 * Submit), the order row is queued onto the same TG, and the TG is submitted ONCE — order + all
 * JEs, or nothing. There is no booked-but-unposted window: a JE failure rolls back the order row,
 * and an order-row failure rolls back the JEs.
 *
 * When a caller (the op) already owns the TransactionGroup — i.e. `this.TransactionGroup` is set —
 * this override does NOT self-compose; it just queues the order row (the op owns Submit). The
 * `shouldBook && !this.TransactionGroup` guard routes both entry points through one unit of work.
 *
 * FAILURE POLICY (v1): any failure BLOCKS the Confirm (Save returns false; reason logged) and
 * commits nothing. A retry happens naturally on the next save (the order-level guard is still open).
 *
 * CONNECTS TO:
 *   BOOKING:  ./orderBooking (queueOrderBooking, loadOrderLines) — shared with ConfirmOrderOperation
 *   ENTITY:   @mj-biz-apps/orders-entities (mjBizAppsOrdersOrderEntity)
 */
import { BaseEntity, EntitySaveOptions, IMetadataProvider, LogError, RunView, UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { mjBizAppsOrdersOrderEntity } from '@mj-biz-apps/orders-entities';
import { loadOrderLines, queueOrderBooking } from './orderBooking.js';

const ACCOUNTING_JE_ENTITY = 'MJ_BizApps_Accounting: Journal Entries';

@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Orders')
export class OrderEntityServer extends mjBizAppsOrdersOrderEntity {
  public override async Save(options?: EntitySaveOptions): Promise<boolean> {
    // Direct-confirm entry: compose the atomic unit of work ONLY when no caller owns the TG.
    // (When the op owns it, `this.TransactionGroup` is set and booking already happened — just queue.)
    if (this.shouldBookJournalEntries() && !this.TransactionGroup) {
      return this.confirmAtomically(options);
    }
    return super.Save(options);
  }

  /**
   * Book once — the ORDER-LEVEL idempotency guard (F1.2): a booked order has ConfirmedAt set
   * (always) and JournalEntryID set (single-JE case only). A failed prior attempt left both null,
   * so it retries here.
   */
  private shouldBookJournalEntries(): boolean {
    return this.Status === 'Confirmed' && !this.JournalEntryID && !this.ConfirmedAt;
  }

  /**
   * Compose + commit the Confirm unit of work for a direct save (no caller TG): queue the
   * per-company JEs onto a fresh TransactionGroup, queue this order row onto the SAME TG, submit
   * ONCE. All-or-nothing; any failure blocks the Confirm and writes nothing.
   */
  private async confirmAtomically(options?: EntitySaveOptions): Promise<boolean> {
    const user = this.ContextCurrentUser;
    const provider = this.ProviderToUse as unknown as IMetadataProvider;
    // Defensive assert (atomic commit removes the old any-JE-exists adoption window): an unbooked
    // order must not already have JEs. If it does, refuse rather than double-book.
    const stray = await this.findExistingEntries(user);
    if (stray.length > 0) {
      LogError(
        `OrderEntityServer: order ${this.OrderNumber} is unbooked yet has ${stray.length} journal ` +
          `entr${stray.length === 1 ? 'y' : 'ies'} — refusing to double-book. Reconcile manually.`
      );
      return false;
    }
    const lines = await loadOrderLines(this.ID, user);
    if (lines.length === 0) {
      LogError(`OrderEntityServer: order ${this.OrderNumber} has no lines; cannot book journal entries.`);
      return false;
    }
    const tg = await provider.CreateTransactionGroup();
    const booking = await queueOrderBooking(this, lines, tg, user, provider); // stamps Posted/ConfirmedAt/JournalEntryID + queues JEs
    if (!booking.Success) {
      LogError(`OrderEntityServer: journal entry booking failed for order ${this.OrderNumber}: ${booking.Errors.join('; ')}. Nothing was written.`);
      return false;
    }
    this.TransactionGroup = tg; // queue THIS order row onto the same unit of work
    if (!(await super.Save(options))) {
      LogError(`OrderEntityServer: order ${this.OrderNumber} row failed to queue: ${this.LatestResult?.CompleteMessage ?? 'unknown error'}`);
      return false;
    }
    if (!(await tg.Submit())) {
      LogError(`OrderEntityServer: Confirm unit of work rolled back for order ${this.OrderNumber}: ${this.LatestResult?.CompleteMessage ?? 'transaction group rolled back'}`);
      return false;
    }
    return true;
  }

  /** Existing journal entries linked to this order (defensive double-book guard). */
  private async findExistingEntries(user: UserInfo | undefined): Promise<string[]> {
    const rv = new RunView();
    const res = await rv.RunView<{ ID: string }>(
      { EntityName: ACCOUNTING_JE_ENTITY, ExtraFilter: `OrderID='${this.ID}'`, Fields: ['ID'], ResultType: 'simple', BypassCache: true },
      user
    );
    return res.Success ? (res.Results ?? []).map(r => r.ID) : [];
  }
}

/** Tree-shaking anchor — imported by the server bootstrap so @RegisterClass fires. */
export function LoadBizAppsOrdersOrderServer(): void {
  // No-op: importing this module registers OrderEntityServer above.
}
