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
 * A change of amount (case A, #506): the caller names a term and its new, lower amount, optionally the invoice the
 * reduction is about. `Preview` returns the plan from ./AmountChange.ts: the catch-up, the staged entries offset and
 * the new schedule, the instalments reduced and the credit memo. Recording one is refused until its application
 * (the credit-memo document, the entries, the instalment rewrite and accounting's task) exists.
 *
 * A confirmed order's payment terms (#309): the caller names the order and its new terms instead of a term. It
 * records a Terms `OrderConcession`, which always waits for someone other than the requester to approve it; the
 * terms and the due date change when it is approved (see ./PaymentTermsChange.ts). `Preview` returns the change in
 * days to payment and the new due date.
 *
 * CONNECTS TO:
 *   PLAN:    ./TermExtension.ts (CheckTermExtension) · ./PaymentTermsChange.ts (CheckTermsChange)
 *            ./AmountChange.ts (CheckAmountChange)
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
    type mjBizAppsOrdersOrderConcessionEntity,
} from '@mj-biz-apps/orders-entities';
import { ORDER_CONCESSION_ENTITY } from './entity-names.js';
import { RequireOptionalDay, RequireUUID } from './sql-guards.js';
import { CheckAmountChange } from './AmountChange.js';
import { CheckTermsChange } from './PaymentTermsChange.js';
import { CheckTermExtension } from './TermExtension.js';

const REASON_CATEGORIES: readonly string[] = ['Retention', 'Referral', 'Other'];

@RegisterClass(BaseRemotableOperation, 'Orders.AmendArrangement')
export class AmendArrangementOperation extends OrdersAmendArrangementOperationBase {
    protected async InternalExecute(
        input: AmendArrangementInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<AmendArrangementOutput> {
        if (!REASON_CATEGORIES.includes(input.ReasonCategory)) {
            return { Success: false, Message: `ReasonCategory must be one of ${REASON_CATEGORIES.join(', ')}.` };
        }
        if (!input.Reason?.trim()) return { Success: false, Message: 'An amendment must state its reason.' };
        if (input.NewPaymentTermsTypeID != null || input.OrderHeaderID != null) {
            if (input.SubscriptionTermID != null || input.NewEndDate != null || input.NewAmount != null || input.AppliesToInvoiceID != null) {
                return { Success: false, Message: 'A change of payment terms is amended on its own, without a term, end date or amount.' };
            }
            return this.amendPaymentTerms(input, provider, user);
        }
        if (input.NewAmount != null) {
            if (input.NewEndDate != null) {
                return { Success: false, Message: 'A change of amount and a change of end date are amended separately.' };
            }
            return this.amendAmount(input, provider, user);
        }
        if (input.AppliesToInvoiceID != null || input.RefundRequested) {
            return { Success: false, Message: 'AppliesToInvoiceID and RefundRequested go with a change of amount (NewAmount).' };
        }

        let newEnd: Date | null;
        try {
            RequireUUID(input.SubscriptionTermID as string, 'SubscriptionTermID');
            newEnd = AsDateValue(RequireOptionalDay(input.NewEndDate, 'NewEndDate'));
        } catch (e) {
            return { Success: false, Message: String((e as Error).message) };
        }
        if (!newEnd) return { Success: false, Message: 'NewEndDate is required.' };
        const termID = input.SubscriptionTermID as string;

        const current = await this.currentEnd(termID, provider, user);
        if (typeof current === 'string') return { Success: false, Message: current };
        const addedDays = Math.round((newEnd.getTime() - current.getTime()) / 86_400_000);

        const checked = await CheckTermExtension(
            { SubscriptionTermID: termID, AddedDays: addedDays, RequestedByUserID: user.ID },
            { Provider: provider, User: user },
        );
        if (typeof checked === 'string') return { Success: false, Message: checked };

        const summary: AmendArrangementOutput = {
            Success: true,
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
            return { ...summary, Message: `Term would end ${summary.NewEndDate} instead of ${summary.CurrentEndDate}.` };
        }

        const concession = await provider.GetEntityObject<mjBizAppsOrdersOrderConcessionEntity>(ORDER_CONCESSION_ENTITY, user);
        concession.NewRecord();
        concession.DeliveryForm = 'Duration';
        concession.SubscriptionTermID = termID;
        concession.AddedDays = addedDays;
        concession.ReasonCategory = input.ReasonCategory;
        concession.Reason = input.Reason.trim();
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
        concession.ReasonCategory = input.ReasonCategory;
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

    private async currentEnd(termID: string, provider: IMetadataProvider, user: UserInfo): Promise<Date | string> {
        const rv = new RunView(provider as unknown as IRunViewProvider);
        const res = await rv.RunView<{ EndDate: Date | string }>(
            {
                EntityName: 'MJ_BizApps_Orders: Subscription Terms',
                ExtraFilter: `ID = '${RequireUUID(termID, 'SubscriptionTermID')}'`,
                Fields: ['EndDate'],
                ResultType: 'simple',
                BypassCache: true,
            },
            user,
        );
        const term = res?.Results?.[0];
        if (!term) return `Subscription term ${termID} was not found.`;
        const d = new Date(term.EndDate);
        return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    }
}

function day(d: Date): string {
    return d.toISOString().slice(0, 10);
}

/** Tree-shaking anchor — called from the server bootstrap so the registration is retained. */
export function LoadAmendArrangementOperation(): void {
    // intentionally empty
}
