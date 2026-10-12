/**
 * Orders.AmendArrangement — change a booked arrangement and keep it alive (golive #221).
 *
 * Case B, a term extended at no charge, is what this supports today: the caller names a term and its new end
 * date, with the reason. `Preview` returns what the extension would do — its value, the staged entries it
 * offsets and the new schedule — and writes nothing. Otherwise it records a Duration `OrderConcession`, which
 * is valued and routed for approval like any other; the extension takes effect when that concession is
 * approved, in the approval's own transaction (see ./TermExtension.ts). A requester within their own authority
 * is approved on save, so the extension applies in this call.
 *
 * A referral extension (#529) names its `ReferralProgramID`, with the reason category Referral. The program approves
 * it when it is in program (see ./ReferralProgram.ts); `Preview` says whether it would, and the extension applies in
 * this call when it does. More days than the program grants are recorded Pending, like any other concession.
 *
 * A change of amount (case A, #506): the caller names a term and its new, lower amount, optionally the invoice the
 * reduction is about. `Preview` returns the plan from ./AmountChange.ts: the catch-up, the staged entries offset and
 * the new schedule, the instalments reduced and the credit memo. Recording one is refused until its application
 * (the credit-memo document, the entries, the instalment rewrite and accounting's task) exists.
 *
 * A shift (#507) moves the term's start and end by the same number of days: the caller names the term and its
 * new start, and the new end follows. It records a Shift `OrderConcession`, valued at zero, which goes through
 * under the `TermShiftReviewDays` setting and otherwise waits for finance to review it; it takes effect when
 * approved (see ./TermShift.ts). `Preview` returns the offsets, the new schedule and the catch-up or reversal for
 * periods already behind us. Finance escalates a shift awaiting its review to the ConcessionLimit approver by
 * naming the concession in `EscalateOrderConcessionID`, with the reason. A shortening (an earlier end, or a later
 * start with the same end) is refused until the credit-memo path its credit follows exists.
 *
 * A confirmed order's payment terms (#309): the caller names the order and its new terms instead of a term. It
 * records a Terms `OrderConcession`, which always waits for someone other than the requester to approve it; the
 * terms and the due date change when it is approved (see ./PaymentTermsChange.ts). `Preview` returns the change in
 * days to payment and the new due date.
 *
 * CONNECTS TO:
 *   PLAN:    ./TermExtension.ts (CheckTermExtension) · ./PaymentTermsChange.ts (CheckTermsChange)
 *            ./AmountChange.ts (CheckAmountChange) · ./ReferralProgram.ts (CheckReferralProgram)
 *            ./TermShift.ts (CheckTermShift)
 *   RECORDS: OrderConcessionEntityServer (value, approval, application)
 */
import {
    BaseRemotableOperation,
    RunView,
    type IMetadataProvider,
    type IRunViewProvider,
    type UserInfo,
} from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    OrdersAmendArrangementOperation as OrdersAmendArrangementOperationBase,
    AsDateValue,
    type AmendArrangementInput,
    type AmendArrangementOutput,
    ConcessionValue,
    InclusiveDays,
    SplitTermDateChange,
    type mjBizAppsOrdersOrderConcessionEntity,
} from '@mj-biz-apps/orders-entities';
import { ORDER_CONCESSION_ENTITY, ORDER_LINE_ENTITY } from './entity-names.js';
import { RequireOptionalDay, RequireUUID } from './sql-guards.js';
import { CheckAmountChange } from './AmountChange.js';
import { CheckTermsChange } from './PaymentTermsChange.js';
import { CheckReferralProgram, type ReferralProgramVerdict } from './ReferralProgram.js';
import { AsDay, CheckTermExtension, IsoDay } from './TermExtension.js';
import { CheckTermShift } from './TermShift.js';
import type { OrderConcessionEntityServer } from './OrderConcessionEntityServer.js';

const REASON_CATEGORIES: readonly string[] = ['Retention', 'Referral', 'Other'];

