/**
 * ReversalScheduleReduction — what a return takes off an instalment-billed order's instalments (#661).
 *
 * A return is a separate order whose lines point at the lines they take back. When the origin order is
 * billed by instalment, booking the return credits the customer with a credit memo for the returned
 * units' share of what was invoiced and not yet earned (./ContractBalance.ts). What the returned units
 * had NOT yet been invoiced for is the other half: it comes off the origin's instalments not yet
 * invoiced, and it is recorded on the returning line as `ScheduleReduction`.
 *
 * THE RETURNED UNITS' SHARE OF WHAT IS STILL TO BE INVOICED, not the returned value less the memo. The
 * revenue already earned on the returned units stays earned and stays billed, so the customer still
 * owes it. A 600 line with 150 invoiced and 50 earned, half returned: the memo credits 50 of the 75
 * invoiced for that half, the half kept still owes 300, and the instalments lose 225 of the 450 they
 * had left. Taking off the returned value less the memo (250) would leave the 25 earned unbilled.
 *
 * "Still to be invoiced" is read the way the invoices bill it: each uninvoiced instalment's tied slice
 * of the line (./InstalmentInvoiceEntry.ts), after earlier amount changes and returns lowered it.
 *
 * READ BACK as a reduction of the origin line, beside approved amount changes: the schedule check and
 * each instalment invoice take both off the lines, so the lowered instalments still tie to them.
 *
 * CONNECTS TO:
 *   CALLER: OrderEntityServer (confirm of a return) · IssueInstalmentInvoiceOperation (tie and slicing)
 *   USES:   ./AmountChange.ts (amount changes, lowering instalments) · ./AmountChangePlan.ts (the spread)
 *           ./InstalmentInvoiceEntry.ts (the slicing) · ./PaymentScheduleBehavior.ts (company slices)
 */
import { RunView, type IRunViewProvider } from '@memberjunction/core';
import type { mjBizAppsOrdersOrderLineEntity } from '@mj-biz-apps/orders-entities';
import { BuildGLAccountResolver, EntityIDFor } from './AccountingBridge.js';
import { AppliedAmountChanges, type AppliedAmountChange } from './AmountChange.js';
import { ReduceLineAmounts } from './AmountChangePlan.js';
import { CalendarDayOrToday } from './calendar-day.js';
import type { ApprovalTaskContext } from './ConcessionApprovalTask.js';
import { ORDER_HEADER_ENTITY, ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY, ORDER_LINE_ENTITY } from './entity-names.js';
import { SliceLayout, TiedSlice, type InstalmentLineFacts } from './InstalmentInvoiceEntry.js';
import { OrderJournalEntryFactory } from './OrderJournalEntryFactory.js';
import { CompanySlices } from './PaymentScheduleBehavior.js';
import { RequireUUID } from './sql-guards.js';

const CHARGE_TYPE_ENTITY = 'MJ_BizApps_Orders: Charge Types';
const SUBSCRIPTION_TERM_ENTITY = 'MJ_BizApps_Orders: Subscription Terms';

const money = (n: number): number => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/**
 * What an order's instalments not yet invoiced will still bill one line. Another charge on the line
 * (shipping, say) is left out: a return does not give it back.
 */
export interface LineStillToBill {
    /** Before tax. */
    Net: number;
    /** The tax on it. */
    Tax: number;
}

/** One instalment, as the slicing reads it. */
export interface SlicedInstalment {
    Amount: number;
    Status: string;
    /** Set once invoiced, and never cleared. */
    DocumentNumber?: string | null;
}

/**
 * Per line, what the instalments not yet invoiced will still bill it: the sum of each such instalment's
 * tied slice. `instalments` are one company's live rows in instalment order, as an invoice slices them.
 * The slices carry tax and other charges together, so the tax is their share in the line's own
 * proportion. Pure.
 */
