/**
 * Load the committed ORD-WORLD catalog from CSV through BaseEntity subclasses.
 *
 * Types (Product Type, Charge Type, Rev Rec, Subscription, Payment) are LOOKED UP, never created.
 * Missing metadata fails loudly — that is the signal to push `metadata/`.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Metadata } from '@memberjunction/core';
import type { IntegrationCheckContext } from '@memberjunction/testing-integration';
import { AccountingEngineBase } from '@mj-biz-apps/accounting-engine-base';
import { OrderHeaderEntity, mjBizAppsOrdersOrderLineEntity } from '@mj-biz-apps/orders-entities';
import { Assert } from '@memberjunction/testing-integration';
import { ReadCsv } from './csv.js';
import { FindId, FindRows, Quote, Upsert } from './entity-io.js';
import type { WorldState } from './world.js';
import {
    ADDRESS_ENTITY,
    COMPANY_ENTITY,
    COMPANY_PROFILE_ENTITY,
    ORDER_HEADER_ENTITY,
    ORDER_LINE_ENTITY,
    PRICE_LIST_ASSIGNMENT_ENTITY,
    PRICE_LIST_ENTITY,
    COMPANY_TAX_NEXUS_ENTITY,
    EVENT_PRODUCT_ENTITY,
    GL_ACCOUNT_ENTITY,
    GL_ACCOUNT_LINK_ENTITY,
    GL_ACCOUNT_ROLE_ENTITY,
    INTERCOMPANY_ACCOUNT_MATCH_ENTITY,
    ORGANIZATION_ENTITY,
    ORGANIZATION_TYPE_ENTITY,
    PERSON_ENTITY,
    PRODUCT_BUNDLE_ITEM_ENTITY,
    PRODUCT_CATEGORY_ENTITY,
    PRODUCT_ENTITY,
    PRODUCT_ENTITLEMENT_ENTITY,
    PRODUCT_PRICE_ENTITY,
    PRODUCT_TYPE_ENTITY,
    RELATIONSHIP_ENTITY,
    RELATIONSHIP_TYPE_ENTITY,
    TAX_AUTHORITY_ENTITY,
    TAX_JURISDICTION_ENTITY,
    TAX_RATE_ENTITY,
    DIMENSION_ENTITY,
    DIMENSION_VALUE_ENTITY,
} from '../entity-names.js';

const WORLD_TAG = 'ORD-WORLD';
const DATA = join(dirname(fileURLToPath(import.meta.url)), 'data');

export async function LoadWorld(ctx: IntegrationCheckContext): Promise<WorldState> {
    const md = new Metadata();
    const companyEntity = md.EntityByName(COMPANY_ENTITY);
    Assert(!!companyEntity, `${COMPANY_ENTITY} not in metadata`);
    const chargeTypeEntity = md.EntityByName('MJ_BizApps_Orders: Charge Types');
    const productTypeEntity = md.EntityByName(PRODUCT_TYPE_ENTITY);
    const productCategoryEntity = md.EntityByName(PRODUCT_CATEGORY_ENTITY);
    const productEntity = md.EntityByName(PRODUCT_ENTITY);

    const currency = await FindRows<{ ID: string; Code: string }>(
        ctx,
        'MJ_BizApps_Accounting: Currencies',
        '',
        ['ID', 'Code'],
    );
    Assert(currency.length > 0, 'no currencies — push accounting metadata first');
    const currencyCode = currency[0].Code;

    const world: WorldState = {
        CurrencyCode: currencyCode,
        CompanyEntityID: companyEntity!.ID,
        Companies: {},
        Accounts: {},
        Organizations: {},
        People: {},
        Categories: {},
        Products: {},
        ProductMnemonics: {},
        Entitlements: {},
        Addresses: {},
        Jurisdictions: {},
        Dimensions: {},
        DimensionValues: {},
        RevRecTypeIDs: await codeMap(ctx, 'MJ_BizApps_Orders: Revenue Recognition Types'),
        SubscriptionTypeIDs: await codeMap(ctx, 'MJ_BizApps_Orders: Subscription Types'),
        PaymentTypeIDs: await codeMap(ctx, 'MJ_BizApps_Orders: Payment Types'),
        ProductTypeIDs: await productTypeMap(ctx),
        Event: { StartsAt: new Date('2027-04-15T09:00:00Z'), EndsAt: new Date('2027-04-17T17:00:00Z') },
    };

    Assert(world.RevRecTypeIDs.size >= 3, 'revenue recognition types missing — push orders metadata');
    Assert(world.SubscriptionTypeIDs.size >= 4, 'subscription types missing — push orders metadata');
    for (const needed of ['PhysicalGood', 'Service', 'Event', 'Membership', 'GiftCard', 'Bundle']) {
        Assert(!!world.ProductTypeIDs[needed], `Product Type '${needed}' missing — push metadata/product-types`);
    }

    await loadCompanies(ctx, world, currencyCode, await resolveCFOUserID(ctx));
    await loadGLAccounts(ctx, world);
    await loadDimensions(ctx, world);
    await loadChargeTypeLinks(ctx, world, chargeTypeEntity?.ID);
    await loadIntercompany(ctx, world);
    await loadOrganizations(ctx, world);
    await loadPeople(ctx, world);
    await loadAddresses(ctx, world);
    await loadTax(ctx, world);
    await loadCategories(ctx, world);
    await loadProducts(ctx, world);
    await loadEventProducts(ctx, world);
    await loadGLLinks(ctx, world, {
        CompanyEntityID: world.CompanyEntityID,
        ProductTypeEntityID: productTypeEntity?.ID,
        ProductCategoryEntityID: productCategoryEntity?.ID,
        ProductEntityID: productEntity?.ID,
    });
    await loadPrices(ctx, world);
    await loadBundles(ctx, world);
    await loadEntitlements(ctx, world);
    await loadOperationalSituations(ctx, world);

    await AccountingEngineBase.Instance.Config(true, ctx.User, ctx.Provider);
    return world;
}

async function codeMap(ctx: IntegrationCheckContext, entityName: string): Promise<Map<string, string>> {
    const rows = await FindRows<{ ID: string; Code: string }>(ctx, entityName, `Code IS NOT NULL`, ['ID', 'Code']);
    return new Map(rows.map((r) => [r.Code, r.ID]));
}

async function productTypeMap(ctx: IntegrationCheckContext): Promise<Record<string, string>> {
    const rows = await FindRows<{ ID: string; Code: string | null }>(
        ctx,
        PRODUCT_TYPE_ENTITY,
        `Code IS NOT NULL`,
        ['ID', 'Code'],
    );
    const out: Record<string, string> = {};
    for (const r of rows) {
        if (r.Code) out[r.Code] = r.ID;
    }
    return out;
}

const SYSTEM_EMAILS = new Set(['not.set@nowhere.com', 'anonymous@magic-link.local']);

/** Batching assigns the approval Task to ApprovalCFOUserID. Prefer a real Explorer user over the System API-key principal. */
async function resolveCFOUserID(ctx: IntegrationCheckContext): Promise<string> {
    const email = (ctx.User?.Email ?? '').toLowerCase();
    if (ctx.User?.ID && email && !SYSTEM_EMAILS.has(email)) return ctx.User.ID;
    const users = await FindRows<{ ID: string; Email: string }>(ctx, 'MJ: Users', `Email IS NOT NULL`, ['ID', 'Email']);
    const human = users.find((u) => u.Email && !SYSTEM_EMAILS.has(u.Email.toLowerCase()));
    Assert(!!human?.ID, 'no human MJ: User to stamp as ApprovalCFOUserID');
    return human!.ID;
}

