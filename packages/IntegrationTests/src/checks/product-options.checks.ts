/**
 * product-options — Tier, Size and other buyer choices on one product, driving the price (golive #399).
 *
 * The unit suite pins the walk (type → categories → product, most specific wins whole), the pick
 * checks and the matrix disjointness. What only a live database shows is that the pieces meet:
 * the catalog rows save through their entity servers, the engine resolves them, the pricing pass
 * reads picks from the line's graph, the save refuses a line missing a required pick, the database
 * holds one pick per option, and a renewal carries its picks.
 *
 *   PO1   options resolve through the type, a category and the product, most specific winning whole
 *   PO2   a Tier × Size matrix saves at one priority, and a line's picks choose its price
 *   PO3   a line missing a required pick is refused, and says which option
 *   PO4   one code is granted per tier (the entitlement index swap), and a mixed condition is refused
 *   PO5   a renewal carries the expiring line's option picks
 *   PO6   variant SKU writes are refused: a parent product, a variant value, a Variant-role assignment
 *   PO7   a second pick of one option on one line is refused
 *
 * Catalog rows are written inside the check's transaction, so the engine is reloaded after writing
 * them and again after the rollback.
 *
 * CONNECTS TO:
 *   CODE: orders-entities product-options.ts · ProductOptionRules.ts · OrderLineEntityServer.refuseBadOptionPicks
 *   PLAN: plans/archive/product-options-and-variants.md
 */
import {
    Assert,
    AssertEqual,
    IntegrationCheckRegistry,
    type IntegrationCheckContext,
    type NamedCheck,
} from '@memberjunction/testing-integration';
import { BaseEntity, BaseRemotableOperation, Metadata } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import { OrdersEngine } from '@mj-biz-apps/orders-entities';
import {
    CreateOrdersFixture,
    Fx,
    InRolledBackTransaction,
    ORDERS_SCHEMA,
    ReloadOrdersEngine,
    TeardownOrdersFixture,
    TxOne,
    TxQuery,
    createViaEntity,
} from '../fixture.js';
import { BuildOrder, ConfirmOrder, type OrderSpec } from '../order-builder.js';
import {
    PRODUCT_ENTITLEMENT_ENTITY,
    PRODUCT_ENTITY,
    PRODUCT_OPTION_ASSIGNMENT_ENTITY,
    PRODUCT_OPTION_ENTITY,
    PRODUCT_OPTION_VALUE_ENTITY,
    PRODUCT_PRICE_ENTITY,
    PRODUCT_VARIANT_VALUE_ENTITY,
} from '../entity-names.js';

interface OptionWorld {
    Tier: { ID: string; Values: Record<string, string> };
    Size: { ID: string; Values: Record<string, string> };
}

/** A unique code per run, so a committed leftover never collides with the shared-code index. */
const run = Date.now().toString(36).toUpperCase();

/** Shared Tier and Size options with their values. */
async function createOptions(ctx: IntegrationCheckContext): Promise<OptionWorld> {
    const make = async (code: string, name: string, values: string[]) => {
        const id = await createViaEntity(ctx, PRODUCT_OPTION_ENTITY, { Code: `${code}${run}`, Name: name, SortOrder: 0, IsActive: true });
        const ids: Record<string, string> = {};
        let sort = 0;
        for (const v of values) {
            ids[v] = await createViaEntity(ctx, PRODUCT_OPTION_VALUE_ENTITY, {
                ProductOptionID: id,
                Code: v,
                Label: v[0] + v.slice(1).toLowerCase(),
                SortOrder: ++sort,
                IsActive: true,
            });
        }
        return { ID: id, Values: ids };
    };
    return {
        Tier: await make('TIER', 'Tier', ['STANDARD', 'PRO', 'ENTERPRISE']),
        Size: await make('SIZE', 'Size', ['SMALL', 'LARGE']),
    };
}

function assign(ctx: IntegrationCheckContext, fields: Record<string, unknown>): Promise<string> {
    return createViaEntity(ctx, PRODUCT_OPTION_ASSIGNMENT_ENTITY, {
        IsExcluded: false,
        IsRequired: false,
        SortOrder: 0,
        Role: 'LineOption',
        ...fields,
    });
}

/** A save expected to fail; the refusal's text, or a failed assert when it saved. */
async function refusal(ctx: IntegrationCheckContext, entityName: string, fields: Record<string, unknown>): Promise<string> {
    const entity = await new Metadata().GetEntityObject<BaseEntity>(entityName, ctx.User);
    entity.NewRecord();
    for (const [k, v] of Object.entries(fields)) entity.Set(k, v);
    const saved = await entity.Save();
    AssertEqual(saved, false, `${entityName} must be refused`);
    const r = entity.LatestResult;
    return [r?.CompleteMessage ?? '', ...(r?.Errors ?? []).map((e) => (typeof e === 'string' ? e : JSON.stringify(e)))].join(' ');
}