export function StillToBillByLine(
    lines: Array<Pick<InstalmentLineFacts, 'ID' | 'Quantity' | 'Net' | 'Tax' | 'Charges' | 'ChargeCredits'>>,
    instalments: SlicedInstalment[],
): Map<string, LineStillToBill> {
    const sums = new Map<string, { Net: number; Other: number }>(lines.map((l) => [l.ID.toLowerCase(), { Net: 0, Other: 0 }]));
    const layout = lines.map(SliceLayout);
    const amounts = instalments.map((i) => money(Number(i.Amount)));
    instalments.forEach((instalment, index) => {
        if (instalment.Status !== 'Scheduled' || instalment.DocumentNumber) return;
        const pieces = TiedSlice(layout.flat(), amounts, index);
        let at = 0;
        lines.forEach((line, j) => {
            const mine = pieces.slice(at, at + layout[j].length).map(Math.abs);
            at += layout[j].length;
            const sum = sums.get(line.ID.toLowerCase()) as { Net: number; Other: number };
            sum.Net = money(sum.Net + mine[0]);
            sum.Other = money(sum.Other + mine.slice(1).reduce((t, p) => t + p, 0));
        });
    });
    return new Map(
        lines.map((line) => {
            const sum = sums.get(line.ID.toLowerCase()) as { Net: number; Other: number };
            const taxAndCharges = Math.abs(Number(line.Tax)) + Math.abs(Number(line.Charges));
            const tax = taxAndCharges > 0 ? money((sum.Other * Math.abs(Number(line.Tax))) / taxAndCharges) : 0;
            return [line.ID.toLowerCase(), { Net: sum.Net, Tax: tax }];
        }),
    );
}

/**
 * The gross one returning line takes off the origin's instalments: the returned units' share of what
 * they still bill the origin line, tax included. Pure.
 *
 * @param returned  the returning line's quantity, as a magnitude
 * @param remaining the origin quantity not yet taken back by another order
 */
export function ReturnScheduleReduction(stillToBill: LineStillToBill, returned: number, remaining: number): number {
    const quantity = Math.abs(Number(returned));
    if (!(remaining > 0) || quantity > remaining + 1e-9) {
        throw new Error(`Returning ${quantity} of an origin line with ${remaining} left to take back; the return should have been refused.`);
    }
    return money(((stillToBill.Net + stillToBill.Tax) * quantity) / remaining);
}

/**
 * A reduction's split between its net and its tax, in the origin line's own proportion. One rule, used
 * wherever a returning line's reduction is read, so every reader slices the line the same way. Pure.
 */
export function SplitReturnReduction(gross: number, origin: { Net: number; Tax: number }): { Net: number; Tax: number } {
    const net = Math.abs(Number(origin.Net));
    const lineTax = Math.abs(Number(origin.Tax));
    const tax = net + lineTax > 0 ? money((money(gross) * lineTax) / (net + lineTax)) : 0;
    return { Net: money(money(gross) - tax), Tax: tax };
}

/** What a schedule reduction took off one line's instalment billing: an amount change's or a return's. */
export type AppliedScheduleReduction = Pick<AppliedAmountChange, 'OrderLineID' | 'CompanyID' | 'Net' | 'Tax' | 'Gross'>;

/** The reductions returns have taken off an order's lines, as amount changes read. */
export async function AppliedReturnReductions(orderHeaderID: string, ctx: ApprovalTaskContext): Promise<AppliedScheduleReduction[]> {
    const orderID = RequireUUID(orderHeaderID, 'OrderHeaderID');
    const returns = await view<{ ReversesOrderLineID: string; ScheduleReduction: number }>(ctx, {
        EntityName: ORDER_LINE_ENTITY,
        ExtraFilter:
            `ScheduleReduction > 0 AND ReversesOrderLineID IN ` +
            `(SELECT ID FROM __mj_BizAppsOrders.OrderLine WHERE OrderHeaderID = '${orderID}')`,
        Fields: ['ReversesOrderLineID', 'ScheduleReduction'],
        ResultType: 'simple',
    });
    if (returns.length === 0) return [];
    const lines = await view<{ ID: string; CompanyID: string; LineTotalNet: number | null; LineTax: number | null }>(ctx, {
        EntityName: ORDER_LINE_ENTITY,
        ExtraFilter: `OrderHeaderID = '${orderID}'`,
        Fields: ['ID', 'CompanyID', 'LineTotalNet', 'LineTax'],
        ResultType: 'simple',
    });
    return returns.map((r) => {
        const line = lines.find((l) => l.ID.toLowerCase() === String(r.ReversesOrderLineID).toLowerCase());
        if (!line) throw new Error(`The line a return reduced (${r.ReversesOrderLineID}) is not on order ${orderID}.`);
        const gross = money(Number(r.ScheduleReduction));
        const split = SplitReturnReduction(gross, { Net: Number(line.LineTotalNet ?? 0), Tax: Number(line.LineTax ?? 0) });
        return { OrderLineID: line.ID, CompanyID: line.CompanyID, Net: split.Net, Tax: split.Tax, Gross: gross };
    });
}

