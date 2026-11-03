/**
 * catalog-world (ORD-00) — commit the shared people / orgs / catalog / GL world.
 *
 * One check: the CSVs loaded through BaseEntity, types resolved from metadata, and the
 * natural keys the rest of the suite (and Explorer) will use actually resolve.
 */
import {
    Assert,
    AssertEqual,
    IntegrationCheckRegistry,
    type IntegrationCheckContext,
    type NamedCheck,
} from '@memberjunction/testing-integration';
import { AccountingEngineBase } from '@mj-biz-apps/accounting-engine-base';
import {
    ADDRESS_ENTITY,
    ADDRESS_LINK_ENTITY,
    COMPANY_PROFILE_ENTITY,
    GL_ACCOUNT_LINK_ENTITY,
    GL_ACCOUNT_ROLE_ENTITY,
    ORDER_HEADER_ENTITY,
    PRICE_LIST_ENTITY,
    PRODUCT_CATEGORY_ENTITY,
    PRODUCT_ENTITY,
} from '../entity-names.js';
import { createViaEntity, InRolledBackTransaction, ORDERS_SCHEMA, TxQuery } from '../fixture.js';
import { FindId, FindRows } from '../world/entity-io.js';
import { LoadWorld } from '../world/load-world.js';
import { SetWorld, World, type WorldState } from '../world/world.js';

