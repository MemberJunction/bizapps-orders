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
 *   DOC:    plans/archive/pricing-charges-and-promotions.md §6
 */
import { IMetadataProvider, IRunViewProvider, RunView, UserInfo } from '@memberjunction/core';
import { MJGlobal, RegisterClassEx } from '@memberjunction/global';

const ACCOUNTING = '__mj_BizAppsAccounting';
const TAX_JURISDICTION_ENTITY = `MJ_BizApps_Accounting: Tax Jurisdictions`;
const TAX_RATE_ENTITY = `MJ_BizApps_Accounting: Tax Rates`;
const EXEMPTION_ENTITY = 'MJ_BizApps_Orders: Customer Tax Exemptions';
// SINGULAR — CodeGen leaves 'Nexus' alone rather than forming 'Nexuses'.
const COMPANY_TAX_NEXUS_ENTITY = 'MJ_BizApps_Accounting: Company Tax Nexus';

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
    /**
     * Set whenever tax was SUPPRESSED, with the reason. A zero is never silently ambiguous: the
     * three ways to owe nothing — the product is not taxable, we have no nexus, the buyer is
     * exempt — are different facts, and an auditor asking "why was no tax charged" needs the
     * right one.
     */
    ExemptReason?: string;
    ExemptionID?: string;
    /** Jurisdictions that matched the address but where this company has NO nexus. */
    SkippedForNoNexus?: string[];
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

/** One level of the category tree, nearest first. */
export interface TaxabilityCategoryLevel {
    ID: string;
    DefaultIsTaxable: boolean | null;
    DefaultTaxCategory: string | null;
}

/** What the taxability walk resolved, and where the answer came from. */
export interface ResolvedTaxability {
    IsTaxable: boolean;
    TaxCategory: string | null;
    /** Which level answered — for the audit trail and for explaining a zero. */
    DecidedAt: 'Product' | 'ProductCategory' | 'ProductType' | 'Default';
    /**
     * WHICH category answered, when one did. A three-deep tree that resolves at the root is a
     * different configuration from one that resolves at the leaf, and 'ProductCategory' alone
     * cannot tell them apart.
     */
    DecidedAtCategoryID?: string;
}

/**
 * Is this product taxable, and as what? (D73)
 *
 * Walks product → its category → that category's ANCESTORS, nearest first → its type. Most specific
 * wins. This is the same walk `GLAccountResolver` performs for accounts, deliberately: a deployment
 * that organises products into a category tree expects "exempt" set at the root to reach every leaf
 * beneath it, and expects a leaf to be able to override its parent.
 *
 * THE TWO QUESTIONS RESOLVE INDEPENDENTLY. A product can name its own tax category while inheriting
 * taxability from three levels up — which is the common real shape, because "what kind of thing is
 * this" and "is it taxed here" are different facts that different people maintain.
 *
 * The type is the backstop and its `DefaultIsTaxable` is NOT NULL, so the walk always terminates
 * with an answer rather than a null nobody knows how to read.
 */