/** Everything taken off an order's lines that its instalments no longer bill: approved amount changes and returns. */
export async function AppliedScheduleReductions(orderHeaderID: string, ctx: ApprovalTaskContext): Promise<AppliedScheduleReduction[]> {
    const [changes, returns] = await Promise.all([AppliedAmountChanges(orderHeaderID, ctx), AppliedReturnReductions(orderHeaderID, ctx)]);
    return [...changes, ...returns];
}

/**
 * Per line of an order billed by instalment, what its instalments not yet invoiced will still bill it,
 * sliced exactly as each instalment invoice will slice it. Reads only.
 */
export async function OrderStillToBill(orderHeaderID: string, ctx: ApprovalTaskContext): Promise<Map<string, LineStillToBill>> {
    const orderID = RequireUUID(orderHeaderID, 'OrderHeaderID');
    const rv = new RunView(ctx.Provider as unknown as IRunViewProvider);
    const order = (await view<{ CompanyID: string }>(ctx, { EntityName: ORDER_HEADER_ENTITY, ExtraFilter: `ID = '${orderID}'`, Fields: ['CompanyID'], ResultType: 'simple' }))[0];
    if (!order) throw new Error(`Order ${orderID} was not found.`);
    const lines = await rv.RunView<mjBizAppsOrdersOrderLineEntity>(
        { EntityName: ORDER_LINE_ENTITY, ExtraFilter: `OrderHeaderID = '${orderID}'`, OrderBy: 'LineNumber', ResultType: 'entity_object' },
        ctx.User,
    );
    if (!lines.Success) throw new Error(`The lines of order ${orderID} could not be read: ${lines.ErrorMessage ?? 'unknown error'}`);
    const rows = await view<{ ID: string; CompanyID: string; InstallmentNumber: number; Amount: number; Status: string; DocumentNumber: string | null }>(ctx, {
        EntityName: ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY,
        ExtraFilter: `OrderHeaderID = '${orderID}'`,
        Fields: ['ID', 'CompanyID', 'InstallmentNumber', 'Amount', 'Status', 'DocumentNumber'],
        ResultType: 'simple',
    });
    const reductions = await AppliedScheduleReductions(orderID, ctx);
    const billedLines = [
        ...(lines.Results ?? []).map((l) => ({ CompanyID: String(l.CompanyID), LineTotalGross: Number(l.LineTotalGross ?? 0) })),
        ...reductions.map((r) => ({ CompanyID: r.CompanyID, LineTotalGross: -r.Gross })),
    ];
    const slices = CompanySlices(
        rows.filter((r) => r.Status !== 'Canceled'),
        billedLines,
        order.CompanyID,
    );
    const factory = new OrderJournalEntryFactory(
        await BuildGLAccountResolver(ctx.Provider, ctx.User),
        EntityIDFor(ORDER_LINE_ENTITY),
        EntityIDFor(SUBSCRIPTION_TERM_ENTITY),
        EntityIDFor(CHARGE_TYPE_ENTITY),
        ctx.Provider,
        ctx.User,
    );
    const today = await CalendarDayOrToday(null, ctx.Provider, ctx.User);
    const out = new Map<string, LineStillToBill>();
    for (const company of new Set((lines.Results ?? []).map((l) => String(l.CompanyID)))) {
        const facts = (await factory.BuildInstalmentLineFacts(lines.Results ?? [], company, today)).map((l) => ReduceLineAmounts(l, reductions));
        if (!facts.length) continue;
        const instalments = slices
            .filter((s) => String(s.CompanyID).toLowerCase() === company.toLowerCase())
            .sort((a, b) => Number(a.InstallmentNumber) - Number(b.InstallmentNumber));
        for (const [id, still] of StillToBillByLine(facts, instalments)) out.set(id, still);
    }
    return out;
}

async function view<T>(ctx: ApprovalTaskContext, params: Parameters<RunView['RunView']>[0]): Promise<T[]> {
    const rv = new RunView(ctx.Provider as unknown as IRunViewProvider);
    const result = await rv.RunView<T>(params, ctx.User);
    if (!result.Success) throw new Error(`Could not read ${params.EntityName}: ${result.ErrorMessage ?? 'unknown error'}`);
    return result.Results ?? [];
}
