import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { BaseDashboard } from '@memberjunction/ng-shared';
import { RegisterClass } from '@memberjunction/global';
import { CompositeKey, RunView } from '@memberjunction/core';
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

  public readonly Lanes: readonly OrderStatus[] = LANES;

  public IsBusy = false;
  public LoadError: string | null = null;

  public AllOrders: OrderRow[] = [];

  // ─── filters ───────────────────────────────────────────────────────────────
  public StatusFilter: OrderStatus | 'All' = 'All';
  public Search = '';

  // ─── selected-order detail ───────────────────────────────────────────────────
  public SelectedOrderID: string | null = null;
  public DetailLoading = false;
  public DetailLines: OrderLineRow[] = [];
  public DetailJE: JESummary | null = null;
  public DetailJELines: JELineRow[] = [];

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
    const stats = await this.loadOrderStats(rows.map(r => r.ID));
    this.AllOrders = rows.map(r => ({
      ID: r.ID,
      OrderNumber: r.OrderNumber,
      OrderDate: r.OrderDate,
      Status: r.Status,
      CustomerOrganizationID: r.CustomerOrganizationID,
      JournalEntryID: r.JournalEntryID,
      ConfirmedAt: r.ConfirmedAt,
      Description: r.Description,
      Total: stats.get(r.ID.toUpperCase())?.total ?? 0,
      LineCount: stats.get(r.ID.toUpperCase())?.count ?? 0,
    }));
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

  public get FilteredOrders(): OrderRow[] {
    const q = this.Search.trim().toLowerCase();
    return this.AllOrders.filter(o => {
      if (this.StatusFilter !== 'All' && o.Status !== this.StatusFilter) return false;
      if (q && !this.matchesSearch(o, q)) return false;
      return true;
    });
  }

  private matchesSearch(o: OrderRow, q: string): boolean {
    return o.OrderNumber.toLowerCase().includes(q)
      || (o.Description?.toLowerCase().includes(q) ?? false);
  }

  public get LaneData(): Lane[] {
    const orders = this.FilteredOrders;
    return LANES.map(status => {
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

  public SetStatusFilter(status: OrderStatus | 'All'): void {
    this.StatusFilter = status;
    this.cdr.markForCheck();
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
    this.navigationService.OpenEntityRecord(JE_ENTITY, CompositeKey.FromID(jeId));
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
