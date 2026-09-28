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
 * A change of amount (case A) is refused until its credit-memo path exists.
 *
 * CONNECTS TO:
 *   PLAN:    ./TermExtension.ts (CheckTermExtension)
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
    AsDateValue,
    ConcessionValue,
    InclusiveDays,
    type mjBizAppsOrdersOrderConcessionEntity,
} from '@mj-biz-apps/orders-entities';
import { ORDER_CONCESSION_ENTITY } from './entity-names.js';
import { RequireOptionalDay, RequireUUID } from './sql-guards.js';
import { CheckTermExtension } from './TermExtension.js';

export type AmendmentReasonCategory = 'Retention' | 'Referral' | 'Other';

export interface AmendArrangementInput {
    /** The booked term to amend. */
    SubscriptionTermID: string;
    /** The term's new end date. Must be later than its current end. */
    NewEndDate: string;
    /** A change of amount. Not supported yet; refused. */
    NewAmount?: number;
    ReasonCategory: AmendmentReasonCategory;
    Reason: string;
    /** Return what the amendment would do without writing anything. */
    Preview?: boolean;
}

export interface AmendArrangementEntry {
    EffectiveDate: string;
    Amount: number;
    /** For an offset, the staged entry it cancels. */
    Offsets?: string;
}

export interface AmendArrangementOutput {
    Success: boolean;
    Message?: string;
    CurrentEndDate?: string;
    NewEndDate?: string;
    /** The day the extension takes effect: staged entries from here on are replaced. */
    EffectiveDate?: string;
    /** What the added days are worth at the term's own rate. */
    Value?: number;
    /** What the replaced entries were going to recognise, and the new schedule now does. */
    Respread?: number;
    Offsets?: AmendArrangementEntry[];
    NewSchedule?: AmendArrangementEntry[];
    /** Set when recorded: the concession, and whether it is Approved (applied) or Pending (awaiting approval). */
    OrderConcessionID?: string;
    Status?: string;
}

const REASON_CATEGORIES: readonly string[] = ['Retention', 'Referral', 'Other'];

@RegisterClass(BaseRemotableOperation, 'Orders.AmendArrangement')
export class AmendArrangementOperation extends BaseRemotableOperation<AmendArrangementInput, AmendArrangementOutput> {
    public OperationKey = 'Orders.AmendArrangement';

    protected async InternalExecute(
        input: AmendArrangementInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<AmendArrangementOutput> {
        let newEnd: Date | null;
        try {
            RequireUUID(input.SubscriptionTermID, 'SubscriptionTermID');
            newEnd = AsDateValue(RequireOptionalDay(input.NewEndDate, 'NewEndDate'));
        } catch (e) {
            return { Success: false, Message: String((e as Error).message) };
        }
        if (input.NewAmount != null) {
            return { Success: false, Message: 'Changing the amount of a booked arrangement is not supported yet.' };
        }
        if (!newEnd) return { Success: false, Message: 'NewEndDate is required.' };
        if (!REASON_CATEGORIES.includes(input.ReasonCategory)) {
            return { Success: false, Message: `ReasonCategory must be one of ${REASON_CATEGORIES.join(', ')}.` };
        }
        if (!input.Reason?.trim()) return { Success: false, Message: 'An amendment must state its reason.' };

        const current = await this.currentEnd(input.SubscriptionTermID, provider, user);
        if (typeof current === 'string') return { Success: false, Message: current };
        const addedDays = Math.round((newEnd.getTime() - current.getTime()) / 86_400_000);

        const checked = await CheckTermExtension(
            { SubscriptionTermID: input.SubscriptionTermID, AddedDays: addedDays, RequestedByUserID: user.ID },
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
        concession.SubscriptionTermID = input.SubscriptionTermID;
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