@RegisterClass(BaseRemotableOperation, 'Orders.AmendArrangement')
export class AmendArrangementOperation extends OrdersAmendArrangementOperationBase {
    protected async InternalExecute(
        input: AmendArrangementInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<AmendArrangementOutput> {
        if (input.EscalateOrderConcessionID != null) return this.escalateShift(input, provider, user);
        if (!input.ReasonCategory || !REASON_CATEGORIES.includes(input.ReasonCategory)) {
            return { Success: false, Message: `ReasonCategory must be one of ${REASON_CATEGORIES.join(', ')}.` };
        }
        if (!input.Reason?.trim()) return { Success: false, Message: 'An amendment must state its reason.' };
        if (input.NewPaymentTermsTypeID != null || input.OrderHeaderID != null) {
            if (
                input.SubscriptionTermID != null ||
                input.NewStartDate != null ||
                input.NewEndDate != null ||
                input.NewAmount != null ||
                input.AppliesToInvoiceID != null ||
                input.ReferralProgramID != null
            ) {
                return {
                    Success: false,
                    Message: 'A change of payment terms is amended on its own, without a term, end date, amount or referral program.',
                };
            }
            return this.amendPaymentTerms(input, provider, user);
        }
        if (input.NewAmount != null) {
            if (input.NewEndDate != null || input.NewStartDate != null) {
                return { Success: false, Message: 'A change of amount and a change of dates are amended separately.' };
            }
            if (input.ReferralProgramID != null) {
                return { Success: false, Message: 'A referral program extends a term; it does not go with a change of amount.' };
            }
            return this.amendAmount(input, provider, user);
        }
        if (input.AppliesToInvoiceID != null || input.RefundRequested) {
            return { Success: false, Message: 'AppliesToInvoiceID and RefundRequested go with a change of amount (NewAmount).' };
        }

        let newEnd: Date | null;
        let newStart: Date | null;
        try {
            RequireUUID(input.SubscriptionTermID as string, 'SubscriptionTermID');
            newEnd = AsDateValue(RequireOptionalDay(input.NewEndDate, 'NewEndDate'));
            newStart = AsDateValue(RequireOptionalDay(input.NewStartDate, 'NewStartDate'));
            if (input.ReferralProgramID != null) RequireUUID(input.ReferralProgramID, 'ReferralProgramID');
        } catch (e) {
            return { Success: false, Message: String((e as Error).message) };
        }
        if (!newEnd && !newStart) return { Success: false, Message: 'NewEndDate or NewStartDate is required.' };
        const termID = input.SubscriptionTermID as string;

        const current = await this.currentDates(termID, provider, user);
        if (typeof current === 'string') return { Success: false, Message: current };
        const startDays = newStart ? Math.round((AsDay(newStart).getTime() - current.StartDate.getTime()) / 86_400_000) : 0;
        const change = SplitTermDateChange(current, {
            StartDate: newStart ? AsDay(newStart) : current.StartDate,
            // A new start alone moves the end with it: that is a shift.
            EndDate: newEnd ? AsDay(newEnd) : new Date(current.EndDate.getTime() + startDays * 86_400_000),
        });
        if (change.ShorteningDays > 0) {
            return {
                Success: false,
                Message:
                    'Shortening a booked term (an earlier end, or a later start with the same end) is not supported yet: ' +
                    'its credit follows the change-of-amount path, which cannot record a change yet.',
            };
        }
        if (change.ShiftDays !== 0 && change.ExtensionDays !== 0) {
            return {
                Success: false,
                Message: 'This change both moves the term and lengthens it. Move it first, then extend it, as two amendments.',
            };
        }
        if (change.ShiftDays !== 0) {
            if (input.ReferralProgramID != null) {
                return { Success: false, Message: 'A referral program extends a term; it does not go with a move of its dates.' };
            }
            return this.amendShift(input, termID, current, change.ShiftDays, provider, user);
        }
        const addedDays = change.ExtensionDays;

        const checked = await CheckTermExtension(
            { SubscriptionTermID: termID, AddedDays: addedDays, RequestedByUserID: user.ID },
            { Provider: provider, User: user },
        );
        if (typeof checked === 'string') return { Success: false, Message: checked };

        let program: ReferralProgramVerdict | null = null;
        if (input.ReferralProgramID != null) {
            const verdict = await CheckReferralProgram(
                {
                    ReferralProgramID: input.ReferralProgramID,
                    DeliveryForm: 'Duration',
                    ReasonCategory: input.ReasonCategory!,
                    AddedDays: addedDays,
                    OrderHeaderID: checked.OrderHeaderID,
                    RenewsSubscriptionID: await this.renewsSubscription(checked.OrderLineID, provider, user),
                    TermStartDate: checked.TermStartDate,
                    Today: checked.EffectiveDate,
                },
                { Provider: provider, User: user },
            );
            if (typeof verdict === 'string') return { Success: false, Message: verdict };
            program = verdict;
        }

        const summary: AmendArrangementOutput = {
            Success: true,
            ...(program ? { ReferralProgram: program.ProgramName, ApprovedByReferralProgram: program.InProgram } : {}),
            CurrentEndDate: day(checked.CurrentEndDate),
            NewEndDate: day(checked.NewEndDate),
            EffectiveDate: day(checked.EffectiveDate),
            Value: ConcessionValue({
                Form: 'Duration',
                TermAmount: checked.TermAmount,
                TermDays: InclusiveDays(checked.TermStartDate, checked.CurrentEndDate),
                AddedDays: addedDays,
            }).Value,
            Respread: checked.Plan.Remaining,
            Offsets: checked.Plan.Offsets.map((d, i) => ({
                EffectiveDate: d.EffectiveDate,
                Amount: d.Lines.reduce((sum, l) => sum + Number(l.DebitAmount ?? 0), 0),
                Offsets: checked.Plan.Targets[i].EntryNumber,
            })),
            NewSchedule: checked.Plan.Respread.map((d) => ({ EffectiveDate: d.EffectiveDate, Amount: d.Lines[0].DebitAmount ?? 0 })),
        };
        if (input.Preview) {
            return { ...summary, Message: `Term would end ${summary.NewEndDate} instead of ${summary.CurrentEndDate}.${programNote(program)}` };
        }

        const concession = await provider.GetEntityObject<mjBizAppsOrdersOrderConcessionEntity>(ORDER_CONCESSION_ENTITY, user);
        concession.NewRecord();
        concession.DeliveryForm = 'Duration';
        concession.SubscriptionTermID = termID;
        concession.AddedDays = addedDays;
        concession.ReasonCategory = input.ReasonCategory!;
        concession.Reason = input.Reason.trim();
        if (input.ReferralProgramID != null) concession.ReferralProgramID = input.ReferralProgramID;
        if (!(await concession.Save())) {
            return { Success: false, Message: concession.LatestResult?.CompleteMessage ?? 'The amendment could not be recorded.' };
        }
        return {
            ...summary,
            OrderConcessionID: concession.ID,
            Status: concession.Status,
            Value: Number(concession.ComputedValue),
            Message:
                concession.Status === 'Approved'
                    ? `Term extended to ${summary.NewEndDate}. Accounting has been asked to confirm the re-cut.`
                    : `The extension to ${summary.NewEndDate} is awaiting approval; it takes effect when approved.`,
        };
    }

    private async amendAmount(
        input: AmendArrangementInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<AmendArrangementOutput> {
        let checked: Awaited<ReturnType<typeof CheckAmountChange>>;
        try {
            checked = await CheckAmountChange(
                {
                    SubscriptionTermID: RequireUUID(input.SubscriptionTermID as string, 'SubscriptionTermID'),
                    NewAmount: Number(input.NewAmount),
                    AppliesToInvoiceID: input.AppliesToInvoiceID ? RequireUUID(input.AppliesToInvoiceID, 'AppliesToInvoiceID') : null,
                    RefundRequested: input.RefundRequested === true,
                    RequestedByUserID: user.ID,
                },
                { Provider: provider, User: user },
            );
        } catch (e) {
            return { Success: false, Message: String((e as Error).message) };
        }
        if (typeof checked === 'string') return { Success: false, Message: checked };

        const plan = checked.Recognition;
        const billing = checked.Billing;
        const summary: AmendArrangementOutput = {
            Success: true,
            EffectiveDate: day(checked.EffectiveDate),
            CurrentAmount: checked.CurrentAmount,
            NewAmount: checked.NewAmount,
            Value: plan.Reduction,
            TaxReduction: checked.TaxReduction,
            GrossReduction: checked.GrossReduction,
            CatchUp: plan.CatchUp,
            Respread: plan.Remaining,
            Offsets: plan.Offsets.map((d, i) => ({
                EffectiveDate: d.EffectiveDate,
                Amount: d.Lines.reduce((sum, l) => sum + Number(l.DebitAmount ?? 0), 0),
                Offsets: plan.Targets[i].EntryNumber,
            })),
            NewSchedule: plan.Respread.map((d) => ({ EffectiveDate: d.EffectiveDate, Amount: d.Lines[0].DebitAmount ?? 0 })),
            Instalments: billing.Instalments.map((c) => ({
                InstalmentID: c.ID,
                InstallmentNumber: c.InstallmentNumber,
                DueDate: c.DueDate,
                CurrentAmount: c.CurrentAmount,
                NewAmount: c.NewAmount,
            })),
            CreditMemo: billing.CreditMemo,
            CreditApplied: billing.Applied.map((a) => ({ InstalmentID: a.InstalmentID, DocumentNumber: a.DocumentNumber, Amount: a.Amount })),
            Refund: billing.Refund,
            OpenCredit: billing.OpenCredit,
        };
        if (!input.Preview) {
            return {
                Success: false,
                Message:
                    'Recording a change of amount is not available yet: only its preview is. Run it again with Preview set ' +
                    'to see what it would do, and correct the order with a correcting order meanwhile.',
            };
        }
        return {
            ...summary,
            Message:
                `Term ${checked.TermNumber} of ${checked.SubscriptionNumber} would go from ${checked.CurrentAmount.toFixed(2)} to ` +
                `${checked.NewAmount.toFixed(2)}: ${plan.CatchUp.toFixed(2)} taken back from revenue already earned, ` +
                `${billing.CreditMemo.toFixed(2)} credited on a credit memo.`,
        };
    }

    private async amendPaymentTerms(
        input: AmendArrangementInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<AmendArrangementOutput> {
        let checked: Awaited<ReturnType<typeof CheckTermsChange>>;
        try {
            checked = await CheckTermsChange(
                {
                    OrderHeaderID: RequireUUID(input.OrderHeaderID as string, 'OrderHeaderID'),
                    NewPaymentTermsTypeID: RequireUUID(input.NewPaymentTermsTypeID as string, 'NewPaymentTermsTypeID'),
                },
                { Provider: provider, User: user },
            );
        } catch (e) {
            return { Success: false, Message: String((e as Error).message) };
        }
        if (typeof checked === 'string') return { Success: false, Message: checked };

        const summary: AmendArrangementOutput = {
            Success: true,
            CurrentPaymentTerms: checked.PriorTermsName,
            NewPaymentTerms: checked.NewTermsName,
            DaysChange: checked.DaysChange,
            CurrentDueDate: checked.CurrentDueDate,
            NewDueDate: checked.NewDueDate,
        };
        if (input.Preview) {
            return {
                ...summary,
                Message: `Order ${checked.OrderNumber} would move to ${checked.NewTermsName}, due ${checked.NewDueDate ?? 'on receipt'}.`,
            };
        }

        const concession = await provider.GetEntityObject<mjBizAppsOrdersOrderConcessionEntity>(ORDER_CONCESSION_ENTITY, user);
        concession.NewRecord();
        concession.DeliveryForm = 'Terms';
        concession.OrderHeaderID = checked.OrderHeaderID;
        concession.NewPaymentTermsTypeID = checked.NewPaymentTermsTypeID;
        concession.ReasonCategory = input.ReasonCategory!;
        concession.Reason = (input.Reason ?? '').trim();
        if (!(await concession.Save())) {
            return { Success: false, Message: concession.LatestResult?.CompleteMessage ?? 'The amendment could not be recorded.' };
        }
        return {
            ...summary,
            OrderConcessionID: concession.ID,
            Status: concession.Status,
            Message: `The change to ${checked.NewTermsName} is awaiting approval; it takes effect when approved.`,
        };
    }

    /** The subscription the line that bought the term renews, or null when that line is not a renewal. */
    private async renewsSubscription(lineID: string, provider: IMetadataProvider, user: UserInfo): Promise<string | null> {
        const rv = new RunView(provider as unknown as IRunViewProvider);
        const res = await rv.RunView<{ RenewsSubscriptionID: string | null }>(
            {
                EntityName: ORDER_LINE_ENTITY,
                ExtraFilter: `ID = '${RequireUUID(lineID, 'OrderLineID')}'`,
                Fields: ['RenewsSubscriptionID'],
                ResultType: 'simple',
                BypassCache: true,
            },
            user,
        );
        return res?.Results?.[0]?.RenewsSubscriptionID ?? null;
    }

    private async currentDates(termID: string, provider: IMetadataProvider, user: UserInfo): Promise<{ StartDate: Date; EndDate: Date } | string> {
        const rv = new RunView(provider as unknown as IRunViewProvider);
        const res = await rv.RunView<{ StartDate: Date | string; EndDate: Date | string }>(
            {
                EntityName: 'MJ_BizApps_Orders: Subscription Terms',
                ExtraFilter: `ID = '${RequireUUID(termID, 'SubscriptionTermID')}'`,
                Fields: ['StartDate', 'EndDate'],
                ResultType: 'simple',
                BypassCache: true,
            },
            user,
        );
        const term = res?.Results?.[0];
        if (!term) return `Subscription term ${termID} was not found.`;
        return { StartDate: AsDay(term.StartDate), EndDate: AsDay(term.EndDate) };
    }

    /** Record a Shift concession, or preview what it would do (#507). */
    private async amendShift(
        input: AmendArrangementInput,
        termID: string,
        current: { StartDate: Date; EndDate: Date },
        shiftDays: number,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<AmendArrangementOutput> {
        const checked = await CheckTermShift(
            { SubscriptionTermID: termID, ShiftDays: shiftDays, RequestedByUserID: user.ID },
            { Provider: provider, User: user },
        );
        if (typeof checked === 'string') return { Success: false, Message: checked };

        const plan = checked.Plan;
        const summary: AmendArrangementOutput = {
            Success: true,
            CurrentStartDate: IsoDay(checked.CurrentStartDate),
            NewStartDate: IsoDay(checked.NewStartDate),
            CurrentEndDate: IsoDay(checked.CurrentEndDate),
            NewEndDate: IsoDay(checked.NewEndDate),
            EffectiveDate: IsoDay(checked.EffectiveDate),
            Value: 0,
            Offsets: plan.Offsets.map((d, i) => ({
                EffectiveDate: d.EffectiveDate,
                Amount: d.Lines.reduce((sum, l) => sum + Number(l.DebitAmount ?? 0), 0),
                Offsets: plan.Targets[i].EntryNumber,
            })),
            NewSchedule: plan.Schedule.map((d) => ({ EffectiveDate: d.EffectiveDate, Amount: d.Lines[0].DebitAmount ?? 0 })),
            Correction: plan.Correction ? { EffectiveDate: plan.Correction.EffectiveDate, Amount: plan.CorrectionAmount } : null,
            MovedInstalments: checked.Instalments.map((m) => ({
                InstallmentNumber: m.InstallmentNumber,
                DueDate: IsoDay(m.DueDate),
                NewDueDate: IsoDay(m.NewDueDate),
            })),
            InstalmentsLeft: checked.InstalmentsLeft,
        };
        const window = `${summary.NewStartDate} – ${summary.NewEndDate}`;
        if (input.Preview) {
            return { ...summary, Message: `Term would run ${window} instead of ${IsoDay(current.StartDate)} – ${IsoDay(current.EndDate)}.` };
        }

        const concession = await provider.GetEntityObject<mjBizAppsOrdersOrderConcessionEntity>(ORDER_CONCESSION_ENTITY, user);
        concession.NewRecord();
        concession.DeliveryForm = 'Shift';
        concession.SubscriptionTermID = termID;
        concession.NewStartDate = checked.NewStartDate;
        concession.NewEndDate = checked.NewEndDate;
        concession.ReasonCategory = input.ReasonCategory!;
        concession.Reason = input.Reason.trim();
        if (!(await concession.Save())) {
            return { Success: false, Message: concession.LatestResult?.CompleteMessage ?? 'The amendment could not be recorded.' };
        }
        return {
            ...summary,
            OrderConcessionID: concession.ID,
            Status: concession.Status,
            Message:
                concession.Status === 'Approved'
                    ? `Term moved to ${window}. Accounting has been asked to confirm the re-cut.`
                    : `The move to ${window} is awaiting finance review; it takes effect when approved.`,
        };
    }

    /** Finance sends a Shift awaiting its review to the ConcessionLimit approver (#507). */
    private async escalateShift(input: AmendArrangementInput, provider: IMetadataProvider, user: UserInfo): Promise<AmendArrangementOutput> {
        let id: string;
        try {
            id = RequireUUID(input.EscalateOrderConcessionID as string, 'EscalateOrderConcessionID');
        } catch (e) {
            return { Success: false, Message: String((e as Error).message) };
        }
        const others = [input.SubscriptionTermID, input.NewStartDate, input.NewEndDate, input.NewAmount, input.OrderHeaderID, input.ReferralProgramID];
        if (others.some((v) => v != null)) {
            return { Success: false, Message: 'An escalation names only the concession and the reason.' };
        }
        const concession = await provider.GetEntityObject<OrderConcessionEntityServer>(ORDER_CONCESSION_ENTITY, user);
        if (!(await concession.Load(id))) return { Success: false, Message: `Order concession ${id} was not found.` };
        if (typeof concession.EscalateShift !== 'function') {
            return { Success: false, Message: 'The orders server subclass of Order Concessions is not registered, so the shift cannot be escalated.' };
        }
        if (!(await concession.EscalateShift(input.Reason ?? ''))) {
            return { Success: false, Message: concession.LatestResult?.CompleteMessage ?? 'The shift could not be escalated.' };
        }
        return {
            Success: true,
            OrderConcessionID: concession.ID,
            Status: concession.Status,
            Message: 'The shift was sent to the ConcessionLimit approver; it takes effect when approved.',
        };
    }
}

function programNote(program: ReferralProgramVerdict | null): string {
    if (!program) return '';
    return program.InProgram
        ? ` Referral program '${program.ProgramName}' would approve it.`
        : ` It is more than referral program '${program.ProgramName}' grants (${program.DaysPerReferral} days), or the ` +
              `program is inactive, so it would be routed for approval.`;
}

function day(d: Date): string {
    return d.toISOString().slice(0, 10);
}

/** Tree-shaking anchor — called from the server bootstrap so the registration is retained. */
export function LoadAmendArrangementOperation(): void {
    // intentionally empty
}
