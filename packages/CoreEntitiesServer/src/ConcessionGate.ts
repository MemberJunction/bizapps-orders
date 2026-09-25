/**
 * ConcessionGate — the reads behind "may this order go in front of the customer yet?".
 *
 * A concession the customer has already been told about cannot be taken back in practice, whatever
 * the record says afterwards. So the approval has to come first in SEQUENCE, not only on save: an
 * order may be saved with a concession awaiting approval, but it may not be confirmed, and its
 * documents may not be sent, until every concession on it is decided. Two things hold it back:
 *
 *   1. an `OrderConcession` on the order that is still Pending; and
 *   2. on an order not yet confirmed, a line whose stated price is below its engine price with no
 *      Approved concession covering that value. A named list pick is a configured price, not a
 *      concession, and is left alone.
 *
 * Every line with a stated price is re-priced here, not only those flagged `PriceOverridden`. The
 * flag is set by the order-lines editor; a line priced through the API, an import or an integration
 * need not carry it, and the gate must not depend on who set it.
 *
 * A bundle component — a line with a `ParentOrderLineID` — is not re-priced. Expansion writes it at
 * its share of the bundle price, which is below its own engine price whenever the bundle sells for
 * less than its parts, and nothing the rep can record or change would clear it. The bundle line
 * itself keeps the bundle's price and is checked like any other.
 *
 * Confirmed orders are checked for (1) only. Their lines' prices were settled at booking, and lines
 * converted from the previous system carry overrides nobody recorded a concession for.
 *
 * CONNECTS TO:
 *   PURE:   @mj-biz-apps/orders-entities ConcessionBehavior (valuation, authority)
 *   CALLER: OrderEntityServer (confirm), OrderConcessionEntityServer (record), send-document action
 */
import { RunView, type IMetadataProvider, type IRunViewProvider, type UserInfo } from '@memberjunction/core';
import {
    ConcessionValue,
    ResolveLinePriceStanding,
    type ConcessionAuthority,
    type ConcessionValuation,
    type PricedLineFacts,
} from '@mj-biz-apps/orders-entities';
import { ORDER_CONCESSION_ENTITY, ORDER_LINE_ENTITY } from './entity-names.js';
import { RequireUUID } from './sql-guards.js';

const SALES_AUTHORITY_ENTITY = 'MJ_BizApps_Orders: Sales Authorities';
const SALES_RULE_ENTITY = 'MJ_BizApps_Orders: Sales Rules';

/** Pennies of tolerance when comparing an approved value with the value now on the line. */
const MONEY_TOLERANCE = 0.005;

