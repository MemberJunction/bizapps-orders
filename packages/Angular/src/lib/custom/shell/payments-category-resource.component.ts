import { Component, OnInit } from '@angular/core';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';

/**
 * Explorer resource shim for the Payments CATEGORY. App nav targets this via
 * `DriverClass: "PaymentsCategoryResource"` (metadata/applications/…-application.json).
 *
 * Thin by design: the category shell it hosts is a BaseDashboard, which calls NotifyLoadComplete
 * itself once its data resolves — so this shim must NOT call it too (a premature call would clear
 * Explorer's loading screen before the shell has anything to show).
 */
@RegisterClass(BaseResourceComponent, 'PaymentsCategoryResource')
@Component({
  standalone: false,
  selector: 'mj-payments-category-resource',
  template: `<mj-payments-category></mj-payments-category>`,
})
export class PaymentsCategoryResourceComponent extends BaseResourceComponent implements OnInit {
  ngOnInit(): void {
    super.ngOnInit();
  }

  async GetResourceDisplayName(_data: ResourceData): Promise<string> {
    return 'Payments';
  }

  async GetResourceIconClass(_data: ResourceData): Promise<string> {
    return 'fa-solid fa-money-check-dollar';
  }
}

/** Tree-shaking prevention — called from public-api.ts. */
export function LoadPaymentsCategoryResource(): void {
  // No-op.
}