const checks: NamedCheck[] = [
    {
        Id: 'catalog-world.CW1',
        Name: 'CW1 — ORD-WORLD is loaded and referentially intact',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const world = await LoadWorld(ctx);
            SetWorld(world);

            Assert(!!world.Companies.BCP, 'Blue Cypress Press missing');
            Assert(!!world.Companies.HH, 'Harbor House missing');
            Assert(!!world.Companies.ORPHAN, 'Orphan Ledger missing');
            Assert(!!world.Companies.DEMO, 'DEMO Publishing Co missing');
            Assert(!!world.Companies.DEMO.Accounts.DueTo, 'DEMO has no Due To account');
            Assert(!!world.Companies.BCP.Accounts.DueFrom, 'BCP has no Due From account');
            Assert(!!world.Companies.BCP.Accounts.AR, 'BCP has no AR account');
            Assert(!!world.Companies.BCP.Accounts.Sales, 'BCP has no Sales account');
            Assert(!!world.Companies.BCP.Accounts.Cash, 'BCP has no Cash account');
            Assert(!!world.Companies.ORPHAN.Accounts.AR, 'Orphan Ledger should still have accounts');
            Assert(!!world.Companies.UNPAIRED?.Accounts.AR, 'Unpaired Press (IC5\'s unpaired company) missing');

            // Verify selling companies carry FederalTaxID and remit-to AddressLink for invoicing
            for (const [code, expectedTaxId, expectedLine1] of [
                ['BCP', '52-1847201', '100 Cypress Way'],
                ['HH', '52-1847202', '250 Harbor Blvd'],
            ] as const) {
                const companyID = world.Companies[code].ID;
                const profiles = await FindRows<{ ID: string; FederalTaxID: string | null }>(
                    ctx,
                    COMPANY_PROFILE_ENTITY,
                    `ID = '${companyID}'`,
                    ['ID', 'FederalTaxID'],
                );
                Assert(profiles.length === 1, `${code} company profile missing`);
                AssertEqual(profiles[0].FederalTaxID, expectedTaxId, `${code} FederalTaxID`);

                const links = await FindRows<{ ID: string; AddressID: string; IsPrimary: boolean }>(
                    ctx,
                    ADDRESS_LINK_ENTITY,
                    `EntityID = '${world.CompanyEntityID}' AND RecordID = '${companyID}' AND IsPrimary = 1`,
                    ['ID', 'AddressID', 'IsPrimary'],
                );
                Assert(links.length >= 1, `${code} primary AddressLink missing`);
                const addresses = await FindRows<{ ID: string; Line1: string }>(
                    ctx,
                    ADDRESS_ENTITY,
                    `ID = '${links[0].AddressID}'`,
                    ['ID', 'Line1'],
                );
                Assert(addresses.length === 1, `${code} linked Address row missing`);
                AssertEqual(addresses[0].Line1, expectedLine1, `${code} remit-to Line1`);
            }

            AssertEqual(Object.keys(world.Organizations).length, 8, 'eight customer organizations');
            Assert(Object.keys(world.People).length >= 30, `expected ≥30 people, got ${Object.keys(world.People).length}`);
            Assert(!!world.People['nora.calhoun@riverside.org'], 'Nora Calhoun missing');
            Assert(!!world.People['jordan.blake@example.com'], 'Jordan Blake (independent) missing');
            Assert(!!world.Organizations.RIV, 'Riverside Library missing');

            Assert(!!world.Products['STYLE-HB'], 'Style Handbook missing');
            Assert(!!world.ProductMnemonics.WidgetA, 'WidgetA mnemonic not mapped');
            AssertEqual(world.ProductMnemonics.WidgetA, world.Products['STYLE-HB'], 'WidgetA is Style Handbook');
            Assert(!!world.Products['ORPHAN-SKU'], 'unlinked product missing');
            Assert(!!world.Products['KIT-NEW'], 'bundle parent missing');
            Assert(!!world.Products['CONF-2027'], 'conference ticket missing');
            Assert(!!world.Products['MEM-IND'], 'individual membership missing');

            await assertEventCategoryTree(ctx, world);

            Assert(!!world.ProductTypeIDs.PhysicalGood, 'Product Type PhysicalGood missing — push metadata/product-types');
            Assert(!!world.ProductTypeIDs.GiftCard, 'Product Type GiftCard missing');
            Assert(!!world.RevRecTypeIDs.get('UpFront'), 'RevRec UpFront missing');
            Assert(!!world.Addresses.SantaClara, 'Santa Clara ship-to missing');
            Assert(!!world.Jurisdictions.CA, 'CA tax jurisdiction missing');
            Assert(!!world.Dimensions.DEPT, 'Department dimension missing');
            Assert(!!world.DimensionValues['DEPT:EDIT'], 'Editorial department missing');
            Assert(!!world.DimensionValues['LOC:HQ'], 'HQ location missing');

            const draft = await FindId(ctx, ORDER_HEADER_ENTITY, `Notes = 'ORD-WORLD draft handbook'`);
            const confirmed = await FindId(ctx, ORDER_HEADER_ENTITY, `Notes = 'ORD-WORLD confirmed handbook'`);
            Assert(!!draft, 'ORD-WORLD draft handbook missing');
            Assert(!!confirmed, 'ORD-WORLD confirmed handbook missing');
            const priceList = await FindId(ctx, PRICE_LIST_ENTITY, `Code = 'BCP-STD'`);
            Assert(!!priceList, 'BCP-STD price list missing');

            // Capture so later bundles in the same process can Fx() without reloading.
            World();
        },
    },
    {
        Id: 'catalog-world.CW2',
        Name: 'CW2 — Every orders entity BaseView selects TOP 0 * and exposes every non-virtual EntityField column',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const ordersEntities = ctx.Provider.Entities.filter((e) => e.SchemaName === ORDERS_SCHEMA);
            Assert(
                ordersEntities.length > 0,
                `no entities found in metadata for schema ${ORDERS_SCHEMA}`,
            );

            const missingColumns: string[] = [];
            for (const entity of ordersEntities) {
                Assert(!!entity.BaseView, `entity ${entity.Name} has no BaseView`);
                // Execute SELECT TOP 0 * against the base view so broken view definitions fail immediately.
                await TxQuery(ctx, `SELECT TOP 0 * FROM [${ORDERS_SCHEMA}].[${entity.BaseView}]`);

                const colRows = await TxQuery<{ ColumnName: string }>(
                    ctx,
                    `SELECT c.name AS ColumnName
                       FROM sys.columns c
                       JOIN sys.views v ON v.object_id = c.object_id
                       JOIN sys.schemas s ON s.schema_id = v.schema_id
                      WHERE s.name = '${ORDERS_SCHEMA}' AND v.name = '${entity.BaseView.replace(/'/g, "''")}'`,
                );
                const viewCols = new Set(colRows.map((r) => r.ColumnName.toLowerCase()));
                Assert(
                    viewCols.size > 0,
                    `view [${ORDERS_SCHEMA}].[${entity.BaseView}] returned zero columns in sys.columns`,
                );

                for (const field of entity.Fields) {
                    if (field.IsVirtual) continue;
                    if (!viewCols.has(field.Name.toLowerCase())) {
                        missingColumns.push(`${entity.Name}.${field.Name} (view ${entity.BaseView})`);
                    }
                }
            }

            AssertEqual(
                missingColumns.length,
                0,
                `non-virtual EntityFields missing from BaseView: ${missingColumns.join(', ')}`,
            );
        },
    },
    {
        Id: 'catalog-world.CW3',
        Name: 'CW3 — Reloading AccountingEngineBase after adding a second product GL link surfaces both links',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const world = World();
            const productEntity = ctx.Provider.Entities.find((e) => e.Name === PRODUCT_ENTITY);
            Assert(!!productEntity?.ID, 'Products entity missing from metadata');

            const discountedProductID = world.ProductMnemonics.DiscountedA;
            Assert(!!discountedProductID, 'DiscountedA product missing from world');

            const engine = AccountingEngineBase.Instance;
            await engine.Config(false, ctx.User, ctx.Provider);

            const linksForProduct = () =>
                engine.GLAccountLinks.filter(
                    (l) =>
                        sameId(l.EntityID, productEntity.ID) &&
                        sameId(l.RecordID, discountedProductID),
                );

            const beforeCount = linksForProduct().length;
            Assert(
                beforeCount >= 1,
                `expected DiscountedA to start with at least 1 cached GL link, got ${beforeCount}`,
            );

            try {
                await InRolledBackTransaction(ctx, async () => {
                    const roles = await FindRows<{ ID: string; Name: string }>(
                        ctx,
                        GL_ACCOUNT_ROLE_ENTITY,
                        `Name = 'Sales Revenue'`,
                        ['ID', 'Name'],
                    );
                    Assert(roles.length === 1, 'Sales Revenue GL role missing');

                    await createViaEntity(ctx, GL_ACCOUNT_LINK_ENTITY, {
                        EntityID: productEntity.ID,
                        RecordID: discountedProductID,
                        GLAccountRoleID: roles[0].ID,
                        GLAccountID: world.Companies.BCP.Accounts.Sales,
                        Status: 'Active',
                        StartedAt: new Date('2026-01-01T00:00:00.000Z'),
                    });

                    await engine.Config(true, ctx.User, ctx.Provider);
                    const afterCount = linksForProduct().length;
                    AssertEqual(
                        afterCount,
                        beforeCount + 1,
                        'reloading AccountingEngineBase after adding a second GL link must surface both links',
                    );
                });
            } finally {
                await engine.Config(true, ctx.User, ctx.Provider);
            }
        },
    },
];

