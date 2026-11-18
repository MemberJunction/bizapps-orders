/**
 * @fileoverview Save-time rules for product options (Tier, Size) and the variant SKU schema (golive #399).
 *
 *   - `ProductOptionAssignmentEntityServer`: a product type (global) may assign only a shared option;
 *     a category or product only a shared option or one of its own company's. The default must be
 *     one of the option's values, and one of the assignment's allowed values when it lists any.
 *     `Role = 'Variant'` is refused until variants are wired. An option whose code a checkout widget
 *     already uses as a choice-group key, on a product that widget sells, is refused: both write
 *     `OrderLineChoice.GroupKey`, so a widget pick would read as an option pick.
 *   - `ProductOptionAssignmentValueEntityServer`: an allowed value must be a value of the
 *     assignment's own option.
 *   - `ProductSuccessorOptionValueEntityServer`: the product must name a successor, and the value
 *     must belong to the option.
 *   - `ProductVariantValueEntityServer`: refused; variant SKUs are not supported yet.
 *   - `CheckoutWidgetEntityServer`: a choice group may not reuse an option code of a product the
 *     widget sells (the forward half of the collision above).
 *   - `ProductEntitlementEntityServer`: templates sharing a `Code` on one product are either one
 *     unconditional template, or all conditioned on the same choice group, so at most one of them
 *     matches any line and a line never gets two grants of one code.
 *
 * Variant refusals exist because a row would otherwise look authoritative while nothing reads it:
 * a variant would quietly miss its template's prices, tax settings and entitlements.
 *
 * CONNECTS TO:
 *   CODE: @mj-biz-apps/orders-entities product-options.ts (the walk these rules protect)
 *   PLAN: plans/archive/product-options-and-variants.md
 *
 * @module @mj-biz-apps/orders-core-entities-server
 */
import { BaseEntity, RunView, ValidationErrorInfo, ValidationResult, type IMetadataProvider, type IRunViewProvider } from '@memberjunction/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import {
    LoadOrdersEngine,
    OrdersEngine,
    mjBizAppsOrdersCheckoutWidgetEntity,
    mjBizAppsOrdersProductEntitlementEntity,
    mjBizAppsOrdersProductOptionAssignmentEntity,
    mjBizAppsOrdersProductOptionAssignmentValueEntity,
    mjBizAppsOrdersProductSuccessorOptionValueEntity,
    mjBizAppsOrdersProductVariantValueEntity,
} from '@mj-biz-apps/orders-entities';
import { RequireUUID } from './sql-guards.js';

const CHECKOUT_WIDGET_ENTITY = 'MJ_BizApps_Orders: Checkout Widgets';
const PRODUCT_ENTITLEMENT_ENTITY = 'MJ_BizApps_Orders: Product Entitlements';

export const VARIANTS_NOT_SUPPORTED =
    'Variant SKUs are not supported yet: prices, tax settings and entitlements are not read through a variant ' +
    'to its parent product. Offer the option on the line instead (Role LineOption).';

const key = (s: string | null | undefined): string => (s ?? '').trim().toLowerCase();

function fail(result: ValidationResult, field: string, message: string, value: unknown = null): void {
    result.Success = false;
    result.Errors.push(new ValidationErrorInfo(field, message, value));
}

/** The products a widget sells, from its configuration. `AllCompany` when it sells any product of its company. */
export interface WidgetProducts {
    ProductIDs: string[];
    AllCompany: boolean;
}

