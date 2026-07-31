/**
 * EntitlementEngine — turns a confirmed order into the grants it confers, and unwinds them on return.
 *
 * The server half of `EntitlementBehavior`: this finds the rows, that decides what they mean. Same
 * split as `PriceResolver`/`PricingBehavior`, for the same reason — the rules about quantity, validity
 * and timing are provable without a database, and only finding the templates needs one.
 *
 * BATCHED, NOT PER LINE. Every lookup here is one `RunView` across the whole order: the entitlement
 * templates, the products, the category ancestors, the event dates, the terms. A sixty-line order
 * would otherwise issue several hundred round trips inside the booking transaction, holding write
 * locks the entire time. The volume bundle confirms sixty-line orders precisely to make that visible.
 *
 * THE FAST PATH MATTERS. Most orders grant nothing at all — no product on them has a single
 * `ProductEntitlement` row. That case is one query and an early return, because entitlements must not
 * make ordinary orders slower.
 *
 * WHY GRANTS ARE WRITTEN INSIDE THE BOOKING TRANSACTION. Access and the receivable are the same
 * decision: an order that booked revenue but failed to grant access has charged for nothing, and one
 * that granted access without booking has given something away. All-or-none is the only coherent
 * option, which is also why a failure here rolls back the confirm rather than being logged.
 *
 * CONNECTS TO:
 *   PURE:   ./EntitlementBehavior.ts
 *   CALLER: OrderEntityServer.Save (after subscriptions materialize — terms drive validity)
 *   DOC:    plans/bizapps-orders-master.md D27, D76
 */
import {
    BaseEntity,
    CompositeKey,
    EntitySaveOptions,
    IMetadataProvider,
    IRunViewProvider,
    RunView,
    UserInfo,
} from '@memberjunction/core';
import {
    InitialGrantStatus,
    ReduceGrantForReturn,
    ResolveEntitlementPolicy,
    ResolveGrantQuantity,
    ResolveValidityWindow,
    type GrantTiming,
    type PolicyCategoryLevel,
    type QuantityMode,
    type ValidityMode,
} from './EntitlementBehavior.js';

const PRODUCT_ENTITLEMENT_ENTITY = 'MJ_BizApps_Orders: Product Entitlements';
const ENTITLEMENT_GRANT_ENTITY = 'MJ_BizApps_Orders: Entitlement Grants';
const PRODUCT_ENTITY = 'MJ_BizApps_Orders: Products';
const PRODUCT_CATEGORY_ENTITY = 'MJ_BizApps_Orders: Product Categories';
const PRODUCT_TYPE_ENTITY = 'MJ_BizApps_Orders: Product Types';
const EVENT_PRODUCT_ENTITY = 'MJ_BizApps_Orders: Event Products';
const SUBSCRIPTION_TERM_ENTITY = 'MJ_BizApps_Orders: Subscription Terms';

const key = (id: string | null | undefined): string => (id ?? '').toLowerCase();
const quote = (ids: string[]): string => [...new Set(ids.map((i) => `'${i}'`))].join(',');

/** The line facts grant creation needs. Deliberately structural, so a caller can pass anything shaped right. */
export interface GrantableLine {
    ID: string;
    ProductID: string;
    Quantity: number;
    /** Per-line ship-to doubles as WHO an intangible line is for (D61) — the natural beneficiary. */
    ShipToPersonID?: string | null;
    ShipToOrganizationID?: string | null;
}

/** The order facts. `Balance`/`TotalGross` decide whether an OnPaidInFull grant starts Active. */
export interface GrantableOrder {
    ID: string;
    OrderDate: Date;
    Balance: number | null;
    TotalGross: number | null;
    BillToPersonID?: string | null;
    BillToOrganizationID?: string | null;
}

/** What `materializeSubscriptions` already knows, passed in rather than re-queried. */
export interface TermForLine {
    ID: string;
    StartDate: Date;
    EndDate: Date;
}

