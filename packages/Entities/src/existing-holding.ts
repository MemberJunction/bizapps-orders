/**
 * @fileoverview "The customer already holds this product" — the lookup behind the extend-or-new
 * question on a subscription line (golive #299, #318).
 *
 * At confirm, a subscription line whose subscriber already holds a live subscription to the product
 * follows the type's `ConcurrencyMode`, and under `ExtendExisting` it becomes the next term and
 * starts the day after current coverage ends, whatever start the line states. A line can answer the
 * question itself through `OrderLine.SubscriptionAction`. These helpers find the lines that should be
 * asked, so every surface that edits or confirms an order (the order screen, a deal's line editor, a
 * deal's close) asks the same question about the same lines.
 *
 * Browser-safe: `RunView` only, so the screen and a server-side refusal read the same rows.
 *
 * @module @mj-biz-apps/orders-entities
 */
import { RunView, type IRunViewProvider, type UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import type {
    mjBizAppsOrdersOrderHeaderEntity,
    mjBizAppsOrdersOrderLineEntity,
} from './generated/entity_subclasses';

const UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const SUBSCRIPTION_ENTITY = 'MJ_BizApps_Orders: Subscriptions';
const SUBSCRIPTION_TERM_ENTITY = 'MJ_BizApps_Orders: Subscription Terms';
const PRODUCT_ENTITY = 'MJ_BizApps_Orders: Products';

/** A live subscription the subscriber already holds for a product, with where its coverage ends. */
export interface ExistingHolding {
    SubscriptionID: string;
    SubscriptionNumber: string;
    Status: string;
    /** End of the LATEST coverage term — not `Subscription.EndDate`, which is the final service date. */
    LatestTermEnd: Date | null;
}

/** Who a line's subscription would be for. */
export interface HoldingSubscriber {
    OrganizationID: string | null;
    PersonID: string | null;
}

/** The line fields the question reads. */
export type HoldingLine = Pick<
    mjBizAppsOrdersOrderLineEntity,
    'ID' | 'LineNumber' | 'ProductID' | 'ShipToOrganizationID' | 'ShipToPersonID' | 'RenewsSubscriptionID' | 'SubscriptionAction'
>;

/** The order fields the question reads. */
export type HoldingOrder = Pick<
    mjBizAppsOrdersOrderHeaderEntity,
    'ShipToOrganizationID' | 'ShipToPersonID' | 'BillToOrganizationID' | 'BillToPersonID'
>;

/** A subscription line that has not answered extend-or-new although its subscriber holds the product. */
export interface UnansweredHeldLine {
    LineID: string;
    LineNumber: number;
    ProductID: string;
    Holding: ExistingHolding;
}

/**
 * Who the line is for, resolved the way the server does: the line's ship-to, then the order's
 * ship-to, then its bill-to. Null when the line names nobody.
 */
export function HoldingSubscriberFor(line: HoldingLine, order: HoldingOrder | null): HoldingSubscriber | null {
    const org = line.ShipToOrganizationID ?? order?.ShipToOrganizationID ?? order?.BillToOrganizationID ?? null;
    const person = line.ShipToPersonID ?? order?.ShipToPersonID ?? order?.BillToPersonID ?? null;
    if (!org && !person) return null;
    return { OrganizationID: org, PersonID: person };
}

/**
 * The live (`Active`/`Trialing`) subscription to `productID` held by this organization or naming
 * this person, newest first, or null.
 *
 * Broader than the server's duplicate test, which keys on the type's `BenefitModel`: matching on
 * either side means a caller may ask about a subscription the server would not extend, never the
 * reverse. Asking when it did not need to costs a click; not asking when it did is the silent date
 * change this exists to prevent. The line's answer is still applied by the server's own rules.
 *
 * Throws when a read fails. A failed read that returned null would read as "holds nothing", which is
 * the one answer that lets a confirm move a line's dates without asking.
 */
export async function FindExistingHolding(
    productID: string,
    subscriber: HoldingSubscriber,
    provider?: IRunViewProvider,
    user?: UserInfo,
): Promise<ExistingHolding | null> {
    if (!UUID_PATTERN.test(productID)) return null;
    const holder = [
        subscriber.OrganizationID && UUID_PATTERN.test(subscriber.OrganizationID)
            ? `HolderOrganizationID = '${subscriber.OrganizationID}'`
            : '',
        subscriber.PersonID && UUID_PATTERN.test(subscriber.PersonID) ? `BeneficiaryPersonID = '${subscriber.PersonID}'` : '',
    ].filter(Boolean);
    if (holder.length === 0) return null;

    const rv = new RunView(provider);
    const subs = await rv.RunView<{ ID: string; SubscriptionNumber: string; Status: string }>(
        {
            EntityName: SUBSCRIPTION_ENTITY,
            ExtraFilter: `ProductID = '${productID}' AND Status IN ('Active', 'Trialing') AND (${holder.join(' OR ')})`,
            OrderBy: '__mj_CreatedAt DESC',
            MaxRows: 1,
            Fields: ['ID', 'SubscriptionNumber', 'Status'],
            ResultType: 'simple',
        },
        user,
    );
    if (!subs.Success) {
        throw new Error(`Could not read existing subscriptions for product ${productID}: ${subs.ErrorMessage}`);
    }
    const sub = subs.Results[0];
    if (!sub) return null;

    // Newest term first, one row: the same ordering the server reads, so the two agree about which
    // term is "latest" even for a subscription whose terms were not written in order.
    const terms = await rv.RunView<{ EndDate: Date | string | null }>(
        {
            EntityName: SUBSCRIPTION_TERM_ENTITY,
            ExtraFilter: `SubscriptionID = '${sub.ID}'`,
            OrderBy: 'TermNumber DESC',
            MaxRows: 1,
            Fields: ['EndDate'],
            ResultType: 'simple',
        },
        user,
    );
    if (!terms.Success) {
        throw new Error(`Could not read the terms of subscription ${sub.SubscriptionNumber}: ${terms.ErrorMessage}`);
    }
    const end = terms.Results[0]?.EndDate ?? null;
    return {
        SubscriptionID: sub.ID,
        SubscriptionNumber: sub.SubscriptionNumber,
        Status: sub.Status,
        LatestTermEnd: end === null ? null : end instanceof Date ? end : new Date(end),
    };
}

/**
 * The lines a confirm would decide for the user: subscription lines with no `SubscriptionAction`,
 * no renewal target, and a subscriber who already holds the product.
 *
 * Renewal lines are left out: they name the subscription they continue. Lines are returned in the
 * order given. Three reads whatever the line count: products, then the candidate subscriptions,
 * then their terms.
 */
export async function FindUnansweredHeldLines(
    order: HoldingOrder | null,
    lines: readonly HoldingLine[],
    provider?: IRunViewProvider,
    user?: UserInfo,
): Promise<UnansweredHeldLine[]> {
    const rv = new RunView(provider);
    const asked = await subscriptionLinesToAsk(rv, order, lines, user);
    if (asked.length === 0) return [];

    const subs = await liveSubscriptionsFor(rv, asked, user);
    if (subs.length === 0) return [];
    const termEnds = await latestTermEnds(rv, subs.map((s) => s.ID), user);

    const found: UnansweredHeldLine[] = [];
    for (const { Line, Subscriber } of asked) {
        // Newest first, as `FindExistingHolding` reads it.
        const sub = subs.find(
            (s) =>
                UUIDsEqual(s.ProductID, Line.ProductID) &&
                ((!!Subscriber.OrganizationID && UUIDsEqual(s.HolderOrganizationID, Subscriber.OrganizationID)) ||
                    (!!Subscriber.PersonID && UUIDsEqual(s.BeneficiaryPersonID, Subscriber.PersonID))),
        );
        if (!sub) continue;
        found.push({
            LineID: Line.ID,
            LineNumber: Line.LineNumber,
            ProductID: Line.ProductID,
            Holding: {
                SubscriptionID: sub.ID,
                SubscriptionNumber: sub.SubscriptionNumber,
                Status: sub.Status,
                LatestTermEnd: termEnds.get(sub.ID.toLowerCase()) ?? null,
            },
        });
    }
    return found;
}

interface AskedLine {
    Line: HoldingLine;
    Subscriber: HoldingSubscriber;
}

interface SubscriptionRow {
    ID: string;
    SubscriptionNumber: string;
    Status: string;
    ProductID: string;
    HolderOrganizationID: string | null;
    BeneficiaryPersonID: string | null;
}

/** Unanswered, non-renewal lines for a subscription product that name a subscriber. */
async function subscriptionLinesToAsk(
    rv: RunView,
    order: HoldingOrder | null,
    lines: readonly HoldingLine[],
    user?: UserInfo,
): Promise<AskedLine[]> {
    const open = lines.filter((l) => !l.SubscriptionAction && !l.RenewsSubscriptionID && UUID_PATTERN.test(l.ProductID ?? ''));
    if (open.length === 0) return [];

    const products = await rv.RunView<{ ID: string; SubscriptionTypeID: string | null }>(
        {
            EntityName: PRODUCT_ENTITY,
            ExtraFilter: `ID IN (${inList(open.map((l) => l.ProductID))})`,
            Fields: ['ID', 'SubscriptionTypeID'],
            ResultType: 'simple',
        },
        user,
    );
    if (!products.Success) {
        throw new Error(`Could not read the products on the order: ${products.ErrorMessage}`);
    }

    const asked: AskedLine[] = [];
    for (const line of open) {
        const isSubscription = products.Results.some((p) => UUIDsEqual(p.ID, line.ProductID) && !!p.SubscriptionTypeID);
        const subscriber = isSubscription ? HoldingSubscriberFor(line, order) : null;
        if (subscriber) asked.push({ Line: line, Subscriber: subscriber });
    }
    return asked;
}

/** Live subscriptions to any asked product held by any asked subscriber, newest first. */
async function liveSubscriptionsFor(rv: RunView, asked: readonly AskedLine[], user?: UserInfo): Promise<SubscriptionRow[]> {
    const orgs = asked.map((a) => a.Subscriber.OrganizationID).filter((id): id is string => !!id && UUID_PATTERN.test(id));
    const people = asked.map((a) => a.Subscriber.PersonID).filter((id): id is string => !!id && UUID_PATTERN.test(id));
    const holder = [
        orgs.length ? `HolderOrganizationID IN (${inList(orgs)})` : '',
        people.length ? `BeneficiaryPersonID IN (${inList(people)})` : '',
    ].filter(Boolean);
    if (holder.length === 0) return [];

    const subs = await rv.RunView<SubscriptionRow>(
        {
            EntityName: SUBSCRIPTION_ENTITY,
            ExtraFilter:
                `ProductID IN (${inList(asked.map((a) => a.Line.ProductID))}) AND Status IN ('Active', 'Trialing') ` +
                `AND (${holder.join(' OR ')})`,
            OrderBy: '__mj_CreatedAt DESC',
            Fields: ['ID', 'SubscriptionNumber', 'Status', 'ProductID', 'HolderOrganizationID', 'BeneficiaryPersonID'],
            ResultType: 'simple',
        },
        user,
    );
    if (!subs.Success) {
        throw new Error(`Could not read existing subscriptions: ${subs.ErrorMessage}`);
    }
    return subs.Results;
}

/** Each subscription's latest term end, keyed by lower-cased subscription id. */
async function latestTermEnds(rv: RunView, subscriptionIDs: readonly string[], user?: UserInfo): Promise<Map<string, Date | null>> {
    const terms = await rv.RunView<{ SubscriptionID: string; TermNumber: number; EndDate: Date | string | null }>(
        {
            EntityName: SUBSCRIPTION_TERM_ENTITY,
            ExtraFilter: `SubscriptionID IN (${inList(subscriptionIDs)})`,
            OrderBy: 'TermNumber DESC',
            Fields: ['SubscriptionID', 'TermNumber', 'EndDate'],
            ResultType: 'simple',
        },
        user,
    );
    if (!terms.Success) {
        throw new Error(`Could not read subscription terms: ${terms.ErrorMessage}`);
    }
    const ends = new Map<string, Date | null>();
    for (const t of terms.Results) {
        const key = t.SubscriptionID.toLowerCase();
        if (ends.has(key)) continue;   // highest TermNumber first
        ends.set(key, t.EndDate === null ? null : t.EndDate instanceof Date ? t.EndDate : new Date(t.EndDate));
    }
    return ends;
}

/** A SQL `IN` list of validated, distinct, lower-cased ids. */
function inList(ids: readonly string[]): string {
    const valid = [...new Set(ids.filter((id) => UUID_PATTERN.test(id)).map((id) => id.toLowerCase()))];
    return valid.map((id) => `'${id}'`).join(', ');
}
