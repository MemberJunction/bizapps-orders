/**
 * AmountChange — lower a booked term's amount (#506, golive #221 case A).
 *
 * CHECK: read everything the change depends on and plan it, writing nothing. `Orders.AmendArrangement` with
 * `NewAmount` and `Preview: true` returns this plan: the reduction and its tax, the catch-up, the staged entries
 * offset and the new schedule, the instalments reduced or cancelled, and any credit memo.
 *
 * APPLY: an approved Price concession carrying `NewAmount` is applied in the approval's own transaction:
 *   - the catch-up, the offsets and the new schedule are posted through Accounting.CreateJournalEntries;
 *   - the term's amount becomes the new amount;
 *   - the instalments not yet invoiced are lowered, or cancelled when lowered to nothing;
 *   - an `AmountChanged` subscription event records it, and accounting's acknowledgment task is raised.
 * The concession's `ScheduleReduction` (set by the concession itself) is what the order's balance and its
 * schedule check take off the booked lines.
 *
 * ONLY WHAT THE UNINVOICED INSTALMENTS ABSORB, FOR NOW. A reduction that needs a credit memo (part of it lands on
 * an invoice already sent, the order is billed as a whole, or a refund is asked for) is refused when recorded and
 * when applied: Orders has no credit-memo document for an amount change yet. The preview still shows it.
 *
 * WHEN IT IS REFUSED:
 *   - the term is not Scheduled or Active, or its renewal is already placed (reverse that first);
 *   - the line that bought the term has had a return against it, so the term's amount no longer describes what
 *     the customer was billed for it;
 *   - the new amount is not lower than the current one, or is zero (that is a cancellation);
 *   - a staged entry that would need an offset is already in a journal-entry batch;
 *   - the staged entries do not add up to the term's amount, so the share already earned cannot be read;
 *   - "applies to invoice" names something that is not an invoiced instalment of this order's covering company;
 *   - an instalment would be lowered below what has already been paid on it;
 *   - no one other than the requester holds the acknowledgment role, so accounting could not be told.
 *
 * CONNECTS TO:
 *   PLAN:   ./AmountChangePlan.ts
 *   SHARES: ./TermExtension.ts (renewal check, acknowledgers, the term's driver, its staged entries, the task)
 *           ./ReversalBehavior.ts + ./ReversalResolver.ts (the tax the line was charged, mirrored)
 *           ./PaymentScheduleBehavior.ts (which rows bill the line's company)
 *   CALLER: AmendArrangementOperation (preview) · OrderConcessionEntityServer (value, apply)
 *   WRITES: Accounting.CreateJournalEntries · Subscription Terms · Order Header Payment Schedules ·
 *           Subscription Events · Tasks
 */
import { RunView, type IRunViewProvider } from '@memberjunction/core';
import type { mjBizAppsOrdersSubscriptionEventEntity } from '@mj-biz-apps/orders-entities';
import { EntityIDFor, SubmitJournalEntryDrafts } from './AccountingBridge.js';
import { PlanAmountChange, PlanReduction, type AmountChangePlan, type ReductionPlan } from './AmountChangePlan.js';
import { CalendarDayOrToday } from './calendar-day.js';
import type { ApprovalTaskContext } from './ConcessionApprovalTask.js';
import { ORDER_CONCESSION_ENTITY, ORDER_HEADER_ENTITY, ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY, ORDER_LINE_ENTITY } from './entity-names.js';
import type { OrderHeaderPaymentScheduleEntityServer } from './OrderHeaderPaymentScheduleEntityServer.js';
import { ScheduleCoverage } from './PaymentScheduleBehavior.js';
import { MirroredTaxCharges } from './ReversalBehavior.js';
import { LoadOriginTaxCharges } from './ReversalResolver.js';
import { RequireUUID } from './sql-guards.js';
import { SanctionTermAmendment, type SubscriptionTermEntityServer } from './SubscriptionTermEntityServer.js';
import {
    AcknowledgerIDs,
    RaiseAcknowledgmentTask,
    RenewalAlreadyPlaced,
    StagedRecognitionEntries,
    TermRecognition,
    type TermRow,
} from './TermExtension.js';

