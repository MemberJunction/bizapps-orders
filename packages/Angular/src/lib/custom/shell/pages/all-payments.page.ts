import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject, OnInit, OnDestroy } from '@angular/core';
import { RunViewParams } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { PageRefreshService } from '@mj-biz-apps/accounting-ng';
import { GridColumnConfig } from '@memberjunction/ng-entity-viewer';
import { TIME_WINDOWS, type TimeWindowId, timeWindowFilter, andFilters, likeContains, CompanyScopeService } from '@mj-biz-apps/accounting-ng';
import type { mjBizAppsOrdersPaymentEntity } from '@mj-biz-apps/orders-entities';

const PAYMENT_ENTITY = 'MJ_BizApps_Orders: Payments';

/** Value-list unions derived from the generated entity (rule 2c — never hand-copied). */
type PaymentStatusValue = mjBizAppsOrdersPaymentEntity['Status'];
type PaymentMethodValue = mjBizAppsOrdersPaymentEntity['Method'];

/** The payment lifecycle, in lifecycle order; typed so a widened CHECK fails the build. */
const STATUSES: readonly PaymentStatusValue[] = ['Pending', 'Captured', 'Failed', 'Refunded', 'Disputed'] as const;

/**
 * All payments (orders UI plan §13.2) — the money-in list.
 *
 * UNLIKE the Orders category, this list IS company-scoped: `Payment.ReceivingCompanyID` is a real,
 * required column, so the rail's scope chip genuinely filters here.
 *
 * Method's value list comes from the entity union rather than the mockup's four manual methods — the
 * grid shows every payment, including provider-originated ones (CreditCard, Chargeback…), not only
 * the ones Payment entry can create.
 */
@Component({
  standalone: false,
  selector: 'mj-all-payments-page',
  templateUrl: './all-payments.page.html',
  styleUrls: ['./all-payments.page.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AllPaymentsPageComponent extends BaseAngularComponent implements OnInit, OnDestroy {
  private cdr = inject(ChangeDetectorRef);
  /** The shell header's Refresh reaches this page only while it is the mounted one. */
  private pageRefresh = inject(PageRefreshService);
  private refreshSub: { unsubscribe: () => void } | null = null;
  public Scope = inject(CompanyScopeService);

  public readonly TimeWindows = TIME_WINDOWS;
  public readonly Statuses = STATUSES;

  public TimeWindow: TimeWindowId = 'last30';
  public StatusFilter: PaymentStatusValue | 'All' = 'All';
  public Search = '';

  public GridParams: RunViewParams = { EntityName: PAYMENT_ENTITY };
  public RefreshToken = 0;

  public Columns: GridColumnConfig[] = [
    { field: 'PaymentNumber', title: 'Payment №', width: 150, sortable: true },
    { field: 'PaymentDate', title: 'Date', width: 110, sortable: true },
    { field: 'Method', title: 'Method', width: 110, sortable: true },
    { field: 'Status', title: 'Status', width: 110, sortable: true },
    { field: 'Amount', title: 'Amount', width: 120, sortable: true },
    { field: 'NetAmount', title: 'Net', width: 120, sortable: true },
    { field: 'Description', title: 'Reference', width: 'auto', sortable: false },
  ];

  async ngOnInit(): Promise<void> {
    this.refreshSub = this.pageRefresh.OnRefresh(() => this.Refresh());
    await this.Scope.Load(this.ProviderToUse.CurrentUser, this.ProviderToUse);
    this.applyFilters();
  }

  public applyFilters(): void {
    const filter = andFilters(
      timeWindowFilter(this.TimeWindow, 'PaymentDate'),
      this.StatusFilter === 'All' ? null : `Status='${this.StatusFilter}'`,
      likeContains(['PaymentNumber', 'Description'], this.Search),
      // A real column, so the scope chip means something here (unlike the Orders category).
      this.Scope.FilterFor('ReceivingCompanyID'),
    );
    this.GridParams = {
      EntityName: PAYMENT_ENTITY,
      ExtraFilter: filter || undefined,
      OrderBy: 'PaymentDate DESC, PaymentNumber DESC',
    };
    this.cdr.markForCheck();
  }

  public OnFilterChanged(): void {
    this.applyFilters();
  }

  /** The ONE refresh control (§13 dispatch ruling). */
  ngOnDestroy(): void {
    // Unsubscribing is what keeps the header's Refresh page-aware: a destroyed page stops counting.
    this.refreshSub?.unsubscribe();
  }
  public Refresh(): void {
    this.RefreshToken++;
    this.applyFilters();
  }

  public get ScopeLabel(): string {
    return this.Scope.Label;
  }
}