async function loadCompanies(ctx: IntegrationCheckContext, world: WorldState, currencyCode: string, cfoUserId: string): Promise<void> {
    for (const row of ReadCsv(join(DATA, 'companies.csv'))) {
        const id = await Upsert(
            ctx,
            COMPANY_PROFILE_ENTITY,
            `Name = '${Quote(row.Name)}'`,
            {
                Name: row.Name,
                Description: WORLD_TAG,
                CompanyCode: row.Code,
                FunctionalCurrencyCode: currencyCode,
                EntityType: row.EntityType,
                IsActive: true,
                ApprovalCFOUserID: cfoUserId,
            },
        );
        world.Companies[row.Code] = { ID: id, Name: row.Name, Linked: row.Linked === '1', Accounts: {} };
    }
}

async function loadGLAccounts(ctx: IntegrationCheckContext, world: WorldState): Promise<void> {
    for (const row of ReadCsv(join(DATA, 'gl-accounts.csv'))) {
        const company = world.Companies[row.CompanyCode];
        Assert(!!company, `gl-accounts.csv: unknown company ${row.CompanyCode}`);
        const id = await Upsert(
            ctx,
            GL_ACCOUNT_ENTITY,
            `CompanyID = '${company.ID}' AND Code = '${Quote(row.Code)}'`,
            {
                CompanyID: company.ID,
                Code: row.Code,
                Name: row.Name,
                AccountType: row.AccountType,
                IsActive: true,
            },
        );
        company.Accounts[row.Key] = id;
        world.Accounts[`${row.CompanyCode}:${row.Key}`] = id;
    }
}

