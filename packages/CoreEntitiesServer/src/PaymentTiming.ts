/**
 * Payment timing on a new sale (bizapps-orders#1097, golive #268).
 *
 * Finance's rule: a new sale is invoiced at confirm and due on receipt; a renewal is due on the first day
 * of its new term; agreed instalments follow the order's payment schedule. Three departures from it on a
 * new sale need approval before the order is confirmed:
 *
 *   1. a delayed service start: a line that is not a renewal starts more than `DelayedStartToleranceDays`
 *      (Orders setting) after the confirm date. With the setting unset the start is not checked;
 *   2. an instalment due after the service starts: a live payment schedule row due after the earliest
 *      service start of the order's new-sale lines. The invoicing SOP's semi-annual shape is allowed: on an
 *      order of {@link SCHEDULE_DEFAULTS}.RecurringSemiAnnualMinGross or more, two equal instalments six
 *      months apart, the first due on or before the start;
 *   3. payment terms other than due on receipt: the order's terms carry net days.
 *
 * An order counts as a new sale when it has a line that renews no subscription (bundle components and
 * reversals aside). Renewal lines are not checked; their due date is the renewal pass's.
 *
 * The approval is a `Timing` concession decided by the active `PaymentTiming` sales rule's role. It records
 * the order's timing facts as they stood ({@link DescribePaymentTiming}), and an approved one covers the
 * order only while the order still has exactly those facts: a later start, new terms or a moved instalment
 * needs a new approval. With no active `PaymentTiming` rule the check is off, so an installation turns it
 * on by creating the rule.
 *
 * CONNECTS TO:
 *   CALLER: ./ConcessionGate.ts (the confirm check) · ./OrderConcessionEntityServer.ts (recording a Timing concession)
 *   READS:  Order Headers · Order Lines · Payment Terms Types · Order Header Payment Schedules · Sales Rules
 */
import { RunView, type IMetadataProvider, type IRunViewProvider, type UserInfo } from '@memberjunction/core';
import { ToISODate } from '@mj-biz-apps/orders-entities';
import { CalendarDayOrToday } from './calendar-day.js';
import { ORDER_HEADER_ENTITY, ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY, ORDER_LINE_ENTITY } from './entity-names.js';
import { AddMonths, SCHEDULE_DEFAULTS } from './PaymentScheduleBehavior.js';
import { OrdersSettings } from './OrdersSettings.js';
import { RequireUUID } from './sql-guards.js';

const PAYMENT_TERMS_TYPE_ENTITY = 'MJ_BizApps_Orders: Payment Terms Types';
const SALES_RULE_ENTITY = 'MJ_BizApps_Orders: Sales Rules';

/** Schedule rows still on the schedule; the same set the schedule's tie check counts. */
const LIVE_SCHEDULE_STATUSES = new Set(['Scheduled', 'Invoiced', 'Paid', 'WrittenOff']);