/** A rep's concession limits, or null when they hold no active SalesAuthority. */
export async function LoadConcessionAuthority(
    userID: string,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<ConcessionAuthority | null> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const res = await rv.RunView<ConcessionAuthority>(
        {
            EntityName: SALES_AUTHORITY_ENTITY,
            ExtraFilter: `SalesRepUserID = '${RequireUUID(userID, 'UserID')}' AND IsActive = 1`,
            Fields: ['ID', 'MaxDiscountPct', 'MaxConcessionValue', 'MaxTermExtensionDays'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    return res?.Results?.[0] ?? null;
}

/** The active ConcessionLimit rule — the role that decides a concession outside a rep's authority. */
export async function FindConcessionLimitRule(
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<{ ID: string; Name: string; ApprovalRequiredRoleID: string | null } | null> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const res = await rv.RunView<{ ID: string; Name: string; ApprovalRequiredRoleID: string | null }>(
        {
            EntityName: SALES_RULE_ENTITY,
            ExtraFilter: `RuleType = 'ConcessionLimit' AND IsActive = 1`,
            Fields: ['ID', 'Name', 'ApprovalRequiredRoleID'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    return res?.Results?.[0] ?? null;
}

/** A line as the gate reads it. */
export interface ConcessionLineFacts extends PricedLineFacts {
    ID: string | null;
    LineNumber: number | null;
    /** Set on a bundle component, whose price is its allocation rather than a concession. */
    ParentOrderLineID: string | null;
    /**
     * Whether `UnitPrice` holds a price rather than a blank the engine fills at confirm. A saved line
     * always does; an unsaved one does when `UnitPrice` is dirty or above zero — the same test
     * `OrderPricingService.applyResolvedPrice` uses, since 0 is a legitimate price for a free line.
     */
    PriceStated: boolean;
}

/** What a line's typed price gives away, when it gives anything away. */
export interface LinePriceConcession {
    Form: 'Price' | 'Scope';
    EngineUnitPrice: number;
    Valuation: ConcessionValuation;
}

/**
 * The concession a line's price carries: a typed price below the engine's. Null for the engine's own
 * price, a named list pick, a price above the engine's, or a line nothing resolves a price for.
 * A line charged nothing is Scope — a product added at no charge — rather than Price.
 */
export async function LinePriceConcessionFor(
    line: PricedLineFacts,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<LinePriceConcession | null> {
    const standing = await ResolveLinePriceStanding(line, provider, user);
    if (!standing || standing.IsEnginePrice || standing.IsNamedListPick || standing.EngineUnitPrice == null) {
        return null;
    }
    const charged = Number(line.UnitPrice ?? 0);
    const form = charged <= 0 ? 'Scope' : 'Price';
    const valuation = ConcessionValue({
        Form: form,
        ReferenceUnitPrice: standing.EngineUnitPrice,
        ChargedUnitPrice: charged,
        Quantity: Number(line.Quantity ?? 0),
    });
    if (!(valuation.Value > 0)) return null;
    return { Form: form, EngineUnitPrice: standing.EngineUnitPrice, Valuation: valuation };
}

/**
 * Every reason the order may not yet reach the customer, written for the person who has to clear
 * it. Empty when nothing is outstanding.
 *
 * @param orderHeaderID  null for an order not yet saved — it can have no concession rows yet.
 * @param inMemoryLines  lines the caller holds, which win over their persisted copies.
 * @param includeLinePrices  check stated prices too (orders not yet confirmed).
 */
export async function FindUnapprovedConcessions(
    orderHeaderID: string | null,
    inMemoryLines: readonly ConcessionLineFacts[],
    includeLinePrices: boolean,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<string[]> {
    const problems: string[] = [];
    const rows = orderHeaderID ? await loadConcessions(orderHeaderID, provider, user) : [];

    for (const row of rows.filter((r) => r.Status === 'Pending')) {
        problems.push(
            `a ${row.DeliveryForm.toLowerCase()} concession worth ${Number(row.ComputedValue).toFixed(2)} ` +
                `(${row.ReasonCategory.toLowerCase()}) is awaiting approval`,
        );
    }

    if (!includeLinePrices) return problems;

    for (const line of await statedPriceLines(orderHeaderID, inMemoryLines, provider, user)) {
        const concession = await LinePriceConcessionFor(line, provider, user);
        if (!concession) continue;
        // A concession is recorded against a saved line, so a line not yet saved cannot have one —
        // tell the rep how to get one rather than that none is recorded.
        if (!orderHeaderID || !line.ID) {
            problems.push(
                `line ${line.LineNumber ?? '?'} is priced at ${Number(line.UnitPrice ?? 0).toFixed(2)} against an engine ` +
                    `price of ${concession.EngineUnitPrice.toFixed(2)}, a concession worth ` +
                    `${concession.Valuation.Value.toFixed(2)}. Save the order without confirming it first, then record ` +
                    `the ${concession.Form} concession against the line and confirm once it is approved`,
            );
            continue;
        }
        const approved = rows.some(
            (r) =>
                r.Status === 'Approved' &&
                sameID(r.OrderLineID, line.ID) &&
                (r.DeliveryForm === 'Price' || r.DeliveryForm === 'Scope') &&
                Number(r.ComputedValue) + MONEY_TOLERANCE >= concession.Valuation.Value,
        );
        if (approved) continue;
        problems.push(
            `line ${line.LineNumber ?? '?'} is priced at ${Number(line.UnitPrice ?? 0).toFixed(2)} against an engine ` +
                `price of ${concession.EngineUnitPrice.toFixed(2)}, a concession worth ` +
                `${concession.Valuation.Value.toFixed(2)} with no approved ${concession.Form} concession recorded for it`,
        );
    }
    return problems;
}

interface ConcessionRow {
    Status: string;
    DeliveryForm: string;
    ReasonCategory: string;
    ComputedValue: number;
    OrderLineID: string | null;
}

async function loadConcessions(
    orderHeaderID: string,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<ConcessionRow[]> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const res = await rv.RunView<ConcessionRow>(
        {
            EntityName: ORDER_CONCESSION_ENTITY,
            ExtraFilter: `OrderHeaderID = '${RequireUUID(orderHeaderID, 'OrderHeaderID')}'`,
            Fields: ['Status', 'DeliveryForm', 'ReasonCategory', 'ComputedValue', 'OrderLineID'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    return res?.Results ?? [];
}

/**
 * Lines with a stated price: the caller's, plus persisted ones the caller does not hold. Bundle
 * components are left out.
 */
async function statedPriceLines(
    orderHeaderID: string | null,
    inMemoryLines: readonly ConcessionLineFacts[],
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<ConcessionLineFacts[]> {
    const lines = inMemoryLines.filter((l) => l.PriceStated && !!l.ProductID && !l.ParentOrderLineID);
    if (!orderHeaderID) return lines;

    const held = new Set(inMemoryLines.map((l) => (l.ID ?? '').toLowerCase()).filter(Boolean));
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const res = await rv.RunView<ConcessionLineFacts>(
        {
            EntityName: ORDER_LINE_ENTITY,
            ExtraFilter: `OrderHeaderID = '${RequireUUID(orderHeaderID, 'OrderHeaderID')}'`,
            Fields: [
                'ID',
                'LineNumber',
                'ParentOrderLineID',
                'ProductID',
                'OrderHeaderID',
                'Quantity',
                'UnitPrice',
                'ProductPriceID',
            ],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    for (const row of res?.Results ?? []) {
        const key = (row.ID ?? '').toLowerCase();
        if (held.has(key) || row.ParentOrderLineID) continue;
        lines.push({ ...row, PriceStated: true });
    }
    return lines;
}

function sameID(a: string | null | undefined, b: string | null | undefined): boolean {
    return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}
