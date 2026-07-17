import { Component, ChangeDetectionStrategy, inject, OnInit, OnDestroy } from '@angular/core';
import { PageRefreshService } from '@mj-biz-apps/accounting-ng';
import { RunView, type IRemoteOperationProvider } from '@memberjunction/core';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { AccountingDashboardBase, CompanyScopeService, ReadModelsClient, type DashboardStat } from '@mj-biz-apps/accounting-ng';
import { OverdueWorklistClient, type OverdueOrderRow } from './overdue-worklist.client';
import { FormatMoney, type DashboardListCard } from './dashboard-lists';
import {
  BreakdownPercent,
  BreakdownTotal,
  type DashboardBreakdown,
  type DashboardBreakdownSegment,
} from '@mj-biz-apps/accounting-ng';

const ORDER_ENTITY = 'MJ_BizApps_Orders: Orders';

/** The five newest orders — a read-only projection, so only the fields the card actually renders. */
interface RecentOrderRow {
  ID: string;
  OrderNumber: string;
  /** DATE column — rendered by the template with the 'UTC' argument. */
  OrderDate: string | null;
  /** Denormalized on the view — no lookup query needed to name the customer. */
  Customer: string | null;
  TotalGross: number | null;
  /** Widened to `string` on purpose: this is display-only, and re-typing the CHECK-constraint union
   *  by hand (rule 2c) would silently drift the moment a migration adds a status. */
  Status: string;
}

/**
 * Every count the page reads. Draft / Quoted / Confirmed / Posted / Fulfilled is the whole
 * `Order.Status` value list bar `Voided`, so the breakdown accounts for every live order.
 */
interface OrderCounts {
  thisMonth: number;
  draft: number;
  quoted: number;
  confirmed: number;
  awaitingFulfilment: number;
  fulfilled: number;
  /** Counted so the lifecycle breakdown can cover the WHOLE Order.Status value list. */
  voided: number;
  booked: number;
  arOpen: number;
}

/**
 * Orders Dashboard (orders UI plan §13.1) — built LAST within the category (§13.5 step 8).
 *
 * Cheap filtered COUNTS + SMALL lists only, per the §0 ruling: anything needing a sum or a group-by
 * over the order book is a scheduled precompute or it does not ship. Every stat here is `MaxRows: 1`
 * + `TotalRowCount` — SQL counts, one row transfers — and every list is capped at five rows, which
 * is why this can run on every dashboard open with no caching layer.
 *
 * The one figure that is a sum, **open A/R**, is read from accounting's PRECOMPUTED read model
 * rather than computed here (see `loadAROpen`). **Current-month sales is deliberately absent**: it
 * would be a `SUM(TotalGross)` over the month's orders, there is no precomputed read model for it,
 * and scanning the order book on every dashboard open is exactly what §0 forbids. Omitted honestly
 * rather than shipped as a query that degrades as the order book grows — it needs a precompute
 * (a sales-by-month read model) before it can appear here.
 *
 * NOT company-scoped: an Order has no CompanyID (MOD-11/MOD-12) — see the Orders category shell.
 *
 * `Overdue` has no stat card because it is time-derived, and `Orders.GetOverdueWorklist` already
 * answers it authoritatively — the overdue CARD below calls that same operation the rail badge uses,
 * so the two cannot disagree ("badge says 4, page shows 3" is impossible by construction).
 */
