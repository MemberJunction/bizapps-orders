import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseDashboard } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { type IRemoteOperationProvider } from '@memberjunction/core';
import { MJLeftNavSection } from '@memberjunction/ng-ui-components';
import { CategoryShellBase, PageRefreshService, type ShellHeaderStat } from '@mj-biz-apps/accounting-ng';
import { OverdueWorklistClient } from './pages/overdue-worklist.client';

/** Page ids for this category's rail. Local to the shell — not routes. */
export type OrdersPageId =
  | 'dashboard'
  | 'all-orders'
  | 'editor'
  | 'status-board'
  | 'fulfillment'
  | 'overdue'
  | 'subscriptions';

/**
 * Orders category shell (orders UI plan §13.0 / §13.1).
 *
 * One of the four Explorer app nav items ("categories"). Hosts MJ's `<mj-left-nav>` + this
 * category's pages: Dashboard · All orders · Order editor · Status board | WORK: Fulfillment queue
 * · Overdue worklist (badge) · Subscriptions & renewals.
 *
 * `CategoryShellBase` is imported from accounting rather than re-implemented: the shell pattern
 * (Explorer nav item → rail + local page switching + company scope) is identical across the two
 * apps, and the dependency direction (common → accounting → orders) already allows it. See that
 * class for why the rail is MJ's `<mj-left-nav>` and not the mockup's bespoke one.
 */
@Component({
  standalone: false,
  selector: 'mj-orders-category',
  templateUrl: './orders-category.component.html',
  styleUrls: ['./category-shell.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Per-shell, NOT root: Explorer keeps tabs alive, so two open categories would
  // otherwise refresh each other's page.
  providers: [PageRefreshService],
})
@RegisterClass(BaseDashboard, 'OrdersCategoryDashboard')
export class OrdersCategoryComponent extends CategoryShellBase {
  public CategoryTitle = 'Orders';
  public override get CategoryIcon(): string {
    return 'fa-solid fa-cart-shopping';
  }
  protected get DefaultPageId(): string {
    return 'all-orders';
  }

  /** Rail badge: how many orders are overdue right now. */
  public OverdueCount = 0;

  /**
   * The category's through-line. Overdue is the one number that matters on every orders page, and
   * it comes from the SAME op the rail badge calls — so the header, the badge and the worklist
   * cannot disagree.
   */
  public override get HeaderStats(): ShellHeaderStat[] {
    return this.OverdueCount > 0
      ? [{
          Label: `${this.OverdueCount} overdue`,
          Icon: 'fa-solid fa-triangle-exclamation',
          Variant: 'error',
          Tooltip: 'Booked orders past their due date with an open balance — computed live, not a stored flag.',
        }]
      : [{ Label: 'Nothing overdue', Icon: 'fa-solid fa-check', Variant: 'success', Tooltip: 'No booked order is past due with an open balance.' }];
  }

  public get RailSections(): MJLeftNavSection[] {
    return [
      {
        label: 'MAIN',
        items: [
          { id: 'dashboard', label: 'Dashboard', icon: 'fa-solid fa-gauge-high' },
          { id: 'all-orders', label: 'All orders', icon: 'fa-solid fa-table-list' },
          { id: 'editor', label: 'Order editor', icon: 'fa-solid fa-pen-ruler' },
          { id: 'status-board', label: 'Status board', icon: 'fa-solid fa-diagram-project' },
        ],
      },
      {
        label: 'WORK',
        items: [
          { id: 'fulfillment', label: 'Fulfillment queue', icon: 'fa-solid fa-truck-fast' },
          {
            id: 'overdue',
            label: 'Overdue worklist',
            icon: 'fa-solid fa-triangle-exclamation',
            // Omit a zero badge entirely — a grey "0" is noise, not information.
            badge: this.OverdueCount > 0 ? this.OverdueCount : undefined,
          },
          { id: 'subscriptions', label: 'Subscriptions & renewals', icon: 'fa-regular fa-calendar-days' },
        ],
      },
    ];
  }

  async GetResourceDisplayName(_data: ResourceData): Promise<string> {
    return 'Orders';
  }

  async GetResourceIconClass(_data: ResourceData): Promise<string> {
    return 'fa-solid fa-cart-shopping';
  }

  protected async loadCategoryData(): Promise<void> {
    await this.loadOverdueBadge();
  }

  /**
   * The badge asks the SERVER what's overdue — it does not re-implement the rule.
   *
   * "Overdue" is time-derived, not a stored flag (`Orders.GetOverdueWorklist` → the pure `isOverdue`
   * predicate). A hand-written `DueDate < now AND Balance > 0` filter here would be a second copy of
   * that rule, free to drift from the worklist page's own count — the classic "the badge says 4, the
   * page shows 3" bug. One rule, one owner: the badge and the page call the same operation.
   *
   * NOT company-scoped, deliberately: an Order carries no CompanyID — it is multi-company via each
   * line's resolved GLAccount.CompanyID (bizapps-orders CLAUDE.md; MOD-11/MOD-12). See the shell's
   * scope-chip note.
   */
  private async loadOverdueBadge(): Promise<void> {
    const client = new OverdueWorklistClient();
    const res = await client.Get(this.ProviderToUse as unknown as IRemoteOperationProvider);
    this.OverdueCount = res.length;
  }
}

/** Tree-shaking prevention — called from public-api.ts. */
export function LoadOrdersCategory(): void {
  // No-op.
}
