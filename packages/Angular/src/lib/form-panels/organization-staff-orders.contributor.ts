import { RunView } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    OrganizationStaffContributor,
    type OrganizationStaffMember,
    type OrganizationStaffRequest,
    type StaffCell,
    type StaffContribution,
} from '@mj-biz-apps/common-ng';
import { MJO_ENTITIES } from '../data/entity-names';
import { FormatMoney } from '../panels/money-format';

/** One order billed to a staff member, as read for the roll-up. */
export interface StaffOrderRow {
    BillToPersonID: string;
    TotalGross: number | null;
    Balance: number | null;
    /** A bit column: the server sends 1/0, so accept either form. */
    IsOverdue: boolean | number | null;
    /** The browser provider hands dates back as Date objects; the server as ISO strings. */
    OrderDate: Date | string | null;
}

function IsFlagSet(value: boolean | number | null): boolean {
    return value === true || value === 1;
}

function ToTime(value: Date | string | null): number | null {
    if (value == null) return null;
    const t = (value instanceof Date ? value : new Date(value)).getTime();
    return isNaN(t) ? null : t;
}

/** One active subscription whose beneficiary is a staff member. */
export interface StaffSubscriptionRow {
    BeneficiaryPersonID: string;
}

/**
 * Order figures for the Organization form's Staff section, using the same definitions as the
 * person header's `Party Order Lifetime` query: an order counts unless Voided, LTV is the sum of
 * TotalGross, open = overdue or a balance due, active subscriptions are Status 'Active'.
 */
export function BuildStaffOrderContribution(
    staff: OrganizationStaffMember[],
    orders: StaffOrderRow[],
    subscriptions: StaffSubscriptionRow[],
): StaffContribution {
    const byPerson = new Map<string, { Orders: number; Ltv: number }>();
    for (const o of orders) {
        const key = o.BillToPersonID.toUpperCase();
        const agg = byPerson.get(key) ?? { Orders: 0, Ltv: 0 };
        agg.Orders += 1;
        agg.Ltv += o.TotalGross ?? 0;
        byPerson.set(key, agg);
    }
    const totalLtv = orders.reduce((sum, o) => sum + (o.TotalGross ?? 0), 0);
    const open = orders.filter(o => IsFlagSet(o.IsOverdue) || (o.Balance ?? 0) > 0).length;
    const overdue = orders.filter(o => IsFlagSet(o.IsOverdue)).length;
    const buyers = byPerson.size;
    const times = orders.map(o => ToTime(o.OrderDate)).filter((t): t is number => t != null);
    const lastOrder = times.length > 0 ? new Date(Math.max(...times)) : null;

    const cells = new Map<string, Record<string, StaffCell>>();
    for (const member of staff) {
        const agg = byPerson.get(member.PersonID.toUpperCase());
        cells.set(member.PersonID.toUpperCase(), {
            orders: agg ? { Text: String(agg.Orders) } : { Text: '0', Tone: 'muted' },
            ltv: agg ? { Text: FormatMoney(agg.Ltv, { Round: true, Zero: '$0' }) } : { Text: '$0', Tone: 'muted' },
        });
    }

    return {
        Figures: [
            { Label: 'Staff LTV', Value: FormatMoney(totalLtv, { Round: true, Zero: '$0' }), Icon: 'fa-solid fa-sack-dollar', Detail: buyers > 0 ? `${buyers} of ${staff.length} staff have bought` : 'No staff purchases yet' },
            { Label: 'Staff orders', Value: orders.length, Icon: 'fa-solid fa-cart-shopping', Detail: `${open} open · ${overdue} overdue`, Tone: overdue > 0 ? 'warn' : 'none' },
            { Label: 'Active subs', Value: subscriptions.length, Icon: 'fa-solid fa-rotate' },
            { Label: 'Last staff order', Value: lastOrder ? FormatDateOnly(lastOrder) : '—', Icon: 'fa-solid fa-calendar-check' },
        ],
        Columns: [
            { Key: 'orders', Header: 'Orders' },
            { Key: 'ltv', Header: 'LTV' },
        ],
        Cells: cells,
    };
}

function FormatDateOnly(d: Date): string {
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/**
 * `'A','B'` for an ExtraFilter IN list. `sql-guards.ts`'s `RequireUUIDs` is a server import an Angular
 * package cannot take, so this checks the same thing locally: an id that is not a UUID never reaches
 * the filter string.
 */
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function QuotedStaffIDs(staff: OrganizationStaffMember[]): string {
    return staff.map(s => {
        if (!UUID_SHAPE.test(s.PersonID)) {
            throw new Error(`Staff PersonID is not a UUID: ${s.PersonID}`);
        }
        return `'${s.PersonID}'`;
    }).join(',');
}

/** Adds order figures and Orders / LTV columns to the Organization form's Staff section. */
@RegisterClass(OrganizationStaffContributor, 'orders')
export class OrdersStaffContributor extends OrganizationStaffContributor {
    public readonly Key = 'orders';
    public readonly Label = 'Order figures';
    public override readonly Priority = 50;

    public async Load(request: OrganizationStaffRequest): Promise<StaffContribution> {
        const rv = request.Provider ? RunView.FromMetadataProvider(request.Provider) : new RunView();
        const ids = QuotedStaffIDs(request.Staff);
        const [orders, subs] = await rv.RunViews([
            {
                EntityName: MJO_ENTITIES.OrderHeader,
                ExtraFilter: `BillToPersonID IN (${ids}) AND Status <> 'Voided'`,
                Fields: ['BillToPersonID', 'TotalGross', 'Balance', 'IsOverdue', 'OrderDate'],
                ResultType: 'simple',
            },
            {
                EntityName: MJO_ENTITIES.Subscription,
                ExtraFilter: `BeneficiaryPersonID IN (${ids}) AND Status = 'Active'`,
                Fields: ['BeneficiaryPersonID'],
                ResultType: 'simple',
            },
        ]);
        if (!orders.Success) throw new Error(orders.ErrorMessage || 'Could not read staff orders.');
        if (!subs.Success) throw new Error(subs.ErrorMessage || 'Could not read staff subscriptions.');
        return BuildStaffOrderContribution(
            request.Staff,
            (orders.Results ?? []) as StaffOrderRow[],
            (subs.Results ?? []) as StaffSubscriptionRow[],
        );
    }
}
