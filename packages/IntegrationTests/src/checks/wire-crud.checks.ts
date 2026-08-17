/**
 * Client-transport checks. Import this module from `client-index.ts` only —
 * the main barrel loads *Server subclasses that throw on GraphQLDataProvider.
 */
import {
    Assert,
    IntegrationCheckRegistry,
    type IntegrationCheckContext,
    type NamedCheck,
} from '@memberjunction/testing-integration/registry';
import { RunView, type IMetadataProvider } from '@memberjunction/core';
import { ORDER_HEADER_ENTITY, PERSON_ENTITY, PRODUCT_ENTITY, PRODUCT_TYPE_ENTITY } from '../entity-names.js';

function View(ctx: IntegrationCheckContext): RunView {
    return RunView.FromMetadataProvider(ctx.Provider as IMetadataProvider);
}

const checks: NamedCheck[] = [
    {
        Id: 'wire-crud.W1',
        Name: 'W1 — RunView Order Headers over GraphQL',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const res = await View(ctx).RunView<{ ID: string }>(
                {
                    EntityName: ORDER_HEADER_ENTITY,
                    Fields: ['ID'],
                    MaxRows: 25,
                    ResultType: 'simple',
                },
                ctx.User,
            );
            Assert(res.Success, `Order Headers RunView failed: ${res.ErrorMessage ?? 'unknown'}`);
            Assert(Array.isArray(res.Results), 'Results is an array');
        },
    },
    {
        Id: 'wire-crud.W2',
        Name: 'W2 — RunViews batches products and product types',
        RequiresMutation: true,
        Fn: async (ctx) => {
            const [products, types] = await View(ctx).RunViews(
                [
                    { EntityName: PRODUCT_ENTITY, Fields: ['ID'], MaxRows: 25, ResultType: 'simple' },
                    { EntityName: PRODUCT_TYPE_ENTITY, Fields: ['ID', 'Name'], ResultType: 'simple' },
                ],
                ctx.User,
            );
            Assert(products.Success, products.ErrorMessage ?? 'products');
            Assert(types.Success, types.ErrorMessage ?? 'types');
            Assert((types.Results?.length ?? 0) > 0, 'product types (metadata) visible over the wire');
        },
    },
    {
        Id: 'wire-crud.W3',
        Name: 'W3 — create and delete a Common person through the same GraphQL provider',
        RequiresMutation: true,
        Fn: async (ctx) => {
            const { mjBizAppsCommonPersonEntity } = await import('@mj-biz-apps/common-entities');
            const email = `wire.${Date.now()}@orders-wire.test`;
            const person = await ctx.Provider.GetEntityObject<InstanceType<typeof mjBizAppsCommonPersonEntity>>(
                PERSON_ENTITY,
                ctx.User,
            );
            person.NewRecord();
            person.FirstName = 'Wire';
            person.LastName = 'Order';
            person.Email = email;
            person.Status = 'Active';
            const saved = await person.Save();
            Assert(saved, `person save: ${person.LatestResult?.CompleteMessage ?? 'unknown'}`);
            const found = await View(ctx).RunView<{ ID: string }>(
                {
                    EntityName: PERSON_ENTITY,
                    ExtraFilter: `Email = '${email.replace(/'/g, "''")}'`,
                    Fields: ['ID'],
                    ResultType: 'simple',
                },
                ctx.User,
            );
            Assert(found.Success && (found.Results?.length ?? 0) === 1, 'person visible via RunView');
            Assert(await person.Delete(), 'cleanup person');
        },
    },
];

for (const check of checks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('wire-crud', {
    Setup: async () => {},
    Teardown: async () => {},
});
