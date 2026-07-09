import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { BaseDashboard } from '@memberjunction/ng-shared';
import { RegisterClass } from '@memberjunction/global';
import { Metadata, RunView } from '@memberjunction/core';
import { ResourceData } from '@memberjunction/core-entities';
import {
  mjBizAppsOrdersOrderEntity,
  mjBizAppsOrdersOrderLineEntity,
  mjBizAppsOrdersProductEntity,
} from '@mj-biz-apps/orders-entities';

const ORDER_ENTITY = 'MJ_BizApps_Orders: Orders';
const ORDER_LINE_ENTITY = 'MJ_BizApps_Orders: Order Lines';
const PRODUCT_ENTITY = 'MJ_BizApps_Orders: Products';
const JE_ENTITY = 'MJ_BizApps_Accounting: Journal Entries';
const JE_LINE_ENTITY = 'MJ_BizApps_Accounting: Journal Entry Lines';

/** Recognition type, derived from the generated entity union (rule 2c). */
type Recognition = mjBizAppsOrdersProductEntity['RevenueRecognitionType'];
/** Order status, derived from the generated entity union (rule 2c). */
type OrderStatus = mjBizAppsOrdersOrderEntity['Status'];

interface ProductOption {
  ID: string;
  Name: string;
  Recognition: Recognition;
}

/** A line in the order being composed (pre-save). */
interface DraftLine {
  ProductID: string;
  ProductName: string;
  Recognition: Recognition;
  Quantity: number;
  UnitPrice: number;
}

interface OrderRow {
  ID: string;
  OrderNumber: string;
  OrderDate: Date | null;
  Status: OrderStatus;
  JournalEntryID: string | null;
  Total: number;
}

/** The booked-JE summary shown after a successful Confirm. */
interface BookedSummary {
  OrderNumber: string;
  EntryNumber: string;
  EntryType: string;
  TotalDebits: number;
  TotalCredits: number;
  LineCount: number;
  Balanced: boolean;
}

/**
 * Orders Console — the interactive order-entry surface that proves the accounting integration:
 * compose an order (pick products, quantities, prices), Confirm it, and watch a balanced journal
 * entry get booked into BizApps Accounting in real time.
 *
 * All data access is client-side (RunView + BaseEntity Save over GraphQL). Confirming an order —
 * setting Status='Confirmed' and Save() — fires OrderEntityServer on MJAPI, which resolves the
 * GL accounts and books the JE via the Accounting.CreateJournalEntry op; the server stamps the
 * order's JournalEntryID, which we read back to celebrate the booking.
 */