async function assertEventCategoryTree(ctx: IntegrationCheckContext, world: WorldState): Promise<void> {
    const required = [
        'BCP:EVENTS',
        'BCP:CONFERENCES',
        'BCP:ANNUAL-CONF',
        'BCP:WEBINARS',
        'BCP:WEBINAR-LIVE',
        'BCP:WORKSHOPS',
        'BCP:HANDBOOKS',
        'HH:CONFERENCES',
    ];
    for (const key of required) {
        Assert(!!world.Categories[key], `category ${key} missing`);
    }

    const parents = await loadCategoryParents(ctx, world.Companies.BCP.ID);
    assertParent(parents, world, 'BCP:ANNUAL-CONF', 'BCP:CONFERENCES');
    assertParent(parents, world, 'BCP:CONFERENCES', 'BCP:EVENTS');
    assertParent(parents, world, 'BCP:WEBINAR-LIVE', 'BCP:WEBINARS');
    assertParent(parents, world, 'BCP:WEBINARS', 'BCP:EVENTS');
    assertParent(parents, world, 'BCP:WORKSHOPS', 'BCP:EVENTS');
    assertParent(parents, world, 'BCP:HANDBOOKS', 'BCP:BOOKS');

    const hhParents = await loadCategoryParents(ctx, world.Companies.HH.ID);
    assertParent(hhParents, world, 'HH:CONFERENCES', 'HH:EVENTS');

    await assertProductCategory(ctx, world, 'CONF-2027', 'BCP:ANNUAL-CONF');
    await assertProductCategory(ctx, world, 'STYLE-HB', 'BCP:HANDBOOKS');
    await assertProductCategory(ctx, world, 'HH-CONF', 'HH:CONFERENCES');
}

async function loadCategoryParents(
    ctx: IntegrationCheckContext,
    companyID: string,
): Promise<Map<string, string | null>> {
    const rows = await FindRows<{ ID: string; ParentProductCategoryID: string | null }>(
        ctx,
        PRODUCT_CATEGORY_ENTITY,
        `CompanyID = '${companyID}'`,
        ['ID', 'ParentProductCategoryID'],
    );
    return new Map(rows.map((r) => [r.ID.toLowerCase(), r.ParentProductCategoryID]));
}

function assertParent(
    parents: Map<string, string | null>,
    world: WorldState,
    childKey: string,
    parentKey: string,
): void {
    const childID = world.Categories[childKey];
    const parentID = world.Categories[parentKey];
    const persisted = parents.get(childID.toLowerCase()) ?? null;
    Assert(sameId(persisted, parentID), `${childKey} should parent to ${parentKey}`);
}

async function assertProductCategory(
    ctx: IntegrationCheckContext,
    world: WorldState,
    sku: string,
    categoryKey: string,
): Promise<void> {
    const rows = await FindRows<{ ID: string; ProductCategoryID: string }>(
        ctx,
        PRODUCT_ENTITY,
        `SKU = '${sku}'`,
        ['ID', 'ProductCategoryID'],
    );
    Assert(rows.length === 1, `${sku} missing`);
    Assert(
        sameId(rows[0].ProductCategoryID, world.Categories[categoryKey]),
        `${sku} should sit in ${categoryKey}`,
    );
}

function sameId(a: string | null | undefined, b: string | null | undefined): boolean {
    return a != null && b != null && a.toLowerCase() === b.toLowerCase();
}

for (const check of checks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('catalog-world', {
    Setup: async () => {
        /* load happens inside CW1 so a failed load is a check failure, not a setup crash */
    },
    Teardown: async () => {
        /* world stays */
    },
});
