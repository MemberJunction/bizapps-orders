/**
 * BizApps Orders Angular Bootstrap
 *
 * Client-side bootstrap package for the BizApps Orders Open App. Imports the
 * entity classes and generated form components so @RegisterClass decorators
 * fire and the components are available to MJ's class factory.
 */

// Import entity package to trigger @RegisterClass decorators for entity subclasses
import '@mj-biz-apps/orders-entities';

// Import generated form components (triggers @RegisterClass for form components)
import './lib/generated/generated-forms.module';

// Import generated class registrations manifest
import { CLASS_REGISTRATIONS } from './lib/generated/class-registrations-manifest';

// Re-export for consumers
export { CLASS_REGISTRATIONS } from './lib/generated/class-registrations-manifest';
export { GeneratedFormsModule } from './lib/generated/generated-forms.module';

/**
 * Bootstrap function called during MJExplorer initialization. The static imports
 * above handle registration; this is the startupExport entry point.
 */
export function LoadBizAppsOrdersClient(): void {
    // Static imports above ensure all form components are registered.
}
