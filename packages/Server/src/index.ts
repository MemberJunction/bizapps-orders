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
    LoadEnvironmentSecretResolver,
    LoadManualPaymentProvider,
    LoadOrderEntityServer,
    LoadOrderLineEntityServer,
    LoadPaymentHeaderEntityServer,
    LoadPaymentLineEntityServer,
    LoadRefundPaymentOperation,
    LoadApplyAccountCreditOperation,
    LoadPreviewPriceOperation,
    LoadSaveOrderOperation,
    LoadPreviewOrderOperation,
    LoadConfirmOrderOperation,
    LoadPreviewConfirmOperation,
    LoadGetOverdueWorklistOperation,
    LoadGetFulfillmentQueueOperation,
    LoadFulfillOrderLinesOperation,
    LoadCapturePaymentOperation,
    LoadCreateOrderInStateOperation,
    LoadDefaultPriceResolver,
    LoadPromotionEngine,
    LoadTaxResolver,
    LoadRevenueRecognitionDrivers,
    LoadSpawnRenewalsOperation,
    LoadStoredValuePaymentProvider,
    LoadStripePaymentProvider,
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
    LoadSaveOrderOperation();          // 'Orders.SaveOrder' — the only way a browser can compose an order
    LoadPreviewOrderOperation();       // 'Orders.PreviewOrder' — the real save, rolled back
    LoadConfirmOrderOperation();       // 'Orders.ConfirmOrder' — the irreversible step (D8)
    LoadPreviewConfirmOperation();     // 'Orders.PreviewConfirm' — the real confirm, rolled back
    LoadGetOverdueWorklistOperation(); // 'Orders.GetOverdueWorklist' — overdue is computed, not stored
    LoadGetFulfillmentQueueOperation(); // 'Orders.GetFulfillmentQueue' — so is the shipping backlog
    LoadFulfillOrderLinesOperation(); // 'Orders.FulfillOrderLines' — flip lines AND close the order, one act
    LoadCapturePaymentOperation(); // 'Orders.CapturePayment' — header + allocations in ONE transaction
    LoadCreateOrderInStateOperation(); // 'Orders.CreateOrderInState' — runs the REAL confirm, then advances
    LoadDefaultPriceResolver();        // the data-driven price resolver the walk falls back to (D69)
    LoadPromotionEngine();             // the promotion qualifier plugin seam (D70)
    LoadTaxResolver();                 // the address -> jurisdiction seam (D72)
    LoadRevenueRecognitionDrivers();   // the three shipped rev-rec drivers (D43)
    LoadSubscriptionBehavior();        // the base subscription rules engine (D45)
    LoadCancelSubscriptionOperation(); // the 'Orders.CancelSubscription' remote operation
    LoadSpawnRenewalsOperation();      // the 'Orders.SpawnRenewals' remote operation (D55)

    // Payment drivers (D19/D37). Each is keyed by its PaymentProviderType.Code, and WITHOUT these
    // anchors the @RegisterClass decorators are tree-shaken away — the ClassFactory then falls back to
    // the base driver, which declines every operation. `PaymentProviderResolver` refuses that fallback
    // explicitly rather than letting "nobody registered a driver" read as "the gateway said no".
    LoadStripePaymentProvider();       // cards and ACH; stub when the provider row is not live
    LoadManualPaymentProvider();       // cheque, wire, cash — no gateway to call
    LoadStoredValuePaymentProvider();  // gift cards and account credit, one driver (D38/D68)
    LoadEnvironmentSecretResolver();   // the default CredentialsRef -> env lookup; replaceable
}
