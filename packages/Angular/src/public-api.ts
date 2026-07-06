/**
 * @mj-biz-apps/orders-ng — the CLIENT BOOTSTRAP package.
 *
 * This is the package named in mj-app.json under packages.client with role
 * "bootstrap". When the app is installed (or dev-linked), MJExplorer's
 * auto-generated open-app-bootstrap.generated.ts gains a static
 * `import '@mj-biz-apps/orders-ng';` — ESBuild bundles it and module evaluation
 * fires the @RegisterClass decorators that make your components discoverable.
 *
 * WHAT LIVES HERE
 *   src/lib/generated/ — CodeGen Angular output (entity forms; do not edit)
 *   src/lib/           — your hand-written components (dashboards, tabs, ...)
 *
 * AFTER YOUR FIRST CODEGEN RUN (the pattern every shipped app uses): import
 * the entity package + the generated forms module so their @RegisterClass
 * decorators fire, and RE-EXPORT the generated module/components so the
 * host's class-registration manifest can import them by name:
 *
 *   import '@mj-biz-apps/orders-entities';
 *   import './lib/generated/generated-forms.module';
 *   export { GeneratedFormsModule } from './lib/generated/generated-forms.module';
 *   export { <YourEntity>FormComponent } from './lib/generated/Entities/<YourEntity>/<yourentity>.form.component';
 *
 * HAND-WRITTEN COMPONENT EXAMPLE — a resource component that renders as a tab
 * in MJ Explorer (its DriverClass must match a DefaultNavItems entry in your
 * application metadata — see metadata/_examples/application.example.json):
 *
 *   import { Component } from '@angular/core';
 *   import { RegisterClass } from '@memberjunction/global';
 *   import { BaseResourceComponent, ResourceData } from '@memberjunction/ng-shared';
 *
 *   @RegisterClass(BaseResourceComponent, 'BizAppsOrdersDashboard')
 *   @Component({
 *     selector: 'bizapps-orders-dashboard',
 *     template: '<div><h2>Sample App</h2></div>',
 *     standalone: false
 *   })
 *   export class BizAppsOrdersDashboardComponent extends BaseResourceComponent {
 *     async GetResourceDisplayName(data: ResourceData): Promise<string> { return 'Sample App'; }
 *     async GetResourceIconClass(data: ResourceData): Promise<string> { return 'fa-solid fa-cube'; }
 *   }
 *
 * NOTE: package.json already carries the peer deps the generated forms will
 * import (@angular/forms, ng-base-forms, ng-entity-viewer, ng-link-directives)
 * so your first codegen run builds without dependency surgery.
 *
 * TODO(template): rename the function to Load<YourApp>Client and keep it in
 * sync with mj-app.json "startupExport".
 */
export function LoadBizAppsOrdersClient(): void {
    // No-op until you add components: importing this module is what
    // registers everything above.
}
