import { Component, ChangeDetectionStrategy, inject, OnInit, OnDestroy } from '@angular/core';
import { PageRefreshService } from '@mj-biz-apps/accounting-ng';
import { RunView } from '@memberjunction/core';
import { AccountingDashboardBase, CompanyScopeService } from '@mj-biz-apps/accounting-ng';
import { FormatMoney, type DashboardListCard } from './dashboard-lists';

const PAYMENT_ENTITY = 'MJ_BizApps_Orders: Payments';

/** A payment row for the cards — a read-only projection, only the fields the card renders. */
interface PaymentRow {
  ID: string;
  PaymentNumber: string;
  /** DATE column — rendered by the template with the 'UTC' argument. */
  PaymentDate: string | null;
  Method: string | null;
  Amount: number | null;
  /** Widened to `string` on purpose: display-only, and hand-copying the CHECK-constraint union
   *  (rule 2c) would silently drift the moment a migration adds a status. */
  Status: string;
}

/**
 * Payments Dashboard (orders UI plan §13.2) — built LAST within the category (§13.5 step 8).
 *
 * Cheap filtered COUNTS + SMALL lists only (§0). Company-scoped — unlike the Orders category, a
 * Payment carries a real `ReceivingCompanyID`, so the rail chip genuinely narrows these numbers,
 * and every read below (counts AND lists) goes through `Scope.ComposeFilter` so the chip cannot
 * narrow one and not the other.
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
export class PaymentsDashboardPageComponent extends AccountingDashboardBase implements OnInit, OnDestroy {
  /** The shell header's Refresh reaches this page only while it is the mounted one. */
  private pageRefresh = inject(PageRefreshService);
  private refreshSub: { unsubscribe: () => void } | null = null;
  public Scope = inject(CompanyScopeService);

  public Title = 'Payments';
  public Subtitle = 'Money in, at a glance.';

  public Cards: DashboardListCard[] = [];

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

      const [recent, awaiting] = await this.loadLists(scoped);

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

      // `pending` is reused as the awaiting card's header count rather than counting the five rows
      // we fetched — same number as the stat card above it, from the same count, by construction.
      this.Cards = [this.recentPaymentsCard(recent), this.awaitingCaptureCard(awaiting, pending)];
    } catch (e) {
      this.LoadError = e instanceof Error ? e.message : String(e);
      this.Stats = [];
      this.Cards = [];
    } finally {
      this.IsLoading = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * Both lists in ONE round trip.
   *
   * They are independent queries over the same entity, which is exactly what `RunViews` (plural) is
   * for — two `RunView` calls would cost two round trips for no reason.
   */
  private async loadLists(scoped: (own: string) => string): Promise<[PaymentRow[], PaymentRow[]]> {
    const fields = ['ID', 'PaymentNumber', 'PaymentDate', 'Method', 'Amount', 'Status'];
    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    const results = await rv.RunViews<PaymentRow>(
      [
        {
          EntityName: PAYMENT_ENTITY,
          Fields: fields,
          ExtraFilter: scoped(''),
          OrderBy: 'PaymentDate DESC',
          MaxRows: 5,
          ResultType: 'simple',
        },
        {
          EntityName: PAYMENT_ENTITY,
          Fields: fields,
          ExtraFilter: scoped(`Status='Pending'`),
          OrderBy: 'PaymentDate DESC',
          MaxRows: 5,
          ResultType: 'simple',
        },
      ],
      this.ProviderToUse.CurrentUser,
    );

    const failed = results.find((r) => !r.Success);
    if (failed) throw new Error(failed.ErrorMessage ?? 'payment lists failed');
    return [results[0].Results, results[1].Results];
  }

  private recentPaymentsCard(rows: PaymentRow[]): DashboardListCard {
    return {
      Id: 'recent-payments',
      Title: 'Recent payments',
      Icon: 'fa-solid fa-clock-rotate-left',
      Count: rows.length,
      Items: rows.map((r) => ({
        Id: r.ID,
        Icon: 'fa-solid fa-money-check-dollar',
        Primary: r.PaymentNumber,
        Secondary: `${r.Method ?? 'No method'} · ${r.Status}`,
        Date: r.PaymentDate,
        Value: FormatMoney(r.Amount),
      })),
      EmptyIcon: 'fa-solid fa-money-check-dollar',
      EmptyMessage: 'No payments yet.',
    };
  }

  /** @param total the authoritative Pending count — the list itself is capped at five rows. */
  private awaitingCaptureCard(rows: PaymentRow[], total: number): DashboardListCard {
    return {
      Id: 'awaiting-capture',
      Title: 'Awaiting capture',
      Icon: 'fa-solid fa-hourglass-half',
      Count: total,
      Items: rows.map((r) => ({
        Id: r.ID,
        Icon: 'fa-solid fa-hourglass-half',
        Primary: r.PaymentNumber,
        Secondary: `${r.Method ?? 'No method'} · not yet captured`,
        Date: r.PaymentDate,
        Value: FormatMoney(r.Amount),
        // Uncaptured money is unbooked money — same warning treatment as the stat card.
        Warn: true,
      })),
      EmptyIcon: 'fa-solid fa-circle-check',
      EmptyMessage: 'Nothing awaiting capture.',
    };
  }
}
