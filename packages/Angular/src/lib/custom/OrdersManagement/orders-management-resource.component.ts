import { Component, OnInit } from '@angular/core';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';

/**
 * Explorer resource shim for Orders Management — the class the application nav metadata targets via
 * DriverClass "OrdersManagementResource". Thin BaseResourceComponent hosting the dashboard, which
 * owns the page chrome. Mirrors OrdersConsoleResource.
 */
@RegisterClass(BaseResourceComponent, 'OrdersManagementResource')
@Component({
  standalone: false,
  selector: 'mj-orders-management-resource',
  template: `<mj-orders-management-dashboard></mj-orders-management-dashboard>`,
})
export class OrdersManagementResourceComponent extends BaseResourceComponent implements OnInit {
  ngOnInit(): void {
    super.ngOnInit();
    this.NotifyLoadComplete();
  }

  async GetResourceDisplayName(_data: ResourceData): Promise<string> {
    return 'Orders';
  }
  async GetResourceIconClass(_data: ResourceData): Promise<string> {
    return 'fa-solid fa-cart-shopping';
  }
}

/** Tree-shaking prevention — called from public-api.ts. */
export function LoadOrdersManagementResource(): void {
  // No-op. Keeps @RegisterClass(BaseResourceComponent, 'OrdersManagementResource') from being shaken out.
}
