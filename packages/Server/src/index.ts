/**
 * @mj-biz-apps/orders-server — the SERVER BOOTSTRAP package.
 *
 * Named in mj-app.json under packages.server (role "bootstrap"). At startup MJAPI dynamically
 * imports this package and calls LoadBizAppsOrdersServer — that call plus the static imports below
 * fire every @RegisterClass decorator in the app's server-side packages (entities, actions, the
 * OrderEntityServer + OrdersEngine, and the generated GraphQL resolvers).
 */

// Entity + action packages first so @RegisterClass auto-increment ordering is correct.
import '@mj-biz-apps/orders-entities';
import '@mj-biz-apps/orders-actions';

// Server-side entity subclasses (OrderEntityServer) — AFTER orders-entities so these override.
import '@mj-biz-apps/orders-core-entities-server';
import { LoadBizAppsOrdersEntitiesServer } from '@mj-biz-apps/orders-core-entities-server';
import { LoadBizAppsOrdersActions } from '@mj-biz-apps/orders-actions';

// Generated GraphQL resolvers (entity CRUD over GraphQL).
import './generated/generated.js';

import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

/**
 * Absolute paths to the resolver files, for createMJServer(). The `generated.{js,ts}` (not
 * `*.{js,ts}`) form avoids matching the emitted `.d.ts` declarations.
 */
export const RESOLVER_PATHS = [resolve(__dirname, 'generated/generated.{js,ts}')];

/** Startup entry point invoked by DynamicPackageLoader; the static imports above do the work. */
export function LoadBizAppsOrdersServer(): void {
  LoadBizAppsOrdersEntitiesServer();
  LoadBizAppsOrdersActions();
}
