import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject, OnInit, OnDestroy, Output, EventEmitter } from '@angular/core';
import { RunView, type IRemoteOperationProvider } from '@memberjunction/core';
import { UUIDsEqual, NormalizeUUID } from '@memberjunction/global';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { CompanyScopeService, PageRefreshService } from '@mj-biz-apps/accounting-ng';
import { TIME_WINDOWS, type TimeWindowId, timeWindowFilter, andFilters } from '@mj-biz-apps/accounting-ng';
// From its OWN package, not re-exported through accounting-ng (MJ CLAUDE.md rule 5).
import { AccountingEngineBase } from '@mj-biz-apps/accounting-engine-base';
import { OrdersEngineBase } from '@mj-biz-apps/orders-engine-base';
import type { mjBizAppsOrdersOrderEntity, mjBizAppsOrdersOrderLineEntity } from '@mj-biz-apps/orders-entities';
import { OrderEditorClient } from './order-editor.client';

const ORDER_ENTITY = 'MJ_BizApps_Orders: Orders';
const ORDER_LINE_ENTITY = 'MJ_BizApps_Orders: Order Lines';

type OrderStatusValue = mjBizAppsOrdersOrderEntity['Status'];

/**
 * The WORKING statuses (§13.1 trim, resolved 2026-07-16): Drafts and terminal states live in All
 * orders. Typed as the entity's union so a widened CHECK fails the build rather than silently
 * dropping a column.
 */
const BOARD_STATUSES: readonly OrderStatusValue[] = ['Quoted', 'Confirmed', 'Posted', 'Fulfilled'] as const;

export interface BoardCard {
  ID: string;
  OrderNumber: string;
  Status: OrderStatusValue;
  TotalGross: number | null;
  Balance: number | null;
  PaymentStatus: string | null;
  OrderDate: Date;
  DueDate: Date | null;
  /**
   * Every company this order is in scope for — normalized UUIDs.
   *
   * An Order has NO CompanyID (MOD-11/12: multi-company is expressed by each LINE's resolved GL
   * account), so "the company is in the order" (Marcelo) means: the company appears on at least one
   * of the order's lines. An order spanning two companies is in BOTH scopes — his ruling exactly.
   */
  CompanyIDs: string[];
}

export interface BoardColumn {
  Status: OrderStatusValue;
  Icon: string;
  /** The TRUE count for this status in the current scope — every one of them is rendered. */
  Count: number;
  Cards: BoardCard[];
}

/** A drop-down option for the company filter. */
export interface BoardFilterOption {
  ID: string;
  Name: string;
}

/**
 * Status board (orders UI plan §13.1) — the pipeline at a glance, trimmed to the working statuses.
 *
 * One read for the whole board, bucketed in memory (the MJ perf rule: never a query per column).
 * Cards open the same detail slide-in All orders uses — one view of an order, two entry points.
 *
 * Every card in a status is rendered: the column SCROLLS rather than truncating at N with a
 * "+ N more…" caption. Silent truncation was the thing that read as dishonest — a scrolling column
 * shows the pipeline and the header count agrees with what you can reach.
 */
