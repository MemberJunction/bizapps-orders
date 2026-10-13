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
 *   - what they cannot absorb is credited on a credit memo (#662): see below;
 *   - an `AmountChanged` subscription event records it, and accounting's acknowledgment task is raised.
 * The concession's `ScheduleReduction` and `CreditMemoAmount` (set by the concession itself) are what the order's
 * balance takes off the booked lines; the schedule check takes off only `ScheduleReduction`.
 *
 * THE CREDIT MEMO IS THE APPROVED CHANGE ITSELF (#662). A reduction the uninvoiced instalments cannot absorb in full
 * (part of it lands on an invoice already sent, the order is billed as a whole, or a refund is asked for) is
 * credited on a memo the concession carries: its amount and document number. Applying it
 *   - posts the memo's entry, dated the effective day: deferred revenue and tax debited, the receivable credited;
 *   - credits the invoiced instalment it names, up to that invoice's open amount (`AmountCredited`), or, when the
 *     customer asked for a paid invoice's credit back, records it there for finance to refund;
 *   - lowers the line's `BilledToDate` by the memo's net, as a return's memo does.
 * Whatever no invoice takes is the customer's credit: the order's balance falls by the memo, so a paid order goes
 * negative, which is how an account credit is held (D68). A refund is not paid here; finance refunds it from the
 * order's payments with `Orders.RefundPayment`, and the acknowledgment task says so.
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
 *   - the line would stay billed for more than its new amount;
 *   - a credit memo is needed and the line carries a charge other than tax, whose share nothing can say;
 *   - no one other than the requester holds the acknowledgment role, so accounting could not be told.
 *
 * CONNECTS TO:
 *   PLAN:   ./AmountChangePlan.ts
 *   SHARES: ./TermExtension.ts (renewal check, acknowledgers, the term's driver, its staged entries, the task)
 *           ./ReversalBehavior.ts + ./ReversalResolver.ts (the tax the line was charged, mirrored)
 *           ./PaymentScheduleBehavior.ts (which rows bill the line's company)
 *   CALLER: AmendArrangementOperation (preview) · OrderConcessionEntityServer (value, apply)
 *   WRITES: Accounting.CreateJournalEntries · Subscription Terms · Order Header Payment Schedules ·
 *           Order Lines (BilledToDate) · Subscription Events · Tasks
 */
import { RunView, type EntitySaveOptions, type IRunViewProvider } from '@memberjunction/core';
import type { mjBizAppsOrdersOrderLineEntity, mjBizAppsOrdersSubscriptionEventEntity } from '@mj-biz-apps/orders-entities';
import { BuildGLAccountResolver, EntityIDFor, SubmitJournalEntryDrafts } from './AccountingBridge.js';
import {
    CreditMemoEntry,
    CreditMemoNumber,
    PlanAmountChange,
    PlanReduction,
    ScheduleShare,
    SplitCreditMemo,
    type AmountChangePlan,
    type CreditMemoSplit,
    type InstalmentChange,
    type ReductionPlan,
} from './AmountChangePlan.js';
import { CalendarDayOrToday } from './calendar-day.js';
import type { ApprovalTaskContext } from './ConcessionApprovalTask.js';
import { ORDER_CONCESSION_ENTITY, ORDER_HEADER_ENTITY, ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY, ORDER_LINE_ENTITY } from './entity-names.js';
import { GL_ROLE } from './GLAccountResolver.js';
import { ResolveInstalmentEntryType } from './InstalmentInvoiceEntry.js';
import { OrderJournalEntryFactory, type JEDraft } from './OrderJournalEntryFactory.js';
import { SanctionInstalmentCredit, type OrderHeaderPaymentScheduleEntityServer } from './OrderHeaderPaymentScheduleEntityServer.js';
import { ScheduleCoverage } from './PaymentScheduleBehavior.js';
import { MirroredTaxCharges } from './ReversalBehavior.js';
import { LoadOriginTaxCharges } from './ReversalResolver.js';
import { RequireUUID } from './sql-guards.js';
import { SanctionTermAmendment, type SubscriptionTermEntityServer } from './SubscriptionTermEntityServer.js';
import {
    AcknowledgerIDs,
    RaiseRecutAcknowledgment,
    RenewalAlreadyPlaced,
    StagedRecognitionEntries,
    TermRecognition,
    type TermRow,
} from './TermExtension.js';

const SUBSCRIPTION_ENTITY = 'MJ_BizApps_Orders: Subscriptions';
const SUBSCRIPTION_TERM_ENTITY = 'MJ_BizApps_Orders: Subscription Terms';
const PRODUCT_ENTITY = 'MJ_BizApps_Orders: Products';
const CHARGE_TYPE_ENTITY = 'MJ_BizApps_Orders: Charge Types';
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
    /** The concession being approved or applied, which is not one of the line's earlier changes. */
    OrderConcessionID?: string | null;
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
    /** The rest of the gross reduction, credited on a credit memo, as net and tax. Zero when none is needed. */
    CreditMemo: CreditMemoSplit;
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

    const scheduleReduction = money(billing.Instalments.reduce((sum, c) => sum + c.CurrentAmount - c.NewAmount, 0));
    const creditMemo = SplitCreditMemo(billing.CreditMemo, recognition.Reduction, grossReduction);

    // Only tax follows a reduction: a shipping or other charge on the line has no share of it, so neither a later
    // instalment invoice nor a credit memo could say what part of that charge goes.
    if ((billing.Instalments.length > 0 || creditMemo.Gross > 0) && money(Number(line.ChargeAmount ?? 0)) !== 0) {
        return (
            `Line ${line.LineNumber} carries a charge other than tax, and lowering it cannot say what part of that ` +
            `charge goes. Correct it with a correcting order.`
        );
    }
    // The line stays billed for no more than its new amount: what it has billed, less what this change's credit
    // memo gives back, cannot pass what the line comes to. Earlier memos already lowered BilledToDate.
    const self = request.OrderConcessionID?.toLowerCase() ?? null;
    const earlier = (await AppliedAmountChanges(line.OrderHeaderID, ctx)).filter(
        (c) => c.OrderLineID.toLowerCase() === line.ID.toLowerCase() && c.OrderConcessionID.toLowerCase() !== self,
    );
    const lineNetAfter = money(lineNet - earlier.reduce((sum, c) => sum + c.ReducedNet, 0) - recognition.Reduction);
    const billed = money(Math.abs(Number(line.BilledToDate ?? 0)));
    if (money(billed - creditMemo.Net) > lineNetAfter) {
        return (
            `Line ${line.LineNumber} has already billed ${billed.toFixed(2)} before tax, and after this change's credit memo ` +
            `of ${creditMemo.Net.toFixed(2)} it would still be billed for more than the ${lineNetAfter.toFixed(2)} it comes to. ` +
            `Name the invoice to credit in AppliesToInvoiceID, or correct it with a correcting order.`
        );
    }

    // An instalment keeps at least what was already paid on it: an uninvoiced instalment is lowered, not credited, so
    // going below would leave paid money that nothing bills for.
    for (const change of billing.Instalments) {
        const row = instalments.find((r) => r.ID === change.ID);
        const paid = money(Number(row?.AmountPaid ?? 0));
        if (row && change.NewAmount < paid) {
            return (
                `Instalment ${change.InstallmentNumber} has ${paid.toFixed(2)} paid on it and would go down to ` +
                `${change.NewAmount.toFixed(2)}. Lower the amount by less, or name a paid invoice in AppliesToInvoiceID ` +
                `and ask for a refund.`
            );
        }
    }

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
        CreditMemo: creditMemo,
        AcknowledgerIDs: acknowledgers,
    };
}

/** The document number the order's next credit memo takes. */
export async function NextCreditMemoNumber(orderHeaderID: string, orderNumber: string | null, ctx: ApprovalTaskContext): Promise<string> {
    if (!orderNumber) throw new Error(`Order ${orderHeaderID} has no order number, so its credit memo cannot be numbered.`);
    const issued = await view<{ CreditMemoNumber: string | null }>(ctx, {
        EntityName: ORDER_CONCESSION_ENTITY,
        ExtraFilter: `OrderHeaderID = '${RequireUUID(orderHeaderID, 'OrderHeaderID')}' AND CreditMemoNumber IS NOT NULL`,
        Fields: ['CreditMemoNumber'],
        ResultType: 'simple',
    });
    return CreditMemoNumber(orderNumber, issued.map((r) => r.CreditMemoNumber));
}

/** The approved concession an amount change is applied from. */
export interface ApprovedAmountChange {
    ID: string;
    SubscriptionTermID: string;
    NewAmount: number;
    AppliesToPaymentScheduleID: string | null;
    RefundRequested: boolean;
    RequestedByUserID: string;
    ReasonCategory: string;
    Reason: string;
    /** The reduction the concession was valued at when recorded. */
    ComputedValue: number;
    /** The credit memo stamped on approval, and its number. Zero and null when none is needed. */
    CreditMemoAmount: number;
    CreditMemoNumber: string | null;
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
            RefundRequested: concession.RefundRequested,
            RequestedByUserID: concession.RequestedByUserID,
            OrderConcessionID: concession.ID,
        },
        ctx,
    );
    if (typeof checked === 'string') throw new Error(`The amount change cannot be applied: ${checked}`);
    if (money(checked.Recognition.Reduction) !== money(concession.ComputedValue)) {
        throw new Error(
            `The amount change cannot be applied: term ${checked.TermNumber} is now ${checked.CurrentAmount.toFixed(2)}, so ` +
                `lowering it to ${checked.NewAmount.toFixed(2)} is a reduction of ${checked.Recognition.Reduction.toFixed(2)}, ` +
                `not the ${money(concession.ComputedValue).toFixed(2)} this concession was recorded for. Reject it and record it again.`,
        );
    }
    if (checked.CreditMemo.Gross !== money(concession.CreditMemoAmount) || (checked.CreditMemo.Gross > 0 && !concession.CreditMemoNumber)) {
        throw new Error(
            `The amount change cannot be applied: it now needs a credit memo of ${checked.CreditMemo.Gross.toFixed(2)}, not the ` +
                `${money(concession.CreditMemoAmount).toFixed(2)} recorded on approval; the order changed meanwhile. Try again.`,
        );
    }
    const plan = checked.Recognition;
    if (plan.CatchUp > 0 && !plan.CatchUpEntry) {
        throw new Error(
            `The amount change cannot be applied: term ${checked.TermNumber} was recognised in full when it was booked, so ` +
                `there is no deferred revenue to take the reduction from. Correct it with a correcting order.`,
        );
    }

    const memoEntry = concession.CreditMemoNumber && checked.CreditMemo.Gross > 0 ? await creditMemoDraft(checked, concession.CreditMemoNumber, ctx) : null;
    const drafts = [...(plan.CatchUpEntry ? [plan.CatchUpEntry] : []), ...plan.Offsets, ...plan.Respread, ...(memoEntry ? [memoEntry] : [])];
    const written = drafts.length
        ? await SubmitJournalEntryDrafts(drafts, `the amount change of ${changeLabel(checked)}`, ctx.Provider, ctx.User)
        : { Success: true, Results: [] };

    await setTermAmount(checked, ctx);
    await lowerInstalments(checked, ctx);
    if (memoEntry) {
        await creditInvoices(checked, concession, ctx);
        await unbillLine(checked, ctx);
    }
    await logAmountChanged(checked, concession, written.Results ?? [], ctx);
    await RaiseRecutAcknowledgment(
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

/** The credit memo's entry, on the accounts the line's own billing used, dated the effective day. */
async function creditMemoDraft(checked: CheckedAmountChange, documentNumber: string, ctx: ApprovalTaskContext): Promise<JEDraft> {
    const rv = new RunView(ctx.Provider as unknown as IRunViewProvider);
    const lines = await rv.RunView<mjBizAppsOrdersOrderLineEntity>(
        { EntityName: ORDER_LINE_ENTITY, ExtraFilter: `ID = '${RequireUUID(checked.OrderLineID, 'OrderLineID')}'`, ResultType: 'entity_object', BypassCache: true },
        ctx.User,
    );
    const line = lines.Results?.[0];
    if (!lines.Success || !line) throw new Error(`The order line that bought term ${checked.TermNumber} could not be read for its credit memo.`);
    const resolver = await BuildGLAccountResolver(ctx.Provider, ctx.User);
    const factory = new OrderJournalEntryFactory(
        resolver,
        EntityIDFor(ORDER_LINE_ENTITY),
        EntityIDFor(SUBSCRIPTION_TERM_ENTITY),
        EntityIDFor(CHARGE_TYPE_ENTITY),
        ctx.Provider,
        ctx.User,
    );
    const companyID = String(line.CompanyID);
    const facts = (await factory.BuildInstalmentLineFacts([line], companyID, checked.EffectiveDate))[0];
    if (!facts) throw new Error(`The order line that bought term ${checked.TermNumber} has no billing facts for its company.`);
    const resolve = (role: (typeof GL_ROLE)[keyof typeof GL_ROLE]): Promise<string> =>
        resolver.Resolve(role, facts.ProductID, facts.ProductCategoryID, companyID, checked.EffectiveDate, facts.ProductTypeID);
    const entry = CreditMemoEntry({
        Split: checked.CreditMemo,
        EffectiveDate: isoDay(checked.EffectiveDate),
        EntryType: await ResolveInstalmentEntryType(ctx.Provider, ctx.User),
        DocumentNumber: documentNumber,
        Label: changeLabel(checked),
        ProductName: facts.ProductName,
        LinkedEntityID: EntityIDFor(ORDER_LINE_ENTITY),
        LinkedRecordID: line.ID,
        Accounts: { AR: await resolve(GL_ROLE.AccountsReceivable), Deferred: await resolve(GL_ROLE.DeferredRevenue) },
        TaxCredits: facts.ChargeCredits,
        Dimensions: facts.Dimensions,
    });
    if (typeof entry === 'string') throw new Error(`The amount change cannot be applied: ${entry}`);
    return entry;
}

/**
 * What the credit memo credits on an invoice the customer holds: the named invoice up to its open amount, or, for a
 * paid invoice whose credit the customer asked to have back, the refund, which finance then pays from the order's
 * payments. Recorded beside the frozen amount, so the invoice's open balance falls by it.
 */
async function creditInvoices(checked: CheckedAmountChange, concession: ApprovedAmountChange, ctx: ApprovalTaskContext): Promise<void> {
    const credits = new Map<string, number>();
    for (const applied of checked.Billing.Applied) {
        if (applied.InstalmentID) credits.set(applied.InstalmentID, money((credits.get(applied.InstalmentID) ?? 0) + applied.Amount));
    }
    if (checked.Billing.Refund > 0 && concession.AppliesToPaymentScheduleID) {
        const id = concession.AppliesToPaymentScheduleID;
        credits.set(id, money((credits.get(id) ?? 0) + checked.Billing.Refund));
    }
    for (const [id, amount] of credits) {
        const row = await ctx.Provider.GetEntityObject<OrderHeaderPaymentScheduleEntityServer>(ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY, ctx.User);
        if (!(await row.Load(id))) throw new Error(`Instalment ${id} could not be loaded to credit it.`);
        const credited = money(Number(row.AmountCredited ?? 0) + amount);
        if (credited > money(Number(row.Amount))) {
            throw new Error(
                `Invoice ${row.DocumentNumber ?? row.InstallmentNumber} is for ${Number(row.Amount).toFixed(2)} and would be credited ` +
                    `${credited.toFixed(2)} in all. The amount change cannot be applied.`,
            );
        }
        SanctionInstalmentCredit(row);
        row.AmountCredited = credited;
        if (!(await row.Save())) {
            throw new Error(`Invoice ${row.DocumentNumber ?? row.InstallmentNumber} could not be credited: ${row.LatestResult?.CompleteMessage}`);
        }
    }
}

/** The memo gives back billed money, so the line's BilledToDate falls by its net, as a return's memo lowers it. */
async function unbillLine(checked: CheckedAmountChange, ctx: ApprovalTaskContext): Promise<void> {
    if (!(checked.CreditMemo.Net > 0)) return;
    const line = await ctx.Provider.GetEntityObject<mjBizAppsOrdersOrderLineEntity>(ORDER_LINE_ENTITY, ctx.User);
    if (!(await line.Load(checked.OrderLineID))) throw new Error(`Order line ${checked.OrderLineID} could not be loaded to lower its BilledToDate.`);
    line.BilledToDate = money(Number(line.BilledToDate ?? 0) - checked.CreditMemo.Net);
    if (!(await line.Save())) {
        throw new Error(`Order line ${checked.OrderLineID}'s BilledToDate could not be lowered: ${line.LatestResult?.CompleteMessage}`);
    }
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
    await LowerInstalments(checked.Billing.Instalments, 'the amount change waited', ctx);
}

/**
 * Write a reduction plan's instalments: each takes its new amount, or is cancelled at zero. Refuses an
 * instalment invoiced since the plan was made. `waited` finishes "was invoiced while …".
 */
export async function LowerInstalments(
    changes: InstalmentChange[],
    waited: string,
    ctx: ApprovalTaskContext,
    options?: EntitySaveOptions,
): Promise<void> {
    for (const change of changes) {
        const row = await ctx.Provider.GetEntityObject<OrderHeaderPaymentScheduleEntityServer>(ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY, ctx.User);
        if (!(await row.Load(change.ID))) throw new Error(`Instalment ${change.InstallmentNumber} could not be loaded to lower it.`);
        if (row.Status !== 'Scheduled' || row.DocumentNumber) {
            throw new Error(`Instalment ${change.InstallmentNumber} was invoiced while ${waited}, so it can no longer be lowered.`);
        }
        if (change.NewAmount > 0) row.Amount = change.NewAmount;
        else row.Status = 'Canceled';
        if (!(await row.Save(options))) {
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
        CreditMemo:
            checked.CreditMemo.Gross > 0
                ? {
                      DocumentNumber: concession.CreditMemoNumber,
                      Amount: checked.CreditMemo.Gross,
                      Net: checked.CreditMemo.Net,
                      Tax: checked.CreditMemo.Tax,
                      Applied: checked.Billing.Applied,
                      Refund: checked.Billing.Refund,
                      OpenCredit: checked.Billing.OpenCredit,
                      EntryNumber: results[results.length - 1]?.EntryNumber ?? null,
                  }
                : null,
    });
    if (!(await event.Save())) {
        throw new Error(`The amount change of term ${checked.TermNumber} could not be logged: ${event.LatestResult?.CompleteMessage}`);
    }
}

function acknowledgmentDescription(checked: CheckedAmountChange, concession: ApprovedAmountChange): string {
    const plan = checked.Recognition;
    const billing = checked.Billing;
    const instalments = billing.Instalments
        .map((c) => `  #${c.InstallmentNumber}  due ${c.DueDate}  ${c.CurrentAmount.toFixed(2)} -> ${c.NewAmount > 0 ? c.NewAmount.toFixed(2) : 'cancelled'}`)
        .join('\n');
    const before = plan.Targets.map((t) => `  ${isoDay(t.EffectiveDate)}  ${t.EntryNumber}  ${t.Lines.reduce((s, l) => s + Number(l.DebitAmount ?? 0), 0)}`).join('\n');
    const after = plan.Respread.map((d) => `  ${d.EffectiveDate}  ${d.Lines[0].DebitAmount ?? 0}`).join('\n');
    const memo = checked.CreditMemo;
    const where =
        memo.Gross > 0
            ? `The reduction and its tax came to ${checked.GrossReduction.toFixed(2)}: ${checked.ScheduleReduction.toFixed(2)} came ` +
              `off the instalments not yet invoiced, and ${memo.Gross.toFixed(2)} (${memo.Net.toFixed(2)} and ${memo.Tax.toFixed(2)} ` +
              `tax) was credited on credit memo ${concession.CreditMemoNumber}.`
            : `The reduction and its tax, ${checked.GrossReduction.toFixed(2)}, came off the instalments not yet invoiced; no ` +
              `invoice was credited.`;
    const credited = billing.Applied.map((a) => `  ${a.DocumentNumber ?? 'the order'}  ${a.Amount.toFixed(2)}`).join('\n');
    const refund =
        billing.Refund > 0
            ? `Refund owed: ${billing.Refund.toFixed(2)}, which the customer asked to have back. It is recorded as a credit on ` +
              `the paid invoice and on the order's balance. Refund it from the order's payments with Orders.RefundPayment.`
            : '';
    const open =
        billing.OpenCredit > 0
            ? `Left as the customer's credit: ${billing.OpenCredit.toFixed(2)}, on the order's balance. It can be spent on ` +
              `another order with Orders.ApplyAccountCredit, or refunded with Orders.RefundPayment.`
            : '';
    // The customer's copy of the memo is sent on purpose, not by the approval: sending reaches someone outside the
    // company and cannot be taken back (#684).
    const send =
        memo.Gross > 0
            ? `Send the customer credit memo ${concession.CreditMemoNumber} with Orders.SendDocument, naming this concession in ` +
              `OrderConcessionID. It goes by email, also for a company that invoices through Bill.com.`
            : '';
    return [
        `Term ${checked.TermNumber} of ${checked.SubscriptionNumber} went from ${checked.CurrentAmount.toFixed(2)} to ` +
            `${checked.NewAmount.toFixed(2)} (${concession.ReasonCategory}: ${concession.Reason}). ${where} ` +
            `Confirm the catch-up and the re-cut below${memo.Gross > 0 ? ', send the credit memo' : ''}` +
            `${billing.Refund > 0 ? ', pay the refund' : ''}, then complete this task.`,
        '',
        `Catch-up on ${isoDay(checked.EffectiveDate)}: ${plan.CatchUp.toFixed(2)} of revenue already earned taken back.`,
        plan.Targets.length ? `Replaced: ${plan.Targets.length} staged entries, each offset on its own date.\n${before}` : '',
        plan.Respread.length ? `New schedule, ${plan.Remaining} over ${plan.Respread.length} entries:\n${after}` : '',
        instalments ? `Instalments:\n${instalments}` : '',
        credited ? `Credited by the memo:\n${credited}` : '',
        send,
        refund,
        open,
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
    OrderConcessionID: string;
    OrderLineID: string;
    CompanyID: string;
    /** What it took off the line's instalment billing, before tax: the schedule reduction's net. */
    Net: number;
    /** The tax on that. */
    Tax: number;
    /** Both: the concession's ScheduleReduction. Zero when a credit memo took the whole reduction. */
    Gross: number;
    /** The whole reduction before tax, credit memo included: the concession's value. */
    ReducedNet: number;
}

/**
 * The approved amount changes on an order. The schedule check and each instalment invoice take their schedule
 * reductions off the lines they changed, so the lowered instalments still tie to the lines. A credit memo's part is
 * not taken off: it was billed on an invoice already sent, and the memo gives it back.
 */
export async function AppliedAmountChanges(orderHeaderID: string, ctx: ApprovalTaskContext): Promise<AppliedAmountChange[]> {
    const orderID = RequireUUID(orderHeaderID, 'OrderHeaderID');
    const changes = await view<{ ID: string; OrderLineID: string; ComputedValue: number; ScheduleReduction: number | null; CreditMemoAmount: number | null }>(ctx, {
        EntityName: ORDER_CONCESSION_ENTITY,
        ExtraFilter:
            `OrderHeaderID = '${orderID}' AND Status = 'Approved' AND NewAmount IS NOT NULL ` +
            `AND (ScheduleReduction IS NOT NULL OR CreditMemoAmount IS NOT NULL)`,
        Fields: ['ID', 'OrderLineID', 'ComputedValue', 'ScheduleReduction', 'CreditMemoAmount'],
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
        const reduced = money(Number(c.ComputedValue));
        const share = ScheduleShare(Number(c.ScheduleReduction ?? 0), Number(c.CreditMemoAmount ?? 0), reduced);
        return { OrderConcessionID: c.ID, OrderLineID: line.ID, CompanyID: line.CompanyID, Net: share.Net, Tax: share.Tax, Gross: share.Gross, ReducedNet: reduced };
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
