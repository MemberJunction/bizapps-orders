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
import { PRODUCT_CATEGORY_ENTITY, PRODUCT_ENTITY } from '../entity-names.js';
import { FindRows } from '../world/entity-io.js';
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

            // Capture so later bundles in the same process can Fx() without reloading.
            World();
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
