/**
 * Server-extension declarations for `@mj-biz-apps/orders-server`.
 *
 * MJ bootstrap (`createMJServer`) collects this list from installed Open App
 * packages listed in the host `mj.config.cjs` `dynamicPackages.server[]` — either
 * from this named export or from `package.json` `memberjunction.serverExtensions`.
 * Host `serverExtensions[]` overlays by DriverClass (Settings, RootPath, Enabled).
 *
 * Keep this array in sync with `package.json` → `memberjunction.serverExtensions`
 * and with this repo's own `mj.config.cjs` `serverExtensions` defaults.
 */
import type { ServerExtensionConfig } from '@memberjunction/server-extensions-core';

export const MJ_SERVER_EXTENSIONS: ServerExtensionConfig[] = [
    {
        Enabled: true,
        DriverClass: 'OrdersPaymentWebhook',
        RootPath: '/webhooks/payments',
        Settings: {},
    },
    {
        Enabled: true,
        DriverClass: 'OrdersCheckoutEdge',
        RootPath: '/checkout',
        Settings: {},
    },
];
