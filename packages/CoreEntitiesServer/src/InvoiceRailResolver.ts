/**
 * @fileoverview From a `PaymentProvider` row to a live `BaseInvoiceRail`.
 *
 * Mirrors `PaymentProviderResolver`: the type's `Code` is the ClassFactory key, the base class coming
 * back means "nothing registered", and an inactive or missing row is refused by name rather than
 * silently skipped. The one extra fact a rail needs is `CompanyIntegrationID` — the MJ row the
 * connector resolves credentials from — which is read here through RunView so no generated getter is
 * required before CodeGen has run on the new column.
 *
 * `FindInvoiceRailForCompany` is the question the sweep and the delivery-exclusion ask: "does this
 * company invoice through a rail at all?" Null is the ordinary answer for a company that invoices
 * natively, and is what keeps every existing company's behaviour unchanged (design D-B4, §12 Q11).
 *
 * @module @mj-biz-apps/orders-core-entities-server
 */
import { MJGlobal } from '@memberjunction/global';
import { RunView, type IMetadataProvider, type IRunViewProvider, type UserInfo } from '@memberjunction/core';
import { BaseInvoiceRail, type InvoiceRailConfig } from './BaseInvoiceRail.js';
import { LoadPaymentProviderConfig } from './PaymentProviderResolver.js';
import { PAYMENT_PROVIDER_ENTITY, PAYMENT_PROVIDER_TYPE_ENTITY } from './entity-names.js';
import { RequireUUID } from './sql-guards.js';

/**
 * Provider type codes that are also invoice rails. Listed rather than discovered so the company
 * lookup can be one filter; a type becomes a rail by appearing here AND having a registered subclass.
 */
export const INVOICE_RAIL_TYPE_CODES: readonly string[] = ['BillCom'];

export class InvoiceRailNotConfiguredError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'InvoiceRailNotConfiguredError';
    }
}

/** The pure half: config → registered subclass, or a refusal that says how to register one. */
export function BuildInvoiceRail(config: InvoiceRailConfig, provider: IMetadataProvider, user: UserInfo): BaseInvoiceRail {
    const rail = MJGlobal.Instance.ClassFactory.CreateInstance<BaseInvoiceRail>(BaseInvoiceRail, config.TypeCode);
    if (!rail || rail.constructor === BaseInvoiceRail) {
        throw new InvoiceRailNotConfiguredError(
            `No invoice rail is registered for provider type '${config.TypeCode}'. Register one with ` +
                `@RegisterClass(BaseInvoiceRail, '${config.TypeCode}') and call its Load* anchor from the ` +
                `server bootstrap — without the anchor the decorator is tree-shaken away and the class is silently absent.`,
        );
    }
    rail.Config = config;
    rail.Provider = provider;
    rail.User = user;
    return rail;
}

/** Resolve the rail behind one provider row. Throws when the row is missing, inactive, or has no rail. */
export async function ResolveInvoiceRail(paymentProviderID: string, provider: IMetadataProvider, user: UserInfo): Promise<BaseInvoiceRail> {
    const cfg = await LoadPaymentProviderConfig(paymentProviderID, provider, user); // refuses missing/inactive by name
    const companyIntegrationID = await loadCompanyIntegrationID(cfg.ID, provider, user);
    return BuildInvoiceRail(
        {
            PaymentProviderID: cfg.ID,
            TypeCode: cfg.TypeCode,
            CompanyID: cfg.CompanyID,
            Name: cfg.Name,
            IsLiveMode: cfg.IsLiveMode,
            CompanyIntegrationID: companyIntegrationID,
        },
        provider,
        user,
    );
}

/**
 * The company's active rail, or null. Two active rails for one company is a configuration error and
 * is refused rather than guessed — the two would each claim every invoice.
 */
export async function FindInvoiceRailForCompany(companyID: string, provider: IMetadataProvider, user: UserInfo): Promise<BaseInvoiceRail | null> {
    const id = await FindInvoiceRailProviderID(companyID, provider, user);
    return id ? ResolveInvoiceRail(id, provider, user) : null;
}

/** The provider row id behind the company's rail, or null. Cheaper than building the rail when only "has one?" is asked. */
export async function FindInvoiceRailProviderID(companyID: string, provider: IMetadataProvider, user: UserInfo): Promise<string | null> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const types = await rv.RunView<{ ID: string; Code: string }>(
        {
            EntityName: PAYMENT_PROVIDER_TYPE_ENTITY,
            ExtraFilter: `Code IN (${INVOICE_RAIL_TYPE_CODES.map((c) => `'${c}'`).join(',')})`,
            Fields: ['ID', 'Code'],
            ResultType: 'simple',
        },
        user,
    );
    const typeIDs = (types.Results ?? []).map((t) => `'${RequireUUID(t.ID, 'PaymentProviderTypeID')}'`);
    if (!typeIDs.length) return null;

    const rows = await rv.RunView<{ ID: string }>(
        {
            EntityName: PAYMENT_PROVIDER_ENTITY,
            ExtraFilter: `CompanyID = '${RequireUUID(companyID, 'CompanyID')}' AND IsActive = 1 AND PaymentProviderTypeID IN (${typeIDs.join(',')})`,
            Fields: ['ID'],
            ResultType: 'simple',
        },
        user,
    );
    const found = rows.Results ?? [];
    if (!found.length) return null;
    if (found.length > 1) {
        throw new InvoiceRailNotConfiguredError(
            `Company ${companyID} has ${found.length} active invoice rails configured; exactly one is allowed, ` +
                `because two rails would each claim every invoice.`,
        );
    }
    return found[0].ID;
}

/** Every active rail provider row, for the poller's "run per company" loop. */
export async function ListInvoiceRailProviderIDs(provider: IMetadataProvider, user: UserInfo): Promise<Array<{ ID: string; CompanyID: string }>> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const types = await rv.RunView<{ ID: string }>(
        { EntityName: PAYMENT_PROVIDER_TYPE_ENTITY, ExtraFilter: `Code IN (${INVOICE_RAIL_TYPE_CODES.map((c) => `'${c}'`).join(',')})`, Fields: ['ID'], ResultType: 'simple' },
        user,
    );
    const typeIDs = (types.Results ?? []).map((t) => `'${RequireUUID(t.ID, 'PaymentProviderTypeID')}'`);
    if (!typeIDs.length) return [];
    const rows = await rv.RunView<{ ID: string; CompanyID: string }>(
        { EntityName: PAYMENT_PROVIDER_ENTITY, ExtraFilter: `IsActive = 1 AND PaymentProviderTypeID IN (${typeIDs.join(',')})`, Fields: ['ID', 'CompanyID'], OrderBy: 'Name', ResultType: 'simple' },
        user,
    );
    return rows.Results ?? [];
}

async function loadCompanyIntegrationID(paymentProviderID: string, provider: IMetadataProvider, user: UserInfo): Promise<string | null> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const r = await rv.RunView<{ CompanyIntegrationID: string | null }>(
        {
            EntityName: PAYMENT_PROVIDER_ENTITY,
            ExtraFilter: `ID = '${RequireUUID(paymentProviderID, 'PaymentProviderID')}'`,
            Fields: ['CompanyIntegrationID'],
            ResultType: 'simple',
        },
        user,
    );
    return r.Results?.[0]?.CompanyIntegrationID ?? null;
}
