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
 *   DOC:    plans/archive/bizapps-orders-master.md D27, D76
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
import { LoadOrdersEngine, OrdersEngine, mjBizAppsOrdersEntitlementGrantEntity } from '@mj-biz-apps/orders-entities';
import {
    DecideGrantStatus,
    ReduceGrantForReturn,
    ResolveEntitlementPolicy,
    ResolveGrantQuantity,
    ResolveValidityWindow,
    ShouldRevokeGrantsOnCancel,
    TemplateAppliesToLineChoices,
    type LineChoiceKey,
    type GrantTiming,
    type OrderPaymentFacts,
    type PolicyCategoryLevel,
    type QuantityMode,
    type ValidityMode,
} from './EntitlementBehavior.js';
import { ResolveLineParty, type LineParty } from './LineParty.js';
import { RequireUUID } from './sql-guards.js';
import { OrdersSettings } from './OrdersSettings.js';
import { BusinessTimeZoneEngine } from '@mj-biz-apps/common-entities';
import { TermDayEnd } from './TermGrantWindow.js';

const PRODUCT_ENTITLEMENT_ENTITY = 'MJ_BizApps_Orders: Product Entitlements';
const ENTITLEMENT_GRANT_ENTITY = 'MJ_BizApps_Orders: Entitlement Grants';
const EVENT_PRODUCT_ENTITY = 'MJ_BizApps_Orders: Event Products';
const SUBSCRIPTION_TERM_ENTITY = 'MJ_BizApps_Orders: Subscription Terms';
const SUBSCRIPTION_ENTITY = 'MJ_BizApps_Orders: Subscriptions';
const ORDER_LINE_CHOICE_ENTITY = 'MJ_BizApps_Orders: Order Line Choices';

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
    /** Set on a renewal line. An `OnFirstPayment` renewal starts Active; a new purchase waits for cash. */
    RenewsSubscriptionID?: string | null;
    /**
     * The options the buyer chose for this line (Order Line Choices), which decide the conditional
     * entitlements. Undefined means "not known here": they are read from the database, and only
     * when a template on the order is conditional.
     */
    Choices?: ReadonlyArray<LineChoiceKey>;
}

/** The order facts. `Payment` decides whether a payment-gated grant starts Active. */
export interface GrantableOrder {
    ID: string;
    OrderDate: Date;
    /** From `PaymentGatedAccess.LoadOrderPaymentFacts`, read after the confirm's own payment landed. */
    Payment: OrderPaymentFacts;
    /** Who a line naming no ship-to is for: the order's ship-to, then its bill-to (`ResolveLineParty`). */
    ShipToPersonID?: string | null;
    ShipToOrganizationID?: string | null;
    BillToPersonID?: string | null;
    BillToOrganizationID?: string | null;
}

