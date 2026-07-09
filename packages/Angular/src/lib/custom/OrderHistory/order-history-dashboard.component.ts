import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseDashboard } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { RunView } from '@memberjunction/core';
import { MjButtonVariant } from '@memberjunction/ng-ui-components';
import { mjBizAppsOrdersOrderEntity } from '@mj-biz-apps/orders-entities';

/** Generated value-list union (rule 2c: derived from the entity, never hand-copied). */
type OrderStatus = mjBizAppsOrdersOrderEntity['Status'];

const STATUS_ORDER: readonly OrderStatus[] = ['Draft', 'Quoted', 'Confirmed', 'Posted', 'Fulfilled', 'Voided'];

const ORDER_ENTITY = 'MJ_BizApps_Orders: Orders';
const ORDER_LINE_ENTITY = 'MJ_BizApps_Orders: Order Lines';
const ORG_ENTITY = 'MJ_BizApps_Common: Organizations';

/** One order row in the history table (with its rolled-up line totals + product set). */
export interface OrderRow {
  ID: string;
  OrderNumber: string;
  OrderDate: Date | null;
  Status: OrderStatus;
  CustomerOrganizationID: string | null;
  CustomerName: string;
  JournalEntryID: string | null;
  LineCount: number;
  Total: number;
  ProductIDs: string[];
  ProductNames: string[];
}

type SortField = 'OrderNumber' | 'Status' | 'OrderDate' | 'CustomerName' | 'ProductNames' | 'LineCount' | 'Total';

/**
 * Order History — a filterable, sortable history of orders (mirrors the accounting Batch Status page).
 * Filters: status toggles, a Customer dropdown (with All), a searchable multi-select Products picker (with
 * All), and a time-span (From/To on the order date). Sortable columns; small header stat-badges. All data is
 * client-side RunView (orders + their lines for totals/products; customer names resolved from Organizations).
 */