@Component({
  standalone: false,
  selector: 'mj-status-board-page',
  templateUrl: './status-board.page.html',
  styleUrls: ['./status-board.page.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusBoardPageComponent extends BaseAngularComponent implements OnInit, OnDestroy {
  private cdr = inject(ChangeDetectorRef);
  /** The shell header's Refresh reaches this page only while it is the mounted one. */
  private pageRefresh = inject(PageRefreshService);
  private refreshSub: { unsubscribe: () => void } | null = null;
  public Scope = inject(CompanyScopeService);
  private client = new OrderEditorClient();

  /**
   * Asks the shell to open the Order editor on an order.
   *
   * Emitting rather than navigating keeps that a SHELL decision: page switching inside a category is
   * local state (Explorer resources are not routed components), so the shell owns it. The shell must
   * bind this output for the card menu's "Edit" verb to go anywhere.
   */
  @Output() OpenOrder = new EventEmitter<string>();

  public readonly TimeWindows = TIME_WINDOWS;
  public TimeWindow: TimeWindowId = 'last30';
  /** '' = the "All …" default on each drop-down. Status is the entity's union — never hand-copied. */
  public FilterCompanyID = '';
  public FilterStatus: OrderStatusValue | '' = '';
  public readonly StatusOptions = BOARD_STATUSES;

  public CompanyOptions: BoardFilterOption[] = [];
  public Columns: BoardColumn[] = [];
  public IsLoading = false;
  public LoadError: string | null = null;
  public SelectedID: string | null = null;
  /** The card whose action menu is open, and the card mid-Confirm. */
  public OpenMenuID: string | null = null;
  public BusyID: string | null = null;
  public ActionError: string | null = null;

  /** Loaded once per read; the filters then re-bucket in memory (no round-trip per drop-down). */
  private cards: BoardCard[] = [];

  private readonly icons: Record<OrderStatusValue, string> = {
    Draft: 'fa-solid fa-pen-ruler',
    Quoted: 'fa-solid fa-file-signature',
    Confirmed: 'fa-solid fa-check',
    Posted: 'fa-solid fa-paper-plane',
    Fulfilled: 'fa-solid fa-box',
    Voided: 'fa-solid fa-ban',
  };

  ngOnInit(): void {
    this.refreshSub = this.pageRefresh.OnRefresh(() => this.Refresh());
    void this.load();
  }

  ngOnDestroy(): void {
    // Unsubscribing is what keeps the header's Refresh page-aware: a destroyed page stops counting.
    this.refreshSub?.unsubscribe();
  }
  public Refresh(): void {
    void this.load();
  }

  /** The time window is a server-side filter (re-read); company/status re-bucket what we hold. */
  public OnWindowChanged(): void {
    void this.load();
  }
  public OnScopeChanged(): void {
    this.buildColumns();
    this.cdr.markForCheck();
  }

  public OnCardClicked(id: string): void {
    this.SelectedID = id;
    this.OpenMenuID = null;
    this.cdr.markForCheck();
  }
  public OnDetailClosed(): void {
    this.SelectedID = null;
    this.cdr.markForCheck();
  }
  public OnDetailChanged(): void {
    void this.load();
  }

  // ---------------------------------------------------------------- the card action menu

  public ToggleMenu(id: string): void {
    this.OpenMenuID = UUIDsEqual(this.OpenMenuID ?? '', id) ? null : id;
    this.ActionError = null;
    this.cdr.markForCheck();
  }

  /** Hand the id upward — this page cannot navigate by itself, and must not import Router. */
  public EditCard(id: string): void {
    this.OpenMenuID = null;
    this.OpenOrder.emit(id);
    this.cdr.markForCheck();
  }

  /** Confirm is offered only where it is legal — a Quoted order is the one that can be booked. */
  public CanConfirm(card: BoardCard): boolean {
    return card.Status === 'Quoted';
  }

  /**
   * Confirm THROUGH the real op — never by setting `Status`.
   *
   * Confirming books a balanced journal entry per company inside one server-side TransactionGroup
   * (`Orders.ConfirmOrder`). Flipping `Status` from a card menu would produce a confirmed order with
   * NO journal entry — silently unbalanced books. A blocked Confirm (e.g. an unmapped revenue
   * account) comes back as a logical failure with `Errors`, which is surfaced, not swallowed.
   */
  public async ConfirmCard(card: BoardCard): Promise<void> {
    this.OpenMenuID = null;
    this.ActionError = null;
    this.BusyID = card.ID;
    this.cdr.markForCheck();
    try {
      const result = await this.client.Confirm(this.opProvider, card.ID);
      if (!result.Success) {
        const why = result.Errors?.length ? result.Errors.join(' · ') : 'Could not confirm the order.';
        this.ActionError = `${card.OrderNumber}: ${why}`;
      } else {
        await this.load();
      }
    } catch (e) {
      this.ActionError = `${card.OrderNumber}: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      this.BusyID = null;
      this.cdr.markForCheck();
    }
  }

  private get opProvider(): IRemoteOperationProvider {
    return this.ProviderToUse as unknown as IRemoteOperationProvider;
  }

  // ---------------------------------------------------------------- loading

  /** One read for the board (+ one for its lines, for company scope); bucket client-side. */
  private async load(): Promise<void> {
    this.IsLoading = true;
    this.LoadError = null;
    this.cdr.markForCheck();
    try {
      const rows = await this.readOrders();
      const companiesByOrder = await this.resolveCompanyScopes(rows);
      this.cards = rows.map((r) => ({ ...r, CompanyIDs: companiesByOrder.get(NormalizeUUID(r.ID)) ?? [] }));
      this.CompanyOptions = this.Scope.Companies.map((c) => ({ ID: c.ID, Name: c.Name })).sort((a, b) =>
        a.Name.localeCompare(b.Name),
      );
      this.buildColumns();
    } catch (e) {
      this.LoadError = e instanceof Error ? e.message : String(e);
      this.cards = [];
      this.Columns = [];
    } finally {
      this.IsLoading = false;
      this.cdr.markForCheck();
    }
  }

  private async readOrders(): Promise<Array<Omit<BoardCard, 'CompanyIDs'>>> {
    const filter = andFilters(
      timeWindowFilter(this.TimeWindow, 'OrderDate'),
      `Status IN (${BOARD_STATUSES.map((s) => `'${s}'`).join(',')})`,
    );
    const res = await RunView.FromMetadataProvider(this.ProviderToUse).RunView<Omit<BoardCard, 'CompanyIDs'>>(
      {
        EntityName: ORDER_ENTITY,
        ExtraFilter: filter || undefined,
        Fields: ['ID', 'OrderNumber', 'Status', 'TotalGross', 'Balance', 'PaymentStatus', 'OrderDate', 'DueDate'],
        OrderBy: 'OrderDate DESC',
        ResultType: 'simple',
      },
      this.ProviderToUse.CurrentUser,
    );
    if (!res.Success) throw new Error(res.ErrorMessage ?? 'Could not load the board.');
    return res.Results ?? [];
  }

  /**
   * Which companies is each order in scope for? ONE read of the board's lines, then the engines'
   * in-memory walk — no round-trip per order.
   *
   * The walk is the SAME one booking uses (`RevenueRoleFor` → `ResolveAccount` → the account's
   * company), so the board cannot claim a company the journal entry wouldn't be cut for.
   */
  private async resolveCompanyScopes(orders: Array<Omit<BoardCard, 'CompanyIDs'>>): Promise<Map<string, string[]>> {
    const scopes = new Map<string, string[]>();
    if (!orders.length) return scopes;

    await this.Scope.Load(this.ProviderToUse.CurrentUser, this.ProviderToUse);
    const engine = OrdersEngineBase.Instance;
    await engine.Config(false, this.ProviderToUse.CurrentUser, this.ProviderToUse);
    const aeb = AccountingEngineBase.Instance;

    const lines = await this.readLines(orders.map((o) => o.ID));
    const asOfByOrder = new Map(orders.map((o) => [NormalizeUUID(o.ID), o.OrderDate]));
    const sets = new Map<string, Set<string>>();
    for (const line of lines) {
      const key = NormalizeUUID(line.OrderID);
      const companyID = this.companyForLine(line.ProductID, asOfByOrder.get(key) ?? new Date(), engine, aeb);
      if (!companyID) continue;
      const set = sets.get(key) ?? new Set<string>();
      set.add(NormalizeUUID(companyID));
      sets.set(key, set);
    }
    for (const [orderID, set] of sets) scopes.set(orderID, [...set]);
    return scopes;
  }

  private async readLines(orderIDs: string[]): Promise<Array<Pick<mjBizAppsOrdersOrderLineEntity, 'OrderID' | 'ProductID'>>> {
    const res = await RunView.FromMetadataProvider(this.ProviderToUse).RunView<
      Pick<mjBizAppsOrdersOrderLineEntity, 'OrderID' | 'ProductID'>
    >(
      {
        EntityName: ORDER_LINE_ENTITY,
        ExtraFilter: `OrderID IN (${orderIDs.map((id) => `'${id}'`).join(',')})`,
        Fields: ['OrderID', 'ProductID'],
        ResultType: 'simple',
      },
      this.ProviderToUse.CurrentUser,
    );
    if (!res.Success) throw new Error(res.ErrorMessage ?? "Could not load the board's order lines.");
    return res.Results ?? [];
  }

  /** A line's company IS its resolved GL account's company (MOD-11/12) — not the product's owner. */
  private companyForLine(
    productID: mjBizAppsOrdersOrderLineEntity['ProductID'],
    asOf: Date,
    engine: OrdersEngineBase,
    aeb: AccountingEngineBase,
  ): string | null {
    if (!productID) return null;
    const product = engine.ProductByID(productID);
    if (!product) return null;
    const resolved = engine.ResolveAccount(
      product.ID,
      engine.RevenueRoleFor(product),
      asOf,
      product.OwningCompanyID ?? undefined,
    );
    return resolved ? (aeb.GLAccountByID(resolved.GLAccountID)?.CompanyID ?? null) : null;
  }

  // ---------------------------------------------------------------- bucketing

  private buildColumns(): void {
    const inScope = this.cards.filter((c) => this.matchesCompany(c));
    const statuses = this.FilterStatus ? BOARD_STATUSES.filter((s) => s === this.FilterStatus) : BOARD_STATUSES;
    this.Columns = statuses.map((status) => {
      const inStatus = inScope.filter((c) => c.Status === status);
      return { Status: status, Icon: this.icons[status], Count: inStatus.length, Cards: inStatus };
    });
  }

  private matchesCompany(card: BoardCard): boolean {
    if (!this.FilterCompanyID) return true;
    return card.CompanyIDs.some((id) => UUIDsEqual(id, this.FilterCompanyID));
  }

  // ---------------------------------------------------------------- card captions

  /** The due caption only earns its place while money is still owed. */
  public ShowDue(card: BoardCard): boolean {
    return !!card.DueDate && (card.Balance ?? 0) > 0;
  }

  public IsOverdue(card: BoardCard): boolean {
    return this.ShowDue(card) && new Date(card.DueDate as Date).getTime() < Date.now();
  }

  /** The header chip: the board's true total across the working statuses, in the current scope. */
  public get TotalLabel(): string {
    const total = this.Columns.reduce((sum, c) => sum + c.Count, 0);
    return `${total} in the pipeline`;
  }
}