async function loadDimensions(ctx: IntegrationCheckContext, world: WorldState): Promise<void> {
    for (const row of ReadCsv(join(DATA, 'dimensions.csv'))) {
        const id = await Upsert(ctx, DIMENSION_ENTITY, `Code = '${Quote(row.Code)}'`, {
            Code: row.Code,
            Name: row.Name,
            Description: row.Description || WORLD_TAG,
            IsActive: true,
        });
        world.Dimensions[row.Code] = id;
    }
    for (const row of ReadCsv(join(DATA, 'dimension-values.csv'))) {
        const dimensionID = world.Dimensions[row.DimensionCode];
        Assert(!!dimensionID, `dimension-values.csv: unknown dimension ${row.DimensionCode}`);
        const id = await Upsert(
            ctx,
            DIMENSION_VALUE_ENTITY,
            `DimensionID = '${dimensionID}' AND Code = '${Quote(row.Code)}'`,
            {
                DimensionID: dimensionID,
                Code: row.Code,
                Name: row.Name,
                IsActive: true,
            },
        );
        world.DimensionValues[`${row.DimensionCode}:${row.Code}`] = id;
    }
}

interface LinkEntities {
    CompanyEntityID: string;
    ProductTypeEntityID: string | undefined;
    ProductCategoryEntityID: string | undefined;
    ProductEntityID: string | undefined;
}

async function loadGLLinks(ctx: IntegrationCheckContext, world: WorldState, entities: LinkEntities): Promise<void> {
    const roles = await FindRows<{ ID: string; Name: string }>(ctx, GL_ACCOUNT_ROLE_ENTITY, '', ['ID', 'Name']);
    const roleID = new Map(roles.map((r) => [r.Name, r.ID]));
    for (const row of ReadCsv(join(DATA, 'gl-links.csv'))) {
        const company = world.Companies[row.CompanyCode];
        Assert(!!company, `gl-links.csv: unknown company ${row.CompanyCode}`);
        const accountID = company.Accounts[row.AccountKey];
        Assert(!!accountID, `gl-links.csv: no account ${row.AccountKey} on ${row.CompanyCode}`);
        const rid = roleID.get(row.Role);
        Assert(!!rid, `GL role '${row.Role}' missing — push accounting metadata`);
        const target = resolveLinkTarget(world, entities, row);
        await Upsert(
            ctx,
            GL_ACCOUNT_LINK_ENTITY,
            `EntityID = '${target.EntityID}' AND RecordID = '${target.RecordID}' AND GLAccountRoleID = '${rid}' AND GLAccountID = '${accountID}'`,
            {
                GLAccountID: accountID,
                GLAccountRoleID: rid,
                EntityID: target.EntityID,
                RecordID: target.RecordID,
                Status: 'Active',
            },
        );
    }
}