/** Product ids and choice-group keys a checkout widget's `Configuration` names. Bad JSON names nothing. */
export function ReadWidgetScope(configuration: string | null | undefined): WidgetProducts & { GroupKeys: string[] } {
    let config: { productId?: unknown; allowedProductIds?: unknown; allowAnyProduct?: unknown; choiceGroups?: unknown } = {};
    try {
        config = configuration ? JSON.parse(configuration) : {};
    } catch {
        config = {};
    }
    const ids = [config.productId, ...(Array.isArray(config.allowedProductIds) ? config.allowedProductIds : [])].filter(
        (v): v is string => typeof v === 'string' && v.trim() !== '',
    );
    const groups = Array.isArray(config.choiceGroups) ? config.choiceGroups : [];
    const groupKeys = groups
        .map((g) => (g && typeof g === 'object' ? (g as { key?: unknown }).key : null))
        .filter((k): k is string => typeof k === 'string' && k.trim() !== '');
    return { ProductIDs: ids, AllCompany: config.allowAnyProduct === true, GroupKeys: groupKeys };
}

/**
 * Template codes on one product whose templates do not condition on one shared choice group: a code
 * granted unconditionally and conditionally, or conditioned on two different groups. Exported for the
 * unit test.
 */
export function MixedEntitlementConditions(
    templates: ReadonlyArray<{ ID: string; Code: string; ChoiceGroupKey: string | null }>,
): string[] {
    const byCode = new Map<string, Set<string>>();
    const names = new Map<string, string>();
    for (const t of templates) {
        const k = key(t.Code);
        names.set(k, t.Code);
        const groups = byCode.get(k) ?? new Set<string>();
        groups.add(t.ChoiceGroupKey ? key(t.ChoiceGroupKey) : '');
        byCode.set(k, groups);
    }
    return [...byCode.entries()].filter(([, groups]) => groups.size > 1).map(([k]) => names.get(k) as string);
}

@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Product Option Assignments')
export class ProductOptionAssignmentEntityServer extends mjBizAppsOrdersProductOptionAssignmentEntity {
    public override get DefaultSkipAsyncValidation(): boolean {
        return false;
    }

    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        if (this.Role === 'Variant') fail(result, 'Role', VARIANTS_NOT_SUPPORTED, this.Role);

        const provider = this.ProviderToUse as unknown as IMetadataProvider;
        await LoadOrdersEngine(provider, this.ContextCurrentUser);
        const engine = OrdersEngine.Instance;
        const option = engine.ProductOptions.find((o) => UUIDsEqual(o.ID, this.ProductOptionID));
        if (!option) return result; // the foreign key refuses an option that does not exist

        // Company boundary: types are global, categories and products belong to one company.
        if (option.CompanyID) {
            const ownerCompany = this.ProductTypeID
                ? null
                : this.ProductCategoryID
                  ? engine.ProductCategoryByID(this.ProductCategoryID)?.CompanyID
                  : engine.ProductByID(this.ProductID ?? '')?.CompanyID;
            if (this.ProductTypeID) {
                fail(
                    result,
                    'ProductOptionID',
                    `${option.Name} belongs to one company, and product types are shared by every company. Assign it on a ` +
                        `category or product of that company, or make the option shared.`,
                );
            } else if (ownerCompany && !UUIDsEqual(ownerCompany, option.CompanyID)) {
                fail(result, 'ProductOptionID', `${option.Name} belongs to another company. Use a shared option or one of this company's.`);
            }
        }

        // The default must be a value of the option, and allowed here when the assignment lists values.
        if (this.DefaultProductOptionValueID) {
            const value = engine.ProductOptionValues.find((v) => UUIDsEqual(v.ID, this.DefaultProductOptionValueID));
            if (value && !UUIDsEqual(value.ProductOptionID, option.ID)) {
                fail(result, 'DefaultProductOptionValueID', `The default must be one of ${option.Name}'s values.`);
            } else if (value && this.IsSaved) {
                const listed = engine.ProductOptionAssignmentValues.filter((av) => UUIDsEqual(av.ProductOptionAssignmentID, this.ID));
                if (listed.length && !listed.some((av) => UUIDsEqual(av.ProductOptionValueID, value.ID))) {
                    fail(result, 'DefaultProductOptionValueID', `The default, ${value.Label}, is not one of the values this assignment allows.`);
                }
            }
        }

