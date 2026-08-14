/**
 * Custom form components and overrides for BizApps Orders.
 * Components declared here are loaded AFTER the generated forms module so their
 * @RegisterClass decorators win priority over the generated forms in ClassFactory.
 */
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// MemberJunction Form Primitives
import { BaseFormsModule } from '@memberjunction/ng-base-forms';
import { EntityViewerModule } from '@memberjunction/ng-entity-viewer';
import { LinkDirectivesModule } from '@memberjunction/ng-link-directives';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';

// Custom Form Components
import { BizAppsProductFormComponent, LoadProductFormComponent } from './Product/product-form.component';

@NgModule({
    declarations: [
        BizAppsProductFormComponent,
    ],
    imports: [
        CommonModule,
        FormsModule,
        BaseFormsModule,
        EntityViewerModule,
        LinkDirectivesModule,
        MJButtonDirective,
    ],
    exports: [
        BizAppsProductFormComponent,
    ],
})
export class CustomFormsModule {}

/** Tree-shaking prevention anchor function */
export function LoadCustomForms(): void {
    LoadProductFormComponent();
}
