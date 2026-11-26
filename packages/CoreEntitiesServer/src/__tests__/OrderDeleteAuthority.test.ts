/**
 * #1021 — who may delete a Draft or Quoted order. MJ.BizApps.Orders.Order.Delete deletes any order;
 * its child ...DeleteOwn only one the user created, read from the order's Create record change. The
 * system user (sales deleting a deal's order) is exempt. No database.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';

const h = vi.hoisted(() => ({ runView: vi.fn(), systemUser: { ID: 'SYSTEM-USER' } as { ID: string } | null }));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...actual, RunView: { FromMetadataProvider: () => ({ RunView: h.runView }) } };
});
vi.mock('@memberjunction/generic-database-provider', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/generic-database-provider')>();
    return { ...actual, UserCache: { Instance: { GetSystemUser: () => h.systemUser } } };
});

const { ORDER_DELETE_AUTH, OrderDeleteRefusal } = await import('@mj-biz-apps/orders-entities');
const { CheckOrderDelete } = await import('../OrderDeleteAuthority.js');

const ADMIN_ROLE = 'F0000000-0000-0000-0000-000000000001';
const REP_ROLE = 'A0000000-0000-0000-0000-000000000001';
const OTHER_ROLE = 'C0000000-0000-0000-0000-000000000001';
const ORDER_ID = '3f0c1d9e-6b2a-4c71-9d55-0a1b2c3d4e5f';
const ORDER_ENTITY_ID = '7a1e2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b';

const userWith = (id: string, roleID: string) => ({ ID: id, UserRoles: [{ RoleID: roleID }] }) as unknown as UserInfo;
const admin = userWith('U-ADMIN', ADMIN_ROLE);
const rep = userWith('U-REP', REP_ROLE);
const nobody = userWith('U-NOBODY', OTHER_ROLE);

const holds = (roleID: string) => (u: UserInfo) => (u.UserRoles ?? []).some((r) => r.RoleID === roleID);
const anyAuth = { ID: 'D0000000-0000-0000-0000-000000000001', Name: ORDER_DELETE_AUTH.Any, ParentID: null, UserCanExecute: holds(ADMIN_ROLE) };
const ownAuth = {
    ID: 'D0000000-0000-0000-0000-000000000002',
    Name: ORDER_DELETE_AUTH.Own,
    ParentID: anyAuth.ID,
    UserCanExecute: holds(REP_ROLE),
};
const catalog = (installed = true) => ({ Authorizations: installed ? [anyAuth, ownAuth] : [] }) as never;

function provider(trackRecordChanges = true): IMetadataProvider {
    return {
        Authorizations: [anyAuth, ownAuth],
        EntityByName: (name: string) =>
            name === 'MJ: Record Changes' ? { ID: 'RC' } : { ID: ORDER_ENTITY_ID, TrackRecordChanges: trackRecordChanges },
    } as unknown as IMetadataProvider;
}

const LABEL = 'Order ORD-000009';

describe('OrderDeleteRefusal (the shared rule)', () => {
    it('fails closed when the authorization is not installed', () => {
        expect(OrderDeleteRefusal(LABEL, admin.ID, admin, catalog(false))).toMatch(/is not installed/);
    });

    it('lets a holder of the any-order grant delete anyone\'s order, or one with no recorded creator', () => {
        expect(OrderDeleteRefusal(LABEL, rep.ID, admin, catalog())).toBeNull();
        expect(OrderDeleteRefusal(LABEL, null, admin, catalog())).toBeNull();
    });

    it('lets a holder of DeleteOwn delete only an order they created', () => {
        expect(OrderDeleteRefusal(LABEL, rep.ID.toLowerCase(), rep, catalog())).toBeNull();
        expect(OrderDeleteRefusal(LABEL, admin.ID, rep, catalog())).toMatch(/created by someone else/);
        expect(OrderDeleteRefusal(LABEL, null, rep, catalog())).toMatch(/no recorded creator/);
    });

    it('refuses a user with neither grant, even on an order they created', () => {
        expect(OrderDeleteRefusal(LABEL, nobody.ID, nobody, catalog())).toMatch(/^Deleting an order needs/);
    });
});

describe('CheckOrderDelete (the server read)', () => {
    beforeEach(() => {
        h.runView.mockReset();
        h.systemUser = { ID: 'SYSTEM-USER' };
    });

    it('lets the system user through without reading anything (a deal\'s order deleted by sales)', async () => {
        const system = userWith('system-user', OTHER_ROLE);
        expect(await CheckOrderDelete({ ID: ORDER_ID, Label: LABEL }, provider(), system)).toBeNull();
        expect(h.runView).not.toHaveBeenCalled();
    });

    it('reads the creator from the order\'s Create record change', async () => {
        h.runView.mockResolvedValue({ Success: true, Results: [{ UserID: rep.ID }] });

        expect(await CheckOrderDelete({ ID: ORDER_ID, Label: LABEL }, provider(), rep)).toBeNull();
        const params = h.runView.mock.calls[0][0] as { EntityName: string; ExtraFilter: string };
        expect(params.EntityName).toBe('MJ: Record Changes');
        expect(params.ExtraFilter).toContain(`EntityID = '${ORDER_ENTITY_ID}'`);
        expect(params.ExtraFilter).toContain(`'ID|${ORDER_ID.toUpperCase()}'`);
        expect(params.ExtraFilter).toContain(`Type = 'Create'`);
    });

    it('refuses DeleteOwn on someone else\'s order', async () => {
        h.runView.mockResolvedValue({ Success: true, Results: [{ UserID: admin.ID }] });
        expect(await CheckOrderDelete({ ID: ORDER_ID, Label: LABEL }, provider(), rep)).toMatch(/created by someone else/);
    });

    it('treats an order whose record changes are not tracked as having no creator', async () => {
        expect(await CheckOrderDelete({ ID: ORDER_ID, Label: LABEL }, provider(false), rep)).toMatch(/no recorded creator/);
        expect(h.runView).not.toHaveBeenCalled();
    });

    it('refuses when the creator cannot be read, rather than guessing', async () => {
        h.runView.mockResolvedValue({ Success: false, ErrorMessage: 'timeout', Results: [] });
        expect(await CheckOrderDelete({ ID: ORDER_ID, Label: LABEL }, provider(), admin)).toMatch(/could not be read \(timeout\)/);
    });
});
