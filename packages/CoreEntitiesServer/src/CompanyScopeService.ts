/**
 * Server-side company scope enforcement for Receivables worklist operations.
 *
 * Users holding a Finance or administrative role see all companies unless they pass an explicit
 * `CompanyIDs` filter. Users without a Finance role who are linked to an employee record are
 * scoped to their employee company (and any `CompanyIDs` filter they pass is intersected with it).
 *
 * @module @mj-biz-apps/orders-core-entities-server
 */
import { RunView, type IMetadataProvider, type IRunViewProvider, type UserInfo } from '@memberjunction/core';
import { IsValidUUID } from '@memberjunction/global';
import { RequireUUID } from './sql-guards.js';

const EMPLOYEES_ENTITY = 'MJ: Employees';
const ROLES_ENTITY = 'MJ: Roles';

/**
 * Roles that see all companies across Receivables worklists.
 */
export const RECEIVABLES_ALL_COMPANIES_ROLES = [
    'Senior Finance (AR)',
    'CFO',
    'CEO Approver',
    'Orders Revenue Supervisor',
    'Finance',
    'Developer',
    'Integration',
    'Administrator',
    'UI',
] as const;

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

export class CompanyScopeService {
    /**
     * Resolves the effective company IDs for a Receivables worklist read:
     * - `null`: all companies are in scope
     * - `string[]`: only the listed companies are in scope (`[]` means none match)
     */
    public static async ResolveReceivablesCompanyIDs(
        requestedCompanyIDs: readonly string[] | null | undefined,
        provider: IMetadataProvider,
        user: UserInfo | null | undefined,
    ): Promise<string[] | null> {
        if (!user) {
            return IntersectCompanyScope(requestedCompanyIDs, null);
        }

        if (UserHoldsAllCompaniesRole(user)) {
            return IntersectCompanyScope(requestedCompanyIDs, null);
        }

        const employeeID = user.EmployeeID ? String(user.EmployeeID).trim() : '';
        if (!IsValidUUID(employeeID)) {
            return IntersectCompanyScope(requestedCompanyIDs, null);
        }

        const rv = new RunView(provider as unknown as IRunViewProvider);
        const roleNames = await this.loadRoleNamesIfNeeded(rv, user);
        if (roleNames && UserHoldsAllCompaniesRole(user, roleNames)) {
            return IntersectCompanyScope(requestedCompanyIDs, null);
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
            return IntersectCompanyScope(requestedCompanyIDs, null);
        }

        const companyIDs = (empResult.Results ?? [])
            .map((r) => (r.CompanyID ? String(r.CompanyID).trim() : ''))
            .filter((id) => IsValidUUID(id));

        if (companyIDs.length === 0) {
            return IntersectCompanyScope(requestedCompanyIDs, null);
        }

        return IntersectCompanyScope(requestedCompanyIDs, companyIDs);
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
