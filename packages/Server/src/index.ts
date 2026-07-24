/**
 * BizApps Orders Server Bootstrap
 *
 * Server-side bootstrap package for the BizApps Orders Open App. Ensures the
 * entity subclasses, action subclasses, and GraphQL resolvers are registered
 * with the MJ class factory.
 */

// Import entity and action packages to trigger @RegisterClass decorators
import '@mj-biz-apps/orders-entities';
import '@mj-biz-apps/orders-actions';

// Import generated GraphQL resolvers
import './generated/generated.js';

// Import generated class registrations manifest
import { CLASS_REGISTRATIONS } from './generated/class-registrations-manifest.js';

// Re-export the manifest for consumers
export { CLASS_REGISTRATIONS } from './generated/class-registrations-manifest.js';

import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

/**
 * Absolute paths to the resolver files (generated + custom), for use with createMJServer().
 * NOTE the `*Resolver.{js,ts}` suffix for custom resolvers (not `*.{js,ts}`): brace-expansion
 * of `*.{js,ts}` would also match emitted `*.d.ts` files, which ts-node then fails to require.
 */
export const RESOLVER_PATHS = [
    resolve(__dirname, 'generated/generated.{js,ts}'),
    resolve(__dirname, 'resolvers/*Resolver.{js,ts}'),
];

/**
 * Bootstrap function called by DynamicPackageLoader during MJAPI startup.
 * The static imports above handle all registration; this function is the
 * startupExport entry point.
 */
export function LoadBizAppsOrdersServer(): void {
    // Static imports above ensure all classes are registered.
}