function resolveLinkTarget(
    world: WorldState,
    entities: LinkEntities,
    row: Record<string, string>,
): { EntityID: string; RecordID: string } {
    const company = world.Companies[row.CompanyCode];
    switch (row.Level) {
        case 'Company':
            return { EntityID: entities.CompanyEntityID, RecordID: company.ID };
        case 'ProductType': {
            Assert(!!entities.ProductTypeEntityID, 'Product Types entity missing');
            const typeID = world.ProductTypeIDs[row.Target];
            Assert(!!typeID, `gl-links.csv: unknown product type ${row.Target}`);
            return { EntityID: entities.ProductTypeEntityID, RecordID: typeID };
        }
        case 'Category': {
            Assert(!!entities.ProductCategoryEntityID, 'Product Categories entity missing');
            const catID = world.Categories[`${row.CompanyCode}:${row.Target}`];
            Assert(!!catID, `gl-links.csv: unknown category ${row.CompanyCode}:${row.Target}`);
            return { EntityID: entities.ProductCategoryEntityID, RecordID: catID };
        }
        case 'Product': {
            Assert(!!entities.ProductEntityID, 'Products entity missing');
            const productID = world.Products[row.Target];
            Assert(!!productID, `gl-links.csv: unknown product ${row.Target}`);
            return { EntityID: entities.ProductEntityID, RecordID: productID };
        }
        default:
            throw new Error(`gl-links.csv: unknown Level '${row.Level}'`);
    }
}

async function loadChargeTypeLinks(
    ctx: IntegrationCheckContext,
    world: WorldState,
    chargeTypeEntityID: string | undefined,
): Promise<void> {
    if (!chargeTypeEntityID) return;
    const roles = await FindRows<{ ID: string; Name: string }>(ctx, GL_ACCOUNT_ROLE_ENTITY, `Name = 'Sales'`, [
        'ID',
        'Name',
    ]);
    const salesRole = roles[0]?.ID;
    if (!salesRole) return;

    const map: Array<[string, string]> = [
        ['Shipping', 'Shipping'],
        ['Handling', 'Shipping'],
        ['SalesTax', 'TaxPayable'],
        ['VAT', 'TaxPayable'],
    ];
    for (const companyCode of ['BCP', 'HH']) {
        const company = world.Companies[companyCode];
        for (const [code, accountKey] of map) {
            const ctID = await FindId(ctx, 'MJ_BizApps_Orders: Charge Types', `Code = '${code}'`);
            if (!ctID) continue;
            const accountID = company.Accounts[accountKey];
            if (!accountID) continue;
            await Upsert(
                ctx,
                GL_ACCOUNT_LINK_ENTITY,
                `EntityID = '${chargeTypeEntityID}' AND RecordID = '${ctID}' AND GLAccountID = '${accountID}'`,
                {
                    GLAccountID: accountID,
                    GLAccountRoleID: salesRole,
                    EntityID: chargeTypeEntityID,
                    RecordID: ctID,
                    Status: 'Active',
                },
            );
        }
    }
}

async function loadIntercompany(ctx: IntegrationCheckContext, world: WorldState): Promise<void> {
    for (const row of ReadCsv(join(DATA, 'intercompany-matches.csv'))) {
        const source = world.Companies[row.Source];
        const target = world.Companies[row.Target];
        Assert(!!source, `intercompany-matches.csv: unknown source ${row.Source}`);
        Assert(!!target, `intercompany-matches.csv: unknown target ${row.Target}`);
        Assert(!!source.Accounts.DueTo, `intercompany-matches.csv: ${row.Source} has no DueTo account`);
        Assert(!!target.Accounts.DueFrom, `intercompany-matches.csv: ${row.Target} has no DueFrom account`);
        await Upsert(
            ctx,
            INTERCOMPANY_ACCOUNT_MATCH_ENTITY,
            `SourceCompanyID = '${source.ID}' AND TargetCompanyID = '${target.ID}' AND Status = 'Active'`,
            {
                SourceCompanyID: source.ID,
                TargetCompanyID: target.ID,
                DueToGLAccountID: source.Accounts.DueTo,
                DueFromGLAccountID: target.Accounts.DueFrom,
                Status: 'Active',
            },
        );
    }
}

