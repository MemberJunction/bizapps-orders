/**
 * Hand-written custom form panels for BizApps Orders.
 *
 * **Panels, not form overrides.** A `*Extended` form replaces the generated one, which means
 * copying its template and hand-maintaining it against every CodeGen run. MJ's
 * `<mj-form-panel-slot>` + `BaseFormPanel` mechanism mounts a component INTO the generated form
 * instead, so the generated form keeps regenerating and the panel keeps rendering. Prefer a panel;
 * reach for an override only when the whole form genuinely has to change.
 *
 * See docs/UI_LAYERING.md, and the MJ repo's guides/FORMS_ARCHITECTURE_GUIDE.md.
 */
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { BaseFormsModule } from '@memberjunction/ng-base-forms';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';

// Layer 2 — the composite. Standalone and Explorer-unaware, so it imports directly.
import { MJOOrderSummaryComponent } from '@mj-biz-apps/orders-ng-widgets';

import { OrderSummaryPanel, LoadOrderSummaryPanel } from './panels/order-summary.panel';

@NgModule({
  declarations: [OrderSummaryPanel],
  imports: [CommonModule, FormsModule, BaseFormsModule, SharedGenericModule, MJOOrderSummaryComponent],
  exports: [OrderSummaryPanel],
})
export class OrdersCustomFormsModule {}

/** Tree-shaking prevention — anchors the panels' registrations. */
export function LoadOrdersCustomForms(): void {
  LoadOrderSummaryPanel();
}