/** Run `body` in the check's transaction with the engine reloaded after the options exist and after the rollback. */
async function withOptions(ctx: IntegrationCheckContext, body: (o: OptionWorld) => Promise<void>): Promise<void> {
    try {
        await InRolledBackTransaction(ctx, async () => {
            const options = await createOptions(ctx);
            await ReloadOrdersEngine(ctx);
            await body(options);
        });
    } finally {
        // The rows rolled back; the engine must not keep them.
        await ReloadOrdersEngine(ctx);
    }
}

const tierCode = () => `TIER${run}`;
const sizeCode = () => `SIZE${run}`;

function pick(o: OptionWorld, option: 'Tier' | 'Size', value: string) {
    const opt = o[option];
    return {
        GroupKey: option === 'Tier' ? tierCode() : sizeCode(),
        GroupLabel: option,
        OptionValue: value,
        OptionLabel: value,
        ProductOptionID: opt.ID,
        ProductOptionValueID: opt.Values[value],
    };
}

function spec(productID: string, choices: ReturnType<typeof pick>[], unitPrice?: number): OrderSpec {
    const f = Fx();
    return {
        CompanyID: f.CoA.ID,
        BillToOrganizationID: f.Customers.OrganizationID,
        Lines: [{ ProductID: productID, Quantity: 1, ...(unitPrice != null ? { UnitPrice: unitPrice } : {}), Choices: choices }],
    };
}