async function loadOrganizations(ctx: IntegrationCheckContext, world: WorldState): Promise<void> {
    for (const row of ReadCsv(join(DATA, 'organizations.csv'))) {
        const typeID = await FindId(ctx, ORGANIZATION_TYPE_ENTITY, `Name = '${Quote(row.OrganizationType)}'`);
        const id = await Upsert(ctx, ORGANIZATION_ENTITY, `Name = '${Quote(row.Name)}'`, {
            Name: row.Name,
            Email: row.Email || null,
            OrganizationTypeID: typeID,
            Description: WORLD_TAG,
        });
        world.Organizations[row.Code] = id;
    }
}

async function loadPeople(ctx: IntegrationCheckContext, world: WorldState): Promise<void> {
    for (const row of ReadCsv(join(DATA, 'people.csv'))) {
        const id = await Upsert(ctx, PERSON_ENTITY, `Email = '${Quote(row.Email)}'`, {
            FirstName: row.FirstName,
            LastName: row.LastName,
            Title: row.Title || null,
            Email: row.Email,
        });
        world.People[row.Email] = id;
        if (row.OrgCode && row.RelationshipType) {
            const orgID = world.Organizations[row.OrgCode];
            Assert(!!orgID, `people.csv: unknown org ${row.OrgCode} for ${row.Email}`);
            const typeID = await FindId(
                ctx,
                RELATIONSHIP_TYPE_ENTITY,
                `Name = '${Quote(row.RelationshipType)}'`,
            );
            Assert(!!typeID, `Relationship Type '${row.RelationshipType}' missing — push common metadata`);
            await Upsert(
                ctx,
                RELATIONSHIP_ENTITY,
                `FromPersonID = '${id}' AND ToOrganizationID = '${orgID}' AND RelationshipTypeID = '${typeID}'`,
                {
                    FromPersonID: id,
                    ToOrganizationID: orgID,
                    RelationshipTypeID: typeID,
                },
            );
        }
    }
}

async function loadAddresses(ctx: IntegrationCheckContext, world: WorldState): Promise<void> {
    for (const row of ReadCsv(join(DATA, 'addresses.csv'))) {
        const id = await Upsert(
            ctx,
            ADDRESS_ENTITY,
            `Line1 = '${Quote(row.Line1)}' AND PostalCode = '${Quote(row.PostalCode)}'`,
            {
                Line1: row.Line1,
                City: row.City,
                StateProvince: row.StateProvince,
                PostalCode: row.PostalCode,
                Country: row.Country,
            },
        );
        world.Addresses[row.Key] = id;
    }
}

async function loadTax(ctx: IntegrationCheckContext, world: WorldState): Promise<void> {
    const authorityID = await Upsert(ctx, TAX_AUTHORITY_ENTITY, `Code = 'ORD-WORLD-US'`, {
        Code: 'ORD-WORLD-US',
        Name: 'ORD-WORLD US Tax Authorities',
        CountryCode: 'US',
        IsActive: true,
    });
    for (const row of ReadCsv(join(DATA, 'tax-jurisdictions.csv'))) {
        const jid = await Upsert(ctx, TAX_JURISDICTION_ENTITY, `Code = '${Quote(row.Code)}'`, {
            TaxAuthorityID: authorityID,
            Code: row.Code,
            Name: row.Name,
            CountryCode: 'US',
            RegionCode: row.Region || null,
            PostalCodeStart: row.PostalFrom || null,
            PostalCodeEnd: row.PostalTo || null,
            CityName: row.City || null,
            IsActive: true,
        });
        world.Jurisdictions[row.Key] = jid;
        await Upsert(
            ctx,
            TAX_RATE_ENTITY,
            `TaxJurisdictionID = '${jid}' AND TaxCategory = 'Standard' AND EffectiveFrom = '2020-01-01'`,
            {
                TaxJurisdictionID: jid,
                TaxCategory: 'Standard',
                Rate: Number(row.Rate),
                EffectiveFrom: '2020-01-01',
                Source: 'Manual',
            },
        );
    }
    const md = world.Jurisdictions.MD;
    if (md) {
        await Upsert(
            ctx,
            TAX_RATE_ENTITY,
            `TaxJurisdictionID = '${md}' AND TaxCategory = 'Reduced' AND EffectiveFrom = '2020-01-01'`,
            {
                TaxJurisdictionID: md,
                TaxCategory: 'Reduced',
                Rate: 0,
                EffectiveFrom: '2020-01-01',
                Source: 'Manual',
            },
        );
    }
    for (const row of ReadCsv(join(DATA, 'tax-nexus.csv'))) {
        const company = world.Companies[row.CompanyCode];
        const jid = world.Jurisdictions[row.JurisdictionKey];
        if (!company || !jid) continue;
        await Upsert(
            ctx,
            COMPANY_TAX_NEXUS_ENTITY,
            `CompanyID = '${company.ID}' AND TaxJurisdictionID = '${jid}'`,
            {
                CompanyID: company.ID,
                TaxJurisdictionID: jid,
                NexusType: 'Economic',
                RegistrationNumber: `ORD-WORLD-${row.CompanyCode}-${row.JurisdictionKey}`,
                RegisteredFrom: '2020-01-01',
                Status: 'Active',
            },
        );
    }
}

