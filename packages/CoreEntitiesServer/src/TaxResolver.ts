/**
 * TaxResolver — turn a ship-to address into the tax charges that actually apply (plan D72).
 *
 * WHAT THIS REPLACES
 * Charges could already compute tax, but the RATE came from the caller. That proves the arithmetic
 * and proves nothing about correctness: the hard part of sales tax is not multiplying, it is knowing
 * which jurisdictions reach this address and what each of them charges for this kind of product.
 *
 * THE THREE QUESTIONS, and they are genuinely separate
 *   1. WHERE — which jurisdictions cover the ship-to address? Usually several, nested: a state, a
 *      county, sometimes a city or transit district. Each is its own charge, which is exactly why
 *      tax is modelled as a charge (D71) rather than as one number.
 *   2. WHETHER — does the SELLER have nexus there? Not modelled yet; that is a property of our own
 *      legal entity and belongs with the company in bizapps-accounting.
 *   3. WHO — is this BUYER exempt, in this jurisdiction, for this kind of product? That is
 *      `CustomerTaxExemption`, and it lives here because customer concerns start at orders.
 *
 * WHY CALIFORNIA IS THE EXAMPLE WORTH KNOWING
 * The state rate is 7.25%, but Santa Clara County charges 9.125% and San Mateo 9.375% — neighbouring
 * counties, a quarter-point apart. A system that resolves tax at the state level is not slightly
 * imprecise, it is wrong for most of the state, and wrong in a way that only surfaces in an audit.
 *
 * ADDRESS → JURISDICTION IS A SEAM, NOT A SOLVED PROBLEM
 * Matching on postal code, city and region is what accounting's `TaxJurisdiction` models and is
 * enough for the fixture and for many real deployments. It is NOT rooftop-accurate: a postal code
 * can straddle a boundary. That is the point at which a commercial provider earns its money, and
 * `BaseTaxJurisdictionResolver` exists so one can be substituted without touching anything else.
 *
 * CONNECTS TO:
 *   TABLES: __mj_BizAppsAccounting.{TaxJurisdiction,TaxRate} · __mj_BizAppsOrders.CustomerTaxExemption
 *   CALLER: OrderEntityServer (charges), Orders.PreviewTax
 *   DOC:    plans/pricing-charges-and-promotions.md §6
 */
import { IMetadataProvider, IRunViewProvider, RunView, UserInfo } from '@memberjunction/core';
import { MJGlobal, RegisterClass } from '@memberjunction/global';

const ACCOUNTING = '__mj_BizAppsAccounting';
const TAX_JURISDICTION_ENTITY = `MJ_BizApps_Accounting: Tax Jurisdictions`;
const TAX_RATE_ENTITY = `MJ_BizApps_Accounting: Tax Rates`;
const EXEMPTION_ENTITY = 'MJ_BizApps_Orders: Customer Tax Exemptions';

/** The address facts jurisdiction matching uses. */
export interface TaxAddress {
    Country: string | null;
    StateProvince: string | null;
    City: string | null;
    PostalCode: string | null;
}

export interface ResolvedTaxLayer {
    TaxJurisdictionID: string;
    JurisdictionName: string;
    JurisdictionCode: string;
    TaxRateID: string;
    Rate: number;
    /** The category the rate was found for — the product's, or the catch-all. */
    TaxCategory: string;
}

export interface TaxResolutionResult {
    Layers: ResolvedTaxLayer[];
    /** Combined rate, for reporting. The CHARGES are per layer — this is not what gets applied. */
    CombinedRate: number;
    /** Set when tax was suppressed, with the reason, so a zero is never silently ambiguous. */
    ExemptReason?: string;
    ExemptionID?: string;
}

interface JurisdictionRow {
    ID: string;
    Code: string;
    Name: string;
    CountryCode: string | null;
    RegionCode: string | null;
    PostalCode: string | null;
    PostalCodeStart: string | null;
    PostalCodeEnd: string | null;
    CityName: string | null;
    ParentTaxJurisdictionID: string | null;
    IsActive: boolean;
}

const norm = (v: string | null | undefined): string => (v ?? '').trim().toLowerCase();

/**
 * Which jurisdictions cover an address?
 *
 * Substitutable: a commercial provider doing rooftop geocoding registers a subclass and the rest of
 * the pipeline is unchanged.
 */
