/**
 * AmountChange — read everything lowering a booked term's amount depends on, and plan it (#506, golive #221 case A).
 *
 * WHAT THIS DOES TODAY: it checks and plans, and writes nothing. `Orders.AmendArrangement` with `NewAmount` and
 * `Preview: true` returns the plan: the reduction and its tax, the catch-up, the staged entries offset and the new
 * schedule, the instalments reduced or cancelled, and the credit memo with where it is applied. Recording and
 * applying the change (the Price concession, the credit-memo document, the entries, the instalment rewrite and
 * accounting's acknowledgment task) is the next step, and until it exists the operation refuses to record one.
 *
 * WHEN IT IS REFUSED:
 *   - the term is not Scheduled or Active, or its renewal is already placed (reverse that first);
 *   - the line that bought the term has had a return against it, so the term's amount no longer describes what
 *     the customer was billed for it;
 *   - the new amount is not lower than the current one, or is zero (that is a cancellation);
 *   - a staged entry that would need an offset is already in a journal-entry batch;
 *   - the staged entries do not add up to the term's amount, so the share already earned cannot be read;
 *   - "applies to invoice" names something that is not an invoiced instalment of this order and company;
 *   - no one other than the requester holds the acknowledgment role, so accounting could not be told.
 *
 * CONNECTS TO:
 *   PLAN:   ./AmountChangePlan.ts
 *   SHARES: ./TermExtension.ts (renewal check, acknowledgers, the term's driver, its staged entries)
 *           ./ReversalBehavior.ts + ./ReversalResolver.ts (the tax the line was charged, mirrored)
 *   CALLER: AmendArrangementOperation (preview)
 */
import { RunView, type IRunViewProvider } from '@memberjunction/core';
import { EntityIDFor } from './AccountingBridge.js';
import { PlanAmountChange, PlanReduction, type AmountChangePlan, type ReductionPlan } from './AmountChangePlan.js';
import { CalendarDayOrToday } from './calendar-day.js';
import type { ApprovalTaskContext } from './ConcessionApprovalTask.js';
import { ORDER_HEADER_ENTITY, ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY, ORDER_LINE_ENTITY } from './entity-names.js';
import { MirroredTaxCharges } from './ReversalBehavior.js';
import { LoadOriginTaxCharges } from './ReversalResolver.js';
import { RequireUUID } from './sql-guards.js';
import {
    AcknowledgerIDs,
    RenewalAlreadyPlaced,
    StagedRecognitionEntries,
    TermRecognition,
    type TermRow,
} from './TermExtension.js';

const SUBSCRIPTION_ENTITY = 'MJ_BizApps_Orders: Subscriptions';
const SUBSCRIPTION_TERM_ENTITY = 'MJ_BizApps_Orders: Subscription Terms';
const PRODUCT_ENTITY = 'MJ_BizApps_Orders: Products';

const money = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export interface AmountChangeRequest {
    SubscriptionTermID: string;
    /** The term's new amount: net of discount, before tax. */
    NewAmount: number;
    /** The invoiced instalment the reduction is about, when it is about one. */
    AppliesToInvoiceID?: string | null;
    /** The customer asked for a refund of a paid invoice's credit. */
    RefundRequested?: boolean;
    /** Who asked. Excluded from the acknowledgment, which they cannot confirm themselves. */
    RequestedByUserID: string;
}

/** Everything an amount change would do, read and planned but not written. */
export interface CheckedAmountChange {
    TermID: string;
    TermNumber: number;
    SubscriptionNumber: string;
    OrderHeaderID: string;
    OrderNumber: string | null;
    OrderLineID: string;
    CurrentAmount: number;
    NewAmount: number;
    /** The tax charged on the reduction, mirrored from the line's own tax charges. */
    TaxReduction: number;
    /** Reduction plus its tax: what the customer is billed less. */
    GrossReduction: number;
    EffectiveDate: Date;
    Recognition: AmountChangePlan;
    Billing: ReductionPlan;
    AcknowledgerIDs: string[];
}