async function loadCategories(ctx: IntegrationCheckContext, world: WorldState): Promise<void> {
    const rows = ReadCsv(join(DATA, 'product-categories.csv'));
    await upsertCategoryRows(ctx, world, rows);
    await applyCategoryParents(ctx, world, rows);
}

async function upsertCategoryRows(
    ctx: IntegrationCheckContext,
    world: WorldState,
    rows: Array<Record<string, string>>,
): Promise<void> {
    for (const row of rows) {
        const company = world.Companies[row.CompanyCode];
        Assert(!!company, `product-categories.csv: unknown company ${row.CompanyCode}`);
        const id = await Upsert(
            ctx,
            PRODUCT_CATEGORY_ENTITY,
            `CompanyID = '${company.ID}' AND Code = '${Quote(row.Code)}'`,
            {
                CompanyID: company.ID,
                Code: row.Code,
                Name: row.Name,
                Description: row.Description || null,
                IsActive: true,
            },
        );
        world.Categories[`${row.CompanyCode}:${row.Code}`] = id;
    }
}

async function applyCategoryParents(
    ctx: IntegrationCheckContext,
    world: WorldState,
    rows: Array<Record<string, string>>,
): Promise<void> {
    for (const row of rows) {
        const id = world.Categories[`${row.CompanyCode}:${row.Code}`];
        const parentID = row.ParentCode
            ? world.Categories[`${row.CompanyCode}:${row.ParentCode}`]
            : null;
        if (row.ParentCode) {
            Assert(!!parentID, `product-categories.csv: unknown parent ${row.ParentCode} for ${row.Code}`);
        }
        await Upsert(ctx, PRODUCT_CATEGORY_ENTITY, `ID = '${id}'`, {
            ParentProductCategoryID: parentID,
        });
    }
}

async function loadProducts(ctx: IntegrationCheckContext, world: WorldState): Promise<void> {
    const eventSKUs = new Set(ReadCsv(join(DATA, 'event-products.csv')).map((r) => r.SKU));
    for (const row of ReadCsv(join(DATA, 'products.csv'))) {
        if (eventSKUs.has(row.SKU)) continue;
        const company = world.Companies[row.CompanyCode];
        const typeID = world.ProductTypeIDs[row.ProductTypeCode];
        const catID = world.Categories[`${row.CompanyCode}:${row.CategoryCode}`];
        const rr = world.RevRecTypeIDs.get(row.RevRecCode);
        Assert(!!company, `products.csv: unknown company ${row.CompanyCode}`);
        Assert(!!typeID, `products.csv: unknown product type ${row.ProductTypeCode}`);
        Assert(!!catID, `products.csv: unknown category ${row.CategoryCode}`);
        Assert(!!rr, `products.csv: unknown rev-rec ${row.RevRecCode}`);
        const sub = row.SubscriptionTypeCode ? world.SubscriptionTypeIDs.get(row.SubscriptionTypeCode) : undefined;
        const id = await Upsert(ctx, PRODUCT_ENTITY, `SKU = '${Quote(row.SKU)}'`, {
            CompanyID: company.ID,
            ProductTypeID: typeID,
            ProductCategoryID: catID,
            Name: row.Name,
            SKU: row.SKU,
            Status: 'Active',
            RevenueRecognitionTypeID: rr,
            SubscriptionTypeID: sub ?? null,
            Description: WORLD_TAG,
        });
        world.Products[row.SKU] = id;
        if (row.Mnemonic) world.ProductMnemonics[row.Mnemonic] = id;
    }
}

