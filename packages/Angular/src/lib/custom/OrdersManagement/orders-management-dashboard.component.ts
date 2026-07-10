import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { BaseDashboard } from '@memberjunction/ng-shared';
import { MJFormPresenterService } from '@memberjunction/ng-base-forms';
import { RegisterClass } from '@memberjunction/global';
import { CompositeKey, Metadata, RunView } from '@memberjunction/core';
import { ResourceData } from '@memberjunction/core-entities';
import { mjBizAppsOrdersOrderEntity } from '@mj-biz-apps/orders-entities';

const ORDER_ENTITY = 'MJ_BizApps_Orders: Orders';
const ORDER_LINE_ENTITY = 'MJ_BizApps_Orders: Order Lines';
const JE_ENTITY = 'MJ_BizApps_Accounting: Journal Entries';
const JE_LINE_ENTITY = 'MJ_BizApps_Accounting: Journal Entry Lines';

/** Order status, derived from the generated entity union (rule 2c). */
type OrderStatus = mjBizAppsOrdersOrderEntity['Status'];

/** Kanban lane order — the order lifecycle, left to right. */
const LANES: OrderStatus[] = ['Draft', 'Quoted', 'Confirmed', 'Posted', 'Fulfilled', 'Voided'];

interface OrderRow {
  ID: string;
  OrderNumber: string;
  OrderDate: Date | null;
  Status: OrderStatus;
  CustomerOrganizationID: string | null;
  JournalEntryID: string | null;
  /** True when ≥1 journal entry for this order exists in accounting (order-level check via JournalEntry.OrderID). */
  HasAccountingJE: boolean;
  ConfirmedAt: Date | null;
  Description: string | null;
  Total: number;
  LineCount: number;
}

interface Lane {
  Status: OrderStatus;
  Orders: OrderRow[];
  Count: number;
  Total: number;
}

interface OrderLineRow {
  LineNumber: number;
  Product: string;
  Quantity: number;
  UnitPrice: number;
  Amount: number;
}

/** The booked-JE header summary shown in the detail panel. */
interface JESummary {
  EntryNumber: string;
  EntryType: string;
  Status: string;
  TotalDebits: number;
  TotalCredits: number;
  LineCount: number;
  Balanced: boolean;
}

interface JELineRow {
  Account: string;
  Debit: number;
  Credit: number;
}

/**
 * Orders Management — the orders viewing/management surface. A status-lane pipeline board
 * (Draft → Quoted → Confirmed → Posted → Fulfilled / Voided) over the recent orders, with an
 * inline detail panel that shows an order's lifecycle, lines, and the balanced journal entry it
 * booked into BizApps Accounting (with a drill-through into the accounting JE record).
 *
 * All data access is client-side (RunView). Selecting an order deep-links via a `?order=<id>`
 * query param so a specific order can be opened directly; "Open in Accounting" emits the
 * BaseDashboard OpenEntityRecord output so the host navigates to the accounting JE form.
 */
