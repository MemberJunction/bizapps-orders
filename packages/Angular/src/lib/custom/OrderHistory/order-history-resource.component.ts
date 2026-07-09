import { Component, OnInit } from '@angular/core';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';

/**
 * Explorer resource shim for Order History — the class the application nav metadata targets via
 * DriverClass "OrderHistoryResource". Thin BaseResourceComponent hosting the dashboard, which owns
 * the page chrome. Mirrors OrdersManagementResource.
 */
@RegisterClass(BaseResourceComponent, 'OrderHistoryResource')
@Component({
  standalone: false,
  selector: 'mj-order-history-resource',
  template: `<mj-order-history-dashboard></mj-order-history-dashboard>`,
})
export class OrderHistoryResourceComponent extends BaseResourceComponent implements OnInit {
  ngOnInit(): void {
    super.ngOnInit();
    this.NotifyLoadComplete();
  }

  async GetResourceDisplayName(_data: ResourceData): Promise<string> {
    return 'Order History';
  }
  async GetResourceIconClass(_data: ResourceData): Promise<string> {
    return 'fa-solid fa-clock-rotate-left';
  }
}

/** Tree-shaking prevention — called from public-api.ts. */
export function LoadOrderHistoryResource(): void {
  // No-op. Keeps @RegisterClass(BaseResourceComponent, 'OrderHistoryResource') from being shaken out.
}