async function loadEventProducts(ctx: IntegrationCheckContext, world: WorldState): Promise<void> {
    const products = ReadCsv(join(DATA, 'products.csv'));
    for (const row of ReadCsv(join(DATA, 'event-products.csv'))) {
        const spec = products.find((p) => p.SKU === row.SKU);
        Assert(!!spec, `event-products.csv: no products.csv row for ${row.SKU}`);
        const company = world.Companies[spec.CompanyCode];
        const typeID = world.ProductTypeIDs[spec.ProductTypeCode];
        const catID = world.Categories[`${spec.CompanyCode}:${spec.CategoryCode}`];
        const rr = world.RevRecTypeIDs.get(spec.RevRecCode);
        const id = await Upsert(ctx, EVENT_PRODUCT_ENTITY, `SKU = '${Quote(row.SKU)}'`, {
            EventStartsAt: new Date(row.EventStartsAt),
            EventEndsAt: new Date(row.EventEndsAt),
            VenueName: row.VenueName,
            Capacity: Number(row.Capacity),
            RequiresAttendeeInfo: true,
            CompanyID: company.ID,
            ProductTypeID: typeID,
            ProductCategoryID: catID,
            Name: spec.Name,
            SKU: spec.SKU,
            Status: 'Active',
            RevenueRecognitionTypeID: rr,
            Description: WORLD_TAG,
        });
        world.Products[row.SKU] = id;
        if (spec.Mnemonic) world.ProductMnemonics[spec.Mnemonic] = id;
    }
}

async function loadPrices(ctx: IntegrationCheckContext, world: WorldState): Promise<void> {
    for (const row of ReadCsv(join(DATA, 'product-prices.csv'))) {
        const productID = world.Products[row.SKU];
        Assert(!!productID, `product-prices.csv: unknown SKU ${row.SKU}`);
        await Upsert(
            ctx,
            PRODUCT_PRICE_ENTITY,
            `ProductID = '${productID}' AND Status = 'Active' AND FeeType = 'Standard' AND Priority = 0 AND PriceListID IS NULL`,
            {
                ProductID: productID,
                Name: `Base ${Number(row.Amount)}`,
                PricingModel: row.PricingModel || 'PerUnit',
                FeeType: 'Standard',
                Amount: Number(row.Amount),
                EffectiveFrom: '2020-01-01',
                Priority: 0,
                Status: 'Active',
            },
        );
    }
}

async function loadBundles(ctx: IntegrationCheckContext, world: WorldState): Promise<void> {
    for (const row of ReadCsv(join(DATA, 'product-bundle-items.csv'))) {
        const bundleID = world.Products[row.BundleSKU];
        const componentID = world.Products[row.ComponentSKU];
        Assert(!!bundleID && !!componentID, `bundle item ${row.BundleSKU} → ${row.ComponentSKU} missing product`);
        await Upsert(
            ctx,
            PRODUCT_BUNDLE_ITEM_ENTITY,
            `BundleProductID = '${bundleID}' AND ComponentProductID = '${componentID}'`,
            {
                BundleProductID: bundleID,
                ComponentProductID: componentID,
                Quantity: Number(row.Quantity),
                PricingMode: row.PricingMode,
                SortOrder: Number(row.SortOrder),
            },
        );
    }
}