@Component({
  standalone: false,
  selector: 'mj-orders-dashboard-page',
  templateUrl: './orders-dashboard.html',
  styleUrls: ['./orders-dashboard.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrdersDashboardPageComponent extends AccountingDashboardBase implements OnInit, OnDestroy {
  /** The shell header's Refresh reaches this page only while it is the mounted one. */
  private pageRefresh = inject(PageRefreshService);
  private refreshSub: { unsubscribe: () => void } | null = null;
  public Scope = inject(CompanyScopeService);

  public Title = 'Orders';
  public Subtitle = 'The order book at a glance.';
  /** The section's create verb — the shell must bind (CreateRequested). See the base class. */
  public override CreateLabel = 'New order';

  public Cards: DashboardListCard[] = [];

  /**
   * The composition cards. Derived ENTIRELY from `OrderCounts` — every segment is a count the page
   * already fetched for the stat strip — so this band adds no reads. See dashboard-breakdown.ts.
   */
  public Breakdowns: DashboardBreakdown[] = [];

  /** Template hooks for the composition bar. Pure functions; see dashboard-breakdown.ts. */
  public BreakdownTotal(b: DashboardBreakdown): number {
    return BreakdownTotal(b);
  }
  public BreakdownPercent(b: DashboardBreakdown, s: DashboardBreakdownSegment): number {
    return BreakdownPercent(b, s);
  }

  /** Stats whose Value is money, not a count — see StatValue. */
  private static readonly MoneyStatIds = new Set<string>(['ar-open']);

  ngOnInit(): void {
    this.refreshSub = this.pageRefresh.OnRefresh(() => this.Refresh());
    void this.load();
  }

  /** The ONE refresh control (§13 dispatch ruling). */
  ngOnDestroy(): void {
    // Unsubscribing is what keeps the header's Refresh page-aware: a destroyed page stops counting.
    this.refreshSub?.unsubscribe();
  }
  public Refresh(): void {
    void this.load();
  }

  /** Counts render bare; the A/R figure renders as money. Everything else defers to the base. */
  public override StatValue(s: DashboardStat): string {
    if (s.Value !== null && OrdersDashboardPageComponent.MoneyStatIds.has(s.Id)) {
      return FormatMoney(s.Value) ?? '—';
    }
    return super.StatValue(s);
  }

  private async load(): Promise<void> {
    this.IsLoading = true;
    this.LoadError = null;
    this.cdr.markForCheck();
    try {
      const monthStart = this.monthStartUTC();
      const c = (filter: string): Promise<number> => this.count({ EntityName: ORDER_ENTITY, ExtraFilter: filter });
      // `voided` exists so the lifecycle breakdown can cover the WHOLE `Order.Status` value list
      // (Draft|Quoted|Confirmed|Posted|Fulfilled|Voided — CK_Order_Status). One extra `MaxRows: 1` +
      // `TotalRowCount` read: a SQL count transferring one row, exactly the kind §0 permits on demand.
      const [thisMonth, draft, quoted, confirmed, awaitingFulfilment, fulfilled, voided, booked, arOpen, recent, overdue] =
        await Promise.all([
          c(`OrderDate >= '${monthStart}'`),
          c(`Status='Draft'`),
          c(`Status='Quoted'`),
          c(`Status='Confirmed'`),
          c(`Status='Posted'`),
          c(`Status='Fulfilled'`),
          c(`Status='Voided'`),
          c(`Status IN ('Confirmed','Posted','Fulfilled')`),
          this.loadAROpen(),
          this.loadRecentOrders(),
          this.loadOverdue(),
        ]);

      const counts: OrderCounts = { thisMonth, draft, quoted, confirmed, awaitingFulfilment, fulfilled, voided, booked, arOpen };
      this.Stats = this.buildStats(counts);
      this.Breakdowns = this.buildBreakdowns(counts);
      this.Cards = [this.recentOrdersCard(recent), this.overdueCard(overdue)];
    } catch (e) {
      this.LoadError = e instanceof Error ? e.message : String(e);
      this.Stats = [];
      this.Breakdowns = [];
      this.Cards = [];
    } finally {
      this.IsLoading = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * The status breakdown + the two derived figures.
   *
   * **"Orders this month" is a COUNT, not current-month SALES** — and the label says so on purpose.
   * Sales would be `SUM(TotalGross)` over the month's orders; there is no precomputed sales-by-month
   * read model, and scanning the order book on every dashboard open is exactly what §0 forbids. A
   * count is the honest thing this page can afford, so it is labelled as a count rather than dressed
   * up as revenue. Open A/R is the one money figure here, and it is READ from accounting's
   * precomputed read model rather than summed from the ledger (see loadAROpen).
   */
  /**
   * The order lifecycle, end to end — the order book's shape in one bar.
   *
   * The segments are the COMPLETE `Order.Status` value list, which is what makes the proportions
   * honest: every order lands in exactly one segment, so these are real shares of a real total. If a
   * migration widens CK_Order_Status, a segment belongs here — the value list is this card's contract.
   *
   * Tones follow the journey, not severity: brand (not yet committed) → info (committed, in flight)
   * → success (delivered) → error for Voided, the one terminal state that is not a completion.
   *
   * NOTE this bar counts ORDERS, not money. Sales by stage would be a `SUM(TotalGross) GROUP BY
   * Status` over the order book — the heavy aggregate §0 forbids on demand — so it needs a
   * precomputed read model before it can appear. Counts are what we can honestly show for free.
   */
  private buildBreakdowns(c: OrderCounts): DashboardBreakdown[] {
    return [
      {
        Id: 'lifecycle',
        Title: 'Order lifecycle',
        Icon: 'fa-solid fa-diagram-project',
        Caption: 'Every order, by status',
        EmptyMessage: 'No orders yet — the book is empty.',
        Segments: [
          { Id: 'draft', Label: 'Draft', Value: c.draft, Tone: 'brand',
            Tooltip: 'Being written. Not a commitment from anyone yet.' },
          { Id: 'quoted', Label: 'Quoted', Value: c.quoted, Tone: 'brand',
            Tooltip: 'Sent to the customer, awaiting their decision.' },
          { Id: 'confirmed', Label: 'Confirmed', Value: c.confirmed, Tone: 'info',
            Tooltip: 'The customer committed. This is the transition that books the journal entry.' },
          { Id: 'posted', Label: 'Awaiting fulfilment', Value: c.awaitingFulfilment, Tone: 'info',
            Tooltip: 'Booked to the ledger and waiting on the fulfilment queue.' },
          { Id: 'fulfilled', Label: 'Fulfilled', Value: c.fulfilled, Tone: 'success',
            Tooltip: 'Delivered — the end of the line for an order.' },
          { Id: 'voided', Label: 'Voided', Value: c.voided, Tone: 'error',
            Tooltip: 'Cancelled. The only terminal state that is not a completion.' },
        ],
      },
    ];
  }

  private buildStats(c: OrderCounts): DashboardStat[] {
    return [
      {
        Id: 'this-month',
        Label: 'Orders this month',
        Value: c.thisMonth,
        Icon: 'fa-solid fa-cart-shopping',
        Tooltip: 'How MANY orders are dated on or after the first of this month (UTC), any status. This is a count, not a sales total — a revenue figure needs a precomputed sales read model (§0).',
        GoTo: 'all-orders',
      },
      {
        Id: 'draft',
        Label: 'Drafts',
        Value: c.draft,
        Icon: 'fa-solid fa-pen-ruler',
        Tooltip: 'Composed but never quoted or confirmed — no journal entries exist for these.',
        GoTo: 'all-orders',
      },
      {
        Id: 'quoted',
        Label: 'Quoted',
        Value: c.quoted,
        Icon: 'fa-solid fa-file-signature',
        Tooltip: 'Priced and sent to the customer, awaiting their confirmation. Still unbooked.',
        GoTo: 'all-orders',
      },
      {
        Id: 'confirmed',
        Label: 'Confirmed',
        Value: c.confirmed,
        Icon: 'fa-solid fa-handshake',
        Tooltip: 'The customer said yes — this is the transition that books the journal entry.',
        GoTo: 'all-orders',
      },
      {
        Id: 'awaiting-fulfilment',
        Label: 'Posted (awaiting fulfilment)',
        Value: c.awaitingFulfilment,
        Icon: 'fa-solid fa-truck-fast',
        Tooltip: 'Posted orders that have not advanced to Fulfilled.',
        GoTo: 'fulfillment',
      },
      {
        Id: 'fulfilled',
        Label: 'Fulfilled',
        Value: c.fulfilled,
        Icon: 'fa-solid fa-box-open',
        Tooltip: 'Delivered to the customer — the end of the order lifecycle.',
        GoTo: 'fulfillment',
      },
      {
        Id: 'booked',
        Label: 'Booked orders',
        Value: c.booked,
        Icon: 'fa-solid fa-book',
        Tooltip: 'Confirmed, Posted or Fulfilled — every one of these carries journal entries.',
        GoTo: 'all-orders',
      },
      {
        Id: 'ar-open',
        Label: 'A/R open',
        Value: c.arOpen,
        Icon: 'fa-solid fa-file-invoice-dollar',
        Tooltip: "Open customer balance from accounting's A/R read model, across every company you can see.",
        GoTo: 'customer-ar',
      },
    ];
  }

  /**
   * Open A/R — summed FROM THE PRECOMPUTE, never from the ledger (§0).
   *
   * `vw_AROpenByCustomer` is accounting's precomputed read model: one small row per customer, with
   * the summing already done server-side. Adding those few rows up here is consuming the precompute,
   * not performing an on-demand aggregate — the distinction §0 actually draws.
   *
   * `''` = every company the user can see (the read models' established contract — see
   * customer-ar.page.ts). That is the right scope precisely BECAUSE orders are not company-scoped:
   * the order book this dashboard describes spans every company, so its A/R figure must too.
   *
   * ReadModelsClient logs and returns [] on failure rather than throwing, so a transient read-model
   * problem shows A/R as 0 instead of taking the whole dashboard down with it.
   */
  private async loadAROpen(): Promise<number> {
    const client = new ReadModelsClient(this.ProviderToUse as GraphQLDataProvider);
    const rows = await client.AROpenByCustomer('');
    return rows.reduce((sum, r) => sum + r.OpenBalance, 0);
  }

  /** The five newest orders. One view, five rows, explicit fields — never a query per row. */
  private async loadRecentOrders(): Promise<RecentOrderRow[]> {
    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    const res = await rv.RunView<RecentOrderRow>(
      {
        EntityName: ORDER_ENTITY,
        Fields: ['ID', 'OrderNumber', 'OrderDate', 'Customer', 'TotalGross', 'Status'],
        OrderBy: 'OrderDate DESC',
        MaxRows: 5,
        ResultType: 'simple',
      },
      this.ProviderToUse.CurrentUser,
    );
    if (!res.Success) throw new Error(res.ErrorMessage ?? 'recent orders failed');
    return res.Results;
  }

  /**
   * The overdue book, from the SAME operation the rail badge calls.
   *
   * Deliberately not a hand-written `DueDate < today AND Balance > 0` filter: "overdue" is a
   * time-derived rule the server owns, and a second copy of it here is a drift waiting to happen.
   * Returned in full (the card needs the true total for its header) and sorted worst-first.
   */
  private async loadOverdue(): Promise<OverdueOrderRow[]> {
    const client = new OverdueWorklistClient();
    const rows = await client.Get(this.ProviderToUse as unknown as IRemoteOperationProvider);
    return [...rows].sort((a, b) => b.DaysOverdue - a.DaysOverdue);
  }

  private recentOrdersCard(rows: RecentOrderRow[]): DashboardListCard {
    return {
      Id: 'recent-orders',
      Title: 'Recent orders',
      Icon: 'fa-solid fa-clock-rotate-left',
      Count: rows.length,
      Items: rows.map((r) => ({
        Id: r.ID,
        Icon: 'fa-solid fa-cart-shopping',
        Primary: r.OrderNumber,
        Secondary: `${r.Customer ?? 'No customer'} · ${r.Status}`,
        Date: r.OrderDate,
        Value: FormatMoney(r.TotalGross),
      })),
      EmptyIcon: 'fa-solid fa-cart-shopping',
      EmptyMessage: 'No orders yet.',
    };
  }

  private overdueCard(rows: OverdueOrderRow[]): DashboardListCard {
    return {
      Id: 'overdue-orders',
      Title: 'Overdue orders',
      Icon: 'fa-solid fa-triangle-exclamation',
      // The full count, not the five shown — this is the number the rail badge shows.
      Count: rows.length,
      Items: rows.slice(0, 5).map((r) => ({
        Id: r.OrderID,
        Icon: 'fa-solid fa-triangle-exclamation',
        Primary: r.OrderNumber,
        Secondary: `${r.DaysOverdue} ${r.DaysOverdue === 1 ? 'day' : 'days'} overdue`,
        Date: r.DueDate,
        Value: FormatMoney(r.Balance),
        Warn: true,
      })),
      EmptyIcon: 'fa-solid fa-circle-check',
      EmptyMessage: 'Nothing overdue.',
    };
  }
}
