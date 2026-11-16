import { RunView, type IMetadataProvider } from '@memberjunction/core';
import { RequireUUID, ToISODate } from '@mj-biz-apps/orders-entities';
import { MJO_ENTITIES } from './entity-names';

/** An open term as the cancel screen reads it to choose its default refund. */
export interface MJOCancelTermRow {
    StartDate: Date | string;
    EndDate: Date | string;
    Amount: number | null;
    OrderLineID: string | null;
}

/** Why the cancel screen starts on a full refund, for the hint beside the choice. */
export interface MJOCancelRefundDefault {
    Refund: 'Full';
    /** The first day of the term the cancellation would cut, `YYYY-MM-DD`. */
    TermStart: string;
}

/**
 * The open term a cancellation requested today cuts: the one covering today, else the earliest still
 * to start. The same choice `Orders.CancelSubscription` makes (`resolveTerm`), so the screen's
 * default is about the term the operation will cancel.
 */
export function TermCancelledOn<T extends MJOCancelTermRow>(terms: readonly T[], today: string): T | null {
    const day = (v: Date | string) => ToISODate(v) ?? '';
    const covering = terms.find((t) => day(t.StartDate) <= today && day(t.EndDate) >= today);
    if (covering) return covering;
    const upcoming = terms.filter((t) => day(t.StartDate) > today).sort((a, b) => day(a.StartDate).localeCompare(day(b.StartDate)));
    return upcoming[0] ?? null;
}

/**
 * The refund the cancel screen starts on (golive #384). A term that has not started and whose order
 * has received no money starts on `Full`: reversing it takes back the unbilled receivable and every
 * month of revenue still scheduled, and refunds nothing, because nothing was paid. Under a type that
 * does not refund, the type's own rule would cancel the subscription and leave both in place, which
 * is how a canceled term came to stay owed and queued for invoicing.
 *
 * Any other term starts on the type's rule (`null`): once money has come in or the term is under
 * way, giving any of it back is a decision for the person cancelling, not a default.
 */
export function PickCancelRefundDefault(
    term: MJOCancelTermRow | null,
    amountPaidOnOrder: number | null,
    today: string,
): MJOCancelRefundDefault | null {
    if (!term) return null;
    const start = ToISODate(term.StartDate);
    if (!start || start <= today) return null;
    if (!(Number(term.Amount ?? 0) > 0)) return null;
    if (amountPaidOnOrder == null || Number(amountPaidOnOrder) > 0.005) return null;
    return { Refund: 'Full', TermStart: start };
}

/**
 * Reads what `PickCancelRefundDefault` needs: the subscription's open terms and the cash on the order
 * that sold the one a cancellation today would cut. A read that fails gives no default, so the
 * screen falls back to the type's rule and the preview still shows what that does.
 */
export async function LoadCancelRefundDefault(
    subscriptionID: string,
    provider: IMetadataProvider,
    today: string,
): Promise<MJOCancelRefundDefault | null> {
    const rv = RunView.FromMetadataProvider(provider);
    const user = provider.CurrentUser;
    const terms = await rv.RunView<MJOCancelTermRow>({
        EntityName: MJO_ENTITIES.SubscriptionTerm,
        ExtraFilter: `SubscriptionID = '${RequireUUID(subscriptionID, 'SubscriptionID')}' AND Status IN ('Scheduled','Active')`,
        Fields: ['ID', 'StartDate', 'EndDate', 'Amount', 'OrderLineID'],
        ResultType: 'simple',
        BypassCache: true,
    }, user);
    if (!terms.Success) return null;
    const term = TermCancelledOn(terms.Results ?? [], today);
    if (!term?.OrderLineID) return null;
    const lineID = RequireUUID(term.OrderLineID, 'OrderLineID');
    const order = await rv.RunView<{ AmountPaid: number | null }>({
        EntityName: MJO_ENTITIES.OrderHeader,
        ExtraFilter: `ID IN (SELECT OrderHeaderID FROM [__mj_BizAppsOrders].[OrderLine] WHERE ID = '${lineID}')`,
        Fields: ['ID', 'AmountPaid'],
        ResultType: 'simple',
        BypassCache: true,
        MaxRows: 1,
    }, user);
    if (!order.Success || !order.Results?.length) return null;
    return PickCancelRefundDefault(term, order.Results[0].AmountPaid, today);
}