async function loadEntitlements(ctx: IntegrationCheckContext, world: WorldState): Promise<void> {
    for (const row of ReadCsv(join(DATA, 'product-entitlements.csv'))) {
        const productID = world.Products[row.SKU];
        Assert(!!productID, `product-entitlements.csv: unknown SKU ${row.SKU}`);
        const id = await Upsert(
            ctx,
            PRODUCT_ENTITLEMENT_ENTITY,
            `ProductID = '${productID}' AND Code = '${Quote(row.Code)}'`,
            {
                ProductID: productID,
                EntitlementType: row.EntitlementType,
                Code: row.Code,
                Name: row.Code,
                Quantity: row.Quantity ? Number(row.Quantity) : null,
                UnitOfMeasure: row.UnitOfMeasure || null,
                IsActive: true,
                ValidityMode: row.ValidityMode || null,
                ValidityDurationDays: row.ValidityDurationDays ? Number(row.ValidityDurationDays) : null,
                AccessLeadHours: row.AccessLeadHours ? Number(row.AccessLeadHours) : null,
                AccessLagHours: row.AccessLagHours ? Number(row.AccessLagHours) : null,
            },
        );
        if (row.Mnemonic) world.Entitlements[row.Mnemonic] = id;
    }
}

/**
 * Situations a demo / Explorer session should actually see: a price list, a Draft,
 * and a Confirmed physical order sitting in the fulfillment queue. Idempotent via Notes.
 */
async function loadOperationalSituations(ctx: IntegrationCheckContext, world: WorldState): Promise<void> {
    const riv = world.Organizations.RIV;
    const nora = world.People['nora.calhoun@riverside.org'];
    const handbook = world.Products['STYLE-HB'];
    const bcp = world.Companies.BCP?.ID;
    if (!riv || !nora || !handbook || !bcp) return;

    const listID = await Upsert(ctx, PRICE_LIST_ENTITY, `Code = 'BCP-STD'`, {
        Code: 'BCP-STD',
        Name: 'BCP Standard',
        Status: 'Active',
        Description: WORLD_TAG,
    });
    await Upsert(
        ctx,
        PRICE_LIST_ASSIGNMENT_ENTITY,
        `PriceListID = '${listID}' AND OrganizationID = '${riv}'`,
        {
            PriceListID: listID,
            OrganizationID: riv,
            Priority: 0,
            Status: 'Active',
        },
    );

    await ensureWorldOrder(ctx, {
        notes: `${WORLD_TAG} draft handbook`,
        confirm: false,
        companyID: bcp,
        personID: nora,
        orgID: riv,
        productID: handbook,
    });
    await ensureWorldOrder(ctx, {
        notes: `${WORLD_TAG} confirmed handbook`,
        confirm: true,
        companyID: bcp,
        personID: nora,
        orgID: riv,
        productID: handbook,
    });
}

async function ensureWorldOrder(
    ctx: IntegrationCheckContext,
    spec: {
        notes: string;
        confirm: boolean;
        companyID: string;
        personID: string;
        orgID: string;
        productID: string;
    },
): Promise<void> {
    const existing = await FindId(ctx, ORDER_HEADER_ENTITY, `Notes = '${Quote(spec.notes)}'`);
    if (existing) return;

    const order = await ctx.Provider.GetEntityObject<OrderHeaderEntity>(ORDER_HEADER_ENTITY, ctx.User);
    order.NewRecord();
    order.OrderType = 'Sale';
    order.Status = 'Draft';
    order.CompanyID = spec.companyID;
    order.BillToPersonID = spec.personID;
    order.BillToOrganizationID = spec.orgID;
    order.ShipToPersonID = spec.personID;
    order.ShipToOrganizationID = spec.orgID;
    order.Notes = spec.notes;
    const line = await ctx.Provider.GetEntityObject<mjBizAppsOrdersOrderLineEntity>(ORDER_LINE_ENTITY, ctx.User);
    line.NewRecord();
    line.ProductID = spec.productID;
    line.Quantity = 1;
    order.Lines.Add(line);
    if (spec.confirm) order.Status = 'Confirmed';
    Assert(await order.Save(), `${spec.notes} save failed: ${order.LatestResult?.CompleteMessage ?? 'unknown'}`);
}
