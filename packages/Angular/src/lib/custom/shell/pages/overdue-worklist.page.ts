import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject, OnInit } from '@angular/core';
import { RunView, type IRemoteOperationProvider } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MJStatBadgeVariant } from '@memberjunction/ng-ui-components';
import { OverdueWorklistClient, type OverdueOrderRow } from './overdue-worklist.client';

const ORDER_ENTITY = 'MJ_BizApps_Orders: Orders';

/** An overdue order, with the customer name resolved for display. */
export interface OverdueRowView extends OverdueOrderRow {
  Customer: string;
  Bucket: string;
}

/**
 * Overdue worklist (orders UI plan §13.1) — the weekly dunning list, reachable from BOTH the Orders
 * rail and Reports → "Overdue & dunning" (§13.4: one page, two nav entries — not a copy).
 *
 * The list comes from `Orders.GetOverdueWorklist`, never a filter written here. "Overdue" is
 * time-derived by the server's pure `isOverdue` predicate (Q-a: never a stored flag mutated by a
 * cron), and the rail badge calls the same op — so the badge count and this page cannot disagree.
 *
 * Aging buckets are derived from the op's own `DaysOverdue`, so a row's bucket always matches the
 * number beside it.
 */
@Component({
  standalone: false,
  selector: 'mj-overdue-worklist-page',
  templateUrl: './overdue-worklist.page.html',
  styleUrls: ['./overdue-worklist.page.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OverdueWorklistPageComponent extends BaseAngularComponent implements OnInit {
  private cdr = inject(ChangeDetectorRef);
  private client = new OverdueWorklistClient();

  public Rows: OverdueRowView[] = [];
  public IsLoading = false;
  public LoadError: string | null = null;
  public AsOf: Date | null = null;

  ngOnInit(): void {
    void this.load();
  }

  public Refresh(): void {
    void this.load();
  }

  public get TotalOverdue(): number {
    return this.Rows.reduce((sum, r) => sum + r.Balance, 0);
  }

  private async load(): Promise<void> {
    this.IsLoading = true;
    this.LoadError = null;
    this.cdr.markForCheck();
    try {
      const rows = await this.client.Get(this.ProviderToUse as unknown as IRemoteOperationProvider);
      this.AsOf = new Date();
      this.Rows = await this.nameCustomers(rows);
    } catch (e) {
      this.LoadError = e instanceof Error ? e.message : String(e);
      this.Rows = [];
    } finally {
      this.IsLoading = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * Resolve customer names in ONE keyed read — the op returns ids (it is a server contract, not a
   * view model). Never a lookup per row.
   */
  private async nameCustomers(rows: OverdueOrderRow[]): Promise<OverdueRowView[]> {
    if (rows.length === 0) return [];
    const ids = [...new Set(rows.map((r) => r.CustomerOrganizationID).filter((id): id is string => !!id))];

    const names = new Map<string, string>();
    if (ids.length) {
      const res = await RunView.FromMetadataProvider(this.ProviderToUse).RunView<{
        CustomerOrganizationID: string;
        Customer: string | null;
      }>(
        {
          EntityName: ORDER_ENTITY,
          ExtraFilter: `CustomerOrganizationID IN (${ids.map((i) => `'${i}'`).join(',')})`,
          Fields: ['CustomerOrganizationID', 'Customer'],
          ResultType: 'simple',
        },
        this.ProviderToUse.CurrentUser,
      );
      for (const r of res.Results ?? []) {
        if (r.CustomerOrganizationID && !names.has(r.CustomerOrganizationID)) {
          names.set(r.CustomerOrganizationID, r.Customer ?? '(unnamed customer)');
        }
      }
    }

    return rows.map((r) => ({
      ...r,
      Customer: r.CustomerOrganizationID ? (names.get(r.CustomerOrganizationID) ?? '(unnamed customer)') : '(no customer)',
      Bucket: bucketFor(r.DaysOverdue),
    }));
  }

  public BucketVariant(bucket: string): MJStatBadgeVariant {
    switch (bucket) {
      case 'Over 90':
        return 'error';
      case '61–90':
        return 'error';
      case '31–60':
        return 'warning';
      default:
        return 'info';
    }
  }
}

/** The standard aging buckets, derived from the op's own DaysOverdue so the two always agree. */
export function bucketFor(daysOverdue: number): string {
  if (daysOverdue > 90) return 'Over 90';
  if (daysOverdue > 60) return '61–90';
  if (daysOverdue > 30) return '31–60';
  return '1–30';
}
