import { Component, OnInit } from '@angular/core';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';

/**
 * Explorer resource shim for the Reports CATEGORY. App nav targets this via
 * `DriverClass: "OrdersReportsCategoryResource"` (metadata/applications/…-application.json).
 *
 * Thin by design: the category shell it hosts is a BaseDashboard, which calls NotifyLoadComplete
 * itself once its data resolves — so this shim must NOT call it too (a premature call would clear
 * Explorer's loading screen before the shell has anything to show).
 */
@RegisterClass(BaseResourceComponent, 'OrdersReportsCategoryResource')
@Component({
  standalone: false,
  selector: 'mj-orders-reports-category-resource',
  template: `<mj-orders-reports-category></mj-orders-reports-category>`,
})
export class OrdersReportsCategoryResourceComponent extends BaseResourceComponent implements OnInit {
  ngOnInit(): void {
    super.ngOnInit();
  }

  async GetResourceDisplayName(_data: ResourceData): Promise<string> {
    return 'Reports';
  }

  async GetResourceIconClass(_data: ResourceData): Promise<string> {
    return 'fa-solid fa-chart-column';
  }
}

/** Tree-shaking prevention — called from public-api.ts. */
export function LoadOrdersReportsCategoryResource(): void {
  // No-op.
}
