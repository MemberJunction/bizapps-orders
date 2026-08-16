/**
 * Resolve the committed ORD-WORLD catalog over GraphQL RunView.
 *
 * Client-safe: no fixture, no CSV load, no server packages. The world is already on disk
 * (catalog-world / ORD-00). This module looks it up by natural keys so a GraphQL process
 * can book against the same companies, people, and SKUs Explorer uses.
 */
import { RunView, type IMetadataProvider } from '@memberjunction/core';
import type { IntegrationCheckContext } from '@memberjunction/testing-integration/registry';
import {
    ADDRESS_ENTITY,
    COMPANY_PROFILE_ENTITY,
    ORGANIZATION_ENTITY,
    PAYMENT_TYPE_ENTITY,
    PERSON_ENTITY,
    PRODUCT_ENTITY,
} from './entity-names.js';

export interface ClientPaymentType {
    ID: string;
    Code: string;
    RequiresReference: boolean;
    RequiresInstrument: boolean;
}

export interface ClientWorld {
    Companies: Record<string, string>;
    Organizations: Record<string, string>;
    People: Record<string, string>;
    Products: Record<string, string>;
    Addresses: Record<string, string>;
    PaymentTypes: Record<string, ClientPaymentType>;
}

let current: ClientWorld | undefined;

export function SetClientWorld(world: ClientWorld): void {
    current = world;
}

export function ClientWorldState(): ClientWorld {
    if (!current) {
        throw new Error('ORD-WORLD is not resolved — run catalog-world (ORD-00) then this client bundle');
    }
    return current;
}

export function HasClientWorld(): boolean {
    return current != null;
}

export function View(ctx: IntegrationCheckContext): RunView {
    return RunView.FromMetadataProvider(ctx.Provider as IMetadataProvider);
}

