/**
 * NoDealConfirmRoles is read from the __mj_BizAppsOrders application row only (golive #390, the rule
 * PR #971 settles for app-scoped settings). With no such row the read throws rather than reading the
 * check as off. No database.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const INSTALL_APP_ID = 'FB80FEB4-5505-49D1-93CE-2E7BD030B478';
const h = vi.hoisted(() => ({ apps: [] as Array<{ ID: string; Name: string }> }));

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
            GetSetting: (key: string, appID?: string) =>
                key === 'NoDealConfirmRoles' && appID === INSTALL_APP_ID ? 'Finance, CFO' : undefined,
        },
    },
}));

const { OrdersSettings } = await import('../OrdersSettings.js');

describe('OrdersSettings.NoDealConfirmRoles', () => {
    afterEach(() => OrdersSettings.ClearOverrides());

    it('reads the install app row', () => {
        h.apps = [{ ID: INSTALL_APP_ID, Name: '__mj_BizAppsOrders' }];
        expect(OrdersSettings.NoDealConfirmRoles).toEqual(['Finance', 'CFO']);
    });

    it('throws rather than reading the check as off when the install app row is missing', () => {
        h.apps = [];
        expect(() => OrdersSettings.NoDealConfirmRoles).toThrow(/Orders application \(__mj_BizAppsOrders\) is not in metadata/);
    });
});
