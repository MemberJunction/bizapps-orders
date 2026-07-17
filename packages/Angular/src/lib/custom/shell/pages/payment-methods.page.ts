import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject, OnInit, OnDestroy } from '@angular/core';
import { RunView } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { PageRefreshService } from '@mj-biz-apps/accounting-ng';

const CPM_ENTITY = 'MJ_BizApps_Orders: Customer Payment Methods';

export interface PaymentMethodRow {
  ID: string;
  CustomerOrganizationID: string;
  MethodType: string | null;
  Brand: string | null;
  /** Display only. The column is CHAR(4) and its own description reads "Never more." */
  Last4: string | null;
  ExpiryMonth: number | null;
  ExpiryYear: number | null;
  IsDefault: boolean;
  IsActive: boolean;
}

/**
 * Payment methods (orders UI plan §13.2) — the F.9 vault, read-only for now.
 *
 * TWO honest constraints shape this page:
 *
 * 1. **"Add" is not built and is not merely disabled-pending-Stripe** — there is no vault write
 *    path at all. §13.2 says Add is enabled only when Stripe REAL (F.4) is live; it is not, so the
 *    control says why rather than sitting there inert and mysterious.
 * 2. **No PAN, ever — by design, and the schema enforces it.** This is BO-D46: a TOKEN vault. It
 *    stores Stripe's token (`cus_`/`pm_`) plus display metadata — brand, last4, expiry, default —
 *    and *"never the PAN"*. `Last4` is `CHAR(4)`, described in the schema as "Last four digits for
 *    display. Never more." The card itself never leaves Stripe; we hold a reference to it, which is
 *    what makes charge-on-file possible for subscriptions and repeat billing without re-collecting.
 *
 * ⚠ CORRECTION (2026-07-16): an earlier version of this file claimed the schema had no last-4
 * column and rendered brand+expiry only. That was WRONG — I scanned the entity's fields with a
 * truncated grep and asserted an absence instead of verifying it. Last4 has existed since the
 * baseline migration (B202607061431, line 321).
 */
@Component({
  standalone: false,
  selector: 'mj-payment-methods-page',
  templateUrl: './payment-methods.page.html',
  styleUrls: ['./shell-table.css', './payment-methods.page.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentMethodsPageComponent extends BaseAngularComponent implements OnInit, OnDestroy {
  private cdr = inject(ChangeDetectorRef);
  /** The shell header's Refresh reaches this page only while it is the mounted one. */
  private pageRefresh = inject(PageRefreshService);
  private refreshSub: { unsubscribe: () => void } | null = null;

  public Rows: PaymentMethodRow[] = [];
  public IsLoading = false;
  public LoadError: string | null = null;

  async ngOnInit(): Promise<void> {
    this.refreshSub = this.pageRefresh.OnRefresh(() => this.Refresh());
    await this.load();
  }

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
      const res = await RunView.FromMetadataProvider(this.ProviderToUse).RunView<PaymentMethodRow>(
        {
          EntityName: CPM_ENTITY,
          Fields: ['ID', 'CustomerOrganizationID', 'MethodType', 'Brand', 'Last4', 'ExpiryMonth', 'ExpiryYear', 'IsDefault', 'IsActive'],
          ResultType: 'simple',
        },
        this.ProviderToUse.CurrentUser,
      );
      if (!res.Success) throw new Error(res.ErrorMessage ?? 'Could not load payment methods.');
      this.Rows = res.Results ?? [];
    } catch (e) {
      this.LoadError = e instanceof Error ? e.message : String(e);
      this.Rows = [];
    } finally {
      this.IsLoading = false;
      this.cdr.markForCheck();
    }
  }

  /** The masked instrument, e.g. "Visa •••• 4242" — brand + last4 only, which is all we store. */
  public Masked(r: PaymentMethodRow): string {
    const brand = r.Brand ?? r.MethodType ?? 'Card';
    return r.Last4 ? `${brand} •••• ${r.Last4}` : brand;
  }

  /** "04/2027", or a plain statement when the schema has no expiry for this method. */
  public Expiry(r: PaymentMethodRow): string {
    if (!r.ExpiryMonth || !r.ExpiryYear) return 'no expiry recorded';
    return `${String(r.ExpiryMonth).padStart(2, '0')}/${r.ExpiryYear}`;
  }

  /** Is the stored expiry in the past? A dead card on file is the actionable fact here. */
  public IsExpired(r: PaymentMethodRow): boolean {
    if (!r.ExpiryMonth || !r.ExpiryYear) return false;
    const now = new Date();
    const endOfMonth = new Date(Date.UTC(r.ExpiryYear, r.ExpiryMonth, 1)); // first instant AFTER it
    return endOfMonth.getTime() <= now.getTime();
  }
}
