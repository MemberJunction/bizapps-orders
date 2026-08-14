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
import { LoadWorld } from '../world/load-world.js';
import { SetWorld, World } from '../world/world.js';

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
