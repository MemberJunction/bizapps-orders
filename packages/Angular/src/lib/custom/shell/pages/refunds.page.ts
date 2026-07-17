import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject, OnInit, OnDestroy } from '@angular/core';
import { RunView } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { PageRefreshService } from '@mj-biz-apps/accounting-ng';
import { CompanyScopeService } from '@mj-biz-apps/accounting-ng';
import { MJStatBadgeVariant } from '@memberjunction/ng-ui-components';

const PAYMENT_ENTITY = 'MJ_BizApps_Orders: Payments';

export interface RefundablePayment {
  ID: string;
  PaymentNumber: string;
  PaymentDate: Date;
  Method: string;
  Amount: number;
  Status: string;
  Description: string | null;
  ReversesPaymentID: string | null;
  /** The reversal that already refunded this payment, if any. */
  ReversedBy: string | null;
}

/**
 * Refunds & reversals (orders UI plan §13.2).
 *
 * ⚠ WHAT THIS HONESTLY IS: the reversal HISTORY plus the captured payments a refund could act on.
 * The refund ACTION is deliberately not built.
 *
 * §13.2 specs "refund action (amount ≤ remaining, reason → reversal payment + JE, F3.4)". There is
 * no server operation for it: orders exposes CapturePayment, ConfirmOrder, CreateReversalOrder (an
 * ORDER reversal, not a payment refund), CreateRevRecSchedule, GetOverdueWorklist and
 * GrantEntitlements — none refunds a payment. Refunding writes money OUT and books a reversing JE;
 * doing that from the browser with raw entity saves would bypass the provider call and the atomic
 * booking that CapturePayment's sibling would own. So the button waits for F3.4's op rather than
 * being faked here.
 *
 * The list is real and useful now: it shows what was captured, what has already been reversed, and
 * the reversal chain (`ReversesPaymentID`).
 */
@Component({
  standalone: false,
  selector: 'mj-refunds-page',
  templateUrl: './refunds.page.html',
  styleUrls: ['./shell-table.css', './refunds.page.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RefundsPageComponent extends BaseAngularComponent implements OnInit, OnDestroy {
  private cdr = inject(ChangeDetectorRef);
  /** The shell header's Refresh reaches this page only while it is the mounted one. */
  private pageRefresh = inject(PageRefreshService);
  private refreshSub: { unsubscribe: () => void } | null = null;
  public Scope = inject(CompanyScopeService);

  public Rows: RefundablePayment[] = [];
  public IsLoading = false;
  public LoadError: string | null = null;

  async ngOnInit(): Promise<void> {
    this.refreshSub = this.pageRefresh.OnRefresh(() => this.Refresh());
    await this.Scope.Load(this.ProviderToUse.CurrentUser, this.ProviderToUse);
    await this.load();
  }

  ngOnDestroy(): void {
    // Unsubscribing is what keeps the header's Refresh page-aware: a destroyed page stops counting.
    this.refreshSub?.unsubscribe();
  }
  public Refresh(): void {
    void this.load();
  }

  public get RefundedCount(): number {
    return this.Rows.filter((r) => r.Status === 'Refunded').length;
  }

  private async load(): Promise<void> {
    this.IsLoading = true;
    this.LoadError = null;
    this.cdr.markForCheck();
    try {
      const res = await RunView.FromMetadataProvider(this.ProviderToUse).RunView<RefundablePayment>(
        {
          EntityName: PAYMENT_ENTITY,
          // Payments scope by a REAL company column, unlike orders.
          ExtraFilter: this.Scope.ComposeFilter(`Status IN ('Captured','Refunded')`, 'ReceivingCompanyID'),
          Fields: ['ID', 'PaymentNumber', 'PaymentDate', 'Method', 'Amount', 'Status', 'Description', 'ReversesPaymentID'],
          OrderBy: 'PaymentDate DESC',
          ResultType: 'simple',
        },
        this.ProviderToUse.CurrentUser,
      );
      if (!res.Success) throw new Error(res.ErrorMessage ?? 'Could not load payments.');

      const rows = res.Results ?? [];
      // Link each payment to the reversal that refunded it — one pass, in memory.
      const reversalOf = new Map<string, string>();
      for (const r of rows) {
        if (r.ReversesPaymentID) reversalOf.set(r.ReversesPaymentID.toLowerCase(), r.PaymentNumber);
      }
      this.Rows = rows.map((r) => ({ ...r, ReversedBy: reversalOf.get(r.ID.toLowerCase()) ?? null }));
    } catch (e) {
      this.LoadError = e instanceof Error ? e.message : String(e);
      this.Rows = [];
    } finally {
      this.IsLoading = false;
      this.cdr.markForCheck();
    }
  }

  public StatusVariant(status: string): MJStatBadgeVariant {
    if (status === 'Refunded') return 'warning';
    if (status === 'Captured') return 'success';
    return 'default';
  }
}
