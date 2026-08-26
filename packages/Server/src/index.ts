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

// Hand-authored, SERVER-ONLY actions. These live here rather than in @mj-biz-apps/orders-actions
// because they import @mj-biz-apps/orders-core-entities-server — and orders-actions is a `shared`
// package that also ships to MJExplorer, where a server dependency drags Node's `stream` into the
// browser bundle and breaks the build. See packages/Actions/src/index.ts.
import { LoadGenerateInvoiceAction } from './custom/generate-invoice.action.js';
import { LoadOpenPaymentIntentAction } from './custom/open-payment-intent.action.js';
import { LoadSendDocumentAction } from './custom/send-document.action.js';
import { LoadReconcileEntitlementProvisioningAction } from './custom/reconcile-entitlement-provisioning.action.js';
// Lives HERE (not CoreEntitiesServer, home of the other entity servers) because invite minting
// needs Node's crypto and CoreEntitiesServer has no Node globals by design — see the file header.
import { LoadCheckoutWidgetDistributionEntityServer } from './custom/CheckoutWidgetDistributionEntityServer.js';

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
    LoadPriceOrderOperation,
    LoadGetOverdueWorklistOperation,
    LoadGetFulfillmentQueueOperation,
    LoadFulfillOrderLinesOperation,
    LoadCapturePaymentOperation,
    LoadAdvanceOrderStateOperation,
    LoadDefaultPriceResolver,
    LoadPromotionEngine,
    LoadTaxResolver,
    LoadRevenueRecognitionDrivers,
    LoadSpawnRenewalsOperation,
    LoadEmailDeliveryChannel,
    LoadStoredValuePaymentProvider,
    LoadStripeACHPaymentProvider,
    LoadStripePaymentProvider,
    LoadSubscriptionBehavior,
    LoadEntitlementGrantClaimDriver,
    LoadGuestOrderClaimDriver,
    LoadPersonAccountLinkClaimDriver,
    LoadEntitlementGrantEntityServer,
    LoadEntitlementProvisioningDrivers,
} from '@mj-biz-apps/orders-core-entities-server';

// The unauthenticated webhook route. Registered as a server EXTENSION rather than mounted here,
// because it must be installed before MJServer's auth middleware — see the file for why.
import { LoadPaymentWebhookExtension } from './PaymentWebhookExtension.js';
// The anonymous checkout edge — same pre-auth extension mechanism as the webhook.
import { LoadCheckoutServerExtension } from './CheckoutServerExtension.js';

// Import generated GraphQL resolvers
import './generated/generated.js';

// Import generated class registrations manifest
import { CLASS_REGISTRATIONS } from './generated/class-registrations-manifest.js';

// Re-export the manifest for consumers
export { CLASS_REGISTRATIONS } from './generated/class-registrations-manifest.js';
export { PaymentWebhookExtension, LoadPaymentWebhookExtension } from './PaymentWebhookExtension.js';
export { CheckoutServerExtension, LoadCheckoutServerExtension } from './CheckoutServerExtension.js';

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
    LoadPriceOrderOperation();         // 'Orders.PriceOrder' — what a whole order comes to, persisting nothing
    LoadGetOverdueWorklistOperation(); // 'Orders.GetOverdueWorklist' — overdue is computed, not stored
    LoadGetFulfillmentQueueOperation(); // 'Orders.GetFulfillmentQueue' — so is the shipping backlog
    LoadFulfillOrderLinesOperation(); // 'Orders.FulfillOrderLines' — flip lines AND close the order, one act
    LoadCapturePaymentOperation(); // 'Orders.CapturePayment' — header + allocations in ONE transaction
    LoadAdvanceOrderStateOperation(); // 'Orders.AdvanceOrderState' — climbs the ladder above Confirmed (D17)
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
    LoadStripePaymentProvider();       // cards; stub when the provider row is not live
    LoadStripeACHPaymentProvider();    // US bank debits — settles LATE, so the webhook books the cash
    LoadManualPaymentProvider();       // cheque, wire, cash — no gateway to call
    LoadStoredValuePaymentProvider();  // gift cards and account credit, one driver (D38/D68)
    LoadEnvironmentSecretResolver();   // the default CredentialsRef -> env lookup; replaceable

    // Actions. Same tree-shaking hazard as the operations above: without the anchor the action row
    // exists in metadata and `ActionEngine` finds nothing registered under its DriverClass.
    LoadGenerateInvoiceAction();       // 'Orders.GenerateInvoice' — an order, rendered (D-INV)
    LoadSendDocumentAction();          // 'Orders.SendDocument' — an order, rendered AND sent (§4.4)
    LoadOpenPaymentIntentAction();     // 'Orders.OpenPaymentIntent' — the FIRST half of a gateway capture (D80)
    LoadReconcileEntitlementProvisioningAction(); // 'Orders.ReconcileEntitlementProvisioning' — the WS-2 sweep

    // Entitlement provisioning (WS-2). The entity server keeps a grant's downstream obligation in
    // step with its Status; the driver anchor keeps the NoOp driver (and the resolve-and-refuse
    // guard's registration base) alive. Real drivers register from the deployment that owns the
    // downstream system, alongside its own Load* anchor.
    LoadEntitlementGrantEntityServer();
    LoadEntitlementProvisioningDrivers();

    // Delivery channels (§4.4). Same tree-shaking hazard as the payment drivers, and the same
    // deliberately unhelpful failure without the anchor: `DeliveryResolver` refuses the base-class
    // fallback rather than letting "nobody registered a channel" read as "the channel refused to send".
    LoadEmailDeliveryChannel();        // 'Email' — over MJ's communication framework

    // Identity-claim drivers (guest checkout → account linking). Without these anchors the
    // @RegisterClass decorators are tree-shaken and MJ core's IdentityClaimEngine finds no
    // driver for the DriverClass named in the claim-type metadata — silently.
    LoadGuestOrderClaimDriver();       // 'GuestOrderClaimDriver' — re-parents the order + activates grants on redemption
    LoadEntitlementGrantClaimDriver(); // 'EntitlementGrantClaimDriver' — activates a single grant on redemption
    LoadPersonAccountLinkClaimDriver(); // 'PersonAccountLinkClaimDriver' — stamps Person.LinkedUserID on redemption

    // The distribution lifecycle: slug normalization, anonymous-invite minting on create (when the
    // widget's Configuration asks for it), and revoke-the-invite-with-the-distribution.
    LoadCheckoutWidgetDistributionEntityServer();

    // Server extensions. Same tree-shaking hazard again: without the anchor the class is absent from
    // the ClassFactory and MJServer's extension loader silently finds nothing for the DriverClass named
    // in mj.config.cjs — so the webhook route is never mounted and no bank debit ever captures.
    LoadPaymentWebhookExtension();     // POST /webhooks/payments/:providerId, mounted before auth
    LoadCheckoutServerExtension();     // POST /checkout/{initialize,draft,payment-intent,complete}, mounted before auth
}