@Component({
  standalone: false,
  selector: 'mj-orders-console-dashboard',
  templateUrl: './orders-console-dashboard.component.html',
  styleUrls: ['./orders-console-dashboard.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
@RegisterClass(BaseDashboard, 'OrdersConsoleDashboard')
export class OrdersConsoleDashboardComponent extends BaseDashboard {
  private cdr = inject(ChangeDetectorRef);

  public IsLoading = false;
  public LoadError: string | null = null;

  public Products: ProductOption[] = [];
  public RecentOrders: OrderRow[] = [];

  // ─── order composer state ────────────────────────────────────────────────
  public DraftLines: DraftLine[] = [];
  /** Optional human-friendly name/description for the order (Robert 2026-07-09: "ability to name orders"). */
  public NewOrderName = '';
  public SelectedProductID = '';
  public NewQuantity = 1;
  public NewUnitPrice: number | null = null;

  public Booking = false;
  public ActionMessage: string | null = null;
  public ActionIsError = false;
  /** Non-null right after a successful Confirm — drives the celebratory booked-JE card. */
  public Booked: BookedSummary | null = null;

  // ─── recent-order detail (JE lines) ──────────────────────────────────────
  public SelectedOrderID: string | null = null;
  public SelectedJELines: Array<{ Account: string; Debit: number; Credit: number }> = [];

  async GetResourceDisplayName(_data: ResourceData): Promise<string> {
    return 'Orders Console';
  }

  protected initDashboard(): void {
    // One-time setup; data loads in loadData(). No persisted UI state for v1.
  }

  protected async loadData(): Promise<void> {
    this.IsLoading = true;
    this.LoadError = null;
    this.cdr.markForCheck();
    try {
      await Promise.all([this.loadProducts(), this.loadRecentOrders()]);
    } catch (e) {
      this.LoadError = e instanceof Error ? e.message : String(e);
    } finally {
      this.IsLoading = false;
      this.cdr.markForCheck();
      // BaseDashboard.ngOnInit() calls NotifyLoadComplete() after loadData() resolves.
    }
  }

  private async loadProducts(): Promise<void> {
    const rv = new RunView();
    const res = await rv.RunView<{ ID: string; Name: string; RevenueRecognitionType: Recognition }>({
      EntityName: PRODUCT_ENTITY,
      ExtraFilter: `IsActive = 1`,
      Fields: ['ID', 'Name', 'RevenueRecognitionType'],
      OrderBy: 'Name ASC',
      ResultType: 'simple',
    });
    this.Products = (res.Results ?? []).map(p => ({ ID: p.ID, Name: p.Name, Recognition: p.RevenueRecognitionType }));
  }

  private async loadRecentOrders(): Promise<void> {
    const rv = new RunView();
    const res = await rv.RunView<{ ID: string; OrderNumber: string; OrderDate: Date; Status: OrderStatus; JournalEntryID: string | null }>({
      EntityName: ORDER_ENTITY,
      Fields: ['ID', 'OrderNumber', 'OrderDate', 'Status', 'JournalEntryID'],
      OrderBy: '__mj_CreatedAt DESC',
      MaxRows: 25,
      ResultType: 'simple',
    });
    const rows = res.Results ?? [];
    const totals = await this.loadOrderTotals(rows.map(r => r.ID));
    this.RecentOrders = rows.map(r => ({
      ID: r.ID,
      OrderNumber: r.OrderNumber,
      OrderDate: r.OrderDate,
      Status: r.Status,
      JournalEntryID: r.JournalEntryID,
      Total: totals.get(r.ID.toUpperCase()) ?? 0,
    }));
  }

  /** One batched read of all lines for the listed orders → per-order total (no query-in-loop). */
  private async loadOrderTotals(orderIds: string[]): Promise<Map<string, number>> {
    const totals = new Map<string, number>();
    if (orderIds.length === 0) return totals;
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
      totals.set(key, (totals.get(key) ?? 0) + Number(l.Quantity) * Number(l.UnitPrice));
    }
    return totals;
  }

  // ─── composer actions ────────────────────────────────────────────────────

  public get DraftTotal(): number {
    return this.DraftLines.reduce((s, l) => s + l.Quantity * l.UnitPrice, 0);
  }
  public get CanAddLine(): boolean {
    return !!this.SelectedProductID && this.NewQuantity > 0 && (this.NewUnitPrice ?? 0) > 0;
  }
  public get CanConfirm(): boolean {
    return this.DraftLines.length > 0 && !this.Booking;
  }
  public get ConfirmedCount(): number {
    return this.RecentOrders.filter(o => o.Status === 'Confirmed').length;
  }
  public get BookedCount(): number {
    return this.RecentOrders.filter(o => !!o.JournalEntryID).length;
  }

  // ─── create-at-stage picker ──────────────────────────────────────────────────
  /** The stages a new order can be created at (later stages are reached via the pipeline board). */
  public readonly StageOptions: readonly OrderStatus[] = ['Draft', 'Quoted', 'Confirmed'];
  /** The stage the composed order is created at (default Confirmed — the book-the-JE happy path). */
  public CreateStage: OrderStatus = 'Confirmed';
  public OnCreateStageChange(v: string): void { this.CreateStage = v as OrderStatus; this.cdr.markForCheck(); }
  public get CreateButtonLabel(): string {
    return this.CreateStage === 'Confirmed' ? 'Confirm & Book' : `Create as ${this.CreateStage}`;
  }

  public AddLine(): void {
    if (!this.CanAddLine) return;
    const product = this.Products.find(p => p.ID === this.SelectedProductID);
    if (!product) return;
    this.DraftLines = [
      ...this.DraftLines,
      {
        ProductID: product.ID,
        ProductName: product.Name,
        Recognition: product.Recognition,
        Quantity: this.NewQuantity,
        UnitPrice: this.NewUnitPrice ?? 0,
      },
    ];
    this.SelectedProductID = '';
    this.NewQuantity = 1;
    this.NewUnitPrice = null;
    this.Booked = null;
    this.cdr.markForCheck();
  }

  public RemoveLine(index: number): void {
    this.DraftLines = this.DraftLines.filter((_, i) => i !== index);
    this.cdr.markForCheck();
  }

  public ResetDraft(): void {
    this.DraftLines = [];
    this.NewOrderName = '';
    this.SelectedProductID = '';
    this.NewQuantity = 1;
    this.NewUnitPrice = null;
    this.ActionMessage = null;
    this.cdr.markForCheck();
  }

  /** Create the order + lines, then flip to Confirmed (which books the JE server-side). */
  public async ConfirmOrder(): Promise<void> {
    if (!this.CanConfirm) return;
    this.Booking = true;
    this.ActionMessage = null;
    this.Booked = null;
    this.cdr.markForCheck();
    try {
      const order = await this.createDraftOrder();
      if (!order) return;
      if (this.CreateStage === 'Confirmed') {
        await this.bookAndReport(order); // Confirmed → OrderEntityServer books the JE
      } else {
        await this.finalizeAtStage(order, this.CreateStage); // Draft / Quoted → no accounting
      }
    } catch (e) {
      this.setError(e instanceof Error ? e.message : String(e));
    } finally {
      this.Booking = false;
      this.cdr.markForCheck();
    }
  }

  /** For a Draft/Quoted create: leave (or advance) the just-created order at the chosen stage. */
  private async finalizeAtStage(order: mjBizAppsOrdersOrderEntity, stage: OrderStatus): Promise<void> {
    if (stage !== 'Draft') { // createDraftOrder already saved it as Draft
      order.Status = stage;
      if (!(await order.Save())) {
        this.setError(`Order ${order.OrderNumber} created but could not be set to ${stage}: ${order.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        await this.loadRecentOrders();
        return;
      }
    }
    this.ActionMessage = `Created order ${order.OrderNumber} as ${stage}.`;
    this.ActionIsError = false;
    this.ResetDraft();
    await this.loadRecentOrders();
  }

  private async createDraftOrder(): Promise<mjBizAppsOrdersOrderEntity | null> {
    const md = new Metadata();
    const order = await md.GetEntityObject<mjBizAppsOrdersOrderEntity>(ORDER_ENTITY);
    order.NewRecord();
    order.OrderNumber = `ORD-${Date.now().toString().slice(-9)}`;
    order.OrderDate = new Date();
    order.Status = 'Draft';
    const name = this.NewOrderName.trim();
    if (name) order.Description = name;
    if (!(await order.Save())) {
      this.setError(`Could not create the order: ${order.LatestResult?.CompleteMessage ?? 'unknown error'}`);
      return null;
    }
    let n = 1;
    for (const l of this.DraftLines) {
      const line = await md.GetEntityObject<mjBizAppsOrdersOrderLineEntity>(ORDER_LINE_ENTITY);
      line.NewRecord();
      line.OrderID = order.ID;
      line.ProductID = l.ProductID;
      line.LineNumber = n++;
      line.Quantity = l.Quantity;
      line.UnitPrice = l.UnitPrice;
      if (!(await line.Save())) {
        this.setError(`Could not save line ${n - 1}: ${line.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        return null;
      }
    }
    return order;
  }

  /** Flip to Confirmed → OrderEntityServer books the JE server-side → read it back. */
  private async bookAndReport(order: mjBizAppsOrdersOrderEntity): Promise<void> {
    order.Status = 'Confirmed';
    const ok = await order.Save();
    if (!ok || !order.JournalEntryID) {
      this.setError(
        `Order ${order.OrderNumber} could not be booked — likely no GL-account link resolves for a ` +
          `product. It stays unconfirmed. (${order.LatestResult?.CompleteMessage ?? 'no journal entry returned'})`
      );
      await this.loadRecentOrders();
      return;
    }
    this.Booked = await this.summarizeJE(order.OrderNumber, order.JournalEntryID);
    this.ActionMessage = `Order ${order.OrderNumber} confirmed and booked as ${this.Booked?.EntryNumber ?? 'a journal entry'}.`;
    this.ActionIsError = false;
    this.ResetDraft();
    await this.loadRecentOrders();
  }

  private async summarizeJE(orderNumber: string, jeId: string): Promise<BookedSummary | null> {
    const rv = new RunView();
    const [header, lines] = await rv.RunViews([
      { EntityName: JE_ENTITY, ExtraFilter: `ID='${jeId}'`, Fields: ['EntryNumber', 'EntryType'], ResultType: 'simple' },
      { EntityName: JE_LINE_ENTITY, ExtraFilter: `JournalEntryID='${jeId}'`, Fields: ['DebitAmount', 'CreditAmount'], ResultType: 'simple' },
    ]);
    const h = (header.Results ?? [])[0] as { EntryNumber: string; EntryType: string } | undefined;
    const ls = (lines.Results ?? []) as Array<{ DebitAmount: number | null; CreditAmount: number | null }>;
    const dr = ls.reduce((s, l) => s + Number(l.DebitAmount ?? 0), 0);
    const cr = ls.reduce((s, l) => s + Number(l.CreditAmount ?? 0), 0);
    return {
      OrderNumber: orderNumber,
      EntryNumber: h?.EntryNumber ?? '(number pending)',
      EntryType: h?.EntryType ?? 'OrderBooking',
      TotalDebits: dr,
      TotalCredits: cr,
      LineCount: ls.length,
      Balanced: Math.abs(dr - cr) < 0.005,
    };
  }

  // ─── recent-order detail ─────────────────────────────────────────────────

  public async ViewOrderJE(row: OrderRow): Promise<void> {
    if (this.SelectedOrderID === row.ID) {
      this.SelectedOrderID = null;
      this.SelectedJELines = [];
      this.cdr.markForCheck();
      return;
    }
    this.SelectedOrderID = row.ID;
    this.SelectedJELines = [];
    if (row.JournalEntryID) {
      const rv = new RunView();
      const res = await rv.RunView<{ GLAccount: string | null; GLAccountID: string; DebitAmount: number | null; CreditAmount: number | null }>({
        EntityName: JE_LINE_ENTITY,
        ExtraFilter: `JournalEntryID='${row.JournalEntryID}'`,
        Fields: ['GLAccount', 'GLAccountID', 'DebitAmount', 'CreditAmount'],
        OrderBy: 'LineNumber ASC',
        ResultType: 'simple',
      });
      this.SelectedJELines = (res.Results ?? []).map(l => ({
        Account: l.GLAccount ?? l.GLAccountID,
        Debit: Number(l.DebitAmount ?? 0),
        Credit: Number(l.CreditAmount ?? 0),
      }));
    }
    this.cdr.markForCheck();
  }

  public StatusVariant(status: OrderStatus): string {
    switch (status) {
      case 'Confirmed': return 'success';
      case 'Posted':
      case 'Fulfilled': return 'info';
      case 'Voided': return 'error';
      default: return 'warning';
    }
  }

  private setError(message: string): void {
    this.ActionMessage = message;
    this.ActionIsError = true;
    this.cdr.markForCheck();
  }
}
