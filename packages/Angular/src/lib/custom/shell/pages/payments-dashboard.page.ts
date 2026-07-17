import { Component, ChangeDetectionStrategy, inject, OnInit, OnDestroy } from '@angular/core';
import { PageRefreshService } from '@mj-biz-apps/accounting-ng';
import { RunView } from '@memberjunction/core';
import { AccountingDashboardBase, CompanyScopeService } from '@mj-biz-apps/accounting-ng';
import { FormatMoney, type DashboardListCard } from './dashboard-lists';

const PAYMENT_ENTITY = 'MJ_BizApps_Orders: Payments';
const SUBSCRIPTION_ENTITY = 'MJ_BizApps_Orders: Subscriptions';

/** How far ahead the "Upcoming renewals" card looks. */
const RENEWAL_HORIZON_DAYS = 30;

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

/** A subscription row for the renewals card — only the fields the card renders. */
interface SubscriptionRow {
  ID: string;
  SubscriptionNumber: string;
  /** DATE column (the renewal boundary) — rendered by the template with the 'UTC' argument. */
  CurrentPeriodEnd: string | null;
  /** Denormalized on the view — no lookup query needed to name the product. */
  Product: string;
  AutoRenew: boolean;
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
  /** The section's create verb — the shell must bind (CreateRequested). See the base class. */
  public override CreateLabel = 'New payment';

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

      const renewalWindow = this.renewalHorizonUTC();
      const [thisMonth, pending, captured, failed, disputed, refunded, renewals] = await Promise.all([
        this.count({ EntityName: PAYMENT_ENTITY, ExtraFilter: scoped(`PaymentDate >= '${monthStart}'`) }),
        this.count({ EntityName: PAYMENT_ENTITY, ExtraFilter: scoped(`Status='Pending'`) }),
        this.count({ EntityName: PAYMENT_ENTITY, ExtraFilter: scoped(`Status='Captured'`) }),
        this.count({ EntityName: PAYMENT_ENTITY, ExtraFilter: scoped(`Status='Failed'`) }),
        this.count({ EntityName: PAYMENT_ENTITY, ExtraFilter: scoped(`Status='Disputed'`) }),
        this.count({ EntityName: PAYMENT_ENTITY, ExtraFilter: scoped(`Status='Refunded'`) }),
        // Subscription carries NO company column, so this one is deliberately unscoped — see
        // loadRenewals. Counted separately from the list so the card header shows the true total.
        this.count({ EntityName: SUBSCRIPTION_ENTITY, ExtraFilter: this.renewalFilter(renewalWindow) }),
      ]);

