import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject, OnInit } from '@angular/core';
import { RunViewParams } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { GridColumnConfig } from '@memberjunction/ng-entity-viewer';
import { TIME_WINDOWS, type TimeWindowId, timeWindowFilter, andFilters, likeContains, rowKeyToId } from '@mj-biz-apps/accounting-ng';
import type { mjBizAppsOrdersOrderEntity } from '@mj-biz-apps/orders-entities';

const ORDER_ENTITY = 'MJ_BizApps_Orders: Orders';

/** Value-list unions derived from the generated entity (MJ CLAUDE.md rule 2c — never hand-copied). */
type OrderStatusValue = mjBizAppsOrdersOrderEntity['Status'];
type PaymentStatusValue = NonNullable<mjBizAppsOrdersOrderEntity['PaymentStatus']>;

/**
 * The order lifecycle, in lifecycle order — which no metadata ordering gives us, so the sequence is
 * stated here but TYPED as the entity's union: if a migration ever widens the CHECK, this fails to
 * compile rather than silently omitting a status from the filter.
 */
const STATUSES: readonly OrderStatusValue[] = ['Draft', 'Quoted', 'Confirmed', 'Posted', 'Fulfilled', 'Voided'] as const;
const PAYMENT_STATUSES: readonly PaymentStatusValue[] = ['Unpaid', 'PartiallyPaid', 'Paid', 'Overdue', 'WrittenOff'] as const;

/**
 * All orders (orders UI plan §13.1) — the order history list, built to the same idiom accounting's
 * All-journal-entries pilot established.
 *
 * Built on MJ's `<mj-entity-data-grid>` (§13 MJ-wins): AG Grid, RunView-driven loading, server-side
 * sorting, column state persistence and export all come from MJ. We contribute the domain: the
 * filter set, the columns, and the row slide-in.
 *
 * NOT company-scoped, deliberately: an Order has no CompanyID — it is multi-company via its lines'
 * resolved GL accounts (MOD-11/MOD-12). Scoping it needs an EXISTS-over-lines predicate, which is a
 * deferred decision (plans/DEFERRALS.md) — so this list does not pretend to filter by the rail chip.
 *
 * The mockup draws expandable rows; MJ's grid has no master/detail (that is AG Grid **Enterprise**),
 * so the row detail is the slide-in — which is also what the element doctrine prescribes for a
 * glance-and-go view. Mockups are directionally, not pixel, binding.
 */
@Component({
  standalone: false,
  selector: 'mj-all-orders-page',
  templateUrl: './all-orders.page.html',
  styleUrls: ['./all-orders.page.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AllOrdersPageComponent extends BaseAngularComponent implements OnInit {
  private cdr = inject(ChangeDetectorRef);

  public readonly TimeWindows = TIME_WINDOWS;
  public readonly Statuses = STATUSES;
  public readonly PaymentStatuses = PAYMENT_STATUSES;

  /** Time-window default — §0 requires one on every list; 30 days matches the approved mockup. */
  public TimeWindow: TimeWindowId = 'last30';
  public StatusFilter: OrderStatusValue | 'All' = 'All';
  public PaymentFilter: PaymentStatusValue | 'All' = 'All';
  public Search = '';
  /** Round-1 ruling: recents are NOT mine-only; "Only mine" is an opt-in toggle. */
  public OnlyMine = false;

  public GridParams: RunViewParams = { EntityName: ORDER_ENTITY };
  public SelectedID: string | null = null;
  /**
   * Bumped by Refresh() to guarantee `applyFilters` yields a NEW GridParams object even when no
   * filter changed — the grid refetches on input identity, so an equal-but-same object would be a
   * no-op refresh button.
   */
  public RefreshToken = 0;

  public Columns: GridColumnConfig[] = [
    { field: 'OrderNumber', title: 'Order №', width: 150, sortable: true },
    { field: 'OrderDate', title: 'Date', width: 110, sortable: true },
    { field: 'Status', title: 'Status', width: 110, sortable: true },
    { field: 'PaymentStatus', title: 'Payment', width: 120, sortable: true },
    { field: 'TotalGross', title: 'Total', width: 120, sortable: true },
    { field: 'Balance', title: 'Balance', width: 120, sortable: true },
    { field: 'DueDate', title: 'Due', width: 110, sortable: true },
    { field: 'ExternalDocumentNumber', title: 'External doc №', width: 150, visible: false, sortable: true },
    { field: 'Description', title: 'Description', width: 'auto', sortable: false },
  ];

  ngOnInit(): void {
    this.applyFilters();
  }

  public applyFilters(): void {
    const filter = andFilters(
      timeWindowFilter(this.TimeWindow, 'OrderDate'),
      this.StatusFilter === 'All' ? null : `Status='${this.StatusFilter}'`,
      this.paymentFilter(),
      likeContains(['OrderNumber', 'Description', 'ExternalDocumentNumber'], this.Search),
      this.OnlyMine ? `SalesRepUserID='${this.CurrentUserID}'` : null,
    );

    this.GridParams = {
      EntityName: ORDER_ENTITY,
      ExtraFilter: filter || undefined,
      OrderBy: 'OrderDate DESC, OrderNumber DESC',
    };
    this.cdr.markForCheck();
  }

  /**
   * Payment-state filter.
   *
   * 'Overdue' is the special case: it is TIME-DERIVED, never a stored flag (the server's own rule —
   * `isOverdue` / `Orders.GetOverdueWorklist`). Filtering `PaymentStatus='Overdue'` would return
   * nothing, because nothing ever writes that value. So the predicate is expressed the way the
   * domain defines it: past due date + an open balance + not written off.
   */
  private paymentFilter(): string | null {
    if (this.PaymentFilter === 'All') return null;
    if (this.PaymentFilter === 'Overdue') {
      return `DueDate IS NOT NULL AND DueDate < GETUTCDATE() AND Balance > 0 AND (PaymentStatus IS NULL OR PaymentStatus <> 'WrittenOff')`;
    }
    return `PaymentStatus='${this.PaymentFilter}'`;
  }

  /**
   * "Only mine" = orders this user is the sales rep on. The id comes from the provider's session
   * user (BaseAngularComponent's ProviderToUse), never a passed-in input — there is exactly one
   * answer to "who am I" and the provider owns it.
   */
  public get CurrentUserID(): string {
    return this.ProviderToUse.CurrentUser?.ID ?? '';
  }

  public OnFilterChanged(): void {
    this.applyFilters();
  }

  /** The ONE refresh control (§13 dispatch ruling) — the seam live push replaces later. */
  public Refresh(): void {
    this.RefreshToken++;
    this.applyFilters();
  }

  /**
   * `rowKey` is NOT the order's ID — it is CompositeKey's concatenated form ("ID|<guid>"), so it
   * must be parsed. See rowKeyToId for the trap.
   */
  public OnRowClicked(rowKey: string | null | undefined): void {
    const id = rowKeyToId(rowKey);
    if (!id) return;
    this.SelectedID = id;
    this.cdr.markForCheck();
  }

  public OnDetailClosed(): void {
    this.SelectedID = null;
    this.cdr.markForCheck();
  }

  public OnDetailChanged(): void {
    this.Refresh();
  }
}
