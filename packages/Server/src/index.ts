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

// Server-side entity subclasses — MUST come after orders-entities so @RegisterClass
// auto-increment gives these higher priority than the generated classes.
import '@mj-biz-apps/orders-core-entities-server';
import {
    LoadCancelSubscriptionOperation,
    LoadOrderEntityServer,
    LoadOrderLineEntityServer,
    LoadPaymentHeaderEntityServer,
    LoadPaymentLineEntityServer,
    LoadRefundPaymentOperation,
    LoadApplyAccountCreditOperation,
    LoadPreviewPriceOperation,
    LoadDefaultPriceResolver,
    LoadPromotionEngine,
    LoadRevenueRecognitionDrivers,
    LoadSpawnRenewalsOperation,
    LoadSubscriptionBehavior,
} from '@mj-biz-apps/orders-core-entities-server';

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
    // Static imports above ensure all classes are registered; these anchor the server-only
    // subclasses against tree-shaking (booking lives in OrderEntityServer.Save).
    LoadOrderEntityServer();
    LoadOrderLineEntityServer();
    LoadPaymentHeaderEntityServer();  // books the cash leg on capture/refund (D18)
    LoadPaymentLineEntityServer();    // the over-application guard
    LoadRefundPaymentOperation();     // the 'Orders.RefundPayment' remote operation (D17)
    LoadApplyAccountCreditOperation(); // the 'Orders.ApplyAccountCredit' remote operation (D68)
    LoadPreviewPriceOperation();       // the 'Orders.PreviewPrice' dry run (D69)
    LoadDefaultPriceResolver();        // the data-driven price resolver the walk falls back to (D69)
    LoadPromotionEngine();             // the promotion qualifier plugin seam (D70)
    LoadRevenueRecognitionDrivers();   // the three shipped rev-rec drivers (D43)
    LoadSubscriptionBehavior();        // the base subscription rules engine (D45)
    LoadCancelSubscriptionOperation(); // the 'Orders.CancelSubscription' remote operation
    LoadSpawnRenewalsOperation();      // the 'Orders.SpawnRenewals' remote operation (D55)
}
