/**
 * Server-side company scope enforcement for Receivables worklist operations.
 *
 * Users holding one of `RECEIVABLES_ALL_COMPANIES_ROLES` (orders-entities) see all companies unless
 * they pass an explicit `CompanyIDs` filter. Any other user is scoped to the company of the employee
 * record linked to their user (and any `CompanyIDs` filter they pass is intersected with it). A user
 * with no such record, or whose record cannot be read, is scoped to no company: the scope fails
 * closed (#813).
 *
 * @module @mj-biz-apps/orders-core-entities-server
 */
import { RunView, type IMetadataProvider, type IRunViewProvider, type UserInfo } from '@memberjunction/core';
import { IsValidUUID } from '@memberjunction/global';
import { RECEIVABLES_ALL_COMPANIES_ROLES } from '@mj-biz-apps/orders-entities';
import { RequireUUID } from './sql-guards.js';

export { RECEIVABLES_ALL_COMPANIES_ROLES };

const EMPLOYEES_ENTITY = 'MJ: Employees';
const ROLES_ENTITY = 'MJ: Roles';

const ALL_COMPANIES_ROLE_SET = new Set<string>(RECEIVABLES_ALL_COMPANIES_ROLES.map((r) => r.toLowerCase()));

/** True when `user` holds a Finance or administrative role that may read across all companies. */
export function UserHoldsAllCompaniesRole(
    user: UserInfo | null | undefined,
    roleNamesById?: ReadonlyMap<string, string>,
): boolean {
    const roles = user?.UserRoles ?? [];
    for (const r of roles) {
        const directName = (r as { Role?: string; RoleName?: string }).Role ?? (r as { RoleName?: string }).RoleName ?? '';
        if (directName && ALL_COMPANIES_ROLE_SET.has(directName.trim().toLowerCase())) {
            return true;
        }
        const roleId = r.RoleID ? String(r.RoleID).trim().toLowerCase() : '';
        if (roleId && roleNamesById) {
            const mapped = roleNamesById.get(roleId);
            if (mapped && ALL_COMPANIES_ROLE_SET.has(mapped.trim().toLowerCase())) {
                return true;
            }
        }
    }
    return false;
}

/**
 * Combines the caller's requested `CompanyIDs` with the user's allowed company scope:
 * - `allowedCompanyIDs === null` (Finance role or unscoped user): returns validated `requestedCompanyIDs`
 *   when non-empty, or `null` (all companies) when empty/omitted.
 * - `allowedCompanyIDs` is `string[]` (user scoped to specific companies): returns `allowedCompanyIDs`
 *   when `requestedCompanyIDs` is empty/omitted, or the intersection when `requestedCompanyIDs` is
 *   provided (which is `[]` when the caller asked only for companies outside their scope).
 */
export function IntersectCompanyScope(
    requestedCompanyIDs: readonly string[] | null | undefined,
    allowedCompanyIDs: readonly string[] | null,
): string[] | null {
    const requested = requestedCompanyIDs?.length
        ? requestedCompanyIDs.map((id) => RequireUUID(id, 'CompanyIDs'))
        : null;

    if (allowedCompanyIDs === null) {
        return requested;
    }

    const allowed = allowedCompanyIDs.map((id) => RequireUUID(id, 'CompanyIDs'));
    if (!requested) {
        return allowed;
    }

    const allowedSet = new Set(allowed.map((id) => id.toLowerCase()));
    return requested.filter((id) => allowedSet.has(id.toLowerCase()));
}

export interface ReceivablesScopeOptions {
    /**
     * True for the scheduled send sweep, which runs as a job user that is often linked to no employee:
     * there the scope keeps the caller from naming companies outside their own, but a user who cannot be
     * placed in any company still sweeps every company, as the send did before scoping. A read for a
     * person leaves it unset and fails closed.
     */
    UnplacedUserSeesAll?: boolean;
}

export class CompanyScopeService {
    /**
     * Resolves the effective company IDs for a Receivables worklist read:
     * - `null`: all companies are in scope (an all-companies role, or no user: a server-internal call)
     * - `string[]`: only the listed companies are in scope (`[]` means none match, which is also the
     *   answer for a user with no all-companies role and no employee company)
     */
    public static async ResolveReceivablesCompanyIDs(
        requestedCompanyIDs: readonly string[] | null | undefined,
        provider: IMetadataProvider,
        user: UserInfo | null | undefined,
        options: ReceivablesScopeOptions = {},
    ): Promise<string[] | null> {
        // Where the user cannot be placed in a company: none for a read, every company for a sweep.
        const unplaced: string[] | null = options.UnplacedUserSeesAll ? null : [];
        if (!user) {
            return IntersectCompanyScope(requestedCompanyIDs, null);
        }

        if (UserHoldsAllCompaniesRole(user)) {
            return IntersectCompanyScope(requestedCompanyIDs, null);
        }

        const employeeID = user.EmployeeID ? String(user.EmployeeID).trim() : '';
        const rv = new RunView(provider as unknown as IRunViewProvider);
        const roleNames = await this.loadRoleNamesIfNeeded(rv, user);
        if (roleNames && UserHoldsAllCompaniesRole(user, roleNames)) {
            return IntersectCompanyScope(requestedCompanyIDs, null);
        }
        // Not an all-companies user and not linked to an employee: nothing proves which company is
        // theirs, so they see none.
        if (!IsValidUUID(employeeID)) {
            return IntersectCompanyScope(requestedCompanyIDs, unplaced);
        }

        const empResult = await rv.RunView<{ CompanyID: string | null }>(
            {
                EntityName: EMPLOYEES_ENTITY,
                ExtraFilter: `ID = '${RequireUUID(employeeID, 'EmployeeID')}'`,
                Fields: ['CompanyID'],
                MaxRows: 1,
                ResultType: 'simple',
            },
            user,
        );
        if (!empResult?.Success) {
            return IntersectCompanyScope(requestedCompanyIDs, unplaced);
        }

        const companyIDs = (empResult.Results ?? [])
            .map((r) => (r.CompanyID ? String(r.CompanyID).trim() : ''))
            .filter((id) => IsValidUUID(id));

        return IntersectCompanyScope(requestedCompanyIDs, companyIDs.length > 0 ? companyIDs : unplaced);
    }

    private static async loadRoleNamesIfNeeded(
        rv: RunView,
        user: UserInfo,
    ): Promise<Map<string, string> | undefined> {
        const roles = user.UserRoles ?? [];
        const unnamedRoleIDs = roles
            .filter((r) => !((r as { Role?: string }).Role ?? (r as { RoleName?: string }).RoleName))
            .map((r) => (r.RoleID ? String(r.RoleID).trim() : ''))
            .filter((id) => IsValidUUID(id));

        if (unnamedRoleIDs.length === 0) return undefined;

        const res = await rv.RunView<{ ID: string; Name: string }>(
            {
                EntityName: ROLES_ENTITY,
                ExtraFilter: `ID IN (${unnamedRoleIDs.map((id) => `'${RequireUUID(id, 'RoleID')}'`).join(',')})`,
                Fields: ['ID', 'Name'],
                ResultType: 'simple',
            },
            user,
        );
        if (!res?.Success || !res.Results) return undefined;
        return new Map(res.Results.map((r) => [String(r.ID).toLowerCase(), r.Name]));
    }
}