export function ResolveTaxability(
    product: { IsTaxable: boolean | null; TaxCategory: string | null },
    /** The category chain, NEAREST FIRST: the product's own category, then its parent, to the root. */
    categoryChain: TaxabilityCategoryLevel[],
    type: { DefaultIsTaxable: boolean; DefaultTaxCategory: string | null } | null,
): ResolvedTaxability {
    let isTaxable: boolean | null = product.IsTaxable;
    let decidedAt: ResolvedTaxability['DecidedAt'] = 'Product';
    let decidedAtCategoryID: string | undefined;

    if (isTaxable == null) {
        for (const level of categoryChain) {
            if (level.DefaultIsTaxable == null) continue;
            isTaxable = level.DefaultIsTaxable;
            decidedAt = 'ProductCategory';
            decidedAtCategoryID = level.ID;
            break;
        }
    }
    if (isTaxable == null && type) {
        isTaxable = type.DefaultIsTaxable;
        decidedAt = 'ProductType';
    }
    if (isTaxable == null) {
        // Nothing answered at any level. Taxable is the safe default: under-collecting is the
        // expensive direction, because the seller owes the tax it failed to charge and usually
        // cannot recover it from the customer afterwards.
        isTaxable = true;
        decidedAt = 'Default';
    }

    // The category resolves through the SAME chain, independently of taxability.
    let taxCategory: string | null = product.TaxCategory;
    if (taxCategory == null) {
        for (const level of categoryChain) {
            if (level.DefaultTaxCategory == null) continue;
            taxCategory = level.DefaultTaxCategory;
            break;
        }
    }
    if (taxCategory == null) taxCategory = type?.DefaultTaxCategory ?? null;

    return {
        IsTaxable: isTaxable,
        TaxCategory: taxCategory,
        DecidedAt: decidedAt,
        ...(decidedAtCategoryID ? { DecidedAtCategoryID: decidedAtCategoryID } : {}),
    };
}

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
@RegisterClassEx(BaseTaxJurisdictionResolver, { skipNullKeyWarning: true })
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
        /** The product's `TaxCategory`. Null falls back to the Standard rate. */
        ProductTaxCategory: string | null;
        /** False short-circuits everything — an untaxable product owes nothing anywhere. */
        IsTaxable?: boolean;
        /** The SELLING company. Tax is only collected where this company has nexus. */
        CompanyID?: string | null;
        OrganizationID: string | null;
        PersonID: string | null;
        AsOf: Date;
    },
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<TaxResolutionResult> {
    // An untaxable product owes nothing anywhere — no point resolving jurisdictions for it.
    if (input.IsTaxable === false) {
        return { Layers: [], CombinedRate: 0, ExemptReason: 'the product is not taxable' };
    }

    const resolver =
        MJGlobal.Instance.ClassFactory.CreateInstance<BaseTaxJurisdictionResolver>(BaseTaxJurisdictionResolver) ??
        new DefaultTaxJurisdictionResolver();
    const jurisdictionIDs = await resolver.Resolve(input.Address, input.AsOf, provider, user);
    if (!jurisdictionIDs.length) return { Layers: [], CombinedRate: 0 };

    const rv = new RunView(provider as unknown as IRunViewProvider);

    // ── NEXUS GATE ────────────────────────────────────────────────────────────
    // Matching a jurisdiction says where the customer IS. It does not say we must collect there.
    // Tax is only owed where the SELLING company has an obligation, so jurisdictions we have no
    // nexus in are dropped before any rate is looked up — the commonest reason a correct system
    // charges nothing.
    const skippedForNoNexus: string[] = [];
    let eligible = jurisdictionIDs;
    if (input.CompanyID) {
        const nexus = await LoadNexusJurisdictions(input.CompanyID, input.AsOf, provider, user);
        eligible = jurisdictionIDs.filter((id) => nexus.has(norm(id)));
        for (const id of jurisdictionIDs) if (!nexus.has(norm(id))) skippedForNoNexus.push(id);
        if (!eligible.length) {
            return {
                Layers: [],
                CombinedRate: 0,
                ExemptReason: 'this company has no tax nexus in the destination jurisdictions',
                SkippedForNoNexus: skippedForNoNexus,
            };
        }
    }

    const quoted = eligible.map((id) => `'${id}'`).join(',');

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
    for (const jid of eligible) {
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
        ...(skippedForNoNexus.length ? { SkippedForNoNexus: skippedForNoNexus } : {}),
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

/**
 * The jurisdictions this company currently has an obligation to collect in.
 *
 * Honours BOTH dates on `CompanyTaxNexus`: a registration can have ended while the duty to collect
 * has not. Trailing nexus is real and asymmetric — California holds a seller through the nexus year
 * plus the whole following calendar year — so the obligation ends at
 * `max(RegisteredTo, ObligationEndsAt)`, and stopping at the earlier of the two would stop
 * collecting while still liable.
 */
export async function LoadNexusJurisdictions(
    companyID: string,
    asOf: Date,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<Set<string>> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const res = await rv.RunView<{
        TaxJurisdictionID: string;
        RegisteredFrom: Date;
        RegisteredTo: Date | null;
        ObligationEndsAt: Date | null;
    }>(
        {
            EntityName: COMPANY_TAX_NEXUS_ENTITY,
            ExtraFilter: `CompanyID = '${companyID}' AND Status = 'Active'`,
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );

    const at = asOf.getTime();
    const out = new Set<string>();
    for (const n of res?.Results ?? []) {
        if (n.RegisteredFrom && at < new Date(n.RegisteredFrom).getTime()) continue;
        const ends = [n.RegisteredTo, n.ObligationEndsAt]
            .filter(Boolean)
            .map((d) => new Date(d as Date).getTime());
        // No end date at all means open-ended. Otherwise the LATER of the two governs.
        if (ends.length && at > Math.max(...ends)) continue;
        out.add(norm(n.TaxJurisdictionID));
    }
    return out;
}

/** Tree-shaking anchor so the default jurisdiction resolver's registration survives bundling. */
export function LoadTaxResolver(): void {
    // intentionally empty
}

export { ACCOUNTING };
