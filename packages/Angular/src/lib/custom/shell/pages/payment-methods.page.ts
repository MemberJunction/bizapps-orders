import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject, OnInit } from '@angular/core';
import { RunView } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';

const CPM_ENTITY = 'MJ_BizApps_Orders: Customer Payment Methods';

export interface PaymentMethodRow {
  ID: string;
  CustomerOrganizationID: string;
  MethodType: string | null;
  Brand: string | null;
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
 * 2. **No PAN, ever** — and note the schema cannot even hold one: `CustomerPaymentMethod` stores
 *    `Brand`, `MethodType`, `ExpiryMonth`/`Year`, and provider IDs. There is no last-4 column, so
 *    the mockup's "brand/last4/expiry" renders as brand + expiry. Showing a fabricated mask would
 *    be worse than showing less.
 */
@Component({
  standalone: false,
  selector: 'mj-payment-methods-page',
  templateUrl: './payment-methods.page.html',
  styleUrls: ['./payment-methods.page.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentMethodsPageComponent extends BaseAngularComponent implements OnInit {
  private cdr = inject(ChangeDetectorRef);

  public Rows: PaymentMethodRow[] = [];
  public IsLoading = false;
  public LoadError: string | null = null;

  async ngOnInit(): Promise<void> {
    await this.load();
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
          Fields: ['ID', 'CustomerOrganizationID', 'MethodType', 'Brand', 'ExpiryMonth', 'ExpiryYear', 'IsDefault', 'IsActive'],
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
