/**
 * @mj-biz-apps/orders-ng — the CLIENT BOOTSTRAP package.
 *
 * Named in mj-app.json under packages.client (role "bootstrap"). When the app is dev-linked,
 * MJExplorer's generated open-app bootstrap statically imports this package; module evaluation
 * fires the @RegisterClass decorators on the generated entity forms so Explorer can render
 * Orders / Products / Categories records. The re-exports let the host's class-registration
 * manifest import the components by name (tree-shaking prevention).
 *
 * v1 has no custom dashboards — the CodeGen entity forms ARE the basic order-entry UI.
 */
import '@mj-biz-apps/orders-entities';
import './lib/generated/generated-forms.module';

export { GeneratedFormsModule } from './lib/generated/generated-forms.module';
export { mjBizAppsOrdersOrderFormComponent } from './lib/generated/Entities/mjBizAppsOrdersOrder/mjbizappsordersorder.form.component';
export { mjBizAppsOrdersOrderLineFormComponent } from './lib/generated/Entities/mjBizAppsOrdersOrderLine/mjbizappsordersorderline.form.component';
export { mjBizAppsOrdersProductFormComponent } from './lib/generated/Entities/mjBizAppsOrdersProduct/mjbizappsordersproduct.form.component';
export { mjBizAppsOrdersProductCategoryFormComponent } from './lib/generated/Entities/mjBizAppsOrdersProductCategory/mjbizappsordersproductcategory.form.component';
export { mjBizAppsOrdersProductTypeFormComponent } from './lib/generated/Entities/mjBizAppsOrdersProductType/mjbizappsordersproducttype.form.component';

/** Startup entry point invoked by MJExplorer; the static imports above register the forms. */
export function LoadBizAppsOrdersClient(): void {
  // No-op: importing this module registered the generated forms above.
}
