import { Component, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { AccountingDashboardBase, CompanyScopeService } from '@mj-biz-apps/accounting-ng';

const PAYMENT_ENTITY = 'MJ_BizApps_Orders: Payments';

/**
 * Payments Dashboard (orders UI plan §13.2) — built LAST within the category (§13.5 step 8).
 *
 * Cheap filtered COUNTS only (§0). Company-scoped — unlike the Orders category, Payment carries a
 * real `ReceivingCompanyID`, so the rail chip genuinely narrows these numbers.
 *
 * "Unapplied balance" is NOT here despite the mockup listing it: it is a SUM over payments minus
 * their applied lines — a heavy aggregate, exactly what §0 says must be precomputed or omitted.
 * Omitted, honestly, rather than shipped as an on-demand scan that degrades as payments accumulate.
 */
@Component({
  standalone: false,
  selector: 'mj-payments-dashboard-page',
  templateUrl: './orders-dashboard.html',
  styleUrls: ['./orders-dashboard.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentsDashboardPageComponent extends AccountingDashboardBase implements OnInit {
  public Scope = inject(CompanyScopeService);

  public Title = 'Payments';
  public Subtitle = 'Money in, at a glance.';

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
      await this.Scope.Load(this.ProviderToUse.CurrentUser, this.ProviderToUse);
      const monthStart = this.monthStartUTC();
      const scoped = (own: string): string => this.Scope.ComposeFilter(own, 'ReceivingCompanyID');

      const [thisMonth, pending, failed, refunded] = await Promise.all([
        this.count({ EntityName: PAYMENT_ENTITY, ExtraFilter: scoped(`PaymentDate >= '${monthStart}'`) }),
        this.count({ EntityName: PAYMENT_ENTITY, ExtraFilter: scoped(`Status='Pending'`) }),
        this.count({ EntityName: PAYMENT_ENTITY, ExtraFilter: scoped(`Status='Failed'`) }),
        this.count({ EntityName: PAYMENT_ENTITY, ExtraFilter: scoped(`Status='Refunded'`) }),
      ]);

      this.Stats = [
        {
          Id: 'this-month',
          Label: 'Payments this month',
          Value: thisMonth,
          Icon: 'fa-solid fa-money-check-dollar',
          Tooltip: 'Payments dated on or after the first of this month (UTC), any status.',
          GoTo: 'all-payments',
        },
        {
          Id: 'pending',
          Label: 'Awaiting capture',
          Value: pending,
          Icon: 'fa-solid fa-hourglass-half',
          Tooltip: 'Recorded but not yet captured — no journal entry has been booked for these.',
          GoTo: 'all-payments',
          Warn: pending > 0,
        },
        {
          Id: 'failed',
          Label: 'Failed',
          Value: failed,
          Icon: 'fa-solid fa-circle-exclamation',
          Tooltip: 'The provider declined the capture. The payment record still exists — retry it.',
          GoTo: 'all-payments',
          Warn: failed > 0,
        },
        {
          Id: 'refunded',
          Label: 'Refunded',
          Value: refunded,
          Icon: 'fa-solid fa-rotate-left',
          Tooltip: 'Payments reversed back to the customer.',
          GoTo: 'refunds',
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