        // Reverse half of the widget collision: a widget already using this code as a choice group.
        if (!this.IsExcluded) {
            const clash = await this.widgetUsingCode(option.Code, provider);
            if (clash) {
                fail(
                    result,
                    'ProductOptionID',
                    `Checkout widget ${clash} already has a choice group with key ${option.Code} on a product this assignment ` +
                        `reaches. Both record their picks under that key, so rename the widget's group or the option's code.`,
                );
            }
        }
        return result;
    }

    /** The name of a widget selling a product in this assignment's scope with a choice group keyed `code`. */
    private async widgetUsingCode(code: string, provider: IMetadataProvider): Promise<string | null> {
        const rv = new RunView(provider as unknown as IRunViewProvider);
        const res = await rv.RunView<{ Name: string; CompanyID: string | null; Configuration: string | null }>(
            { EntityName: CHECKOUT_WIDGET_ENTITY, Fields: ['Name', 'CompanyID', 'Configuration'], ResultType: 'simple' },
            this.ContextCurrentUser,
        );
        if (!res?.Success) throw new Error(`Could not read checkout widgets: ${res?.ErrorMessage}`);
        const engine = OrdersEngine.Instance;
        const inScope = (productID: string): boolean => {
            const p = engine.ProductByID(productID);
            if (!p) return false;
            if (this.ProductID) return UUIDsEqual(p.ID, this.ProductID);
            if (this.ProductTypeID) return UUIDsEqual(p.ProductTypeID, this.ProductTypeID);
            return engine.CategoryChain(p.ProductCategoryID).some((c) => UUIDsEqual(c, this.ProductCategoryID));
        };
        for (const w of res.Results ?? []) {
            const scope = ReadWidgetScope(w.Configuration);
            if (!scope.GroupKeys.some((k) => key(k) === key(code))) continue;
            const products = scope.AllCompany
                ? engine.Products.filter((p) => UUIDsEqual(p.CompanyID, w.CompanyID)).map((p) => p.ID)
                : scope.ProductIDs;
            if (products.some(inScope)) return w.Name;
        }
        return null;
    }
}

@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Product Option Assignment Values')
export class ProductOptionAssignmentValueEntityServer extends mjBizAppsOrdersProductOptionAssignmentValueEntity {
    public override get DefaultSkipAsyncValidation(): boolean {
        return false;
    }

    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        await LoadOrdersEngine(this.ProviderToUse as unknown as IMetadataProvider, this.ContextCurrentUser);
        const engine = OrdersEngine.Instance;
        const assignment = engine.ProductOptionAssignments.find((a) => UUIDsEqual(a.ID, this.ProductOptionAssignmentID));
        const value = engine.ProductOptionValues.find((v) => UUIDsEqual(v.ID, this.ProductOptionValueID));
        if (assignment && value && !UUIDsEqual(assignment.ProductOptionID, value.ProductOptionID)) {
            fail(result, 'ProductOptionValueID', `${value.Label} is a value of another option, not the one this assignment offers.`);
        }
        return result;
    }
}

@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Product Successor Option Values')
export class ProductSuccessorOptionValueEntityServer extends mjBizAppsOrdersProductSuccessorOptionValueEntity {
    public override get DefaultSkipAsyncValidation(): boolean {
        return false;
    }

    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        await LoadOrdersEngine(this.ProviderToUse as unknown as IMetadataProvider, this.ContextCurrentUser);
        const engine = OrdersEngine.Instance;
        const product = engine.ProductByID(this.ProductID);
        if (product && !product.SuccessorProductID) {
            fail(
                result,
                'ProductID',
                `${product.Name} names no successor product, so a renewal never moves off it and these picks would never be used. ` +
                    `Set its successor first.`,
            );
        }
        const value = engine.ProductOptionValues.find((v) => UUIDsEqual(v.ID, this.ProductOptionValueID));
        if (value && !UUIDsEqual(value.ProductOptionID, this.ProductOptionID)) {
            fail(result, 'ProductOptionValueID', `${value.Label} is a value of another option.`);
        }
        return result;
    }
}

