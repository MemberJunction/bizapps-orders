import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject, OnInit } from '@angular/core';
import { RunView } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MJStatBadgeVariant } from '@memberjunction/ng-ui-components';
import { rowKeyToId } from '@mj-biz-apps/accounting-ng';

const SUBSCRIPTION_ENTITY = 'MJ_BizApps_Orders: Subscriptions';
const SUBSCRIPTION_EVENT_ENTITY = 'MJ_BizApps_Orders: Subscription Events';

export interface SubscriptionRow {
  ID: string;
  SubscriptionNumber: string;
  Status: string;
  Product: string | null;
  CustomerOrganizationID: string | null;
  StartDate: Date;
  CurrentPeriodStart: Date;
  CurrentPeriodEnd: Date;
  EndDate: Date | null;
}

export interface SubscriptionEventRow {
  ID: string;
  EventType: string;
  OccurredAt: Date;
}

/**
 * Subscriptions & renewals (orders UI plan §13.1).
 *
 * The list plus, in the slide-in, the SubscriptionEvent timeline — which is the thing worth having:
 * a subscription's state is the accumulation of what happened to it (Created → Activated → renewed
 * → PaymentFailed…), and the timeline is the only place that story is legible.
 *
 * "Next renewal" is `CurrentPeriodEnd` — the modelled fact — not a date computed here from a
 * billing cycle. Deriving it would be a second answer to a question the row already answers.
 *
 * The §11 waterfall viewer is NOT here: it is the rev-rec schedule's shape, and belongs with rev-rec
 * (accounting-homed, and not yet built as a shared component). Listed as a gap rather than mocked.
 */
@Component({
  standalone: false,
  selector: 'mj-subscriptions-page',
  templateUrl: './subscriptions.page.html',
  styleUrls: ['./subscriptions.page.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SubscriptionsPageComponent extends BaseAngularComponent implements OnInit {
  private cdr = inject(ChangeDetectorRef);

  public Rows: SubscriptionRow[] = [];
  public Events: SubscriptionEventRow[] = [];
  public SelectedID: string | null = null;
  public IsLoading = false;
  public IsLoadingEvents = false;
  public LoadError: string | null = null;

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  public Refresh(): void {
    void this.load();
  }

  public get ActiveCount(): number {
    return this.Rows.filter((r) => r.Status === 'Active').length;
  }

  public get Selected(): SubscriptionRow | null {
    return this.Rows.find((r) => r.ID === this.SelectedID) ?? null;
  }

  private async load(): Promise<void> {
    this.IsLoading = true;
    this.LoadError = null;
    this.cdr.markForCheck();
    try {
      const res = await RunView.FromMetadataProvider(this.ProviderToUse).RunView<SubscriptionRow>(
        {
          EntityName: SUBSCRIPTION_ENTITY,
          Fields: ['ID', 'SubscriptionNumber', 'Status', 'Product', 'CustomerOrganizationID', 'StartDate', 'CurrentPeriodStart', 'CurrentPeriodEnd', 'EndDate'],
          OrderBy: 'CurrentPeriodEnd ASC',
          ResultType: 'simple',
        },
        this.ProviderToUse.CurrentUser,
      );
      if (!res.Success) throw new Error(res.ErrorMessage ?? 'Could not load subscriptions.');
      this.Rows = res.Results ?? [];
    } catch (e) {
      this.LoadError = e instanceof Error ? e.message : String(e);
      this.Rows = [];
    } finally {
      this.IsLoading = false;
      this.cdr.markForCheck();
    }
  }

  public async Select(id: string): Promise<void> {
    this.SelectedID = id;
    this.Events = [];
    this.cdr.markForCheck();
    await this.loadEvents(id);
  }

  public Close(): void {
    this.SelectedID = null;
    this.Events = [];
    this.cdr.markForCheck();
  }

  private async loadEvents(id: string): Promise<void> {
    this.IsLoadingEvents = true;
    this.cdr.markForCheck();
    try {
      const res = await RunView.FromMetadataProvider(this.ProviderToUse).RunView<SubscriptionEventRow>(
        {
          EntityName: SUBSCRIPTION_EVENT_ENTITY,
          ExtraFilter: `SubscriptionID='${id}'`,
          Fields: ['ID', 'EventType', 'OccurredAt'],
          OrderBy: 'OccurredAt DESC',
          ResultType: 'simple',
        },
        this.ProviderToUse.CurrentUser,
      );
      this.Events = res.Success ? (res.Results ?? []) : [];
    } finally {
      this.IsLoadingEvents = false;
      this.cdr.markForCheck();
    }
  }

  public StatusVariant(status: string): MJStatBadgeVariant {
    switch (status) {
      case 'Active':
        return 'success';
      case 'Trialing':
        return 'info';
      case 'Canceled':
        return 'error';
      case 'Paused':
        return 'warning';
      default:
        return 'default';
    }
  }

  /** A failure or cancellation in the timeline is what an operator is scanning for. */
  public EventVariant(type: string): MJStatBadgeVariant {
    if (type === 'PaymentFailed' || type === 'Canceled') return 'error';
    if (type === 'CancellationRequested' || type === 'Paused') return 'warning';
    if (type === 'PaymentSucceeded' || type === 'Activated') return 'success';
    return 'default';
  }

  public IsRenewingSoon(r: SubscriptionRow): boolean {
    if (r.Status !== 'Active') return false;
    const days = (new Date(r.CurrentPeriodEnd).getTime() - Date.now()) / 86400000;
    return days >= 0 && days <= 30;
  }
}
