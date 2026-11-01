/**
 * Which `MJ: Applications` row the settings are read from. A host carries two rows with orders-like
 * names: `__mj_BizAppsOrders`, which the baseline migration's CodeGen output creates and every
 * setting hangs off, and `Orders`, the MJ Explorer navigation app from metadata/applications, which
 * holds no settings. When `Orders` came first in the list, every app-scoped setting read as unset,
 * so order review was off with OrderReviewTriggers configured (AIDP Next, ORD-002511). No database.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const INSTALL_APP_ID = 'FB80FEB4-5505-49D1-93CE-2E7BD030B478';
const NAV_APP_ID = 'D3E6A4C2-8F5B-4C31-9A74-2E3F7C03D501';
const INSTALL_APP = { ID: INSTALL_APP_ID, Name: '__mj_BizAppsOrders' };
const NAV_APP = { ID: NAV_APP_ID, Name: 'Orders' };

const h = vi.hoisted(() => ({ apps: [] as Array<{ ID: string; Name: string }> }));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        Metadata: class {
            get Applications() {
                return h.apps;
            }
        },
    };
});

vi.mock('@memberjunction/core-entities', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core-entities')>();
    return {
        ...actual,
        ApplicationSettingEngine: {
            Instance: {
                ApplicationSettings: [],
                // Only the install row carries the setting, as on a real host.
                GetSetting: (key: string, appID?: string) =>
                    key === 'OrderReviewTriggers' && appID === INSTALL_APP_ID ? 'OverThreshold' : undefined,
            },
        },
    };
});

const { OrdersSettings } = await import('../OrdersSettings.js');

const MISSING_APP = /Orders application \(__mj_BizAppsOrders\) is not in metadata/;

describe('OrdersSettings reads the __mj_BizAppsOrders application row', () => {
    afterEach(() => OrdersSettings.ClearOverrides());

    it('when the Orders navigation app is listed first', () => {
        h.apps = [NAV_APP, INSTALL_APP];
        expect(OrdersSettings.OrderReviewTriggers.Enabled).toEqual(['OverThreshold']);
    });

    it('when it is listed first', () => {
        h.apps = [INSTALL_APP, NAV_APP];
        expect(OrdersSettings.OrderReviewTriggers.Enabled).toEqual(['OverThreshold']);
    });
});

describe('OrdersSettings with only the Orders navigation app in metadata', () => {
    afterEach(() => OrdersSettings.ClearOverrides());

    it.each([
        ['RefundApprovalThreshold', () => OrdersSettings.RefundApprovalThreshold],
        ['OrderReviewTriggers', () => OrdersSettings.OrderReviewTriggers],
        ['ConcessionSelfApprovalEscalation', () => OrdersSettings.ConcessionSelfApprovalEscalation],
    ])('%s throws rather than reading the navigation app and switching its control off', (_name, read) => {
        h.apps = [NAV_APP];
        expect(read).toThrow(MISSING_APP);
    });
});