@Component({
  standalone: false,
  selector: 'mj-order-history-dashboard',
  templateUrl: './order-history-dashboard.component.html',
  styleUrls: ['./order-history-dashboard.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
@RegisterClass(BaseDashboard, 'OrderHistoryDashboard')
export class OrderHistoryDashboardComponent extends BaseDashboard {
  public IsLoading = false;
  public LoadError: string | null = null;

  public Orders: OrderRow[] = [];
  public Customers: { ID: string; Name: string }[] = [];
  public Products: { ID: string; Name: string }[] = [];

  public readonly StatusOptions = STATUS_ORDER;

  /** Filters. Empty status/product sets = show all; null customer = All. */
  public SelectedStatuses = new Set<OrderStatus>();
  public SelectedCustomerID: string | null = null;
  public SelectedProductIDs = new Set<string>();
  public ProductSearch = '';
  public ShowProductMenu = false;
  public FromDate: string | null = null;
  public ToDate: string | null = null;
  /** Which moving-window preset is active (drives button highlighting); null when the range is custom/unbounded. */
  public ActiveWindow: 'today' | '7d' | '30d' | null = null;

  public SortField: SortField = 'OrderDate';
  public SortDir: 'asc' | 'desc' = 'desc';

  private cdr = inject(ChangeDetectorRef);

  async GetResourceDisplayName(_data: ResourceData): Promise<string> { return 'Order History'; }
  protected initDashboard(): void { /* no persisted UI state for v1 */ }

  protected async loadData(): Promise<void> {
    this.IsLoading = true;
    this.LoadError = null;
    try {
      await this.loadAll();
    } catch (e) {
      this.LoadError = e instanceof Error ? e.message : String(e);
    } finally {
      this.IsLoading = false;
      this.cdr.markForCheck();
    }
    // BaseDashboard.ngOnInit() calls NotifyLoadComplete() after loadData() resolves.
  }

  public async Reload(): Promise<void> {
    this.IsLoading = true; this.LoadError = null; this.cdr.markForCheck();
    try { await this.loadAll(); }
    catch (e) { this.LoadError = e instanceof Error ? e.message : String(e); }
    finally { this.IsLoading = false; this.cdr.markForCheck(); }
  }

  // ─── status filter ────────────────────────────────────────────────────────
  public ToggleStatus(s: OrderStatus): void { this.SelectedStatuses.has(s) ? this.SelectedStatuses.delete(s) : this.SelectedStatuses.add(s); this.cdr.markForCheck(); }
  public IsStatusOn(s: OrderStatus): boolean { return this.SelectedStatuses.has(s); }
  public ShowAllStatuses(): void { this.SelectedStatuses.clear(); this.cdr.markForCheck(); }
  public get AllStatusesShown(): boolean { return this.SelectedStatuses.size === 0; }
  public StatusVariant(active: boolean): MjButtonVariant { return active ? 'primary' : 'flat'; }
  public BadgeVariant(s: OrderStatus): 'success' | 'warning' | 'error' | 'info' | 'default' {
    switch (s) {
      case 'Posted': case 'Fulfilled': return 'success';
      case 'Voided': return 'error';
      case 'Confirmed': return 'info';
      case 'Draft': case 'Quoted': return 'warning';
      default: return 'default';
    }
  }

  // ─── customer + date filters ─────────────────────────────────────────────────
  public OnCustomerChange(id: string): void { this.SelectedCustomerID = id || null; this.cdr.markForCheck(); }
  public OnFromDateChange(v: string): void { this.FromDate = v || null; this.ActiveWindow = null; this.cdr.markForCheck(); }
  public OnToDateChange(v: string): void { this.ToDate = v || null; this.ActiveWindow = null; this.cdr.markForCheck(); }

  /** Moving-window presets (Robert 2026-07-09: "last day/week/month" windows). Sets the From/To range. */
  public ApplyWindow(win: 'today' | '7d' | '30d'): void {
    const to = new Date();
    const from = new Date();
    if (win === '7d') from.setDate(from.getDate() - 6);
    else if (win === '30d') from.setDate(from.getDate() - 29);
    this.FromDate = this.toDateInput(from);
    this.ToDate = this.toDateInput(to);
    this.ActiveWindow = win;
    this.cdr.markForCheck();
  }
  public ClearWindow(): void { this.FromDate = null; this.ToDate = null; this.ActiveWindow = null; this.cdr.markForCheck(); }
  public IsWindowOn(win: 'today' | '7d' | '30d'): boolean { return this.ActiveWindow === win; }

  /** Local-time yyyy-MM-dd for a native <input type="date"> (matches inSpan's day-granularity parsing). */
  private toDateInput(d: Date): string {
    const m = `${d.getMonth() + 1}`.padStart(2, '0');
    const day = `${d.getDate()}`.padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  }

  // ─── product multi-select (searchable) ───────────────────────────────────────
  public ToggleProductMenu(): void { this.ShowProductMenu = !this.ShowProductMenu; this.cdr.markForCheck(); }
  public OnProductSearch(v: string): void { this.ProductSearch = v; this.cdr.markForCheck(); }
  public ToggleProduct(id: string): void { this.SelectedProductIDs.has(id) ? this.SelectedProductIDs.delete(id) : this.SelectedProductIDs.add(id); this.cdr.markForCheck(); }
  public IsProductOn(id: string): boolean { return this.SelectedProductIDs.has(id); }
  public ClearProducts(): void { this.SelectedProductIDs.clear(); this.cdr.markForCheck(); }
  public get AllProductsShown(): boolean { return this.SelectedProductIDs.size === 0; }
  public get ProductButtonLabel(): string { return this.AllProductsShown ? 'All products' : `${this.SelectedProductIDs.size} selected`; }
  public get FilteredProductOptions(): { ID: string; Name: string }[] {
    const q = this.ProductSearch.trim().toLowerCase();
    return q ? this.Products.filter(p => p.Name.toLowerCase().includes(q)) : this.Products;
  }

  // ─── sort ─────────────────────────────────────────────────────────────────
  public SortBy(field: SortField): void {
    if (this.SortField === field) this.SortDir = this.SortDir === 'asc' ? 'desc' : 'asc';
    else { this.SortField = field; this.SortDir = field === 'OrderDate' ? 'desc' : 'asc'; }
    this.cdr.markForCheck();
  }
  public SortIcon(field: SortField): string {
    if (this.SortField !== field) return 'fa-solid fa-sort';
    return this.SortDir === 'asc' ? 'fa-solid fa-sort-up' : 'fa-solid fa-sort-down';
  }

  // ─── filtered view ──────────────────────────────────────────────────────────
  public get FilteredOrders(): OrderRow[] {
    const rows = this.Orders.filter(o =>
      (this.SelectedStatuses.size === 0 || this.SelectedStatuses.has(o.Status)) &&
      (!this.SelectedCustomerID || o.CustomerOrganizationID === this.SelectedCustomerID) &&
      (this.SelectedProductIDs.size === 0 || o.ProductIDs.some(pid => this.SelectedProductIDs.has(pid))) &&
      this.inSpan(o));
    return this.sortRows(rows);
  }
  public get FilteredCount(): number { return this.FilteredOrders.length; }
  public statusCount(s: OrderStatus): number { return this.FilteredOrders.filter(o => o.Status === s).length; }

  private inSpan(o: OrderRow): boolean {
    if (!this.FromDate && !this.ToDate) return true;
    if (!o.OrderDate) return false;
    const t = o.OrderDate.getTime();
    const fromT = this.FromDate ? new Date(this.FromDate).getTime() : -Infinity;
    const toT = this.ToDate ? new Date(`${this.ToDate}T23:59:59`).getTime() : Infinity;
    return t >= fromT && t <= toT;
  }

  private sortRows(rows: OrderRow[]): OrderRow[] {
    const dir = this.SortDir === 'asc' ? 1 : -1;
    const f = this.SortField;
    return [...rows].sort((a, b) => this.compare(a, b, f) * dir);
  }
  private compare(a: OrderRow, b: OrderRow, f: SortField): number {
    const av = a[f], bv = b[f];
    if (av instanceof Date || bv instanceof Date) return (av instanceof Date ? av.getTime() : 0) - (bv instanceof Date ? bv.getTime() : 0);
    if (typeof av === 'number' && typeof bv === 'number') return av - bv;
    // Products is a name array — sort alphabetically by its (already-sorted) joined names.
    if (Array.isArray(av) || Array.isArray(bv)) {
      return (Array.isArray(av) ? av.join(', ') : '').localeCompare(Array.isArray(bv) ? bv.join(', ') : '', undefined, { sensitivity: 'base' });
    }
    return String(av ?? '').localeCompare(String(bv ?? ''));
  }

  // ─── data loading ────────────────────────────────────────────────────────────
  private async loadAll(): Promise<void> {
    const [orders, lineAgg] = await Promise.all([this.loadOrders(), this.loadLineAggregates()]);
    await this.resolveCustomers(orders);
    this.Orders = orders.map(o => this.toRow(o, lineAgg));
    this.Products = this.distinctProducts(lineAgg);
    this.cdr.markForCheck();
  }

  private toRow(
    o: { ID: string; OrderNumber: string; OrderDate: Date | null; Status: OrderStatus; CustomerOrganizationID: string | null; JournalEntryID: string | null },
    agg: Map<string, { total: number; count: number; products: Map<string, string> }>,
  ): OrderRow {
    const a = agg.get(o.ID);
    return {
      ...o,
      CustomerName: o.CustomerOrganizationID ? (this.customerNames.get(o.CustomerOrganizationID) ?? '—') : '—',
      LineCount: a?.count ?? 0,
      Total: a ? Math.round(a.total * 100) / 100 : 0,
      ProductIDs: a ? [...a.products.keys()] : [],
      ProductNames: a ? [...a.products.values()].sort((x, y) => x.localeCompare(y)) : [],
    };
  }

  private customerNames = new Map<string, string>();

  private async loadOrders(): Promise<Array<{ ID: string; OrderNumber: string; OrderDate: Date | null; Status: OrderStatus; CustomerOrganizationID: string | null; JournalEntryID: string | null }>> {
    const res = await this.runView().RunView<{ ID: string; OrderNumber: string; OrderDate: string | null; Status: OrderStatus; CustomerOrganizationID: string | null; JournalEntryID: string | null }>(
      { EntityName: ORDER_ENTITY, Fields: ['ID', 'OrderNumber', 'OrderDate', 'Status', 'CustomerOrganizationID', 'JournalEntryID'], OrderBy: 'OrderDate DESC', ResultType: 'simple' }, this.contextUser());
    return (res.Results ?? []).map(o => ({ ...o, OrderDate: o.OrderDate ? new Date(o.OrderDate) : null }));
  }

  /** order → { total = Σ Qty*UnitPrice, line count, product id→name map }. */
  private async loadLineAggregates(): Promise<Map<string, { total: number; count: number; products: Map<string, string> }>> {
    const res = await this.runView().RunView<{ OrderID: string; ProductID: string; Product: string | null; Quantity: number; UnitPrice: number }>(
      { EntityName: ORDER_LINE_ENTITY, Fields: ['OrderID', 'ProductID', 'Product', 'Quantity', 'UnitPrice'], ResultType: 'simple' }, this.contextUser());
    const agg = new Map<string, { total: number; count: number; products: Map<string, string> }>();
    for (const l of res.Results ?? []) {
      const cur = agg.get(l.OrderID) ?? { total: 0, count: 0, products: new Map<string, string>() };
      cur.total += Number(l.Quantity) * Number(l.UnitPrice);
      cur.count += 1;
      cur.products.set(l.ProductID, l.Product ?? '(product)');
      agg.set(l.OrderID, cur);
    }
    return agg;
  }

  private distinctProducts(agg: Map<string, { products: Map<string, string> }>): { ID: string; Name: string }[] {
    const map = new Map<string, string>();
    for (const a of agg.values()) for (const [id, name] of a.products) map.set(id, name);
    return [...map].map(([ID, Name]) => ({ ID, Name })).sort((x, y) => x.Name.localeCompare(y.Name));
  }

  /** Resolve customer-org names for the dropdown (guarded — soft cross-app ref; no-op when no customers set). */
  private async resolveCustomers(orders: Array<{ CustomerOrganizationID: string | null }>): Promise<void> {
    const ids = [...new Set(orders.map(o => o.CustomerOrganizationID).filter((id): id is string => !!id))];
    this.customerNames = new Map();
    this.Customers = [];
    if (ids.length === 0) return;
    const inList = ids.map(id => `'${id}'`).join(',');
    const res = await this.runView().RunView<{ ID: string; Name: string }>(
      { EntityName: ORG_ENTITY, ExtraFilter: `ID IN (${inList})`, Fields: ['ID', 'Name'], ResultType: 'simple' }, this.contextUser());
    if (res.Success) {
      this.customerNames = new Map((res.Results ?? []).map(c => [c.ID, c.Name]));
    }
    this.Customers = ids.map(id => ({ ID: id, Name: this.customerNames.get(id) ?? id })).sort((a, b) => a.Name.localeCompare(b.Name));
  }

  // ─── plumbing ────────────────────────────────────────────────────────────────
  private runView(): RunView { return RunView.FromMetadataProvider(this.ProviderToUse); }
  private contextUser() { return this.ProviderToUse.CurrentUser; }
}

/** Tree-shaking prevention — called from public-api.ts. */
export function LoadOrderHistoryDashboard(): void {
  // No-op.
}