/** Check an amount change and plan it, or say why it cannot be made. Reads only. */
export async function CheckAmountChange(request: AmountChangeRequest, ctx: ApprovalTaskContext): Promise<CheckedAmountChange | string> {
    const newAmount = Number(request.NewAmount);
    if (!Number.isFinite(newAmount) || money(newAmount) !== newAmount) return 'NewAmount must be an amount in whole cents.';
    const appliesTo = request.AppliesToInvoiceID ? RequireUUID(request.AppliesToInvoiceID, 'AppliesToInvoiceID') : null;

    const term = (
        await view<TermRow>(ctx, {
            EntityName: SUBSCRIPTION_TERM_ENTITY,
            ExtraFilter: `ID = '${RequireUUID(request.SubscriptionTermID, 'SubscriptionTermID')}'`,
            Fields: ['ID', 'SubscriptionID', 'TermNumber', 'OrderLineID', 'StartDate', 'EndDate', 'Amount', 'Status', 'RevenueRecognitionTypeID'],
            ResultType: 'simple',
        })
    )[0];
    if (!term) return `Subscription term ${request.SubscriptionTermID} was not found.`;
    if (term.Status !== 'Scheduled' && term.Status !== 'Active') {
        return `Term ${term.TermNumber} is ${term.Status}; only a Scheduled or Active term's amount can be changed.`;
    }
    const renewal = await RenewalAlreadyPlaced(term, ctx);
    if (renewal) return renewal;

    const subscription = (
        await view<{ SubscriptionNumber: string; SubscriptionTypeID: string; ProductID: string }>(ctx, {
            EntityName: SUBSCRIPTION_ENTITY,
            ExtraFilter: `ID = '${RequireUUID(term.SubscriptionID, 'SubscriptionID')}'`,
            Fields: ['SubscriptionNumber', 'SubscriptionTypeID', 'ProductID'],
            ResultType: 'simple',
        })
    )[0];
    if (!subscription) return `The subscription of term ${term.TermNumber} was not found.`;

    const lineID = RequireUUID(term.OrderLineID, 'OrderLineID');
    const line = (
        await view<{ ID: string; OrderHeaderID: string; CompanyID: string; LineNumber: number; LineTotalNet: number | null; LineTax: number | null }>(ctx, {
            EntityName: ORDER_LINE_ENTITY,
            ExtraFilter: `ID = '${lineID}'`,
            Fields: ['ID', 'OrderHeaderID', 'CompanyID', 'LineNumber', 'LineTotalNet', 'LineTax'],
            ResultType: 'simple',
        })
    )[0];
    if (!line) return `The order line that bought term ${term.TermNumber} was not found.`;

    const returned = await view<{ ID: string }>(ctx, {
        EntityName: ORDER_LINE_ENTITY,
        ExtraFilter:
            `ReversesOrderLineID = '${lineID}' AND OrderHeaderID IN ` +
            `(SELECT ID FROM __mj_BizAppsOrders.OrderHeader WHERE Status <> 'Voided')`,
        Fields: ['ID'],
        ResultType: 'simple',
        MaxRows: 1,
    });
    if (returned.length > 0) {
        return (
            `Line ${line.LineNumber}, which bought term ${term.TermNumber}, has a return against it, so the term's amount no ` +
            `longer says what the customer is billed for it. Correct it with a correcting order instead.`
        );
    }

    const order = (
        await view<{ OrderNumber: string | null; Balance: number | null }>(ctx, {
            EntityName: ORDER_HEADER_ENTITY,
            ExtraFilter: `ID = '${RequireUUID(line.OrderHeaderID, 'OrderHeaderID')}'`,
            Fields: ['OrderNumber', 'Balance'],
            ResultType: 'simple',
        })
    )[0];
    if (!order) return `The order that bought term ${term.TermNumber} was not found.`;

    const product = (
        await view<{ Name: string }>(ctx, {
            EntityName: PRODUCT_ENTITY,
            ExtraFilter: `ID = '${RequireUUID(subscription.ProductID, 'ProductID')}'`,
            Fields: ['Name'],
            ResultType: 'simple',
        })
    )[0];

    const acknowledgers = await AcknowledgerIDs(request.RequestedByUserID, ctx);
    if (typeof acknowledgers === 'string') return acknowledgers;

    const currentAmount = money(Number(term.Amount));
    const effective = await CalendarDayOrToday(undefined, ctx.Provider, ctx.User);
    const label = `term ${term.TermNumber} of ${subscription.SubscriptionNumber} reduced to ${newAmount.toFixed(2)}`;
    const recognitionType = await TermRecognition(term, subscription.SubscriptionTypeID, ctx);
    const entries = recognitionType ? await StagedRecognitionEntries(term.ID, ctx) : [];
    const recognition = PlanAmountChange({
        Entries: entries,
        EffectiveDate: effective,
        TermEndDate: asDay(term.EndDate),
        CurrentAmount: currentAmount,
        NewAmount: newAmount,
        Driver: recognitionType?.Driver ?? null,
        PeriodMonths: recognitionType?.PeriodMonths ?? 1,
        LinkedEntityID: EntityIDFor(SUBSCRIPTION_TERM_ENTITY),
        LinkedRecordID: term.ID,
        Label: label,
        ProductName: product?.Name ?? 'subscription',
    });
    if (typeof recognition === 'string') return recognition;

    // The tax the line was charged, taken back in the share the reduction is of the line's net: the same
    // per-jurisdiction mirroring a return uses, measured in money rather than units.
    const lineNet = money(Number(line.LineTotalNet ?? 0));
    const charges = lineNet > 0 ? await LoadOriginTaxCharges(line.ID, ctx.Provider, ctx.User) : [];
    const taxReduction =
        lineNet > 0
            ? money(-MirroredTaxCharges({ Quantity: lineNet, LineTax: Number(line.LineTax ?? 0) }, charges, 0, recognition.Reduction).reduce((s, c) => s + c.Amount, 0))
            : 0;
    const grossReduction = money(recognition.Reduction + taxReduction);

    const instalments = await view<ScheduleRow>(ctx, {
        EntityName: ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY,
        ExtraFilter: `OrderHeaderID = '${RequireUUID(line.OrderHeaderID, 'OrderHeaderID')}' AND CompanyID = '${RequireUUID(line.CompanyID, 'CompanyID')}'`,
        Fields: ['ID', 'InstallmentNumber', 'DueDate', 'Amount', 'Balance', 'Status', 'DocumentNumber'],
        OrderBy: 'InstallmentNumber',
        ResultType: 'simple',
    });
    const billing = PlanReduction({
        GrossReduction: grossReduction,
        Instalments: instalments.map((i) => ({
            ID: i.ID,
            InstallmentNumber: Number(i.InstallmentNumber),
            DueDate: asDay(i.DueDate).toISOString().slice(0, 10),
            Amount: Number(i.Amount),
            Balance: Number(i.Balance ?? i.Amount),
            Status: i.Status,
            DocumentNumber: i.DocumentNumber,
        })),
        OrderBalance: Number(order.Balance ?? 0),
        AppliesToInvoiceID: appliesTo,
        RefundRequested: request.RefundRequested === true,
    });
    if (typeof billing === 'string') return billing;

    return {
        TermID: term.ID,
        TermNumber: term.TermNumber,
        SubscriptionNumber: subscription.SubscriptionNumber,
        OrderHeaderID: line.OrderHeaderID,
        OrderNumber: order.OrderNumber,
        OrderLineID: line.ID,
        CurrentAmount: currentAmount,
        NewAmount: newAmount,
        TaxReduction: taxReduction,
        GrossReduction: grossReduction,
        EffectiveDate: effective,
        Recognition: recognition,
        Billing: billing,
        AcknowledgerIDs: acknowledgers,
    };
}

interface ScheduleRow {
    ID: string;
    InstallmentNumber: number;
    DueDate: Date | string;
    Amount: number;
    Balance: number | null;
    Status: string;
    DocumentNumber: string | null;
}

/** A `date` column as midnight UTC, the shape it round-trips in. */
function asDay(value: Date | string): Date {
    const d = new Date(value);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

async function view<T>(ctx: ApprovalTaskContext, params: Parameters<RunView['RunView']>[0]): Promise<T[]> {
    const rv = new RunView(ctx.Provider as unknown as IRunViewProvider);
    const res = await rv.RunView<T>({ ...params, BypassCache: true }, ctx.User);
    if (!res.Success) throw new Error(`Reading ${params.EntityName} failed: ${res.ErrorMessage}`);
    return res.Results;
}