export interface GrantOutcome {
    Created: number;
    /** Per grant, for the caller to log or assert on. */
    Grants: Array<{ ID: string; OrderLineID: string; Code: string; Status: string; ValidityModeApplied: ValidityMode }>;
}

/**
 * Create every grant this order's lines confer.
 *
 * A REVERSAL LINE GRANTS NOTHING. It unwinds a purchase, so running the grant path on it would hand
 * the customer access as a side effect of returning the thing that conferred it — the same class of
 * mistake as materializing a second subscription on a cancellation (D16).
 */
export async function CreateEntitlementGrants(
    order: GrantableOrder,
    lines: GrantableLine[],
    termsByLine: Map<string, TermForLine>,
    provider: IMetadataProvider,
    user: UserInfo,
    options?: EntitySaveOptions,
): Promise<GrantOutcome> {
    const out: GrantOutcome = { Created: 0, Grants: [] };

    // Reversal lines and anything with no positive quantity confer nothing.
    const grantable = lines.filter((l) => Number(l.Quantity ?? 0) > 0);
    if (!grantable.length) return out;

    const rv = new RunView(provider as unknown as IRunViewProvider);
    const productIDs = [...new Set(grantable.map((l) => l.ProductID))];

    // THE FAST PATH. One query, and most orders stop here.
    const templates = await rv.RunView<{
        ID: string;
        ProductID: string;
        EntitlementType: string;
        Code: string;
        Name: string | null;
        Quantity: number | null;
        ValidityMode: ValidityMode | null;
        ValidityDurationDays: number | null;
        AccessLeadHours: number | null;
        AccessLagHours: number | null;
        IsActive: boolean;
    }>(
        {
            EntityName: PRODUCT_ENTITLEMENT_ENTITY,
            ExtraFilter: `ProductID IN (${quote(productIDs)}) AND IsActive = 1`,
            ResultType: 'simple',
        },
        user,
    );
    const templateRows = templates?.Results ?? [];
    if (!templateRows.length) return out;

    const templatesByProduct = new Map<string, typeof templateRows>();
    for (const t of templateRows) {
        const list = templatesByProduct.get(key(t.ProductID)) ?? [];
        list.push(t);
        templatesByProduct.set(key(t.ProductID), list);
    }

    // Only the products that actually grant something need their policy resolved.
    const relevantProductIDs = productIDs.filter((id) => templatesByProduct.has(key(id)));
    const policy = await loadPolicyInputs(relevantProductIDs, provider, user);

    // Event dates, for EventWindow. One query for every event product on the order.
    const events = await rv.RunView<{ ID: string; EventStartsAt: Date; EventEndsAt: Date }>(
        {
            EntityName: EVENT_PRODUCT_ENTITY,
            ExtraFilter: `ID IN (${quote(relevantProductIDs)})`,
            ResultType: 'simple',
        },
        user,
    );
    const eventByProduct = new Map((events?.Results ?? []).map((e) => [key(e.ID), e]));

    // NORMALISE THE CALLER'S KEYS. `materializeSubscriptions` keys `TermsByLine` by the raw line ID
    // as SQL returned it — uppercase — and a lowercased lookup here found nothing, so EVERY
    // subscription grant fell back to Perpetual while looking entirely correct. The suite caught it
    // only because EN6 asserts `ValidityModeApplied` rather than just the dates.
    //
    // Re-keying here rather than asking the caller to change: a map that arrives with unknown casing
    // is the caller's business, and normalising on receipt cannot be forgotten by the next caller.
    const termsByLineKey = new Map<string, TermForLine>();
    for (const [lineID, term] of termsByLine) termsByLineKey.set(key(lineID), term);

    // Subscription IDs behind the terms, so a grant can point at both.
    const termIDs = [...termsByLineKey.values()].map((t) => t.ID);
    const subscriptionByTerm = new Map<string, string>();
    if (termIDs.length) {
        const terms = await rv.RunView<{ ID: string; SubscriptionID: string }>(
            {
                EntityName: SUBSCRIPTION_TERM_ENTITY,
                ExtraFilter: `ID IN (${quote(termIDs)})`,
                ResultType: 'simple',
            },
            user,
        );
        for (const t of terms?.Results ?? []) subscriptionByTerm.set(key(t.ID), t.SubscriptionID);
    }

    for (const line of grantable) {
        const forThisProduct = templatesByProduct.get(key(line.ProductID)) ?? [];
        if (!forThisProduct.length) continue;

        const inputs = policy.get(key(line.ProductID));
        if (!inputs) {
            // The product grants something but could not be read. Refusing beats granting on a guess:
            // an access decision made from defaults nobody configured is not a decision.
            throw new Error(
                `Order line for product ${line.ProductID} confers entitlements, but the product's ` +
                    `policy could not be resolved (its type or category tree could not be read). ` +
                    `Access is refused rather than granted on assumed defaults.`,
            );
        }

        const term = termsByLineKey.get(key(line.ID)) ?? null;

        for (const template of forThisProduct) {
            const resolved = ResolveEntitlementPolicy(
                inputs.Product,
                inputs.CategoryChain,
                inputs.Type,
                { ValidityMode: template.ValidityMode },
            );

            const event = eventByProduct.get(key(line.ProductID));
            const validity = ResolveValidityWindow(resolved.ValidityMode, {
                GrantedOn: order.OrderDate,
                DurationDays: template.ValidityDurationDays,
                EventStartsAt: event?.EventStartsAt ? new Date(event.EventStartsAt) : null,
                EventEndsAt: event?.EventEndsAt ? new Date(event.EventEndsAt) : null,
                AccessLeadHours: template.AccessLeadHours,
                AccessLagHours: template.AccessLagHours,
                TermStartDate: term ? new Date(term.StartDate) : null,
                TermEndDate: term ? new Date(term.EndDate) : null,
            });

            const grant = await provider.GetEntityObject<BaseEntity>(ENTITLEMENT_GRANT_ENTITY, user);
            grant.NewRecord();
            grant.Set('ProductEntitlementID', template.ID);
            grant.Set('OrderLineID', line.ID);
            if (term) {
                grant.Set('SubscriptionTermID', term.ID);
                const subID = subscriptionByTerm.get(key(term.ID));
                if (subID) grant.Set('SubscriptionID', subID);
            }

            // BENEFICIARY: the line's own ship-to first, because that is where 'who is this for'
            // lives (D61) — a seat bought for a named colleague, a ticket for an attendee, a gift for
            // a recipient. Only then the buyer.
            const person = line.ShipToPersonID ?? order.BillToPersonID ?? null;
            const organization = line.ShipToOrganizationID ?? order.BillToOrganizationID ?? null;
            if (person) grant.Set('BeneficiaryPersonID', person);
            if (organization) grant.Set('BeneficiaryOrganizationID', organization);

            grant.Set(
                'Quantity',
                ResolveGrantQuantity(template.Quantity, Number(line.Quantity ?? 0), resolved.QuantityMode),
            );
            grant.Set('ValidFrom', validity.ValidFrom);
            grant.Set('ValidTo', validity.ValidTo);
            grant.Set('ValidityModeApplied', validity.ModeApplied);
            const status = InitialGrantStatus(resolved.GrantTiming, order);
            grant.Set('Status', status);

            if (!(await grant.Save(options))) {
                throw new Error(
                    `Failed to grant entitlement '${template.Code}' for order line ${line.ID}: ` +
                        `${grant.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                );
            }

            out.Created++;
            out.Grants.push({
                ID: grant.Get('ID') as string,
                OrderLineID: line.ID,
                Code: template.Code,
                Status: status,
                ValidityModeApplied: validity.ModeApplied,
            });
        }
    }

    return out;
}

interface PolicyInputs {
    Product: {
        EntitlementGrantTiming: GrantTiming | null;
        EntitlementQuantityMode: QuantityMode | null;
        EntitlementValidityMode: ValidityMode | null;
    };
    CategoryChain: PolicyCategoryLevel[];
    Type: {
        DefaultEntitlementGrantTiming: GrantTiming;
        DefaultEntitlementQuantityMode: QuantityMode;
        DefaultEntitlementValidityMode: ValidityMode;
    };
}

/**
 * Load the policy chain for every relevant product, in a bounded number of queries.
 *
 * The category tree is walked BREADTH-FIRST across all products at once rather than depth-first per
 * product: one query per LEVEL of the deepest tree, not one per ancestor per product. A three-level
 * tree over forty products is three queries instead of a hundred and twenty.
 *
 * The depth cap is a cycle guard, not a modelling limit. `CK_ProductCategory_NoSelfParent` stops a
 * category being its own parent but nothing stops A→B→A, and an unbounded walk on that would hang
 * inside the booking transaction — the worst possible place.
 */
async function loadPolicyInputs(
    productIDs: string[],
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<Map<string, PolicyInputs>> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const out = new Map<string, PolicyInputs>();
    if (!productIDs.length) return out;

    const products = await rv.RunView<{
        ID: string;
        ProductTypeID: string;
        ProductCategoryID: string | null;
        EntitlementGrantTiming: GrantTiming | null;
        EntitlementQuantityMode: QuantityMode | null;
        EntitlementValidityMode: ValidityMode | null;
    }>(
        {
            EntityName: PRODUCT_ENTITY,
            ExtraFilter: `ID IN (${quote(productIDs)})`,
            ResultType: 'simple',
        },
        user,
    );
    const productRows = products?.Results ?? [];
    if (!productRows.length) return out;

    const types = await rv.RunView<{
        ID: string;
        DefaultEntitlementGrantTiming: GrantTiming;
        DefaultEntitlementQuantityMode: QuantityMode;
        DefaultEntitlementValidityMode: ValidityMode;
    }>(
        {
            EntityName: PRODUCT_TYPE_ENTITY,
            ExtraFilter: `ID IN (${quote(productRows.map((p) => p.ProductTypeID))})`,
            ResultType: 'simple',
        },
        user,
    );
    const typeByID = new Map((types?.Results ?? []).map((t) => [key(t.ID), t]));

    // Breadth-first up the tree, gathering every level in one query each.
    const categoryByID = new Map<string, PolicyCategoryLevel & { ParentProductCategoryID: string | null }>();
    let frontier = [...new Set(productRows.map((p) => p.ProductCategoryID).filter((c): c is string => !!c))];
    const MAX_DEPTH = 20;
    for (let depth = 0; depth < MAX_DEPTH && frontier.length; depth++) {
        const level = await rv.RunView<{
            ID: string;
            ParentProductCategoryID: string | null;
            DefaultEntitlementGrantTiming: GrantTiming | null;
            DefaultEntitlementQuantityMode: QuantityMode | null;
            DefaultEntitlementValidityMode: ValidityMode | null;
        }>(
            {
                EntityName: PRODUCT_CATEGORY_ENTITY,
                ExtraFilter: `ID IN (${quote(frontier)})`,
                ResultType: 'simple',
            },
            user,
        );
        const rows = level?.Results ?? [];
        if (!rows.length) break;
        for (const r of rows) {
            categoryByID.set(key(r.ID), {
                ID: r.ID,
                ParentProductCategoryID: r.ParentProductCategoryID,
                EntitlementGrantTiming: r.DefaultEntitlementGrantTiming,
                EntitlementQuantityMode: r.DefaultEntitlementQuantityMode,
                EntitlementValidityMode: r.DefaultEntitlementValidityMode,
            });
        }
        frontier = [
            ...new Set(
                rows
                    .map((r) => r.ParentProductCategoryID)
                    .filter((c): c is string => !!c && !categoryByID.has(key(c))),
            ),
        ];
    }

    for (const p of productRows) {
        const type = typeByID.get(key(p.ProductTypeID));
        if (!type) continue; // caller refuses — see CreateEntitlementGrants

        // NEAREST FIRST, and stop on a repeat: a cyclic tree must not loop forever.
        const chain: PolicyCategoryLevel[] = [];
        const seen = new Set<string>();
        let cursor = p.ProductCategoryID;
        while (cursor && !seen.has(key(cursor)) && chain.length < MAX_DEPTH) {
            seen.add(key(cursor));
            const cat = categoryByID.get(key(cursor));
            if (!cat) break;
            chain.push({
                ID: cat.ID,
                EntitlementGrantTiming: cat.EntitlementGrantTiming,
                EntitlementQuantityMode: cat.EntitlementQuantityMode,
                EntitlementValidityMode: cat.EntitlementValidityMode,
            });
            cursor = cat.ParentProductCategoryID;
        }

        out.set(key(p.ID), {
            Product: {
                EntitlementGrantTiming: p.EntitlementGrantTiming,
                EntitlementQuantityMode: p.EntitlementQuantityMode,
                EntitlementValidityMode: p.EntitlementValidityMode,
            },
            CategoryChain: chain,
            Type: type,
        });
    }

    return out;
}

/**
 * Unwind the grants a returned line conferred.
 *
 * A full return REVOKES; a partial return reduces the quantity proportionally. Revocation stamps
 * `RevokedAt` and a reason, because "this grant is revoked" with no record of when or why is exactly
 * the shape that makes an access dispute unanswerable — and the database CHECK enforces the pairing.
 *
 * Uncountable grants (a Feature, an AccessLevel) survive a partial return: the customer still holds
 * some of the thing that conferred it. Only sending all of it back takes the feature away.
 */
export async function RevokeGrantsForReturn(
    originOrderLineID: string,
    originQuantity: number,
    returnedQuantity: number,
    reason: string,
    provider: IMetadataProvider,
    user: UserInfo,
    options?: EntitySaveOptions,
): Promise<{ Revoked: number; Reduced: number }> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const grants = await rv.RunView<{ ID: string; Quantity: number | null; Status: string }>(
        {
            EntityName: ENTITLEMENT_GRANT_ENTITY,
            ExtraFilter: `OrderLineID = '${originOrderLineID}' AND Status IN ('Active','Suspended')`,
            ResultType: 'simple',
        },
        user,
    );

    let revoked = 0;
    let reduced = 0;
    for (const row of grants?.Results ?? []) {
        const decision = ReduceGrantForReturn(row.Quantity, originQuantity, returnedQuantity);
        // `GetEntityObject` with a CompositeKey loads it — the house idiom, same as
        // CancelSubscriptionOperation. There is no `Load(id)` on BaseEntity.
        const grant = await provider.GetEntityObject<BaseEntity>(
            ENTITLEMENT_GRANT_ENTITY,
            CompositeKey.FromID(row.ID),
            user,
        );

        if (decision.Revoke) {
            grant.Set('Status', 'Revoked');
            grant.Set('RevokedAt', new Date());
            grant.Set('RevocationReason', reason);
            revoked++;
        } else {
            if (decision.Quantity === row.Quantity) continue; // nothing to change
            grant.Set('Quantity', decision.Quantity);
            reduced++;
        }

        if (!(await grant.Save(options))) {
            throw new Error(
                `Failed to unwind entitlement grant ${row.ID} for the returned line: ` +
                    `${grant.LatestResult?.CompleteMessage ?? 'unknown error'}`,
            );
        }
    }

    return { Revoked: revoked, Reduced: reduced };
}
