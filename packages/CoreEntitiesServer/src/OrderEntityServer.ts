/**
 * OrderEntityServer — books balanced journal entries into BizApps Accounting when an order is
 * first Confirmed (amendment §4, S4) — ONE JE PER ORDER LINE (MOD-15, Amith 2026-07-21), as an
 * ATOMIC UNIT OF WORK (F1.2b).
 *
 * A direct save of an order to `Confirmed` (outside a caller-owned TransactionGroup) composes the
 * SAME atomic unit of work as the `Orders.ConfirmOrder` remotable op: the per-line JE set (+ each
 * OrderLine.JournalEntryID stamp) is queued onto ONE fresh TransactionGroup (accounting's
 * `QueueJournalEntries` seam — validate, no Submit), the order row is queued onto the same TG, and
 * the TG is submitted ONCE — order + all line JEs, or nothing. There is no booked-but-unposted
 * window: a JE failure rolls back the order row, and an order-row failure rolls back the JEs.
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
import {
  computeBalance,
  computeLineGross,
  computeLineNet,
  computeOrderTotalGross,
  derivePaymentStatus,
  isBookedStatus,
  validateTransition,
  type OrderStatus,
} from '@mj-biz-apps/orders-engine-base';
import { mjBizAppsOrdersOrderEntity } from '@mj-biz-apps/orders-entities';
import { loadOrderLines, queueOrderBooking } from './orderBooking.js';

const ACCOUNTING_JE_ENTITY = 'MJ_BizApps_Accounting: Journal Entries';

@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Orders')
export class OrderEntityServer extends mjBizAppsOrdersOrderEntity {
  public override async Save(options?: EntitySaveOptions): Promise<boolean> {
    // When a caller owns the unit of work (the op set this.TransactionGroup), it already validated +
    // composed everything — just queue the row. The F1 gates below run for a DIRECT save only.
    if (this.TransactionGroup) return super.Save(options);

    // F1 transition gate — reject an illegal status change before any effect.
    const gate = this.gateStatusTransition();
    if (!gate.ok) {
      LogError(`OrderEntityServer: order ${this.OrderNumber}: ${gate.reason}`);
      return false;
    }
    // F1.3 totals — recompute while the order is still editable (frozen after booking by the schema trigger).
    await this.recomputeTotalsIfEditable();
    // MOD-9b backdating seam — pass-through (any future timing rule detects by date, never a period FK).
    this.validatePostingDate();

    // Direct-confirm entry: compose the atomic unit of work when reaching a booked state.
    if (this.shouldBookJournalEntries()) {
      return this.confirmAtomically(options);
    }
    return super.Save(options);
  }

  /**
   * Book once — the ORDER-LEVEL idempotency guard (F1.2). Fires on reaching ANY booked state
   * (Confirmed/Posted/Fulfilled — MOD-10 prerequisite effects, so a forward skip still books) when
   * not yet booked. The Order carries NO JournalEntryID (MOD-15) — ConfirmedAt is the order-level
   * "already booked" guard (each line's JE lives on OrderLine.JournalEntryID).
   */
  private shouldBookJournalEntries(): boolean {
    return isBookedStatus(this.Status) && !this.ConfirmedAt;
  }

  /** Validate a status CHANGE on an existing order against the lifecycle DAG (F1.1). */
  private gateStatusTransition(): { ok: boolean; reason?: string } {
    const field = this.GetFieldByName('Status');
    if (!field?.Dirty) return { ok: true }; // no status change (non-status edit / idempotent save)
    const from = field.OldValue as OrderStatus | null | undefined;
    if (from == null) return { ok: true }; // a create (no prior state) is not a transition
    const check = validateTransition(from, this.Status);
    return check.Allowed ? { ok: true } : { ok: false, reason: check.Reason ?? 'illegal status transition' };
  }

  /**
   * Recompute the order-level totals from its lines (F1.3) — only while the order is still editable
   * (its persisted status is unbooked). TotalGross = Σ line gross; Balance = TotalGross − AmountPaid;
   * PaymentStatus derived (never overriding an explicit WrittenOff). After booking the schema trigger
   * freezes TotalGross, so we skip to avoid tripping it.
   */
  private async recomputeTotalsIfEditable(): Promise<void> {
    const from = this.GetFieldByName('Status')?.OldValue as OrderStatus | null | undefined;
    if (from != null && isBookedStatus(from)) return; // already booked → frozen
    const lines = await loadOrderLines(this.ID, this.ContextCurrentUser);
    const grosses = lines.map(l => computeLineGross(computeLineNet(l.Quantity, l.UnitPrice, l.DiscountPct), l.LineTax));
    this.TotalGross = computeOrderTotalGross(grosses);
    this.Balance = computeBalance(this.TotalGross, this.AmountPaid);
    this.PaymentStatus = derivePaymentStatus(this.TotalGross, this.AmountPaid, this.PaymentStatus);
  }

  /**
   * Backdating seam (MOD-9b, FINAL): OrderDate is freely settable and the JE bears it — NO guard.
   * Kept as the single seam so a FUTURE timing rule attaches here and detects by DATE (periods were
   * removed, MOD-1); today it is intentionally a pass-through.
   */
  private validatePostingDate(): void {
    /* intentional pass-through — see MOD-9b */
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
