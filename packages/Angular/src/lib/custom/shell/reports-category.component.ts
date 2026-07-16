import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseDashboard } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { MJLeftNavSection } from '@memberjunction/ng-ui-components';
import { CategoryShellBase } from '@mj-biz-apps/accounting-ng';

/** Page ids for this category's rail. Local to the shell — not routes. */
export type OrdersReportsPageId = 'customer-ar' | 'overdue';

/**
 * Reports category shell (orders UI plan §13.0 / §13.4).
 *
 * Rail: Customer A/R · Overdue & dunning.
 *
 * "Overdue & dunning" is deliberately the SAME page as the Orders category's Overdue worklist —
 * one page, two nav entries (§13.4). It is not a copy: both ids render the one component, so the
 * worklist can never drift between its two entry points.
 */
@Component({
  standalone: false,
  selector: 'mj-orders-reports-category',
  templateUrl: './reports-category.component.html',
  styleUrls: ['./category-shell.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
@RegisterClass(BaseDashboard, 'OrdersReportsCategoryDashboard')
export class OrdersReportsCategoryComponent extends CategoryShellBase {
  public CategoryTitle = 'Reports';
  protected get DefaultPageId(): string {
    return 'customer-ar';
  }

  public get RailSections(): MJLeftNavSection[] {
    return [
      {
        items: [
          { id: 'customer-ar', label: 'Customer A/R', icon: 'fa-solid fa-file-invoice-dollar' },
          { id: 'overdue', label: 'Overdue & dunning', icon: 'fa-solid fa-triangle-exclamation' },
        ],
      },
    ];
  }

  async GetResourceDisplayName(_data: ResourceData): Promise<string> {
    return 'Reports';
  }

  async GetResourceIconClass(_data: ResourceData): Promise<string> {
    return 'fa-solid fa-chart-column';
  }
}

/** Tree-shaking prevention — called from public-api.ts. */
export function LoadOrdersReportsCategory(): void {
  // No-op.
}
