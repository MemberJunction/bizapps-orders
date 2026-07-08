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

// Custom Explorer surface: the Orders Console (interactive order-entry + live JE booking).
import './lib/custom/OrdersConsole/orders-console.module';
import { LoadOrdersConsoleResource } from './lib/custom/OrdersConsole/orders-console-resource.component';

// Custom Explorer surface: Orders Management (pipeline board + order detail + JE drill-through).
import './lib/custom/OrdersManagement/orders-management.module';
import { LoadOrdersManagementResource } from './lib/custom/OrdersManagement/orders-management-resource.component';

// Custom Explorer surface: Product Catalog (products + inline GL-account mapping) + Category tree.
import './lib/custom/ProductCatalog/product-catalog.module';
import { LoadProductCatalogResource } from './lib/custom/ProductCatalog/product-catalog-resource.component';
import './lib/custom/ProductCategoryTree/product-category-tree.module';
import { LoadProductCategoryTreeResource } from './lib/custom/ProductCategoryTree/product-category-tree-resource.component';

export { GeneratedFormsModule } from './lib/generated/generated-forms.module';
export { OrdersConsoleModule } from './lib/custom/OrdersConsole/orders-console.module';
export { OrdersManagementModule } from './lib/custom/OrdersManagement/orders-management.module';
export { ProductCatalogModule } from './lib/custom/ProductCatalog/product-catalog.module';
export { ProductCategoryTreeModule } from './lib/custom/ProductCategoryTree/product-category-tree.module';
export { mjBizAppsOrdersOrderFormComponent } from './lib/generated/Entities/mjBizAppsOrdersOrder/mjbizappsordersorder.form.component';
export { mjBizAppsOrdersOrderLineFormComponent } from './lib/generated/Entities/mjBizAppsOrdersOrderLine/mjbizappsordersorderline.form.component';
export { mjBizAppsOrdersProductFormComponent } from './lib/generated/Entities/mjBizAppsOrdersProduct/mjbizappsordersproduct.form.component';
export { mjBizAppsOrdersProductCategoryFormComponent } from './lib/generated/Entities/mjBizAppsOrdersProductCategory/mjbizappsordersproductcategory.form.component';
export { mjBizAppsOrdersProductTypeFormComponent } from './lib/generated/Entities/mjBizAppsOrdersProductType/mjbizappsordersproducttype.form.component';

/** Startup entry point invoked by MJExplorer; the static imports above register the forms. */
export function LoadBizAppsOrdersClient(): void {
  // Importing the modules above registered the generated forms + the custom dashboards; these calls
  // are the tree-shaking anchors for the custom Explorer resources.
  LoadOrdersConsoleResource();
  LoadOrdersManagementResource();
  LoadProductCatalogResource();
  LoadProductCategoryTreeResource();
}