@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Product Variant Values')
export class ProductVariantValueEntityServer extends mjBizAppsOrdersProductVariantValueEntity {
    public override Validate(): ValidationResult {
        const result = super.Validate();
        fail(result, 'ProductID', VARIANTS_NOT_SUPPORTED);
        return result;
    }
}

@RegisterClass(BaseEntity, CHECKOUT_WIDGET_ENTITY)
export class CheckoutWidgetEntityServer extends mjBizAppsOrdersCheckoutWidgetEntity {
    public override get DefaultSkipAsyncValidation(): boolean {
        return false;
    }

    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        const changed = !this.IsSaved || this.GetFieldByName('Configuration')?.Dirty === true;
        if (!changed) return result;
        const scope = ReadWidgetScope(this.Configuration);
        if (!scope.GroupKeys.length) return result;

        await LoadOrdersEngine(this.ProviderToUse as unknown as IMetadataProvider, this.ContextCurrentUser);
        const engine = OrdersEngine.Instance;
        const products = scope.AllCompany ? engine.Products.filter((p) => UUIDsEqual(p.CompanyID, this.CompanyID)).map((p) => p.ID) : scope.ProductIDs;
        const groupKeys = new Set(scope.GroupKeys.map(key));
        for (const productID of products) {
            const clash = engine.EffectiveOptions(productID).find((e) => groupKeys.has(key(e.Option.Code)));
            if (clash) {
                const product = engine.ProductByID(productID);
                fail(
                    result,
                    'Configuration',
                    `The choice group ${clash.Option.Code} has the same key as the ${clash.Option.Name} option of ${product?.Name ?? productID}. ` +
                        `Both record their picks under that key, so rename the choice group.`,
                );
                break;
            }
        }
        return result;
    }
}

@RegisterClass(BaseEntity, PRODUCT_ENTITLEMENT_ENTITY)
export class ProductEntitlementEntityServer extends mjBizAppsOrdersProductEntitlementEntity {
    public override get DefaultSkipAsyncValidation(): boolean {
        return false;
    }

    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        const touched =
            !this.IsSaved || ['Code', 'ChoiceGroupKey', 'ProductID', 'IsActive'].some((f) => this.GetFieldByName(f)?.Dirty === true);
        if (!touched || !this.ProductID || !this.IsActive) return result;

        const rv = new RunView(this.ProviderToUse as unknown as IRunViewProvider);
        const res = await rv.RunView<{ ID: string; Code: string; ChoiceGroupKey: string | null }>(
            {
                EntityName: PRODUCT_ENTITLEMENT_ENTITY,
                ExtraFilter: `ProductID='${RequireUUID(this.ProductID, 'ProductID')}' AND IsActive=1`,
                Fields: ['ID', 'Code', 'ChoiceGroupKey'],
                ResultType: 'simple',
            },
            this.ContextCurrentUser,
        );
        if (!res?.Success) throw new Error(`Could not read the product's entitlement templates: ${res?.ErrorMessage}`);
        const others = (res.Results ?? []).filter((t) => !UUIDsEqual(t.ID, this.ID));
        const mixed = MixedEntitlementConditions([...others, { ID: this.ID, Code: this.Code, ChoiceGroupKey: this.ChoiceGroupKey }]);
        if (mixed.some((c) => key(c) === key(this.Code))) {
            fail(
                result,
                'ChoiceGroupKey',
                `Entitlement ${this.Code} is already granted on this product with a different condition. Templates sharing a code ` +
                    `must all condition on the same option (one per value), or be a single unconditional template, so a line ` +
                    `never receives two grants of one code.`,
                this.ChoiceGroupKey,
            );
        }
        return result;
    }
}

/** Tree-shaking anchor — call from the server bootstrap so @RegisterClass is retained. */
export function LoadProductOptionRules(): void {
    // intentionally empty
}