export abstract class BaseTaxJurisdictionResolver {
    public abstract Resolve(
        address: TaxAddress,
        asOf: Date,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<string[]>;
}

/**
 * The built-in matcher: postal code, then city, then region, then country.
 *
 * A jurisdiction matches when every field it SPECIFIES agrees with the address. A row specifying
 * only `RegionCode='CA'` matches everything in California; one that also names a postal range
 * matches only inside it. Nulls mean "do not care", so the same table expresses a state, a county
 * and a city without three shapes.
 */
@RegisterClass(BaseTaxJurisdictionResolver)
export class DefaultTaxJurisdictionResolver extends BaseTaxJurisdictionResolver {
    public async Resolve(
        address: TaxAddress,
        _asOf: Date,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<string[]> {
        const rv = new RunView(provider as unknown as IRunViewProvider);
        const res = await rv.RunView<JurisdictionRow>(
            { EntityName: TAX_JURISDICTION_ENTITY, ExtraFilter: `IsActive = 1`, ResultType: 'simple', BypassCache: true },
            user,
        );
        const all = res?.Results ?? [];

        const country = norm(address.Country) === 'usa' ? 'us' : norm(address.Country);
        const region = norm(address.StateProvince);
        const city = norm(address.City);
        const postal = (address.PostalCode ?? '').trim();

        return all
            .filter((j) => {
                if (j.CountryCode && norm(j.CountryCode) !== country) return false;
                if (j.RegionCode && norm(j.RegionCode) !== region) return false;
                if (j.CityName && norm(j.CityName) !== city) return false;
                if (j.PostalCode && j.PostalCode.trim() !== postal) return false;
                if (j.PostalCodeStart && j.PostalCodeEnd) {
                    if (!postal) return false;
                    // Lexicographic works for fixed-width US ZIPs; a provider handling other
                    // countries' formats is exactly what the seam above is for.
                    if (postal < j.PostalCodeStart.trim() || postal > j.PostalCodeEnd.trim()) return false;
                }
                return true;
            })
            .map((j) => j.ID);
    }
}

/**
 * Resolve every tax layer for one line: where it ships, what it is, and who is buying.
 *
 * Returns NO layers when the buyer is exempt, with `ExemptReason` set — the difference between
 * "no tax applies here" and "this customer is exempt" matters to an auditor, and a bare zero
 * cannot tell them apart.
 */
export async function ResolveTax(
    input: {
        Address: TaxAddress;
        /** The product's `TaxCategory`. Null falls back to the catch-all rate. */
        ProductTaxCategory: string | null;
        OrganizationID: string | null;
        PersonID: string | null;
        AsOf: Date;
    },
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<TaxResolutionResult> {
    const resolver =
        MJGlobal.Instance.ClassFactory.CreateInstance<BaseTaxJurisdictionResolver>(BaseTaxJurisdictionResolver) ??
        new DefaultTaxJurisdictionResolver();
    const jurisdictionIDs = await resolver.Resolve(input.Address, input.AsOf, provider, user);
    if (!jurisdictionIDs.length) return { Layers: [], CombinedRate: 0 };

    const rv = new RunView(provider as unknown as IRunViewProvider);
    const quoted = jurisdictionIDs.map((id) => `'${id}'`).join(',');

    const jurRes = await rv.RunView<{ ID: string; Code: string; Name: string }>(
        {
            EntityName: TAX_JURISDICTION_ENTITY,
            ExtraFilter: `ID IN (${quoted})`,
            Fields: ['ID', 'Code', 'Name'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    const jurByID = new Map((jurRes?.Results ?? []).map((j) => [norm(j.ID), j]));

    const rateRes = await rv.RunView<{
        ID: string;
        TaxJurisdictionID: string;
        TaxCategory: string;
        Rate: number;
        EffectiveFrom: Date;
        EffectiveTo: Date | null;
    }>(
        {
            EntityName: TAX_RATE_ENTITY,
            ExtraFilter: `TaxJurisdictionID IN (${quoted})`,
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );

    const asOf = input.AsOf.getTime();
    const inForce = (rateRes?.Results ?? []).filter((r) => {
        const from = r.EffectiveFrom ? new Date(r.EffectiveFrom).getTime() : null;
        const to = r.EffectiveTo ? new Date(r.EffectiveTo).getTime() : null;
        if (from !== null && asOf < from) return false;
        if (to !== null && asOf > to) return false;
        return true;
    });

    // Per jurisdiction, the product's OWN category wins over the catch-all. A state that taxes
    // groceries at 2% and everything else at 6% is two rows, and picking the wrong one is a silent
    // three-fold error.
    const wanted = norm(input.ProductTaxCategory);
    const layers: ResolvedTaxLayer[] = [];
    for (const jid of jurisdictionIDs) {
        const forJur = inForce.filter((r) => norm(r.TaxJurisdictionID) === norm(jid));
        if (!forJur.length) continue;
        // The product's OWN category wins; 'Standard' is the fallback.
        //
        // This looked for a category called 'general' or a null one, and NEITHER CAN EXIST:
        // TaxCategory is NOT NULL and constrained to ('Standard','Reduced','Zero','Exempt','Custom').
        // So the fallback was dead code, and any product whose category did not match a row exactly
        // got NO tax layer at all — a zero indistinguishable from 'no jurisdiction applies'. That is
        // the silent-wrong-answer shape this whole area keeps producing.
        const specific = wanted ? forJur.find((r) => norm(r.TaxCategory) === wanted) : undefined;
        const standard = forJur.find((r) => norm(r.TaxCategory) === 'standard');
        const chosen = specific ?? standard;
        if (!chosen) continue;
        const j = jurByID.get(norm(jid));
        layers.push({
            TaxJurisdictionID: jid,
            JurisdictionName: j?.Name ?? jid,
            JurisdictionCode: j?.Code ?? '',
            TaxRateID: chosen.ID,
            Rate: Number(chosen.Rate),
            TaxCategory: chosen.TaxCategory,
        });
    }

    // EXEMPTION LAST, so the reason can name what would otherwise have applied.
    const exemption = await findExemption(input, layers, provider, user);
    if (exemption) {
        return {
            Layers: [],
            CombinedRate: 0,
            ExemptReason: exemption.Reason,
            ExemptionID: exemption.ID,
        };
    }

    return {
        Layers: layers,
        CombinedRate: Math.round(layers.reduce((s, l) => s + l.Rate, 0) * 1e6) / 1e6,
    };
}

/**
 * Is this buyer exempt for these jurisdictions and this product category?
 *
 * An exemption with a NULL jurisdiction or NULL category means "all". An expired certificate is not
 * an exemption — checked here rather than by a nightly job, so the answer is right on the day it is
 * asked rather than on the day something last swept.
 */
async function findExemption(
    input: {
        ProductTaxCategory: string | null;
        OrganizationID: string | null;
        PersonID: string | null;
        AsOf: Date;
    },
    layers: ResolvedTaxLayer[],
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<{ ID: string; Reason: string } | null> {
    if (!input.OrganizationID && !input.PersonID) return null;

    const clauses: string[] = [];
    if (input.OrganizationID) clauses.push(`OrganizationID = '${input.OrganizationID}'`);
    if (input.PersonID) clauses.push(`PersonID = '${input.PersonID}'`);

    const rv = new RunView(provider as unknown as IRunViewProvider);
    const res = await rv.RunView<{
        ID: string;
        TaxJurisdictionID: string | null;
        TaxCategory: string | null;
        ExemptionType: string;
        CertificateRef: string | null;
        CertificateExpiresAt: Date | null;
        StartedAt: Date | null;
        EndedAt: Date | null;
    }>(
        {
            EntityName: EXEMPTION_ENTITY,
            ExtraFilter: `Status = 'Active' AND (${clauses.join(' OR ')})`,
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );

    const asOf = input.AsOf.getTime();
    const wanted = norm(input.ProductTaxCategory);
    const jurisdictions = new Set(layers.map((l) => norm(l.TaxJurisdictionID)));

    for (const e of res?.Results ?? []) {
        const from = e.StartedAt ? new Date(e.StartedAt).getTime() : null;
        const to = e.EndedAt ? new Date(e.EndedAt).getTime() : null;
        if (from !== null && asOf < from) continue;
        if (to !== null && asOf > to) continue;

        // An expired certificate is not an exemption. Silently honouring one is how a company ends
        // up owing years of uncollected tax.
        if (e.CertificateExpiresAt && new Date(e.CertificateExpiresAt).getTime() < asOf) continue;

        if (e.TaxJurisdictionID && !jurisdictions.has(norm(e.TaxJurisdictionID))) continue;
        if (e.TaxCategory && norm(e.TaxCategory) !== wanted) continue;

        const scope = e.TaxJurisdictionID ? 'in this jurisdiction' : 'in all jurisdictions';
        const kind = e.TaxCategory ? ` for category '${e.TaxCategory}'` : '';
        return {
            ID: e.ID,
            Reason:
                `${e.ExemptionType} exemption ${scope}${kind}` +
                (e.CertificateRef ? ` (certificate ${e.CertificateRef})` : ''),
        };
    }
    return null;
}

/** Tree-shaking anchor so the default jurisdiction resolver's registration survives bundling. */
export function LoadTaxResolver(): void {
    // intentionally empty
}

export { ACCOUNTING };
