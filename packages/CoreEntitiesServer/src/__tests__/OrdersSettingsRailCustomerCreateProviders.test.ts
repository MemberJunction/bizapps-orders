/**
 * RailCustomerCreateProviders is read from the __mj_BizAppsOrders application row only (golive #358,
 * the rule PR #971 settles for app-scoped settings). Unset lists nothing, so every provider refuses to
 * create a customer; with no app row the read throws rather than reading a listed provider as unlisted.
 * No database.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const INSTALL_APP_ID = 'FB80FEB4-5505-49D1-93CE-2E7BD030B478';
const h = vi.hoisted(() => ({ apps: [] as Array<{ ID: string; Name: string }>, value: undefined as string | undefined }));

vi.mock('@memberjunction/core', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/core')>()),
    Metadata: class {
        get Applications() {
            return h.apps;
        }
    },
}));

vi.mock('@memberjunction/core-entities', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/core-entities')>()),
    ApplicationSettingEngine: {
        Instance: {
            ApplicationSettings: [],
            GetSetting: (key: string, appID?: string) => (key === 'RailCustomerCreateProviders' && appID === INSTALL_APP_ID ? h.value : undefined),
        },
    },
}));

const { OrdersSettings } = await import('../OrdersSettings.js');

describe('OrdersSettings.RailCustomerCreateProviders', () => {
    afterEach(() => OrdersSettings.ClearOverrides());

    it('reads the install app row', () => {
        h.apps = [{ ID: INSTALL_APP_ID, Name: '__mj_BizAppsOrders' }];
        h.value = ' 11111111-2222-4333-8444-555555555555 ,22222222-2222-4333-8444-555555555555';
        expect(OrdersSettings.RailCustomerCreateProviders).toEqual(['11111111-2222-4333-8444-555555555555', '22222222-2222-4333-8444-555555555555']);
    });

    it('lists nothing when unset', () => {
        h.apps = [{ ID: INSTALL_APP_ID, Name: '__mj_BizAppsOrders' }];
        h.value = undefined;
        expect(OrdersSettings.RailCustomerCreateProviders).toEqual([]);
    });

    it('throws when the install app row is missing', () => {
        h.apps = [];
        expect(() => OrdersSettings.RailCustomerCreateProviders).toThrow(/Orders application \(__mj_BizAppsOrders\) is not in metadata/);
    });
});
