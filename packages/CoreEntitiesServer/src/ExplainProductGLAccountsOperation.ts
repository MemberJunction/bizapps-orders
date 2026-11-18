/**
 * @fileoverview `Orders.ExplainProductGLAccounts` — which GL account each role books to for a
 * product, and where in the walk it comes from (golive#439).
 *
 * WHY THIS IS AN OPERATION AND NOT A CLIENT WALK. The product → category (+ ancestors) → product
 * type → company precedence, the legal-entity scoping of a Division and the cross-company refusal
 * live in `GLAccountResolver`, on the server, where confirm runs them. A browser copy would disagree
 * with booking the first time either changed, so the product screen asks the resolver itself, through
 * `GLAccountResolver.Explain`, which runs the walk `Resolve` books through.
 *
 * It reads the server's accounting engine cache, the one confirm reads, so a stale cache shows here as
 * it would at booking.
 *
 * READ-ONLY: it loads the product and reads cached links; nothing is written or recorded.
 *
 * CONNECTS TO:
 *   CODE: GLAccountResolver.Explain, AccountingBridge.BuildGLAccountResolver
 *   UI:   the product Accounting tab's "Effective accounts" block
 *
 * @module @mj-biz-apps/orders-core-entities-server
 */
import { BaseRemotableOperation, RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import {
    LoadOrdersEngine,
    OrdersEngine,
    OrdersExplainProductGLAccountsOperation as OrdersExplainProductGLAccountsOperationBase,
    ToISODate,
    type ExplainedGLRole,
    type mjBizAppsOrdersProductEntity,
    type OrdersExplainProductGLAccountsInput,
    type OrdersExplainProductGLAccountsOutput,
} from '@mj-biz-apps/orders-entities';

import { BuildGLAccountResolver } from './AccountingBridge.js';
import { CalendarDayOrToday } from './calendar-day.js';
import { GL_ROLE, type GLRole, type GLRoleExplanation, type GLWalkLevel } from './GLAccountResolver.js';
import { InvalidOperationInputError, RequireOptionalDay, RequireOptionalUUID, RequireUUID, RequireUUIDs } from './sql-guards.js';

const PRODUCT_ENTITY = 'MJ_BizApps_Orders: Products';
const COMPANY_ENTITY = 'MJ: Companies';

/** The roles a product's lines book, in the order the product screen lists them (g439.1 A). */
export const PRODUCT_GL_ROLES: readonly GLRole[] = [
    GL_ROLE.Sales,
    GL_ROLE.DeferredRevenue,
    GL_ROLE.SalesDiscounts,
    GL_ROLE.SalesReturnsAndAllowances,
    GL_ROLE.AccountsReceivable,
];

const KNOWN_ROLES: readonly string[] = Object.values(GL_ROLE);

/** The roles asked for, checked against the ones orders books; the product roles when none are named. */
export function RequireGLRoles(roles: string[] | null | undefined): GLRole[] {
    if (!roles?.length) return [...PRODUCT_GL_ROLES];
    return roles.map((r) => {
        const match = KNOWN_ROLES.find((k) => k.toLowerCase() === String(r ?? '').trim().toLowerCase());
        if (!match) {
            throw new InvalidOperationInputError(`Roles: '${r}' is not a GL account role orders books. Known roles: ${KNOWN_ROLES.join(', ')}.`);
        }
        return match as GLRole;
    });
}

const LEVEL_LABEL: Record<GLWalkLevel, string> = {
    Product: 'Product',
    Category: 'Category',
    ParentCategory: 'Parent category',
    ProductType: 'Product type',
    Company: 'Company default',
    LegalEntity: 'Legal entity default',
};

/**
 * One role's explanation in the operation's output shape, which is also what accounting's
 * `mj-gl-resolution-preview` renders.
 *
 * @param nameOf the record's name for a level, or null when it cannot be found; the id is shown then
 */
export function ShapeRoleExplanation(
    explanation: GLRoleExplanation,
    nameOf: (level: GLWalkLevel, recordID: string) => string | null,
): ExplainedGLRole {
    const steps = explanation.Steps.map((s) => ({
        Level: s.Level,
        Scope: `${LEVEL_LABEL[s.Level]}: ${nameOf(s.Level, s.RecordID) ?? s.RecordID}`,
        RecordID: s.RecordID,
        GLAccountID: s.Hit?.GLAccountID ?? null,
        AccountCode: s.Hit ? (s.Hit.AccountCode ?? s.Hit.AccountLabel ?? s.Hit.GLAccountID) : null,
        AccountName: s.Hit ? (s.Hit.AccountName ?? null) : null,
        Won: s.Won,
        Dimensions: (s.Hit?.RequiredDimensions ?? []).map((d) => d.Code),
    }));
    const winner = explanation.GLAccountID ? steps.find((s) => s.Won) : undefined;
    return {
        Role: explanation.Role,
        Steps: steps,
        ResolvedGLAccountID: winner?.GLAccountID ?? null,
        ResolvedCode: winner?.AccountCode ?? null,
        ResolvedName: winner?.AccountName ?? null,
        Failure: explanation.Failure,
        Message: explanation.Message,
    };
}

@RegisterClass(BaseRemotableOperation, 'Orders.ExplainProductGLAccounts')
export class ExplainProductGLAccountsOperation extends OrdersExplainProductGLAccountsOperationBase {
    protected async InternalExecute(
        input: OrdersExplainProductGLAccountsInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<OrdersExplainProductGLAccountsOutput> {
        const productID = RequireUUID(input?.ProductID, 'ProductID');
        RequireOptionalUUID(input?.CompanyID, 'CompanyID');
        // Refused rather than absorbed: `CalendarDayOrToday` reads an unreadable day as today.
        RequireOptionalDay(input?.AsOf, 'AsOf');
        const roles = RequireGLRoles(input?.Roles);

        const asOf = await CalendarDayOrToday(input?.AsOf, provider, user);
        const asOfDay = ToISODate(asOf) ?? '';
        const refuse = (companyID: string, message: string): OrdersExplainProductGLAccountsOutput => ({
            Success: false,
            Message: message,
            ProductID: productID,
            CompanyID: companyID,
            AsOf: asOfDay,
            Roles: [],
        });

        const product = await provider.GetEntityObject<mjBizAppsOrdersProductEntity>(PRODUCT_ENTITY, user);
        if (!(await product.Load(productID))) {
            return refuse(input?.CompanyID ?? '', `Product ${productID} does not exist, so its GL accounts cannot be explained.`);
        }
        const companyID = input?.CompanyID || product.CompanyID;

        const resolver = await BuildGLAccountResolver(provider, user);
        const explanations: GLRoleExplanation[] = [];
        try {
            for (const role of roles) {
                explanations.push(
                    await resolver.Explain(role, product.ID, product.ProductCategoryID, companyID, asOf, product.ProductTypeID),
                );
            }
        } catch (err) {
            // The legal-entity lookup refuses a Division whose setup is incomplete; booking refuses the same way.
            return refuse(companyID, err instanceof Error ? err.message : String(err));
        }

        await LoadOrdersEngine(provider, user);
        const companyIDs = [
            ...new Set(
                explanations.flatMap((e) =>
                    e.Steps.filter((s) => s.Level === 'Company' || s.Level === 'LegalEntity').map((s) => s.RecordID.toLowerCase()),
                ),
            ),
        ];
        const companyNames = await this.companyNames(companyIDs, provider, user);
        const nameOf = (level: GLWalkLevel, recordID: string): string | null => {
            switch (level) {
                case 'Product':
                    return product.Name;
                case 'Category':
                case 'ParentCategory':
                    return OrdersEngine.Instance.ProductCategories.find((c) => UUIDsEqual(c.ID, recordID))?.Name ?? null;
                case 'ProductType':
                    return OrdersEngine.Instance.ProductTypeByID(recordID)?.Name ?? null;
                case 'Company':
                case 'LegalEntity':
                    return companyNames.get(recordID.toLowerCase()) ?? null;
            }
        };

        return {
            Success: true,
            ProductID: productID,
            CompanyID: companyID,
            AsOf: asOfDay,
            Roles: explanations.map((e) => ShapeRoleExplanation(e, nameOf)),
        };
    }

    /** Company names by lower-cased id, for the company-default steps. */
    private async companyNames(ids: string[], provider: IMetadataProvider, user: UserInfo): Promise<Map<string, string>> {
        const names = new Map<string, string>();
        if (!ids.length) return names;
        const inList = RequireUUIDs(ids, 'CompanyID')
            .map((id) => `'${id}'`)
            .join(', ');
        const result = await RunView.FromMetadataProvider(provider).RunView<{ ID: string; Name: string }>(
            { EntityName: COMPANY_ENTITY, ExtraFilter: `ID IN (${inList})`, Fields: ['ID', 'Name'], ResultType: 'simple' },
            user,
        );
        for (const row of result.Success ? (result.Results ?? []) : []) names.set(String(row.ID).toLowerCase(), row.Name);
        return names;
    }
}

/** Tree-shaking anchor — call from the server bootstrap so @RegisterClass is retained. */
export function LoadExplainProductGLAccountsOperation(): void {
    // intentionally empty
}