/** What `materializeSubscriptions` already knows, passed in rather than re-queried. */
export interface TermForLine {
    ID: string;
    StartDate: Date;
    EndDate: Date;
    /** Seats the term covers (`SubscriptionTerm.Quantity`), before proration (#589). */
    Quantity: number;
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
    /**
     * The term or terms each subscription line bought. A line that states an end past its first term
     * bought several (golive #338); a grant that follows the term is written once per term, so
     * extending, shifting or cancelling one term moves the access that term gave.
     */
    termsByLine: Map<string, TermForLine | readonly TermForLine[]>,
    provider: IMetadataProvider,
    user: UserInfo,
    options?: EntitySaveOptions,
): Promise<GrantOutcome> {
    const out: GrantOutcome = { Created: 0, Grants: [] };
    await OrdersSettings.Load(provider, user);
    const cutoffDaysPastDue = OrdersSettings.RenewalAccessCutoffDaysPastDue;
    // A term-following grant covers each of its term's days in full, in the business zone.
    await BusinessTimeZoneEngine.Instance.Config(false, user, provider);
    const zone = BusinessTimeZoneEngine.Instance.Zone;

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
        ChoiceGroupKey: string | null;
        ChoiceOptionValue: string | null;
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

    const choicesByLine = await loadLineChoices(grantable, templateRows, rv, user);

    // NORMALISE THE CALLER'S KEYS. `materializeSubscriptions` keys `TermsByLine` by the raw line ID
    // as SQL returned it — uppercase — and a lowercased lookup here found nothing, so EVERY
    // subscription grant fell back to Perpetual while looking entirely correct. The suite caught it
    // only because EN6 asserts `ValidityModeApplied` rather than just the dates.
    //
    // Re-keying here rather than asking the caller to change: a map that arrives with unknown casing
    // is the caller's business, and normalising on receipt cannot be forgotten by the next caller.
    const termsByLineKey = new Map<string, readonly TermForLine[]>();
    for (const [lineID, terms] of termsByLine) termsByLineKey.set(key(lineID), Array.isArray(terms) ? terms : [terms as TermForLine]);

    // Subscription IDs behind the terms, so a grant can point at both.
    const termIDs = [...termsByLineKey.values()].flat().map((t) => t.ID);
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

    // The holders of those subscriptions. A subscription line's access goes to whoever holds the
    // subscription, read from the row itself: the holder is not always the line's ship-to fallback,
    // because a renewal keeps its target's holder (D61) and a blank organization may have been
    // filled in from the person's affiliation (D64). Granting from the fallback instead would give
    // the access to a different party than the subscription it belongs to (#622).
    const holderBySubscription = new Map<string, LineParty>();
    const subscriptionIDs = [...subscriptionByTerm.values()];
    if (subscriptionIDs.length) {
        const subs = await rv.RunView<{ ID: string; HolderOrganizationID: string | null; BeneficiaryPersonID: string | null }>(
            {
                EntityName: SUBSCRIPTION_ENTITY,
                ExtraFilter: `ID IN (${quote(subscriptionIDs)})`,
                Fields: ['ID', 'HolderOrganizationID', 'BeneficiaryPersonID'],
                ResultType: 'simple',
            },
            user,
        );
        for (const sub of subs?.Results ?? []) {
            holderBySubscription.set(key(sub.ID), {
                OrganizationID: sub.HolderOrganizationID ?? null,
                PersonID: sub.BeneficiaryPersonID ?? null,
            });
        }
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

        const lineTerms = termsByLineKey.get(key(line.ID)) ?? [];

        for (const template of forThisProduct) {
            if (!TemplateAppliesToLineChoices(template, choicesByLine.get(key(line.ID)) ?? [])) continue;

            const resolved = ResolveEntitlementPolicy(
                inputs.Product,
                inputs.CategoryChain,
                inputs.Type,
                { ValidityMode: template.ValidityMode },
            );

            // One grant per term when it follows the term; any other validity is the line's, once.
            const grantTerms: Array<TermForLine | null> =
                resolved.ValidityMode === 'SubscriptionTerm' && lineTerms.length > 1 ? [...lineTerms] : [lineTerms[0] ?? null];
            for (const term of grantTerms) {
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
                    BusinessZone: zone,
                });

                const grant = await provider.GetEntityObject<mjBizAppsOrdersEntitlementGrantEntity>(ENTITLEMENT_GRANT_ENTITY, user);
                grant.NewRecord();
                grant.ProductEntitlementID = template.ID;
                grant.OrderLineID = line.ID;
                const subID = term ? subscriptionByTerm.get(key(term.ID)) : undefined;
                if (term) {
                    grant.SubscriptionTermID = term.ID;
                    if (subID) grant.SubscriptionID = subID;
                }

                // BENEFICIARY: the subscription's holder when the grant belongs to one, so access and
                // the subscription never name different parties. Otherwise the line's own ship-to,
                // because that is where 'who is this for' lives (D61) — a seat bought for a named
                // colleague, a ticket for an attendee — then the order's ship-to, then the buyer.
                const beneficiary = (subID && holderBySubscription.get(key(subID))) || ResolveLineParty(line, order);
                if (beneficiary.PersonID) grant.BeneficiaryPersonID = beneficiary.PersonID;
                if (beneficiary.OrganizationID) grant.BeneficiaryOrganizationID = beneficiary.OrganizationID;

                // A subscription line's seats come from its term: the line's own quantity is prorated
                // by now, so 10 seats over a half-length first period would grant 5 (#589).
                grant.Quantity = ResolveGrantQuantity(
                    template.Quantity,
                    term ? term.Quantity : Number(line.Quantity ?? 0),
                    resolved.QuantityMode,
                );
                grant.ValidFrom = validity.ValidFrom;
                grant.ValidTo = validity.ValidTo;
                grant.ValidityModeApplied = validity.ModeApplied;
                const decision = DecideGrantStatus(
                    resolved.GrantTiming,
                    !!line.RenewsSubscriptionID,
                    order.Payment,
                    cutoffDaysPastDue,
                );
                const status = decision.Status;
                grant.Status = status;
                // Recorded so the grant can be re-decided later under the rule it was written under,
                // whatever the catalog says by then (PaymentGatedAccess).
                grant.GrantTimingApplied = resolved.GrantTiming;
                grant.SuspensionReason = decision.Reason;
                grant.SuspendedAt = status === 'Suspended' ? new Date() : null;

                if (!(await grant.Save(options))) {
                    throw new Error(
                        `Failed to grant entitlement '${template.Code}' for order line ${line.ID}: ` +
                            `${grant.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                    );
                }

                out.Created++;
                out.Grants.push({
                    ID: grant.ID,
                    OrderLineID: line.ID,
                    Code: template.Code,
                    Status: status,
                    ValidityModeApplied: validity.ModeApplied,
                });
            }
        }
    }

    return out;
}

/**
 * The chosen options of every line that could meet a conditional template, keyed by line.
 *
 * A caller that holds the line's choices in memory passes them — a checkout or a renewal adds them
 * to the line in the same graph as the confirm, so they are the truth even before they commit. Only
 * lines that arrive without them are read, and only when some template on the order is conditional:
 * an order of unconditional products pays nothing for this.
 */
async function loadLineChoices(
    lines: GrantableLine[],
    templates: ReadonlyArray<{ ProductID: string; ChoiceGroupKey: string | null }>,
    rv: RunView,
    user: UserInfo,
): Promise<Map<string, ReadonlyArray<LineChoiceKey>>> {
    const out = new Map<string, ReadonlyArray<LineChoiceKey>>();
    const conditionalProducts = new Set(templates.filter((t) => t.ChoiceGroupKey).map((t) => key(t.ProductID)));
    if (!conditionalProducts.size) return out;

    const unknown: string[] = [];
    for (const line of lines) {
        if (!conditionalProducts.has(key(line.ProductID))) continue;
        if (line.Choices) out.set(key(line.ID), line.Choices);
        else unknown.push(line.ID);
    }
    if (!unknown.length) return out;

    const rows = await rv.RunView<{ OrderLineID: string; GroupKey: string; OptionValue: string }>(
        {
            EntityName: ORDER_LINE_CHOICE_ENTITY,
            ExtraFilter: `OrderLineID IN (${quote(unknown)})`,
            Fields: ['OrderLineID', 'GroupKey', 'OptionValue'],
            ResultType: 'simple',
        },
        user,
    );
    for (const id of unknown) out.set(key(id), []);
    for (const r of rows?.Results ?? []) {
        (out.get(key(r.OrderLineID)) as LineChoiceKey[]).push({ GroupKey: r.GroupKey, OptionValue: r.OptionValue });
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

    await LoadOrdersEngine(provider, user);
    const productRows = productIDs
        .map((id) => OrdersEngine.Instance.ProductByID(id))
        .filter((p): p is NonNullable<typeof p> => !!p);
    if (!productRows.length) return out;

    const typeByID = new Map(
        productRows.map((p) => {
            const t = OrdersEngine.Instance.ProductTypeByID(p.ProductTypeID);
            return [
                key(p.ProductTypeID),
                t
                    ? {
                          ID: t.ID,
                          DefaultEntitlementGrantTiming: t.DefaultEntitlementGrantTiming as GrantTiming,
                          DefaultEntitlementQuantityMode: t.DefaultEntitlementQuantityMode as QuantityMode,
                          DefaultEntitlementValidityMode: t.DefaultEntitlementValidityMode as ValidityMode,
                      }
                    : undefined,
            ] as const;
        }).filter((entry): entry is readonly [string, NonNullable<(typeof entry)[1]>] => !!entry[1]),
    );

    const categoryByID = new Map<string, PolicyCategoryLevel & { ParentProductCategoryID: string | null }>();
    const seenCats = new Set<string>();
    for (const p of productRows) {
        for (const catID of OrdersEngine.Instance.CategoryChain(p.ProductCategoryID)) {
            if (seenCats.has(key(catID))) continue;
            seenCats.add(key(catID));
            const cat = OrdersEngine.Instance.ProductCategoryByID(catID);
            if (!cat) continue;
            categoryByID.set(key(cat.ID), {
                ID: cat.ID,
                ParentProductCategoryID: cat.ParentProductCategoryID ?? null,
                EntitlementGrantTiming: cat.DefaultEntitlementGrantTiming as GrantTiming | null,
                EntitlementQuantityMode: cat.DefaultEntitlementQuantityMode as QuantityMode | null,
                EntitlementValidityMode: cat.DefaultEntitlementValidityMode as ValidityMode | null,
            });
        }
    }

    for (const p of productRows) {
        const type = typeByID.get(key(p.ProductTypeID));
        if (!type) continue; // caller refuses — see CreateEntitlementGrants

        // NEAREST FIRST, and stop on a repeat: a cyclic tree must not loop forever.
        const chain: PolicyCategoryLevel[] = [];
        const seen = new Set<string>();
        let cursor = p.ProductCategoryID;
        while (cursor && !seen.has(key(cursor)) && chain.length < 20) {
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
        // CancelSubscriptionOperation.
        const grant = await provider.GetEntityObject<mjBizAppsOrdersEntitlementGrantEntity>(
            ENTITLEMENT_GRANT_ENTITY,
            CompositeKey.FromID(row.ID),
            user,
        );

        if (decision.Revoke) {
            grant.Status = 'Revoked';
            grant.RevokedAt = new Date();
            grant.RevocationReason = reason;
            revoked++;
        } else {
            if (decision.Quantity === row.Quantity) continue; // nothing to change
            grant.Quantity = decision.Quantity;
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

/**
 * A term's seat count changed: its live grants follow the new count (#686).
 *
 * An approved Seats concession adds seats to a booked term. A `PerUnit` grant scales by the term's
 * seats, so it is recomputed from its template the same way `CreateEntitlementGrants` computed it;
 * a `Flat` grant and a grant with no countable quantity stay as they are. Revoked and expired grants
 * are history and are left alone.
 */
export async function ResizeTermGrants(
    termID: string,
    productID: string,
    seats: number,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<{ Resized: number }> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const grants = await rv.RunView<{ ID: string; ProductEntitlementID: string; Quantity: number | null }>(
        {
            EntityName: ENTITLEMENT_GRANT_ENTITY,
            ExtraFilter: `SubscriptionTermID = '${RequireUUID(termID, 'SubscriptionTermID')}' AND Status IN ('Active','Suspended')`,
            Fields: ['ID', 'ProductEntitlementID', 'Quantity'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    const rows = grants?.Results ?? [];
    if (!rows.length) return { Resized: 0 };

    const templates = await rv.RunView<{ ID: string; Quantity: number | null; ValidityMode: ValidityMode | null }>(
        {
            EntityName: PRODUCT_ENTITLEMENT_ENTITY,
            ExtraFilter: `ID IN (${quote([...new Set(rows.map((g) => g.ProductEntitlementID))])})`,
            Fields: ['ID', 'Quantity', 'ValidityMode'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    const templateByID = new Map((templates?.Results ?? []).map((t) => [key(t.ID), t]));

    const inputs = (await loadPolicyInputs([productID], provider, user)).get(key(productID));
    if (!inputs) {
        throw new Error(
            `The grants of term ${termID} follow its seats, but the policy of product ${productID} could not be ` +
                `resolved, so they cannot be resized.`,
        );
    }

    let resized = 0;
    for (const row of rows) {
        const template = templateByID.get(key(row.ProductEntitlementID));
        if (!template) continue;
        const mode = ResolveEntitlementPolicy(inputs.Product, inputs.CategoryChain, inputs.Type, {
            ValidityMode: template.ValidityMode,
        }).QuantityMode;
        const quantity = ResolveGrantQuantity(template.Quantity, seats, mode);
        if (quantity === (row.Quantity == null ? null : Number(row.Quantity))) continue;

        const grant = await provider.GetEntityObject<mjBizAppsOrdersEntitlementGrantEntity>(
            ENTITLEMENT_GRANT_ENTITY,
            CompositeKey.FromID(row.ID),
            user,
        );
        grant.Quantity = quantity;
        if (!(await grant.Save())) {
            throw new Error(
                `Entitlement grant ${row.ID} could not be resized to the term's ${seats} seats: ` +
                    `${grant.LatestResult?.CompleteMessage ?? 'unknown error'}`,
            );
        }
        resized++;
    }
    return { Resized: resized };
}

