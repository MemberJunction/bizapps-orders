import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject, OnInit } from '@angular/core';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { RunView } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { UUIDsEqual } from '@memberjunction/global';
import {
  CompanyScopeService,
  ReadModelsClient,
  type CustomerARView,
  type AROpenByCustomerRow,
  type ARAgingRow,
} from '@mj-biz-apps/accounting-ng';

const ORDER_ENTITY = 'MJ_BizApps_Orders: Orders';

/** An open order behind the customer's balance — orders' own contribution to the page. */
export interface CustomerOpenOrder {
  ID: string;
  OrderNumber: string;
  DueDate: Date | null;
  Balance: number | null;
  Status: string;
}

/**
 * Customer A/R (orders UI plan §13.4) — homed HERE, in orders' Reports category (Q3, resolved by
 * mockup approval), but the numbers are accounting's.
 *
 * The split is the point:
 *  - `<mj-customer-ar-base>` is imported from accounting and renders the A/R position (charges,
 *    payments, open balance, aging strip). Accounting's subsidiary ledger defines those figures, so
 *    they exist in ONE component and cannot drift between the apps.
 *  - This page adds what orders owns: the open ORDERS behind the balance, and the verbs (record a
 *    payment, open the order). Orders never recomputes A/R; it links to it.
 *
 * Reads go through accounting's `ReadModelsClient` (vw_AROpenByCustomer + vw_ARAging), not a query
 * of the ledger from here — same reason.
 */
@Component({
  standalone: false,
  selector: 'mj-customer-ar-page',
  templateUrl: './customer-ar.page.html',
  styleUrls: ['./customer-ar.page.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerARPageComponent extends BaseAngularComponent implements OnInit {
  private cdr = inject(ChangeDetectorRef);
  public Scope = inject(CompanyScopeService);

  public Customers: CustomerARView[] = [];
  public SelectedID: string | null = null;
  public OpenOrders: CustomerOpenOrder[] = [];

  public IsLoading = false;
  public IsLoadingOrders = false;
  public LoadError: string | null = null;

  async ngOnInit(): Promise<void> {
    await this.Scope.Load(this.ProviderToUse.CurrentUser, this.ProviderToUse);
    await this.load();
  }

  public get Selected(): CustomerARView | null {
    return this.Customers.find((c) => c.CustomerOrganizationID === this.SelectedID) ?? null;
  }

  public Refresh(): void {
    void this.load();
  }

  /**
   * The A/R book, from accounting's read models.
   *
   * Two views, ONE company scope: `vw_AROpenByCustomer` gives charges/payments/open,
   * `vw_ARAging` gives the buckets. They are joined here by customer because the base component
   * renders both halves — and because a customer present in one but not the other is real
   * information (a customer with a balance but no aging row means the aging view missed them).
   */
  private async load(): Promise<void> {
    this.IsLoading = true;
    this.LoadError = null;
    this.cdr.markForCheck();
    try {
      const client = new ReadModelsClient(this.ProviderToUse as GraphQLDataProvider);
      // The read models are company-scoped by contract; '' = every company the user can see. The
      // rail chip narrows it when the operator has chosen exactly one company.
      const companyId = this.Scope.SelectedIDs.length === 1 ? this.Scope.SelectedIDs[0] : '';
      const [open, aging] = await Promise.all([client.AROpenByCustomer(companyId), client.ARAging(companyId)]);

      this.Customers = this.join(open, aging);
      if (this.Customers.length && !this.SelectedID) {
        this.SelectedID = this.Customers[0].CustomerOrganizationID;
      }
      if (this.SelectedID) await this.loadOpenOrders();
    } catch (e) {
      this.LoadError = e instanceof Error ? e.message : String(e);
      this.Customers = [];
    } finally {
      this.IsLoading = false;
      this.cdr.markForCheck();
    }
  }

  /** Join the two read models by customer, biggest balance first (who to chase). */
  private join(open: AROpenByCustomerRow[], aging: ARAgingRow[]): CustomerARView[] {
    const agingById = new Map(aging.map((a) => [a.CustomerOrganizationID ?? '', a]));
    return open
      .map((o) => {
        const a = agingById.get(o.CustomerOrganizationID ?? '');
        return {
          CustomerOrganizationID: o.CustomerOrganizationID,
          CustomerName: o.CustomerName ?? '(unnamed customer)',
          OpenBalance: o.OpenBalance,
          TotalCharges: o.TotalCharges,
          TotalPayments: o.TotalPayments,
          // A customer with no aging row gets zeroed buckets — and the base view's foot check then
          // flags the mismatch against their real open balance rather than inventing buckets.
          Current_0_30: a?.Current_0_30 ?? 0,
          Days_31_60: a?.Days_31_60 ?? 0,
          Days_61_90: a?.Days_61_90 ?? 0,
          Days_Over_90: a?.Days_Over_90 ?? 0,
          TotalOpen: a?.TotalOpen ?? o.OpenBalance,
        };
      })
      .sort((x, y) => y.TotalOpen - x.TotalOpen);
  }

  public async OnCustomerSelected(id: string | null): Promise<void> {
    this.SelectedID = id;
    this.OpenOrders = [];
    this.cdr.markForCheck();
    if (id) await this.loadOpenOrders();
  }

  /** The orders behind the balance — orders' own half of the page. */
  private async loadOpenOrders(): Promise<void> {
    if (!this.SelectedID) return;
    this.IsLoadingOrders = true;
    this.cdr.markForCheck();
    try {
      const res = await RunView.FromMetadataProvider(this.ProviderToUse).RunView<CustomerOpenOrder>(
        {
          EntityName: ORDER_ENTITY,
          ExtraFilter: `CustomerOrganizationID='${this.SelectedID}' AND Status IN ('Confirmed','Posted','Fulfilled') AND Balance > 0`,
          Fields: ['ID', 'OrderNumber', 'DueDate', 'Balance', 'Status'],
          OrderBy: 'DueDate ASC',
          ResultType: 'simple',
        },
        this.ProviderToUse.CurrentUser,
      );
      this.OpenOrders = res.Success ? (res.Results ?? []) : [];
    } finally {
      this.IsLoadingOrders = false;
      this.cdr.markForCheck();
    }
  }

  public IsOverdue(o: CustomerOpenOrder): boolean {
    return !!o.DueDate && (o.Balance ?? 0) > 0 && new Date(o.DueDate).getTime() < Date.now();
  }

  public CustomerLabel(c: CustomerARView): string {
    return `${c.CustomerName} — ${c.TotalOpen.toFixed(2)}`;
  }

  public IsSelected(c: CustomerARView): boolean {
    return !!c.CustomerOrganizationID && !!this.SelectedID && UUIDsEqual(c.CustomerOrganizationID, this.SelectedID);
  }
}
