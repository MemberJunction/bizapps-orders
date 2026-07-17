import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseDashboard } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { MJLeftNavSection } from '@memberjunction/ng-ui-components';
import { CategoryShellBase, PageRefreshService } from '@mj-biz-apps/accounting-ng';

/** Page ids for this category's rail. Local to the shell — not routes. */
export type PaymentsPageId = 'dashboard' | 'all-payments' | 'entry' | 'capture' | 'refunds' | 'methods';

/**
 * Payments category shell (orders UI plan §13.0 / §13.2).
 *
 * Rail: Dashboard · All payments · Payment entry | WORK: Refunds & reversals · Payment methods.
 *
 * Unlike Orders, payments ARE company-scopeable — `Payment.ReceivingCompanyID` is a required column,
 * so the rail's scope chip genuinely filters this category's lists.
 */
@Component({
  standalone: false,
  selector: 'mj-payments-category',
  templateUrl: './payments-category.component.html',
  styleUrls: ['./category-shell.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Per-shell, NOT root: Explorer keeps tabs alive, so two open categories would
  // otherwise refresh each other's page.
  providers: [PageRefreshService],
})
@RegisterClass(BaseDashboard, 'PaymentsCategoryDashboard')
export class PaymentsCategoryComponent extends CategoryShellBase {
  public CategoryTitle = 'Payments';
  public override get CategoryIcon(): string {
    return 'fa-solid fa-money-check-dollar';
  }
  protected get DefaultPageId(): string {
    return 'all-payments';
  }

  public get RailSections(): MJLeftNavSection[] {
    return [
      {
        label: 'MAIN',
        items: [
          { id: 'dashboard', label: 'Dashboard', icon: 'fa-solid fa-gauge-high' },
          { id: 'all-payments', label: 'All payments', icon: 'fa-solid fa-table-list' },
          { id: 'entry', label: 'Payment entry', icon: 'fa-solid fa-money-check-dollar' },
          // Money has arrived but nobody has said which orders it pays — the accountant's bench.
          { id: 'capture', label: 'Apply payments', icon: 'fa-solid fa-link' },
        ],
      },
      {
        label: 'WORK',
        items: [
          { id: 'refunds', label: 'Refunds & reversals', icon: 'fa-solid fa-rotate-left' },
          { id: 'methods', label: 'Payment methods', icon: 'fa-regular fa-credit-card' },
        ],
      },
    ];
  }

  async GetResourceDisplayName(_data: ResourceData): Promise<string> {
    return 'Payments';
  }

  async GetResourceIconClass(_data: ResourceData): Promise<string> {
    return 'fa-solid fa-money-check-dollar';
  }
}

/** Tree-shaking prevention — called from public-api.ts. */
export function LoadPaymentsCategory(): void {
  // No-op.
}
