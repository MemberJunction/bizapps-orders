import { Component, OnInit } from '@angular/core';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';

/**
 * Explorer resource shim for the Orders Console — the class the application nav metadata targets
 * via DriverClass "OrdersConsoleResource". Thin BaseResourceComponent hosting the dashboard, which
 * owns the page chrome. Mirrors accounting's BatchDispatchResource.
 */
@RegisterClass(BaseResourceComponent, 'OrdersConsoleResource')
@Component({
  standalone: false,
  selector: 'mj-orders-console-resource',
  template: `<mj-orders-console-dashboard></mj-orders-console-dashboard>`,
})
export class OrdersConsoleResourceComponent extends BaseResourceComponent implements OnInit {
  ngOnInit(): void {
    super.ngOnInit();
    this.NotifyLoadComplete();
  }

  async GetResourceDisplayName(_data: ResourceData): Promise<string> {
    return 'Orders Console';
  }
  async GetResourceIconClass(_data: ResourceData): Promise<string> {
    return 'fa-solid fa-cart-shopping';
  }
}

/** Tree-shaking prevention — called from public-api.ts. */
export function LoadOrdersConsoleResource(): void {
  // No-op. Keeps @RegisterClass(BaseResourceComponent, 'OrdersConsoleResource') from being shaken out.
}
