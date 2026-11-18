import { Injectable } from '@angular/core';
import { IMetadataProvider, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { IsValidUUID } from '@memberjunction/global';
import { MJO_ENTITIES } from '../data/entity-names';

const COMPANIES_ENTITY = 'MJ: Companies';
const EMPLOYEES_ENTITY = 'MJ: Employees';
const ROLES_ENTITY = 'MJ: Roles';

/**
 * Roles that see all companies across Receivables surfaces. Users without one of these roles are
 * scoped to the companies their employee record belongs to.
 */
export const ORDERS_FINANCE_ROLES = [
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

const FINANCE_ROLE_SET = new Set<string>(ORDERS_FINANCE_ROLES.map((r) => r.toLowerCase()));

/** A company option for scoping Orders and Receivables views. */
export interface OrdersScopeCompany {
    ID: string;
    Name: string;
}

/** True when `user` holds a Finance or administrative role that sees all companies. */
export function UserHoldsFinanceRole(
    user: UserInfo | null | undefined,
    roleNamesById?: ReadonlyMap<string, string>,
): boolean {
    const roles = user?.UserRoles ?? [];
    for (const r of roles) {
        const directName = (r as { Role?: string; RoleName?: string }).Role ?? (r as { RoleName?: string }).RoleName ?? '';
        if (directName && FINANCE_ROLE_SET.has(directName.trim().toLowerCase())) {
            return true;
        }
        const roleId = r.RoleID ? String(r.RoleID).trim().toLowerCase() : '';
        if (roleId && roleNamesById) {
            const mapped = roleNamesById.get(roleId);
            if (mapped && FINANCE_ROLE_SET.has(mapped.trim().toLowerCase())) {
                return true;
            }
        }
    }
    return false;
}

/**
 * Resolves the effective company ID filter (`null` = all companies, `string[]` = restricted to those IDs).
 *
 * - When `allowedCompanyIDs` is `null` (Finance role or unscoped user): empty `selectedIDs` means all
 *   companies (`null`); non-empty narrows to `selectedIDs`.
 * - When `allowedCompanyIDs` is `string[]` (user tied to specific companies): empty `selectedIDs`
 *   defaults to `allowedCompanyIDs`; non-empty intersects `selectedIDs` with `allowedCompanyIDs`.
 */
export function ResolveEffectiveCompanyIDs(
    selectedIDs: readonly string[],
    allowedCompanyIDs: readonly string[] | null,
): string[] | null {
    const cleanSelected = cleanUUIDs(selectedIDs);
    if (allowedCompanyIDs === null) {
        return cleanSelected.length > 0 ? cleanSelected : null;
    }
    const cleanAllowed = cleanUUIDs(allowedCompanyIDs);
    if (cleanSelected.length === 0) {
        return cleanAllowed;
    }
    const allowedSet = new Set(cleanAllowed.map((id) => id.toLowerCase()));
    return cleanSelected.filter((id) => allowedSet.has(id.toLowerCase()));
}

function cleanUUIDs(ids: readonly string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of ids) {
        const trimmed = (raw ?? '').trim();
        if (!IsValidUUID(trimmed)) continue;
        const key = trimmed.toLowerCase();
        if (!seen.has(key)) {
            seen.add(key);
            out.push(trimmed);
        }
    }
    return out;
}

/**
 * Orders & Receivables company scope service.
 *
 * Defaults Receivables pages (Invoicing queue, Billing, Overdue, Customer A/R, and External Payments)
 * to the signed-in user's companies, while Finance roles see all companies unless narrowed by the
 * filter bar.
 */
@Injectable({ providedIn: 'root' })
export class CompanyScopeService {
    private selectedIDs: string[] = [];
    private companies: OrdersScopeCompany[] = [];
    private allowedCompanyIDs: string[] | null = null;
    private isFinanceUser = false;
    private loaded = false;

    public get Companies(): OrdersScopeCompany[] {
        return this.companies;
    }

    public get SelectedIDs(): string[] {
        return this.selectedIDs;
    }

    public get AllowedCompanyIDs(): string[] | null {
        return this.allowedCompanyIDs;
    }

    public get IsFinanceUser(): boolean {
        return this.isFinanceUser;
    }

    /**
     * Effective company IDs to pass to server operations and RunView filters, or `undefined` when all
     * companies are in scope.
     */
    public get EffectiveCompanyIDs(): string[] | undefined {
        return ResolveEffectiveCompanyIDs(this.selectedIDs, this.allowedCompanyIDs) ?? undefined;
    }

    /**
     * Loads the user's company scope once per session. Safe when called in test environments without
     * a live metadata provider.
     */
    public async Load(contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        if (this.loaded) return;
        this.loaded = true;

        try {
            const md = new Metadata();
            const activeProvider = provider ?? Metadata.Provider;
            const user = contextUser ?? md.CurrentUser;
            if (!activeProvider || !user) {
                this.allowedCompanyIDs = null;
                this.isFinanceUser = true;
                return;
            }

            const rv = RunView.FromMetadataProvider(activeProvider);
            const roleNames = await this.loadRoleNamesIfNeeded(rv, user);
            this.isFinanceUser = UserHoldsFinanceRole(user, roleNames);

            const employeeCompanies = this.isFinanceUser ? null : await this.loadEmployeeCompanies(rv, user);
            this.allowedCompanyIDs = employeeCompanies;
            if (employeeCompanies && employeeCompanies.length > 0 && this.selectedIDs.length === 0) {
                this.selectedIDs = [...employeeCompanies];
            }

            const companiesRes = await rv.RunView<OrdersScopeCompany>(
                {
                    EntityName: COMPANIES_ENTITY,
                    Fields: ['ID', 'Name'],
                    OrderBy: 'Name ASC',
                    ResultType: 'simple',
                },
                user,
            );
            if (companiesRes?.Success && companiesRes.Results) {
                const all = companiesRes.Results;
                if (this.allowedCompanyIDs === null) {
                    this.companies = all;
                } else {
                    const allowedSet = new Set(this.allowedCompanyIDs.map((id) => id.toLowerCase()));
                    this.companies = all.filter((c) => allowedSet.has(String(c.ID).toLowerCase()));
                }
            }
        } catch {
            // Degrade gracefully when metadata or RunView is not wired (e.g., unit tests).
            this.allowedCompanyIDs = null;
        }
    }

    /** Sets the selected company filter IDs (empty array = default scope). */
    public SetScope(ids: readonly string[]): void {
        this.selectedIDs = cleanUUIDs(ids);
    }

    /** Resets cached state (for tests). */
    public Reset(options?: { AllowedCompanyIDs?: string[] | null; SelectedIDs?: string[]; IsFinanceUser?: boolean }): void {
        this.loaded = options !== undefined;
        this.allowedCompanyIDs = options?.AllowedCompanyIDs ?? null;
        this.isFinanceUser = options?.IsFinanceUser ?? (this.allowedCompanyIDs === null);
        this.selectedIDs = cleanUUIDs(options?.SelectedIDs ?? []);
    }

    /**
     * SQL predicate for `columnName` (`CompanyID IN (...)`), `'1 = 0'` when scoped to an empty set,
     * or `null` when all companies are in scope.
     */
    public FilterFor(columnName = 'CompanyID'): string | null {
        const ids = this.EffectiveCompanyIDs;
        if (!ids) return null;
        if (ids.length === 0) return '1 = 0';
        return `${columnName} IN (${ids.map((id) => `'${id}'`).join(',')})`;
    }

    /** Composes `ownFilter` with the active company scope predicate on `columnName`. */
    public ComposeFilter(ownFilter: string | null | undefined, columnName = 'CompanyID'): string {
        const scope = this.FilterFor(columnName);
        const parts = [ownFilter?.trim(), scope].filter((p): p is string => !!p && p.length > 0);
        if (parts.length <= 1) return parts[0] ?? '';
        return parts.map((p) => `(${p})`).join(' AND ');
    }

    /**
     * Composes `ownFilter` on `MJ_BizApps_Orders: External Payments` with a `PaymentProviderID IN (...)`
     * predicate derived from the active companies' payment providers, since `ExternalPayment` reaches
     * its company through `PaymentProvider`.
     */
    public async ExternalPaymentFilter(ownFilter?: string | null, user?: UserInfo): Promise<string> {
        const base = ownFilter?.trim() ?? '';
        const companyIDs = this.EffectiveCompanyIDs;
        if (!companyIDs) return base;
        if (companyIDs.length === 0) {
            return base ? `(${base}) AND (1 = 0)` : '1 = 0';
        }

        const rv = new RunView();
        const companyClause = `CompanyID IN (${companyIDs.map((id) => `'${id}'`).join(',')})`;
        const providers = await rv.RunView<{ ID: string }>(
            {
                EntityName: MJO_ENTITIES.PaymentProvider,
                ExtraFilter: companyClause,
                Fields: ['ID'],
                ResultType: 'simple',
            },
            user,
        );
        if (!providers?.Success) {
            return base ? `(${base}) AND (1 = 0)` : '1 = 0';
        }
        const providerIDs = cleanUUIDs((providers.Results ?? []).map((p) => String(p.ID)));
        const providerClause = providerIDs.length > 0 ? `PaymentProviderID IN (${providerIDs.map((id) => `'${id}'`).join(',')})` : '1 = 0';
        return base ? `(${base}) AND (${providerClause})` : providerClause;
    }

    private async loadRoleNamesIfNeeded(rv: RunView, user: UserInfo): Promise<Map<string, string> | undefined> {
        const roles = user.UserRoles ?? [];
        if (roles.length === 0) return undefined;
        if (UserHoldsFinanceRole(user)) return undefined;
        const missingNameIDs = cleanUUIDs(
            roles
                .filter((r) => !((r as { Role?: string }).Role ?? (r as { RoleName?: string }).RoleName))
                .map((r) => String(r.RoleID ?? '')),
        );
        if (missingNameIDs.length === 0) return undefined;
        const res = await rv.RunView<{ ID: string; Name: string }>(
            {
                EntityName: ROLES_ENTITY,
                ExtraFilter: `ID IN (${missingNameIDs.map((id) => `'${id}'`).join(',')})`,
                Fields: ['ID', 'Name'],
                ResultType: 'simple',
            },
            user,
        );
        if (!res?.Success || !res.Results) return undefined;
        return new Map(res.Results.map((r) => [String(r.ID).toLowerCase(), r.Name]));
    }

    private async loadEmployeeCompanies(rv: RunView, user: UserInfo): Promise<string[] | null> {
        const employeeID = user.EmployeeID ? String(user.EmployeeID).trim() : '';
        if (!IsValidUUID(employeeID)) {
            return null;
        }
        const res = await rv.RunView<{ CompanyID: string | null }>(
            {
                EntityName: EMPLOYEES_ENTITY,
                ExtraFilter: `ID = '${employeeID}'`,
                Fields: ['CompanyID'],
                MaxRows: 1,
                ResultType: 'simple',
            },
            user,
        );
        if (!res?.Success) return null;
        const companyIDs = cleanUUIDs((res.Results ?? []).map((r) => String(r.CompanyID ?? '')));
        return companyIDs.length > 0 ? companyIDs : null;
    }
}