const SUBSCRIPTION_ENTITY = 'MJ_BizApps_Orders: Subscriptions';
const SUBSCRIPTION_TERM_ENTITY = 'MJ_BizApps_Orders: Subscription Terms';
const PRODUCT_ENTITY = 'MJ_BizApps_Orders: Products';
const SUBSCRIPTION_EVENT_ENTITY = 'MJ_BizApps_Orders: Subscription Events';

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
    SubscriptionID: string;
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
    /** What the billing plan takes off the instalments not yet invoiced, reduction and tax together. */
    ScheduleReduction: number;
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
        await view<{
            ID: string;
            OrderHeaderID: string;
            CompanyID: string;
            LineNumber: number;
            LineTotalNet: number | null;
            LineTax: number | null;
            ChargeAmount: number | null;
            BilledToDate: number | null;
        }>(ctx, {
            EntityName: ORDER_LINE_ENTITY,
            ExtraFilter: `ID = '${lineID}'`,
            Fields: ['ID', 'OrderHeaderID', 'CompanyID', 'LineNumber', 'LineTotalNet', 'LineTax', 'ChargeAmount', 'BilledToDate'],
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
        await view<{ OrderNumber: string | null; Balance: number | null; CompanyID: string }>(ctx, {
            EntityName: ORDER_HEADER_ENTITY,
            ExtraFilter: `ID = '${RequireUUID(line.OrderHeaderID, 'OrderHeaderID')}'`,
            Fields: ['OrderNumber', 'Balance', 'CompanyID'],
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

    // The rows that bill the line's company: the order company's, unless the line's own company kept live rows
    // of its own from before schedules moved to the order's company.
    const rows = await view<ScheduleRow>(ctx, {
        EntityName: ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY,
        ExtraFilter: `OrderHeaderID = '${RequireUUID(line.OrderHeaderID, 'OrderHeaderID')}'`,
        Fields: ['ID', 'CompanyID', 'InstallmentNumber', 'DueDate', 'Amount', 'AmountPaid', 'Balance', 'Status', 'DocumentNumber'],
        OrderBy: 'InstallmentNumber',
        ResultType: 'simple',
    });
    const covering = ScheduleCoverage(
        rows.map((r) => ({ CompanyID: r.CompanyID, Amount: Number(r.Amount), Status: r.Status })),
        [line.CompanyID],
        order.CompanyID,
    ).get(String(line.CompanyID).toLowerCase());
    const instalments = rows.filter((r) => String(r.CompanyID).toLowerCase() === covering);
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

    // Each later instalment invoice bills the line at its lowered amount, which only tax can follow: a shipping
    // or other charge on the line has no share of the reduction.
    if (billing.Instalments.length > 0 && money(Number(line.ChargeAmount ?? 0)) !== 0) {
        return (
            `Line ${line.LineNumber} carries a charge other than tax, and lowering it on an order billed by instalment ` +
            `cannot say what part of that charge goes. Correct it with a correcting order.`
        );
    }
    // The line keeps at least what it has already billed: billing past its new amount would leave invoiced money
    // that only a credit memo can give back.
    const earlier = (await AppliedAmountChanges(line.OrderHeaderID, ctx)).filter((c) => c.OrderLineID.toLowerCase() === line.ID.toLowerCase());
    const lineNetAfter = money(lineNet - earlier.reduce((sum, c) => sum + c.Net, 0) - recognition.Reduction);
    const billed = money(Math.abs(Number(line.BilledToDate ?? 0)));
    if (billing.Instalments.length > 0 && billed > lineNetAfter) {
        return (
            `Line ${line.LineNumber} has already billed ${billed.toFixed(2)} before tax, more than the ${lineNetAfter.toFixed(2)} ` +
            `it would come to. Giving that back needs a credit memo, which an amount change cannot issue yet.`
        );
    }

    // An instalment keeps at least what was already paid on it: going below would leave money nothing bills for,
    // which only a credit memo can give back.
    for (const change of billing.Instalments) {
        const row = instalments.find((r) => r.ID === change.ID);
        const paid = money(Number(row?.AmountPaid ?? 0));
        if (row && change.NewAmount < paid) {
            return (
                `Instalment ${change.InstallmentNumber} has ${paid.toFixed(2)} paid on it and would go down to ` +
                `${change.NewAmount.toFixed(2)}. Giving back money already paid needs a credit memo, which an amount ` +
                `change cannot issue yet.`
            );
        }
    }
    const scheduleReduction = money(billing.Instalments.reduce((sum, c) => sum + c.CurrentAmount - c.NewAmount, 0));

    return {
        TermID: term.ID,
        TermNumber: term.TermNumber,
        SubscriptionID: term.SubscriptionID,
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
        ScheduleReduction: scheduleReduction,
        AcknowledgerIDs: acknowledgers,
    };
}

/** Why this checked change needs a credit memo, which cannot be issued yet; null when it needs none. */
export function CreditMemoRefusal(checked: CheckedAmountChange): string | null {
    const billing = checked.Billing;
    if (billing.CreditMemo <= 0 && billing.Refund <= 0) return null;
    return (
        `Lowering term ${checked.TermNumber} of ${checked.SubscriptionNumber} to ${checked.NewAmount.toFixed(2)} needs a ` +
        `credit memo of ${billing.CreditMemo.toFixed(2)}: the instalments not yet invoiced cannot absorb the whole ` +
        `reduction. An amount change can only lower instalments not yet invoiced for now; correct the rest with a ` +
        `correcting order.`
    );
}

/** The approved concession an amount change is applied from. */
export interface ApprovedAmountChange {
    ID: string;
    SubscriptionTermID: string;
    NewAmount: number;
    AppliesToPaymentScheduleID: string | null;
    RequestedByUserID: string;
    ReasonCategory: string;
    Reason: string;
    /** The reduction the concession was valued at when recorded. */
    ComputedValue: number;
}

/**
 * Apply an approved amount change to its term. Joins the caller's transaction; throws on any refusal, so the
 * caller's approval rolls back with it.
 */
export async function ApplyAmountChange(concession: ApprovedAmountChange, ctx: ApprovalTaskContext): Promise<CheckedAmountChange> {
    const checked = await CheckAmountChange(
        {
            SubscriptionTermID: concession.SubscriptionTermID,
            NewAmount: concession.NewAmount,
            AppliesToInvoiceID: concession.AppliesToPaymentScheduleID,
            RequestedByUserID: concession.RequestedByUserID,
        },
        ctx,
    );
    if (typeof checked === 'string') throw new Error(`The amount change cannot be applied: ${checked}`);
    const memo = CreditMemoRefusal(checked);
    if (memo) throw new Error(`The amount change cannot be applied: ${memo}`);
    if (money(checked.Recognition.Reduction) !== money(concession.ComputedValue)) {
        throw new Error(
            `The amount change cannot be applied: term ${checked.TermNumber} is now ${checked.CurrentAmount.toFixed(2)}, so ` +
                `lowering it to ${checked.NewAmount.toFixed(2)} is a reduction of ${checked.Recognition.Reduction.toFixed(2)}, ` +
                `not the ${money(concession.ComputedValue).toFixed(2)} this concession was recorded for. Reject it and record it again.`,
        );
    }
    const plan = checked.Recognition;
    if (plan.CatchUp > 0 && !plan.CatchUpEntry) {
        throw new Error(
            `The amount change cannot be applied: term ${checked.TermNumber} was recognised in full when it was booked, so ` +
                `there is no deferred revenue to take the reduction from. Correct it with a correcting order.`,
        );
    }

    const drafts = [...(plan.CatchUpEntry ? [plan.CatchUpEntry] : []), ...plan.Offsets, ...plan.Respread];
    const written = drafts.length
        ? await SubmitJournalEntryDrafts(drafts, `the amount change of ${changeLabel(checked)}`, ctx.Provider, ctx.User)
        : { Success: true, Results: [] };

    await setTermAmount(checked, ctx);
    await lowerInstalments(checked, ctx);
    await logAmountChanged(checked, concession, written.Results ?? [], ctx);
    await RaiseAcknowledgmentTask(
        {
            Name: `Confirm the recognition re-cut: ${changeLabel(checked)}`,
            Description: acknowledgmentDescription(checked, concession),
            TermID: checked.TermID,
            OrderConcessionID: concession.ID,
            OrderHeaderID: checked.OrderHeaderID,
            AcknowledgerIDs: checked.AcknowledgerIDs,
        },
        ctx,
    );
    return checked;
}

async function setTermAmount(checked: CheckedAmountChange, ctx: ApprovalTaskContext): Promise<void> {
    const term = await ctx.Provider.GetEntityObject<SubscriptionTermEntityServer>(SUBSCRIPTION_TERM_ENTITY, ctx.User);
    if (!(await term.Load(checked.TermID))) throw new Error(`Subscription term ${checked.TermID} was not found.`);
    SanctionTermAmendment(term);
    term.Amount = checked.NewAmount;
    if (!(await term.Save())) {
        throw new Error(`Term ${checked.TermNumber}'s amount could not be changed: ${term.LatestResult?.CompleteMessage}`);
    }
}

/** Each uninvoiced instalment the plan changes takes its new amount, or is cancelled at zero. */
async function lowerInstalments(checked: CheckedAmountChange, ctx: ApprovalTaskContext): Promise<void> {
    for (const change of checked.Billing.Instalments) {
        const row = await ctx.Provider.GetEntityObject<OrderHeaderPaymentScheduleEntityServer>(ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY, ctx.User);
        if (!(await row.Load(change.ID))) throw new Error(`Instalment ${change.InstallmentNumber} could not be loaded to lower it.`);
        if (row.Status !== 'Scheduled' || row.DocumentNumber) {
            throw new Error(`Instalment ${change.InstallmentNumber} was invoiced while the amount change waited, so it can no longer be lowered.`);
        }
        if (change.NewAmount > 0) row.Amount = change.NewAmount;
        else row.Status = 'Canceled';
        if (!(await row.Save())) {
            throw new Error(`Instalment ${change.InstallmentNumber} could not be lowered: ${row.LatestResult?.CompleteMessage}`);
        }
    }
}

async function logAmountChanged(
    checked: CheckedAmountChange,
    concession: ApprovedAmountChange,
    results: Array<{ JournalEntryID?: string; EntryNumber?: string }>,
    ctx: ApprovalTaskContext,
): Promise<void> {
    const plan = checked.Recognition;
    const first = plan.CatchUpEntry ? 1 : 0;
    const event = await ctx.Provider.GetEntityObject<mjBizAppsOrdersSubscriptionEventEntity>(SUBSCRIPTION_EVENT_ENTITY, ctx.User);
    event.NewRecord();
    event.SubscriptionID = checked.SubscriptionID;
    event.EventType = 'AmountChanged';
    event.OccurredAt = new Date();
    event.RelatedOrderHeaderID = checked.OrderHeaderID;
    event.EventData = JSON.stringify({
        TermNumber: checked.TermNumber,
        Action: 'Amendment',
        OrderConcessionID: concession.ID,
        ReasonCategory: concession.ReasonCategory,
        PreviousAmount: checked.CurrentAmount,
        NewAmount: checked.NewAmount,
        EffectiveDate: isoDay(checked.EffectiveDate),
        TaxReduction: checked.TaxReduction,
        CatchUp: { Amount: plan.CatchUp, EntryNumber: plan.CatchUpEntry ? (results[0]?.EntryNumber ?? null) : null },
        Offsets: plan.Targets.map((target, i) => ({ Offsets: target.EntryNumber, EntryNumber: results[first + i]?.EntryNumber ?? null })),
        NewSchedule: plan.Respread.map((d, i) => ({
            EffectiveDate: d.EffectiveDate,
            Amount: d.Lines[0].DebitAmount ?? 0,
            EntryNumber: results[first + plan.Offsets.length + i]?.EntryNumber ?? null,
        })),
        Instalments: checked.Billing.Instalments,
        ScheduleReduction: checked.ScheduleReduction,
    });
    if (!(await event.Save())) {
        throw new Error(`The amount change of term ${checked.TermNumber} could not be logged: ${event.LatestResult?.CompleteMessage}`);
    }
}

function acknowledgmentDescription(checked: CheckedAmountChange, concession: ApprovedAmountChange): string {
    const plan = checked.Recognition;
    const instalments = checked.Billing.Instalments
        .map((c) => `  #${c.InstallmentNumber}  due ${c.DueDate}  ${c.CurrentAmount.toFixed(2)} -> ${c.NewAmount > 0 ? c.NewAmount.toFixed(2) : 'cancelled'}`)
        .join('\n');
    const before = plan.Targets.map((t) => `  ${isoDay(t.EffectiveDate)}  ${t.EntryNumber}  ${t.Lines.reduce((s, l) => s + Number(l.DebitAmount ?? 0), 0)}`).join('\n');
    const after = plan.Respread.map((d) => `  ${d.EffectiveDate}  ${d.Lines[0].DebitAmount ?? 0}`).join('\n');
    return [
        `Term ${checked.TermNumber} of ${checked.SubscriptionNumber} went from ${checked.CurrentAmount.toFixed(2)} to ` +
            `${checked.NewAmount.toFixed(2)} (${concession.ReasonCategory}: ${concession.Reason}). The reduction and its tax, ` +
            `${checked.GrossReduction.toFixed(2)}, came off the instalments not yet invoiced; no invoice was credited. ` +
            `Confirm the catch-up and the re-cut below, then complete this task.`,
        '',
        `Catch-up on ${isoDay(checked.EffectiveDate)}: ${plan.CatchUp.toFixed(2)} of revenue already earned taken back.`,
        plan.Targets.length ? `Replaced: ${plan.Targets.length} staged entries, each offset on its own date.\n${before}` : '',
        plan.Respread.length ? `New schedule, ${plan.Remaining} over ${plan.Respread.length} entries:\n${after}` : '',
        instalments ? `Instalments:\n${instalments}` : '',
    ]
        .filter((part) => part !== '')
        .join('\n\n')
        .trim();
}

function changeLabel(checked: CheckedAmountChange): string {
    return `term ${checked.TermNumber} of ${checked.SubscriptionNumber} reduced to ${checked.NewAmount.toFixed(2)}`;
}

function isoDay(day: Date): string {
    return day.toISOString().slice(0, 10);
}

/** An approved amount change, as what it takes off its line. */
export interface AppliedAmountChange {
    OrderLineID: string;
    CompanyID: string;
    /** The reduction before tax: the concession's value. */
    Net: number;
    /** The tax on it. */
    Tax: number;
    /** Both: the concession's ScheduleReduction. */
    Gross: number;
}

/**
 * The approved amount changes on an order. The schedule check and each instalment invoice take them off the
 * lines they changed, so the lowered instalments still tie to the lines.
 */
export async function AppliedAmountChanges(orderHeaderID: string, ctx: ApprovalTaskContext): Promise<AppliedAmountChange[]> {
    const orderID = RequireUUID(orderHeaderID, 'OrderHeaderID');
    const changes = await view<{ OrderLineID: string; ComputedValue: number; ScheduleReduction: number }>(ctx, {
        EntityName: ORDER_CONCESSION_ENTITY,
        ExtraFilter: `OrderHeaderID = '${orderID}' AND Status = 'Approved' AND ScheduleReduction IS NOT NULL`,
        Fields: ['OrderLineID', 'ComputedValue', 'ScheduleReduction'],
        ResultType: 'simple',
    });
    if (changes.length === 0) return [];
    const lines = await view<{ ID: string; CompanyID: string }>(ctx, {
        EntityName: ORDER_LINE_ENTITY,
        ExtraFilter: `OrderHeaderID = '${orderID}'`,
        Fields: ['ID', 'CompanyID'],
        ResultType: 'simple',
    });
    return changes.map((c) => {
        const line = lines.find((l) => l.ID.toLowerCase() === String(c.OrderLineID).toLowerCase());
        if (!line) throw new Error(`The line an approved amount change names (${c.OrderLineID}) is not on order ${orderID}.`);
        const net = money(Number(c.ComputedValue));
        const gross = money(Number(c.ScheduleReduction));
        return { OrderLineID: line.ID, CompanyID: line.CompanyID, Net: net, Tax: money(gross - net), Gross: gross };
    });
}

interface ScheduleRow {
    ID: string;
    CompanyID: string;
    AmountPaid: number | null;
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