/** `yyyy-mm-dd` moved by whole days. */
function addDays(isoDay: string, days: number): string {
    const [y, m, d] = isoDay.slice(0, 10).split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** A line as the timing check reads it. */
export interface PaymentTimingLine {
    RenewsSubscriptionID?: string | null;
    ParentOrderLineID?: string | null;
    ReversesOrderLineID?: string | null;
    Quantity?: number | null;
    /** The start stated on the line. None means the service starts at confirm. */
    ServicePeriodStart?: Date | string | null;
}

/** An order's payment timing, the facts a Timing concession records and the check compares. */
export interface PaymentTimingFacts {
    /** Whether the order has a line that renews no subscription. */
    HasNewSaleLine: boolean;
    /** The stated starts of its new-sale lines, `yyyy-mm-dd`, sorted, without repeats. */
    NewSaleStarts: string[];
    /** Whether a new-sale line states no start, so its service starts at confirm. */
    StartsAtConfirm: boolean;
    PaymentTermsName: string | null;
    /** The terms' net days; 0 when the order has no terms or its terms are due on receipt. */
    NetDays: number;
    /** The live instalments, by due date. */
    Instalments: Array<{ DueDate: string; Amount: number }>;
}

/** One reason the order's payment timing needs approval, for the person who has to clear it. */
export type PaymentTimingDeviation = string;

/** Whether the line is a new sale: not a renewal, a bundle component or a reversal. */
export function IsNewSaleLine(line: PaymentTimingLine): boolean {
    if (line.RenewsSubscriptionID || line.ParentOrderLineID || line.ReversesOrderLineID) return false;
    return Number(line.Quantity ?? 1) >= 0;
}

/** The timing facts of an order from its lines, terms and schedule. */
export function PaymentTimingFactsOf(
    lines: readonly PaymentTimingLine[],
    terms: { Name: string | null; NetDays: number | null } | null,
    schedule: ReadonlyArray<{ Status: string; DueDate: Date | string; Amount: number }>,
): PaymentTimingFacts {
    const newSale = lines.filter(IsNewSaleLine);
    const starts = new Set<string>();
    let startsAtConfirm = false;
    for (const line of newSale) {
        const day = line.ServicePeriodStart ? ToISODate(line.ServicePeriodStart) : null;
        if (day) starts.add(day);
        else startsAtConfirm = true;
    }
    return {
        HasNewSaleLine: newSale.length > 0,
        NewSaleStarts: [...starts].sort(),
        StartsAtConfirm: startsAtConfirm,
        PaymentTermsName: terms?.Name ?? null,
        NetDays: Math.max(0, Number(terms?.NetDays ?? 0)),
        Instalments: schedule
            .filter((r) => LIVE_SCHEDULE_STATUSES.has(r.Status))
            .map((r) => ({ DueDate: ToISODate(r.DueDate) ?? '', Amount: Math.round(Number(r.Amount) * 100) / 100 }))
            .sort((a, b) => (a.DueDate === b.DueDate ? a.Amount - b.Amount : a.DueDate < b.DueDate ? -1 : 1)),
    };
}

/**
 * The facts in words. A Timing concession records this text, and an approved one covers the order while the
 * order's own text is the same, so it is both what the approver reads and what the check compares.
 */
export function DescribePaymentTiming(facts: PaymentTimingFacts): string {
    const starts = [...(facts.StartsAtConfirm ? ['at confirm'] : []), ...facts.NewSaleStarts];
    const terms =
        facts.NetDays > 0
            ? `${facts.PaymentTermsName ?? 'payment terms'} (${facts.NetDays} days)`
            : `due on receipt${facts.PaymentTermsName ? ` (${facts.PaymentTermsName})` : ''}`;
    const instalments = facts.Instalments.length
        ? facts.Instalments.map((i) => `${i.DueDate} ${i.Amount.toFixed(2)}`).join(', ')
        : 'none';
    return `Service starts: ${starts.join(', ') || 'none'}. Payment terms: ${terms}. Instalments: ${instalments}.`;
}

/**
 * The invoicing SOP's semi-annual shape: on an order of the SOP's minimum or more, two equal instalments
 * six months apart, the first due on or before the service start.
 */
export function IsSopSemiAnnualSchedule(instalments: PaymentTimingFacts['Instalments'], serviceStart: string): boolean {
    if (instalments.length !== 2) return false;
    const [first, second] = instalments;
    const gross = first.Amount + second.Amount;
    return (
        gross >= SCHEDULE_DEFAULTS.RecurringSemiAnnualMinGross &&
        Math.round(Math.abs(first.Amount - second.Amount) * 100) <= 1 &&
        first.DueDate <= serviceStart &&
        second.DueDate === AddMonths(first.DueDate, 6)
    );
}

/**
 * Every way the order's payment timing departs from finance's rule, as of `confirmDay`. Empty when it does
 * not, or when the order has no new-sale line.
 *
 * @param confirmDay  `yyyy-mm-dd`, the day the order would be confirmed (today).
 * @param toleranceDays  `DelayedStartToleranceDays`; null does not check the start.
 */
export function PaymentTimingDeviations(
    facts: PaymentTimingFacts,
    confirmDay: string,
    toleranceDays: number | null,
): PaymentTimingDeviation[] {
    if (!facts.HasNewSaleLine) return [];
    const deviations: PaymentTimingDeviation[] = [];

    if (toleranceDays != null) {
        const latestAllowed = addDays(confirmDay, toleranceDays);
        const delayed = facts.NewSaleStarts.filter((d) => d > latestAllowed);
        if (delayed.length) {
            deviations.push(
                `the service starts ${delayed.join(', ')}, more than ${toleranceDays} days after ${confirmDay} ` +
                    `(Orders setting DelayedStartToleranceDays)`,
            );
        }
    }

    // A line with no stated start starts at confirm, the earliest start the order can have.
    const earliestStart = facts.StartsAtConfirm || !facts.NewSaleStarts.length ? confirmDay : facts.NewSaleStarts[0];
    const late = facts.Instalments.filter((i) => i.DueDate > earliestStart);
    if (late.length && !IsSopSemiAnnualSchedule(facts.Instalments, earliestStart)) {
        deviations.push(
            `${late.length === 1 ? 'an instalment is' : `${late.length} instalments are`} due after the service ` +
                `starts on ${earliestStart} (${late.map((i) => `${i.DueDate} ${i.Amount.toFixed(2)}`).join(', ')})`,
        );
    }

    if (facts.NetDays > 0) {
        deviations.push(
            `its payment terms, ${facts.PaymentTermsName ?? 'net'} (${facts.NetDays} days), are not due on receipt`,
        );
    }
    return deviations;
}

/** The active PaymentTiming sales rule. */
export interface PaymentTimingRule {
    ID: string;
    Name: string;
    ApprovalRequiredRoleID: string | null;
}

/**
 * The active PaymentTiming rule, null when there is none (the check is off), or a refusal when more than one
 * is active: which role decides would then be a guess.
 */
export async function LoadPaymentTimingRule(provider: IMetadataProvider, user: UserInfo): Promise<PaymentTimingRule | null | string> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const res = await rv.RunView<PaymentTimingRule>(
        {
            EntityName: SALES_RULE_ENTITY,
            ExtraFilter: `RuleType = 'PaymentTiming' AND IsActive = 1`,
            Fields: ['ID', 'Name', 'ApprovalRequiredRoleID'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    if (!res?.Success) throw new Error(`Could not read the PaymentTiming rules: ${res?.ErrorMessage}`);
    if (res.Results.length > 1) {
        return (
            `${res.Results.length} SalesRules of type 'PaymentTiming' are active (` +
            `${res.Results.map((r) => r.Name).join(', ')}), so which role approves payment timing is unclear. ` +
            `Leave one active.`
        );
    }
    return res.Results[0] ?? null;
}

/**
 * Read an order's payment timing. `inMemory` carries what the caller holds and has not saved: its lines win
 * over the saved ones, and its payment terms over the saved terms.
 */
export async function LoadPaymentTimingFacts(
    orderHeaderID: string | null,
    inMemory: { Lines?: readonly PaymentTimingLine[]; PaymentTermsTypeID?: string | null } | null,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<PaymentTimingFacts> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const read = async <T>(entity: string, filter: string, fields: string[]): Promise<T[]> => {
        const res = await rv.RunView<T>({ EntityName: entity, ExtraFilter: filter, Fields: fields, ResultType: 'simple', BypassCache: true }, user);
        if (!res?.Success) throw new Error(`Could not read ${entity} for the payment timing check: ${res?.ErrorMessage}`);
        return res.Results;
    };
    const orderFilter = orderHeaderID ? `OrderHeaderID = '${RequireUUID(orderHeaderID, 'OrderHeaderID')}'` : null;

    const lines =
        inMemory?.Lines ??
        (orderFilter
            ? await read<PaymentTimingLine>(ORDER_LINE_ENTITY, orderFilter, [
                  'RenewsSubscriptionID',
                  'ParentOrderLineID',
                  'ReversesOrderLineID',
                  'Quantity',
                  'ServicePeriodStart',
              ])
            : []);

    let termsID = inMemory?.PaymentTermsTypeID;
    if (termsID === undefined && orderHeaderID) {
        const [header] = await read<{ PaymentTermsTypeID: string | null }>(
            ORDER_HEADER_ENTITY,
            `ID = '${RequireUUID(orderHeaderID, 'OrderHeaderID')}'`,
            ['PaymentTermsTypeID'],
        );
        termsID = header?.PaymentTermsTypeID ?? null;
    }
    const [terms] = termsID
        ? await read<{ Name: string | null; NetDays: number | null }>(
              PAYMENT_TERMS_TYPE_ENTITY,
              `ID = '${RequireUUID(termsID, 'PaymentTermsTypeID')}'`,
              ['Name', 'NetDays'],
          )
        : [];

    const schedule = orderFilter
        ? await read<{ Status: string; DueDate: Date | string; Amount: number }>(ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY, orderFilter, [
              'Status',
              'DueDate',
              'Amount',
          ])
        : [];

    return PaymentTimingFactsOf(lines, terms ?? null, schedule);
}

/** Today in the business time zone, `yyyy-mm-dd`: the day a confirm now would happen on. */
export async function ConfirmDay(provider: IMetadataProvider, user: UserInfo): Promise<string> {
    return (await CalendarDayOrToday(undefined, provider, user)).toISOString().slice(0, 10);
}

/** The order's deviations as of today, with the tolerance setting loaded. */
export async function CurrentPaymentTimingDeviations(
    facts: PaymentTimingFacts,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<PaymentTimingDeviation[]> {
    await OrdersSettings.Load(provider, user);
    return PaymentTimingDeviations(facts, await ConfirmDay(provider, user), OrdersSettings.DelayedStartToleranceDays);
}