/**
 * After a subscription cancel, make the stored grants tell the truth.
 *
 * Access-through already passed (an immediate cancel, no remaining grace) REVOKES, with a reason.
 *
 * Access-through in the future (end of term, a grace period, a cancel cut short at a billing boundary)
 * leaves the rows `Active` and MOVES THEIR END to it: through 00:00 business time on the day after the
 * access-through day (`TermDayEnd`), the instant `EvaluateGrantAccess` already reads from
 * `subscription.EndDate`. Before, the rows kept their old end, so a downstream copy that follows the
 * grant (the Learning Hub, through `GrantStatusChanged`) ended access on a different day from Orders:
 * earlier with a grace period, later when the cancel cut the term short. Each moved grant records the
 * date change as an outbound event (`EntitlementGrantEntityServer`).
 *
 * A grant that starts at or after the new end (a later term, which begins exactly where the cancelled
 * one's coverage ends) is left as it is: it never comes into force, and an end at or before its start
 * would be an empty window, or refused by the database.
 */
export async function RevokeGrantsForCanceledSubscription(
    subscriptionID: string,
    accessThroughDate: Date,
    reason: string,
    provider: IMetadataProvider,
    user: UserInfo,
    options?: EntitySaveOptions,
    now: Date = new Date(),
): Promise<{ Revoked: number; LeftStanding: number; EndMoved: number }> {
    const id = RequireUUID(subscriptionID, 'SubscriptionID');
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const grants = await rv.RunView<{ ID: string; Status: string }>(
        {
            EntityName: ENTITLEMENT_GRANT_ENTITY,
            ExtraFilter: `SubscriptionID = '${id}' AND Status IN ('Active','Suspended')`,
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    const rows = grants?.Results ?? [];
    if (!rows.length) return { Revoked: 0, LeftStanding: 0, EndMoved: 0 };

    if (!ShouldRevokeGrantsOnCancel(accessThroughDate, now)) {
        await BusinessTimeZoneEngine.Instance.Config(false, user, provider);
        const accessEnds = TermDayEnd(accessThroughDate, BusinessTimeZoneEngine.Instance.Zone);
        let moved = 0;
        for (const row of rows) {
            const grant = await provider.GetEntityObject<mjBizAppsOrdersEntitlementGrantEntity>(
                ENTITLEMENT_GRANT_ENTITY,
                CompositeKey.FromID(row.ID),
                user,
            );
            // Starting at or after the end, it never comes into force (a later term begins exactly where the
            // cancelled one's coverage ends): leave it, rather than write an empty window and send an event.
            const startsAfter = grant.ValidFrom != null && new Date(grant.ValidFrom).getTime() >= accessEnds.getTime();
            const alreadyThere = grant.ValidTo != null && new Date(grant.ValidTo).getTime() === accessEnds.getTime();
            if (startsAfter || alreadyThere) continue;
            grant.ValidTo = accessEnds;
            if (!(await grant.Save(options))) {
                throw new Error(
                    `Failed to move entitlement grant ${row.ID}'s end to the cancel's access-through: ` +
                        `${grant.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                );
            }
            moved++;
        }
        return { Revoked: 0, LeftStanding: rows.length, EndMoved: moved };
    }

    let revoked = 0;
    for (const row of rows) {
        const grant = await provider.GetEntityObject<mjBizAppsOrdersEntitlementGrantEntity>(
            ENTITLEMENT_GRANT_ENTITY,
            CompositeKey.FromID(row.ID),
            user,
        );
        grant.Status = 'Revoked';
        grant.RevokedAt = now;
        grant.RevocationReason = reason;
        if (!(await grant.Save(options))) {
            throw new Error(
                `Failed to revoke entitlement grant ${row.ID} after subscription cancel: ` +
                    `${grant.LatestResult?.CompleteMessage ?? 'unknown error'}`,
            );
        }
        revoked++;
    }
    return { Revoked: revoked, LeftStanding: 0, EndMoved: 0 };
}