export function QuoteFilter(value: string): string {
    return value.replace(/'/g, "''");
}

export function IdList(ids: string[]): string {
    if (ids.length === 0) {
        return `'00000000-0000-0000-0000-000000000000'`;
    }
    return ids.map((id) => `'${QuoteFilter(id)}'`).join(',');
}

export async function ResolveClientWorld(ctx: IntegrationCheckContext): Promise<ClientWorld> {
    const world: ClientWorld = {
        Companies: await loadCompanies(ctx),
        Organizations: await loadOrganizations(ctx),
        People: await loadPeople(ctx),
        Products: await loadProducts(ctx),
        Addresses: await loadAddresses(ctx),
        PaymentTypes: await loadPaymentTypes(ctx),
    };
    assertRequired(world);
    SetClientWorld(world);
    return world;
}

interface CompanyRow {
    ID: string;
    Name: string;
    CompanyCode: string | null;
}

interface OrgRow {
    ID: string;
    Name: string;
    Email: string | null;
}

interface PersonRow {
    ID: string;
    Email: string | null;
}

interface ProductRow {
    ID: string;
    SKU: string | null;
}

interface AddressRow {
    ID: string;
    Line1: string | null;
    PostalCode: string | null;
}

interface PaymentTypeRow {
    ID: string;
    Code: string;
    RequiresReference: boolean;
    RequiresInstrument: boolean;
}

async function loadCompanies(ctx: IntegrationCheckContext): Promise<Record<string, string>> {
    const res = await View(ctx).RunView<CompanyRow>(
        {
            EntityName: COMPANY_PROFILE_ENTITY,
            ExtraFilter: `CompanyCode IN ('BCP','HH','DEMO','PARTNER','ORPHAN')`,
            Fields: ['ID', 'Name', 'CompanyCode'],
            ResultType: 'simple',
        },
        ctx.User,
    );
    if (!res.Success) {
        throw new Error(`company profiles: ${res.ErrorMessage ?? 'unknown'}`);
    }
    const out: Record<string, string> = {};
    for (const row of res.Results ?? []) {
        if (row.CompanyCode) out[row.CompanyCode] = row.ID;
    }
    return out;
}

const ORG_BY_EMAIL: Record<string, string> = {
    'hello@riverside.org': 'RIV',
    'office@northgate-schools.edu': 'NGS',
    'hello@summit.edu': 'SUM',
    'desk@atlasathletics.com': 'ATL',
    'front@westfieldmed.org': 'WFM',
    'club@harboryc.org': 'HYC',
    'hello@cedarpine.tax': 'CAP',
    'desk@brightline.tv': 'BLM',
};

async function loadOrganizations(ctx: IntegrationCheckContext): Promise<Record<string, string>> {
    const emails = Object.keys(ORG_BY_EMAIL)
        .map((e) => `'${QuoteFilter(e)}'`)
        .join(',');
    const res = await View(ctx).RunView<OrgRow>(
        {
            EntityName: ORGANIZATION_ENTITY,
            ExtraFilter: `Email IN (${emails})`,
            Fields: ['ID', 'Name', 'Email'],
            ResultType: 'simple',
        },
        ctx.User,
    );
    if (!res.Success) {
        throw new Error(`organizations: ${res.ErrorMessage ?? 'unknown'}`);
    }
    const out: Record<string, string> = {};
    for (const row of res.Results ?? []) {
        const code = row.Email ? ORG_BY_EMAIL[row.Email] : undefined;
        if (code) out[code] = row.ID;
    }
    return out;
}

const WORLD_PEOPLE = [
    'nora.calhoun@riverside.org',
    'james.whitaker@riverside.org',
    'elena.voss@riverside.org',
    'ben.okada@riverside.org',
    'ruth.perez@riverside.org',
    'priya.shah@northgate-schools.edu',
    'marcus.hale@northgate-schools.edu',
    'tess.okonkwo@northgate-schools.edu',
    'leo.brandt@northgate-schools.edu',
    'ami.foster@northgate-schools.edu',
    'helen.cho@summit.edu',
    'owen.briggs@summit.edu',
    'nadia.idris@summit.edu',
    'carlos.mendez@summit.edu',
    'june.park@summit.edu',
    'dana.ruiz@atlasathletics.com',
    'theo.park@atlasathletics.com',
    'mei.lin@atlasathletics.com',
    'amal.rahman@westfieldmed.org',
    'claire.bennett@westfieldmed.org',
    'lydia.grant@harboryc.org',
    'jordan.blake@example.com',
];

async function loadPeople(ctx: IntegrationCheckContext): Promise<Record<string, string>> {
    const emails = WORLD_PEOPLE.map((e) => `'${QuoteFilter(e)}'`).join(',');
    const res = await View(ctx).RunView<PersonRow>(
        {
            EntityName: PERSON_ENTITY,
            ExtraFilter: `Email IN (${emails})`,
            Fields: ['ID', 'Email'],
            ResultType: 'simple',
        },
        ctx.User,
    );
    if (!res.Success) {
        throw new Error(`people: ${res.ErrorMessage ?? 'unknown'}`);
    }
    const out: Record<string, string> = {};
    for (const row of res.Results ?? []) {
        if (row.Email) out[row.Email] = row.ID;
    }
    return out;
}

const WORLD_SKUS = [
    'STYLE-HB',
    'HH-ANTH',
    'MEM-IND',
    'MEM-MONTH',
    'MEM-SEAT',
    'CONF-2027',
    'EDIT-COURSE',
    'WORKSHOP',
];

async function loadProducts(ctx: IntegrationCheckContext): Promise<Record<string, string>> {
    const skus = WORLD_SKUS.map((s) => `'${QuoteFilter(s)}'`).join(',');
    const res = await View(ctx).RunView<ProductRow>(
        {
            EntityName: PRODUCT_ENTITY,
            ExtraFilter: `SKU IN (${skus})`,
            Fields: ['ID', 'SKU'],
            ResultType: 'simple',
        },
        ctx.User,
    );
    if (!res.Success) {
        throw new Error(`products: ${res.ErrorMessage ?? 'unknown'}`);
    }
    const out: Record<string, string> = {};
    for (const row of res.Results ?? []) {
        if (row.SKU) out[row.SKU] = row.ID;
    }
    return out;
}

const ADDRESS_BY_LINE1: Record<string, string> = {
    '1 Innovation Way': 'SantaClara',
    '2 Peninsula Ave': 'SanMateo',
    '7 Broadway': 'NYC',
    '100 River Walk': 'Riverside',
    '200 Schoolhouse Ln': 'Northgate',
};

async function loadAddresses(ctx: IntegrationCheckContext): Promise<Record<string, string>> {
    const lines = Object.keys(ADDRESS_BY_LINE1)
        .map((l) => `'${QuoteFilter(l)}'`)
        .join(',');
    const res = await View(ctx).RunView<AddressRow>(
        {
            EntityName: ADDRESS_ENTITY,
            ExtraFilter: `Line1 IN (${lines})`,
            Fields: ['ID', 'Line1', 'PostalCode'],
            ResultType: 'simple',
        },
        ctx.User,
    );
    if (!res.Success) {
        throw new Error(`addresses: ${res.ErrorMessage ?? 'unknown'}`);
    }
    const out: Record<string, string> = {};
    for (const row of res.Results ?? []) {
        const key = row.Line1 ? ADDRESS_BY_LINE1[row.Line1] : undefined;
        if (key) out[key] = row.ID;
    }
    return out;
}

async function loadPaymentTypes(ctx: IntegrationCheckContext): Promise<Record<string, ClientPaymentType>> {
    const res = await View(ctx).RunView<PaymentTypeRow>(
        {
            EntityName: PAYMENT_TYPE_ENTITY,
            ExtraFilter: `Code IN ('Cash','Check','Wire')`,
            Fields: ['ID', 'Code', 'RequiresReference', 'RequiresInstrument'],
            ResultType: 'simple',
        },
        ctx.User,
    );
    if (!res.Success) {
        throw new Error(`payment types: ${res.ErrorMessage ?? 'unknown'}`);
    }
    const out: Record<string, ClientPaymentType> = {};
    for (const row of res.Results ?? []) {
        out[row.Code] = {
            ID: row.ID,
            Code: row.Code,
            RequiresReference: !!row.RequiresReference,
            RequiresInstrument: !!row.RequiresInstrument,
        };
    }
    return out;
}

function assertRequired(world: ClientWorld): void {
    if (!world.Companies.BCP) {
        throw new Error("ORD-WORLD company BCP missing — run the catalog-world bundle first");
    }
    for (const sku of WORLD_SKUS) {
        if (!world.Products[sku]) {
            throw new Error(`ORD-WORLD product ${sku} missing — run the catalog-world bundle first`);
        }
    }
    for (const code of ['Cash', 'Check', 'Wire']) {
        if (!world.PaymentTypes[code]) {
            throw new Error(`Payment Type '${code}' missing — push orders metadata`);
        }
    }
    if (Object.keys(world.Organizations).length < 3) {
        throw new Error('ORD-WORLD organizations missing — run the catalog-world bundle first');
    }
    if (Object.keys(world.People).length < 6) {
        throw new Error('ORD-WORLD people missing — run the catalog-world bundle first');
    }
}

export function OrgCodes(world: ClientWorld): string[] {
    return Object.keys(world.Organizations);
}

export function PersonEmails(world: ClientWorld): string[] {
    return Object.keys(world.People);
}