export const ProductOptionsChecks: NamedCheck[] = [
    {
        Id: 'product-options.PO1',
        Name: 'PO1: options resolve through type, category and product, the most specific winning whole',
        RequiresMutation: true,
        Fn: async (ctx) =>
            withOptions(ctx, async (o) => {
                const f = Fx();
                const widget = OrdersEngine.Instance.ProductByID(f.Products.WidgetA);
                Assert(widget != null, 'setup: WidgetA is in the engine');
                await assign(ctx, { ProductTypeID: widget!.ProductTypeID, ProductOptionID: o.Tier.ID, IsRequired: true });
                await ReloadOrdersEngine(ctx);
                let eff = OrdersEngine.Instance.EffectiveOptions(widget!.ID).find((e) => e.Option.ID.toLowerCase() === o.Tier.ID.toLowerCase());
                AssertEqual(eff?.Source, 'Type', 'a type default reaches the product');
                AssertEqual(eff?.IsRequired, true, 'with its required flag');

                await assign(ctx, { ProductCategoryID: widget!.ProductCategoryID, ProductOptionID: o.Tier.ID, IsRequired: false });
                await ReloadOrdersEngine(ctx);
                eff = OrdersEngine.Instance.EffectiveOptions(widget!.ID).find((e) => e.Option.ID.toLowerCase() === o.Tier.ID.toLowerCase());
                AssertEqual(eff?.Source, 'Category', 'the category row replaces the type row');
                AssertEqual(eff?.IsRequired, false, 'whole, required flag included');

                await assign(ctx, { ProductID: widget!.ID, ProductOptionID: o.Tier.ID, IsExcluded: true });
                await ReloadOrdersEngine(ctx);
                eff = OrdersEngine.Instance.EffectiveOptions(widget!.ID).find((e) => e.Option.ID.toLowerCase() === o.Tier.ID.toLowerCase());
                AssertEqual(eff, undefined, 'a product-level exclusion removes the inherited option');
            }),
    },
    {
        Id: 'product-options.PO2',
        Name: 'PO2: a Tier x Size matrix saves at one priority, and the picks choose the line price',
        RequiresMutation: true,
        Fn: async (ctx) =>
            withOptions(ctx, async (o) => {
                const f = Fx();
                const product = f.Products.WidgetA;
                await assign(ctx, { ProductID: product, ProductOptionID: o.Tier.ID, IsRequired: true });
                await assign(ctx, { ProductID: product, ProductOptionID: o.Size.ID, IsRequired: true });
                const when = (tier: string, size: string) =>
                    JSON.stringify({
                        logic: 'and',
                        filters: [
                            { field: `Option.${tierCode()}`, operator: 'eq', value: tier },
                            { field: `Option.${sizeCode()}`, operator: 'eq', value: size },
                        ],
                    });
                const price = (name: string, amount: number, tier: string, size: string) =>
                    createViaEntity(ctx, PRODUCT_PRICE_ENTITY, {
                        ProductID: product,
                        Name: name,
                        PricingModel: 'PerUnit',
                        FeeType: 'Standard',
                        Amount: amount,
                        EffectiveFrom: '2020-01-01',
                        Priority: 7,
                        Status: 'Active',
                        Applicability: when(tier, size),
                    });
                // Two rows at one priority: the collision check must read them as a matrix, not a tie.
                await price(`Pro Small ${run}`, 310, 'PRO', 'SMALL');
                await price(`Pro Large ${run}`, 470, 'PRO', 'LARGE');
                await ReloadOrdersEngine(ctx);

                const built = await BuildOrder(ctx.User, spec(product, [pick(o, 'Tier', 'PRO'), pick(o, 'Size', 'LARGE')]));
                Assert(await built.Order.Save(), `the draft must save — ${built.Order.LatestResult?.CompleteMessage ?? 'no reason given'}`);
                const row = await TxOne<{ UnitPrice: number }>(
                    ctx,
                    `SELECT UnitPrice FROM ${ORDERS_SCHEMA}.OrderLine WHERE ID = '${built.Lines[0].Get('ID')}'`,
                );
                AssertEqual(Number(row.UnitPrice), 470, 'the Pro / Large row prices the line');
            }),
    },
    {
        Id: 'product-options.PO3',
        Name: 'PO3: a line missing a required pick is refused, and the refusal names the option',
        RequiresMutation: true,
        Fn: async (ctx) =>
            withOptions(ctx, async (o) => {
                const f = Fx();
                await assign(ctx, { ProductID: f.Products.WidgetA, ProductOptionID: o.Tier.ID, IsRequired: true });
                await assign(ctx, { ProductID: f.Products.WidgetA, ProductOptionID: o.Size.ID, IsRequired: true });
                await ReloadOrdersEngine(ctx);
                const built = await BuildOrder(ctx.User, spec(f.Products.WidgetA, [pick(o, 'Tier', 'PRO')], 100));
                const saved = await built.Order.Save();
                AssertEqual(saved, false, 'a line without a Size pick must not save');
                const message = JSON.stringify(built.Order.LatestResult ?? {});
                Assert(message.includes('Pick a Size'), `and says which option: ${message.slice(0, 400)}`);
            }),
    },
    {
        Id: 'product-options.PO4',
        Name: 'PO4: one entitlement code is granted per tier, and a mixed condition is refused',
        RequiresMutation: true,
        Fn: async (ctx) =>
            withOptions(ctx, async () => {
                const f = Fx();
                const code = `SSO${run}`;
                const template = (value: string | null) => ({
                    ProductID: f.Products.WidgetA,
                    EntitlementType: 'Feature',
                    Code: code,
                    Name: 'Single sign-on',
                    IsActive: true,
                    ChoiceGroupKey: value ? tierCode() : null,
                    ChoiceOptionValue: value,
                });
                await createViaEntity(ctx, PRODUCT_ENTITLEMENT_ENTITY, template('PRO'));
                await createViaEntity(ctx, PRODUCT_ENTITLEMENT_ENTITY, template('ENTERPRISE'));
                const text = await refusal(ctx, PRODUCT_ENTITLEMENT_ENTITY, template(null));
                Assert(text.includes('different condition'), `an unconditional copy of the code is refused: ${text.slice(0, 300)}`);
            }),
    },
    {
        Id: 'product-options.PO5',
        Name: 'PO5: a renewal carries the expiring line’s option picks',
        RequiresMutation: true,
        Fn: async (ctx) =>
            withOptions(ctx, async (o) => {
                const f = Fx();
                const product = f.Products.SubRolling;
                await assign(ctx, { ProductID: product, ProductOptionID: o.Tier.ID, IsRequired: true });
                await ReloadOrdersEngine(ctx);
                const bought = await ConfirmOrder(ctx.User, {
                    ...spec(product, [pick(o, 'Tier', 'ENTERPRISE')], 1200),
                    OrderDate: new Date('2026-01-01T00:00:00Z'),
                });
                Assert(bought.Saved, `setup: the subscription must book — ${bought.Message}`);
                const term = await TxOne<{ SubscriptionID: string; EndDate: string }>(
                    ctx,
                    `SELECT st.SubscriptionID, st.EndDate FROM ${ORDERS_SCHEMA}.SubscriptionTerm st
                     JOIN ${ORDERS_SCHEMA}.OrderLine ol ON ol.ID = st.OrderLineID
                     WHERE ol.OrderHeaderID = '${bought.Order.ID}'`,
                );
                const asOf = new Date(term.EndDate);
                asOf.setUTCDate(asOf.getUTCDate() - 10);
                const op = MJGlobal.Instance.ClassFactory.CreateInstance<
                    BaseRemotableOperation<Record<string, unknown>, { Candidates: Array<{ OrderID?: string; SkippedReason?: string }> }>
                >(BaseRemotableOperation, 'Orders.SpawnRenewals');
                Assert(op != null, "'Orders.SpawnRenewals' is not registered");
                const result = await op!.Execute(
                    { SubscriptionID: term.SubscriptionID, AsOfDate: asOf.toISOString().slice(0, 10) },
                    { provider: ctx.Provider, user: ctx.User },
                );
                Assert(result.Success, `the renewal pass ran: ${result.ErrorMessage ?? ''}`);
                const orderID = result.Output?.Candidates?.[0]?.OrderID;
                Assert(!!orderID, `a renewal was placed: ${JSON.stringify(result.Output?.Candidates ?? [])}`);
                const picks = await TxQuery<{ GroupKey: string; OptionValue: string; ProductOptionID: string | null }>(
                    ctx,
                    `SELECT c.GroupKey, c.OptionValue, c.ProductOptionID FROM ${ORDERS_SCHEMA}.OrderLineChoice c
                     JOIN ${ORDERS_SCHEMA}.OrderLine ol ON ol.ID = c.OrderLineID WHERE ol.OrderHeaderID = '${orderID}'`,
                );
                AssertEqual(picks.length, 1, 'the renewal line carries one pick');
                AssertEqual(picks[0].OptionValue, 'ENTERPRISE', 'the tier the buyer had');
                Assert(picks[0].ProductOptionID?.toLowerCase() === o.Tier.ID.toLowerCase(), 'still linked to the Tier option');
            }),
    },
    {
        Id: 'product-options.PO6',
        Name: 'PO6: variant SKU writes are refused until variants are supported',
        RequiresMutation: true,
        Fn: async (ctx) =>
            withOptions(ctx, async (o) => {
                const f = Fx();
                const variantValue = await refusal(ctx, PRODUCT_VARIANT_VALUE_ENTITY, {
                    ProductID: f.Products.WidgetA,
                    ProductOptionID: o.Size.ID,
                    ProductOptionValueID: o.Size.Values.LARGE,
                });
                Assert(variantValue.includes('not supported yet'), `a variant value is refused: ${variantValue.slice(0, 200)}`);
                const role = await refusal(ctx, PRODUCT_OPTION_ASSIGNMENT_ENTITY, {
                    ProductID: f.Products.WidgetA,
                    ProductOptionID: o.Size.ID,
                    IsExcluded: false,
                    IsRequired: false,
                    SortOrder: 0,
                    Role: 'Variant',
                });
                Assert(role.includes('not supported yet'), `a Variant-role assignment is refused: ${role.slice(0, 200)}`);

                const product = await new Metadata().GetEntityObject<BaseEntity & { Load(id: string): Promise<boolean> }>(PRODUCT_ENTITY, ctx.User);
                Assert(await product.Load(f.Products.WidgetB), 'setup: WidgetB loads');
                product.Set('ParentProductID', f.Products.WidgetA);
                AssertEqual(await product.Save(), false, 'a parent product is refused');
            }),
    },
    {
        Id: 'product-options.PO7',
        Name: 'PO7: a second pick of one option on a line is refused',
        RequiresMutation: true,
        Fn: async (ctx) =>
            withOptions(ctx, async (o) => {
                const f = Fx();
                await assign(ctx, { ProductID: f.Products.WidgetA, ProductOptionID: o.Tier.ID });
                await ReloadOrdersEngine(ctx);
                const built = await BuildOrder(
                    ctx.User,
                    spec(f.Products.WidgetA, [pick(o, 'Tier', 'PRO'), pick(o, 'Tier', 'ENTERPRISE')], 100),
                );
                AssertEqual(await built.Order.Save(), false, 'two Tier picks on one line must not save');
                const message = JSON.stringify(built.Order.LatestResult ?? {});
                Assert(message.includes('more than one pick'), `and says so: ${message.slice(0, 400)}`);
            }),
    },
];

IntegrationCheckRegistry.Instance.RegisterLifecycle('product-options', {
    Setup: async (ctx) => {
        await CreateOrdersFixture(ctx);
    },
    Teardown: TeardownOrdersFixture,
});
for (const check of ProductOptionsChecks) IntegrationCheckRegistry.Instance.Register(check);