      const [[recent, uncaptured], renewalRows] = await Promise.all([
        this.loadLists(scoped),
        this.loadRenewals(renewalWindow),
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
          // NAMING (Marcelo questioned "Awaiting capture"): this is `Status='Pending'` — money
          // recorded but not yet captured by the provider. "Uncaptured" says that in plainer words.
          //
          // ⚠ CORRECTION (2026-07-16): an earlier note here claimed Payments "carries no
          // application/allocation concept at all (no PaymentApplication entity, no AppliedAmount
          // column)" and used that to reject Marcelo's "unapplied payments" wording. That was WRONG
          // — an absence inferred from a failed grep for two guessed names. The concept exists as
          // `MJ_BizApps_Orders: Payment Lines`, whose own field docs read: Amount = "Amount of the
          // payment APPLIED TO THIS ORDER"; AllocatedAt = "UTC timestamp when this APPLICATION was
          // made"; plus AllocatedByUserID. The Payment capture workspace is built on it.
          //
          // So BOTH concepts are real and DIFFERENT, and the dashboard carries both:
          //   Uncaptured  = Status 'Pending'                     → the provider hasn't taken the money.
          //   Unapplied   = SUM(PaymentLine.Amount) < Amount     → nobody has said which orders it pays.
          Id: 'pending',
          Label: 'Uncaptured payments',
          Value: pending,
          Icon: 'fa-solid fa-hourglass-half',
          Tooltip: 'Recorded but not yet captured by the provider — no journal entry has been booked for these.',
          GoTo: 'all-payments',
          Warn: pending > 0,
        },
        {
          Id: 'captured',
          Label: 'Captured',
          Value: captured,
          Icon: 'fa-solid fa-circle-check',
          Tooltip: 'The money landed and a journal entry was booked. Financial fields are frozen from here (DB trigger).',
          GoTo: 'all-payments',
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
          Id: 'disputed',
          Label: 'Disputed',
          Value: disputed,
          Icon: 'fa-solid fa-gavel',
          Tooltip: 'The customer charged back. Money already booked is at risk — these need a response.',
          GoTo: 'all-payments',
          Warn: disputed > 0,
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

      // Each card's header count comes from the COUNT above, never from the five rows fetched — so
      // the card and the stat above it show the same number by construction, not by coincidence.
      this.Cards = [
        this.recentPaymentsCard(recent),
        this.uncapturedCard(uncaptured, pending),
        this.renewalsCard(renewalRows, renewals),
      ];
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
  private uncapturedCard(rows: PaymentRow[], total: number): DashboardListCard {
    return {
      Id: 'uncaptured',
      // Same naming call as the stat card above — see the comment there.
      Title: 'Uncaptured payments',
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
      EmptyMessage: 'Nothing is waiting on a capture.',
    };
  }

  /**
   * The renewal window as a UTC date string — `CurrentPeriodEnd` is a DATE column, so the boundary
   * has to be a date, not an instant, or the comparison silently shifts a day.
   */
  private renewalHorizonUTC(): string {
    const horizon = new Date();
    horizon.setUTCDate(horizon.getUTCDate() + RENEWAL_HORIZON_DAYS);
    return horizon.toISOString().slice(0, 10);
  }

  /**
   * "Renewing soon": an ACTIVE, auto-renewing subscription whose paid-through period ends between
   * today and the horizon. `AutoRenew=0` is excluded on purpose — a subscription that will not renew
   * itself is not an upcoming renewal, it is an upcoming expiry (a different card, if wanted).
   */
  private renewalFilter(horizon: string): string {
    const today = new Date().toISOString().slice(0, 10);
    return `Status='Active' AND AutoRenew=1 AND CurrentPeriodEnd >= '${today}' AND CurrentPeriodEnd <= '${horizon}'`;
  }

  /**
   * Upcoming renewals — a `MaxRows: 5` top-N over an indexed date column, so §0-cheap like every
   * other list here. Soonest first: the point of the card is what is about to bill.
   *
   * NOT company-scoped, unlike every Payment read on this page: `Subscription` has no company column
   * (it hangs off an OrderLine, and Orders are not company-scoped — MOD-11/MOD-12). Scoping it would
   * mean joining out to reach a company, which is precisely the kind of read §0 rules out. So this
   * card spans every subscription the user can see, and its tooltip says so rather than implying the
   * rail chip narrowed it.
   */
  private async loadRenewals(horizon: string): Promise<SubscriptionRow[]> {
    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    const res = await rv.RunView<SubscriptionRow>(
      {
        EntityName: SUBSCRIPTION_ENTITY,
        Fields: ['ID', 'SubscriptionNumber', 'CurrentPeriodEnd', 'Product', 'AutoRenew'],
        ExtraFilter: this.renewalFilter(horizon),
        OrderBy: 'CurrentPeriodEnd ASC',
        MaxRows: 5,
        ResultType: 'simple',
      },
      this.ProviderToUse.CurrentUser,
    );
    if (!res.Success) throw new Error(res.ErrorMessage ?? 'upcoming renewals failed');
    return res.Results;
  }

  /** @param total the authoritative count over the whole window — the list shows only five. */
  private renewalsCard(rows: SubscriptionRow[], total: number): DashboardListCard {
    return {
      Id: 'upcoming-renewals',
      Title: `Renewing in the next ${RENEWAL_HORIZON_DAYS} days`,
      Icon: 'fa-regular fa-calendar-check',
      Count: total,
      Items: rows.map((r) => ({
        Id: r.ID,
        Icon: 'fa-regular fa-calendar-check',
        Primary: r.SubscriptionNumber,
        Secondary: r.Product,
        // CurrentPeriodEnd is a DATE — the template renders it with the 'UTC' argument.
        Date: r.CurrentPeriodEnd,
        // No figure: the renewal amount lives on the plan/order line, and reaching it would cost a
        // read per row — the per-row lookup §0 exists to prevent.
        Value: null,
      })),
      EmptyIcon: 'fa-regular fa-calendar-check',
      EmptyMessage: `Nothing renews in the next ${RENEWAL_HORIZON_DAYS} days.`,
    };
  }
}