@Component({
  standalone: false,
  selector: 'mj-orders-management-dashboard',
  templateUrl: './orders-management-dashboard.component.html',
  styleUrls: ['./orders-management-dashboard.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
@RegisterClass(BaseDashboard, 'OrdersManagementDashboard')
export class OrdersManagementDashboardComponent extends BaseDashboard {
  private cdr = inject(ChangeDetectorRef);
  private forms = inject(MJFormPresenterService);

  public readonly Lanes: readonly OrderStatus[] = LANES;

  public IsBusy = false;
  public LoadError: string | null = null;

  public AllOrders: OrderRow[] = [];

  // ─── filters ───────────────────────────────────────────────────────────────
  /** Which lanes to show. Empty = show all lanes. */
  public SelectedLanes = new Set<OrderStatus>();
  public Search = '';

  // ─── selected-order detail ───────────────────────────────────────────────────
  public SelectedOrderID: string | null = null;
  public DetailLoading = false;
  public DetailLines: OrderLineRow[] = [];
  public DetailJE: JESummary | null = null;
  public DetailJELines: JELineRow[] = [];

  // ─── lifecycle movement (arrows / void / refresh) ────────────────────────────
  /** The order currently mid-action — drives the standardized per-card loading spinner. */
  public MovingOrderID: string | null = null;

  /** Reusable confirmation dialog state (Confirm / Fulfill / Void all route through it). */
  public ConfirmVisible = false;
  public ConfirmTitle = '';
  public ConfirmMessage = '';
  public ConfirmLabel = '';
  public ConfirmDanger = false;
  private pendingAction: (() => Promise<void>) | null = null;

  async GetResourceDisplayName(_data: ResourceData): Promise<string> {
    return 'Orders';
  }

  protected initDashboard(): void {
    // One-time setup; data loads in loadData().
  }

  protected async loadData(): Promise<void> {
    this.IsBusy = true;
    this.LoadError = null;
    this.cdr.markForCheck();
    try {
      await this.loadOrders();
    } catch (e) {
      this.LoadError = e instanceof Error ? e.message : String(e);
    } finally {
      this.IsBusy = false;
      this.cdr.markForCheck();
    }
  }

  private async loadOrders(): Promise<void> {
    const rv = new RunView();
    const res = await rv.RunView<{
      ID: string; OrderNumber: string; OrderDate: Date; Status: OrderStatus;
      CustomerOrganizationID: string | null; JournalEntryID: string | null;
      ConfirmedAt: Date | null; Description: string | null;
    }>({
      EntityName: ORDER_ENTITY,
      Fields: ['ID', 'OrderNumber', 'OrderDate', 'Status', 'CustomerOrganizationID', 'JournalEntryID', 'ConfirmedAt', 'Description'],
      OrderBy: '__mj_CreatedAt DESC',
      MaxRows: 200,
      ResultType: 'simple',
    });
    const rows = res.Results ?? [];
    const orderIds = rows.map(r => r.ID);
    const [stats, jePresence] = await Promise.all([
      this.loadOrderStats(orderIds),
      this.loadAccountingJEPresence(orderIds),
    ]);
    this.AllOrders = rows.map(r => ({
      ID: r.ID,
      OrderNumber: r.OrderNumber,
      OrderDate: r.OrderDate,
      Status: r.Status,
      CustomerOrganizationID: r.CustomerOrganizationID,
      JournalEntryID: r.JournalEntryID,
      HasAccountingJE: jePresence.has(r.ID.toUpperCase()) || !!r.JournalEntryID,
      ConfirmedAt: r.ConfirmedAt,
      Description: r.Description,
      Total: stats.get(r.ID.toUpperCase())?.total ?? 0,
      LineCount: stats.get(r.ID.toUpperCase())?.count ?? 0,
    }));
  }

  /** Order-level: which of these orders have ≥1 journal entry in accounting (by JournalEntry.OrderID). */
  private async loadAccountingJEPresence(orderIds: string[]): Promise<Set<string>> {
    const present = new Set<string>();
    if (orderIds.length === 0) return present;
    const inList = orderIds.map(id => `'${id}'`).join(',');
    const res = await new RunView().RunView<{ OrderID: string | null }>({
      EntityName: JE_ENTITY, ExtraFilter: `OrderID IN (${inList})`, Fields: ['OrderID'], ResultType: 'simple',
    });
    for (const r of res.Results ?? []) if (r.OrderID) present.add(r.OrderID.toUpperCase());
    return present;
  }

  /** One batched read of all lines for the listed orders → per-order total + line count. */
  private async loadOrderStats(orderIds: string[]): Promise<Map<string, { total: number; count: number }>> {
    const stats = new Map<string, { total: number; count: number }>();
    if (orderIds.length === 0) return stats;
    const inList = orderIds.map(id => `'${id}'`).join(',');
    const rv = new RunView();
    const res = await rv.RunView<{ OrderID: string; Quantity: number; UnitPrice: number }>({
      EntityName: ORDER_LINE_ENTITY,
      ExtraFilter: `OrderID IN (${inList})`,
      Fields: ['OrderID', 'Quantity', 'UnitPrice'],
      ResultType: 'simple',
    });
    for (const l of res.Results ?? []) {
      const key = l.OrderID.toUpperCase();
      const cur = stats.get(key) ?? { total: 0, count: 0 };
      cur.total += Number(l.Quantity) * Number(l.UnitPrice);
      cur.count += 1;
      stats.set(key, cur);
    }
    return stats;
  }

  // ─── filtered views + lanes ──────────────────────────────────────────────────

  /** Orders after the text search (lane filtering happens in LaneData). */
  public get FilteredOrders(): OrderRow[] {
    const q = this.Search.trim().toLowerCase();
    return q ? this.AllOrders.filter(o => this.matchesSearch(o, q)) : this.AllOrders;
  }

  private matchesSearch(o: OrderRow, q: string): boolean {
    return o.OrderNumber.toLowerCase().includes(q)
      || (o.Description?.toLowerCase().includes(q) ?? false);
  }

  /** The lanes to render — the selected subset, or all lanes when nothing is selected. */
  public get VisibleLanes(): OrderStatus[] {
    return this.SelectedLanes.size > 0 ? LANES.filter(s => this.SelectedLanes.has(s)) : [...LANES];
  }

  public get LaneData(): Lane[] {
    const orders = this.FilteredOrders;
    return this.VisibleLanes.map(status => {
      const laneOrders = orders.filter(o => o.Status === status);
      return {
        Status: status,
        Orders: laneOrders,
        Count: laneOrders.length,
        Total: laneOrders.reduce((s, o) => s + o.Total, 0),
      };
    });
  }

  public get TotalOrders(): number {
    return this.AllOrders.length;
  }
  public get ConfirmedCount(): number {
    return this.AllOrders.filter(o => o.Status === 'Confirmed').length;
  }
  public get BookedCount(): number {
    return this.AllOrders.filter(o => !!o.JournalEntryID).length;
  }
  public get BookedValue(): number {
    return this.AllOrders.filter(o => !!o.JournalEntryID).reduce((s, o) => s + o.Total, 0);
  }

  /** Toggle a lane in/out of the shown set (multi-select). */
  public ToggleLane(status: OrderStatus): void {
    const next = new Set(this.SelectedLanes);
    if (next.has(status)) next.delete(status); else next.add(status);
    this.SelectedLanes = next;
    this.cdr.markForCheck();
  }
  public IsLaneSelected(status: OrderStatus): boolean {
    return this.SelectedLanes.has(status);
  }
  public get AllLanesShown(): boolean {
    return this.SelectedLanes.size === 0;
  }
  public ShowAllLanes(): void {
    this.SelectedLanes = new Set();
    this.cdr.markForCheck();
  }

  // ─── lifecycle movement — the pipeline state machine ─────────────────────────
  // Draft ⇄ Quoted (free) · Quoted → Confirmed (confirm; books the JE, auto-advances to Posted) ·
  // Confirmed: no arrows (auto-advances) + a status-refresh · Posted → Fulfilled (confirm) · no going back
  // once posted. Void (Draft/Quoted only, confirm). Every action shows the standardized per-card spinner.

  public IsMoving(o: OrderRow): boolean { return this.MovingOrderID === o.ID; }
  public AnyMoving(): boolean { return this.MovingOrderID !== null; }

  public CanMoveForward(o: OrderRow): boolean { return this.forwardTarget(o) !== null; }
  public CanMoveBack(o: OrderRow): boolean { return o.Status === 'Quoted'; } // only Quoted → Draft
  public CanVoid(o: OrderRow): boolean { return o.Status === 'Draft' || o.Status === 'Quoted'; }
  public CanRefresh(o: OrderRow): boolean { return o.Status === 'Confirmed'; }

  private forwardTarget(o: OrderRow): OrderStatus | null {
    switch (o.Status) {
      case 'Draft': return 'Quoted';
      case 'Quoted': return 'Confirmed';
      case 'Posted': return 'Fulfilled';
      default: return null; // Confirmed auto-advances; Fulfilled/Voided are terminal
    }
  }
  public ForwardTitle(o: OrderRow): string {
    const t = this.forwardTarget(o);
    return t ? `Move to ${t}` : 'Move forward';
  }

  /** Forward: Draft→Quoted is immediate; Quoted→Confirmed and Posted→Fulfilled prompt a confirmation first. */
  public MoveForward(o: OrderRow): void {
    const target = this.forwardTarget(o);
    if (!target || this.MovingOrderID) return;
    if (target === 'Confirmed') {
      this.askConfirm('Confirm order',
        `You're about to confirm order ${o.OrderNumber}. This books a balanced journal entry into the accounting system and cannot be undone.`,
        'Confirm order', false, () => this.applyStatus(o, 'Confirmed'));
    } else if (target === 'Fulfilled') {
      this.askConfirm('Fulfill order',
        `Fulfilling order ${o.OrderNumber} recognizes any deferred revenue that isn't on a recognition schedule. This cannot be undone.`,
        'Fulfill order', false, () => this.applyStatus(o, 'Fulfilled'));
    } else {
      void this.applyStatus(o, target);
    }
  }

  public MoveBack(o: OrderRow): void {
    if (o.Status !== 'Quoted' || this.MovingOrderID) return;
    void this.applyStatus(o, 'Draft');
  }

  public Void(o: OrderRow): void {
    if (!this.CanVoid(o) || this.MovingOrderID) return;
    this.askConfirm('Void order',
      `Void order ${o.OrderNumber}? This cancels the order and it will move to the Voided lane.`,
      'Void order', true, () => this.applyStatus(o, 'Voided'));
  }

  /** An order stuck in Confirmed with NOTHING in accounting yet — surfaces a clickable warning. */
  public NeedsAttention(o: OrderRow): boolean {
    return o.Status === 'Confirmed' && !o.HasAccountingJE;
  }

  /** Per-order reason from the last failed nudge (transient, session-scoped). */
  public NudgeErrors = new Map<string, string>();
  public NudgeMessage(o: OrderRow): string {
    return this.NudgeErrors.get(o.ID)
      ?? 'This order is confirmed but its journal entries are not in accounting yet. Recheck to post them.';
  }

  // ── warning dialog ──
  public WarnVisible = false;
  public WarnOrderID: string | null = null;
  public get WarnOrder(): OrderRow | null { return this.AllOrders.find(o => o.ID === this.WarnOrderID) ?? null; }
  public OpenWarning(o: OrderRow): void { this.WarnOrderID = o.ID; this.WarnVisible = true; this.cdr.markForCheck(); }
  public CloseWarning(): void { this.WarnVisible = false; this.cdr.markForCheck(); }
  public RecheckFromWarning(): void {
    const o = this.WarnOrder;
    this.CloseWarning();
    if (o) void this.RefreshStatus(o);
  }

  /**
   * Nudge a Confirmed order (order-level): re-check accounting for THIS order's journal entries. If any are
   * already in, catch the order up to Posted. If none are in and nothing's mid-flight, re-attempt booking
   * (a Confirmed save re-fires OrderEntityServer, guarded idempotently by the stamped JournalEntryID). On a
   * failed attempt, capture the reason for the warning. The per-card spinner (MovingOrderID) is the in-flight
   * guard, so the same user can't fire concurrent attempts.
   */
  public async RefreshStatus(o: OrderRow): Promise<void> {
    if (o.Status !== 'Confirmed' || this.MovingOrderID) return;
    this.MovingOrderID = o.ID;
    this.LoadError = null;
    this.cdr.markForCheck();
    try {
      const alreadyIn = (await this.orderHasAccountingJE(o.ID)) || !!o.JournalEntryID;
      const order = await new Metadata().GetEntityObject<mjBizAppsOrdersOrderEntity>(ORDER_ENTITY);
      if (!(await order.Load(o.ID))) throw new Error(`could not load order ${o.OrderNumber}`);

      if (alreadyIn || order.JournalEntryID) {
        // Journal entries are in accounting — advance the order to Posted.
        if (order.Status !== 'Posted') {
          order.Status = 'Posted';
          if (!(await order.Save())) throw new Error(order.LatestResult?.CompleteMessage ?? 'could not advance to Posted');
        }
        this.NudgeErrors.delete(o.ID);
      } else {
        // Nothing in accounting yet — re-attempt booking (server books on a Confirmed save).
        order.Status = 'Confirmed';
        const ok = await order.Save();
        const nowIn = ok && (!!order.JournalEntryID || (await this.orderHasAccountingJE(o.ID)));
        if (nowIn) this.NudgeErrors.delete(o.ID);
        else this.NudgeErrors.set(o.ID, order.LatestResult?.CompleteMessage?.trim()
          || 'The journal entries could not be posted to accounting. A common cause is a product (or its company) missing a linked GL account — open the order to review its lines.');
      }
      await this.loadOrders();
    } catch (e) {
      this.NudgeErrors.set(o.ID, e instanceof Error ? e.message : String(e));
    } finally {
      this.MovingOrderID = null;
      this.cdr.markForCheck();
    }
  }

  /** Order-level: does accounting hold ≥1 journal entry for this order (by JournalEntry.OrderID)? */
  private async orderHasAccountingJE(orderId: string): Promise<boolean> {
    const res = await new RunView().RunView<{ ID: string }>({
      EntityName: JE_ENTITY, ExtraFilter: `OrderID='${orderId}'`, Fields: ['ID'], MaxRows: 1, ResultType: 'simple',
    });
    return res.Success && (res.Results?.length ?? 0) > 0;
  }

  /**
   * Persist a status change (the ONE write path — standardized spinner + reload). `onlyIfBooked` guards
   * the Confirmed→Posted catch-up so refresh only advances an order whose journal entry actually booked.
   */
  private async applyStatus(o: OrderRow, status: OrderStatus, onlyIfBooked = false): Promise<void> {
    this.MovingOrderID = o.ID;
    this.LoadError = null;
    this.cdr.markForCheck();
    try {
      const order = await new Metadata().GetEntityObject<mjBizAppsOrdersOrderEntity>(ORDER_ENTITY);
      if (!(await order.Load(o.ID))) throw new Error(`could not load order ${o.OrderNumber}`);
      if (onlyIfBooked && !order.JournalEntryID) {
        this.LoadError = `Order ${o.OrderNumber} isn't posted yet — its journal entry hasn't booked. Try again shortly.`;
        return;
      }
      order.Status = status;
      if (!(await order.Save())) throw new Error(order.LatestResult?.CompleteMessage ?? 'save failed');
      await this.loadOrders(); // a Confirm books the JE + auto-advances to Posted server-side
    } catch (e) {
      this.LoadError = `Couldn't update order ${o.OrderNumber}: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      this.MovingOrderID = null;
      this.cdr.markForCheck();
    }
  }

  // ─── confirmation dialog (reused for Confirm / Fulfill / Void) ────────────────
  private askConfirm(title: string, message: string, label: string, danger: boolean, action: () => Promise<void>): void {
    this.ConfirmTitle = title; this.ConfirmMessage = message; this.ConfirmLabel = label; this.ConfirmDanger = danger;
    this.pendingAction = action; this.ConfirmVisible = true; this.cdr.markForCheck();
  }
  public OnConfirmCancel(): void {
    this.ConfirmVisible = false; this.pendingAction = null; this.cdr.markForCheck();
  }
  public async OnConfirmProceed(): Promise<void> {
    const action = this.pendingAction;
    this.ConfirmVisible = false; this.pendingAction = null; this.cdr.markForCheck();
    if (action) await action();
  }

  // ─── selection + detail ────────────────────────────────────────────────────

  protected override OnQueryParamsChanged(params: Record<string, string>): void {
    const orderId = params['order'];
    if (orderId && orderId !== this.SelectedOrderID) {
      void this.SelectOrderById(orderId);
    } else if (!orderId && this.SelectedOrderID) {
      this.clearSelection();
    }
  }

  public async SelectOrder(row: OrderRow): Promise<void> {
    this.UpdateQueryParams({ order: row.ID });
    await this.SelectOrderById(row.ID);
  }

  public async SelectOrderById(orderId: string): Promise<void> {
    this.SelectedOrderID = orderId;
    this.DetailLoading = true;
    this.DetailLines = [];
    this.DetailJE = null;
    this.DetailJELines = [];
    this.cdr.markForCheck();
    try {
      const order = this.AllOrders.find(o => o.ID.toUpperCase() === orderId.toUpperCase());
      await this.loadDetailLines(orderId);
      if (order?.JournalEntryID) await this.loadDetailJE(order.JournalEntryID);
    } catch (e) {
      this.LoadError = e instanceof Error ? e.message : String(e);
    } finally {
      this.DetailLoading = false;
      this.cdr.markForCheck();
    }
  }

  public CloseDetail(): void {
    this.UpdateQueryParams({ order: null });
    this.clearSelection();
  }

  private clearSelection(): void {
    this.SelectedOrderID = null;
    this.DetailLines = [];
    this.DetailJE = null;
    this.DetailJELines = [];
    this.cdr.markForCheck();
  }

  public get SelectedOrder(): OrderRow | null {
    return this.AllOrders.find(o => o.ID === this.SelectedOrderID) ?? null;
  }

  private async loadDetailLines(orderId: string): Promise<void> {
    const rv = new RunView();
    const res = await rv.RunView<{ LineNumber: number; Product: string | null; Quantity: number; UnitPrice: number }>({
      EntityName: ORDER_LINE_ENTITY,
      ExtraFilter: `OrderID='${orderId}'`,
      Fields: ['LineNumber', 'Product', 'Quantity', 'UnitPrice'],
      OrderBy: 'LineNumber ASC',
      ResultType: 'simple',
    });
    this.DetailLines = (res.Results ?? []).map(l => ({
      LineNumber: l.LineNumber,
      Product: l.Product ?? '(product)',
      Quantity: Number(l.Quantity),
      UnitPrice: Number(l.UnitPrice),
      Amount: Number(l.Quantity) * Number(l.UnitPrice),
    }));
  }

  private async loadDetailJE(jeId: string): Promise<void> {
    const rv = new RunView();
    const [header, lines] = await rv.RunViews([
      { EntityName: JE_ENTITY, ExtraFilter: `ID='${jeId}'`, Fields: ['EntryNumber', 'EntryType', 'Status'], ResultType: 'simple' },
      { EntityName: JE_LINE_ENTITY, ExtraFilter: `JournalEntryID='${jeId}'`, Fields: ['GLAccount', 'GLAccountID', 'DebitAmount', 'CreditAmount', 'LineNumber'], OrderBy: 'LineNumber ASC', ResultType: 'simple' },
    ]);
    const h = (header.Results ?? [])[0] as { EntryNumber: string; EntryType: string; Status: string } | undefined;
    const ls = (lines.Results ?? []) as Array<{ GLAccount: string | null; GLAccountID: string; DebitAmount: number | null; CreditAmount: number | null }>;
    const dr = ls.reduce((s, l) => s + Number(l.DebitAmount ?? 0), 0);
    const cr = ls.reduce((s, l) => s + Number(l.CreditAmount ?? 0), 0);
    this.DetailJELines = ls.map(l => ({
      Account: l.GLAccount ?? l.GLAccountID,
      Debit: Number(l.DebitAmount ?? 0),
      Credit: Number(l.CreditAmount ?? 0),
    }));
    this.DetailJE = {
      EntryNumber: h?.EntryNumber ?? '(pending)',
      EntryType: h?.EntryType ?? 'OrderBooking',
      Status: h?.Status ?? '',
      TotalDebits: dr,
      TotalCredits: cr,
      LineCount: ls.length,
      Balanced: Math.abs(dr - cr) < 0.005,
    };
  }

  /** Drill through to the accounting Journal Entry record via the host navigation. */
  public OpenInAccounting(): void {
    const jeId = this.SelectedOrder?.JournalEntryID;
    if (!jeId) return;
    this.forms.Open({ EntityName: JE_ENTITY, PrimaryKey: CompositeKey.FromID(jeId), Presentation: 'dialog', Width: '94vw' });
  }

  // ─── presentation helpers ────────────────────────────────────────────────────

  public StatusVariant(status: OrderStatus): string {
    switch (status) {
      case 'Confirmed': return 'success';
      case 'Posted':
      case 'Fulfilled': return 'info';
      case 'Voided': return 'error';
      default: return 'warning';
    }
  }

  public LaneIcon(status: OrderStatus): string {
    switch (status) {
      case 'Draft': return 'fa-solid fa-pen-ruler';
      case 'Quoted': return 'fa-solid fa-file-invoice-dollar';
      case 'Confirmed': return 'fa-solid fa-circle-check';
      case 'Posted': return 'fa-solid fa-book';
      case 'Fulfilled': return 'fa-solid fa-truck-fast';
      case 'Voided': return 'fa-solid fa-ban';
      default: return 'fa-solid fa-receipt';
    }
  }
}
