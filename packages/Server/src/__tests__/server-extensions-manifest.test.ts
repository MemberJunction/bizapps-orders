import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MJ_SERVER_EXTENSIONS } from '../server-extensions-manifest.js';

const pkgJsonPath = join(dirname(fileURLToPath(import.meta.url)), '../../package.json');

describe('MJ_SERVER_EXTENSIONS', () => {
    it('declares the webhook and checkout edge with the same DriverClass/RootPath as mj.config.cjs', () => {
        expect(MJ_SERVER_EXTENSIONS).toEqual([
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
        ]);
    });

    it('mirrors package.json memberjunction.serverExtensions so static introspection matches the export', () => {
        const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8')) as {
            memberjunction?: { serverExtensions?: unknown };
        };
        expect(pkg.memberjunction?.serverExtensions).toEqual(MJ_SERVER_EXTENSIONS);
    });
});
