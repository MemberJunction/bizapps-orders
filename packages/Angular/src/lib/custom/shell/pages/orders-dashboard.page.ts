import { Component, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { AccountingDashboardBase } from '@mj-biz-apps/accounting-ng';
import { CompanyScopeService } from '@mj-biz-apps/accounting-ng';

const ORDER_ENTITY = 'MJ_BizApps_Orders: Orders';

/**
 * Orders Dashboard (orders UI plan §13.1) — built LAST within the category (§13.5 step 8).
 *
 * Cheap filtered COUNTS only, per the §0 ruling: anything needing summing or grouping over the
 * order book (an orders-per-day trend, revenue by month) is a scheduled precompute or it does not
 * ship. Every stat here is `MaxRows: 1` + `TotalRowCount` — SQL counts, one row transfers — which is
 * why this can run on every dashboard open with no caching layer.
 *
 * NOT company-scoped: an Order has no CompanyID (MOD-11/MOD-12) — see the Orders category shell.
 *
 * `Overdue` is deliberately absent: it is time-derived, and the Overdue worklist already answers it
 * authoritatively via `Orders.GetOverdueWorklist`. A second, subtly-different count on a dashboard
 * would be the "badge says 4, page shows 3" bug by construction.
 */
@Component({
  standalone: false,
  selector: 'mj-orders-dashboard-page',
  templateUrl: './orders-dashboard.html',
  styleUrls: ['./orders-dashboard.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrdersDashboardPageComponent extends AccountingDashboardBase implements OnInit {
  public Scope = inject(CompanyScopeService);

  public Title = 'Orders';
  public Subtitle = 'The order book at a glance.';

  ngOnInit(): void {
    void this.load();
  }

  /** The ONE refresh control (§13 dispatch ruling). */
  public Refresh(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    this.IsLoading = true;
    this.LoadError = null;
    this.cdr.markForCheck();
    try {
      const monthStart = this.monthStartUTC();
      const [thisMonth, draft, awaitingFulfilment, booked] = await Promise.all([
        this.count({ EntityName: ORDER_ENTITY, ExtraFilter: `OrderDate >= '${monthStart}'` }),
        this.count({ EntityName: ORDER_ENTITY, ExtraFilter: `Status='Draft'` }),
        this.count({ EntityName: ORDER_ENTITY, ExtraFilter: `Status='Posted'` }),
        this.count({ EntityName: ORDER_ENTITY, ExtraFilter: `Status IN ('Confirmed','Posted','Fulfilled')` }),
      ]);

      this.Stats = [
        {
          Id: 'this-month',
          Label: 'Orders this month',
          Value: thisMonth,
          Icon: 'fa-solid fa-cart-shopping',
          Tooltip: 'Orders dated on or after the first of this month (UTC), any status.',
          GoTo: 'all-orders',
        },
        {
          Id: 'draft',
          Label: 'Drafts',
          Value: draft,
          Icon: 'fa-solid fa-pen-ruler',
          Tooltip: 'Composed but never quoted or confirmed — no journal entries exist for these.',
          GoTo: 'all-orders',
        },
        {
          Id: 'awaiting-fulfilment',
          Label: 'Posted (awaiting fulfilment)',
          Value: awaitingFulfilment,
          Icon: 'fa-solid fa-truck-fast',
          Tooltip: 'Posted orders that have not advanced to Fulfilled.',
          GoTo: 'fulfillment',
        },
        {
          Id: 'booked',
          Label: 'Booked orders',
          Value: booked,
          Icon: 'fa-solid fa-book',
          Tooltip: 'Confirmed, Posted or Fulfilled — every one of these carries journal entries.',
          GoTo: 'all-orders',
        },
      ];
    } catch (e) {
      this.LoadError = e instanceof Error ? e.message : String(e);
      this.Stats = [];
    } finally {
      this.IsLoading = false;
      this.cdr.markForCheck();
    }
  }
}
