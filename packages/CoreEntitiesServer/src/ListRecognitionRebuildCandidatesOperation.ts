/**
 * `Orders.ListRecognitionRebuildCandidates` — which booked lines of a product still follow its old recognition schedule (golive #495).
 *
 * A product's recognition type is read once, when a line is confirmed. When finance changes it, the lines already
 * booked keep their schedule until someone rebuilds them (Orders.RebuildRecognition). This lists the confirmed,
 * non-subscription lines of the product that still hold recognition entries Pending in no batch, which are the ones
 * a rebuild would change. The Product form shows it after the type changes.
 *
 * Read only. Reads run as the caller, so they see what the caller may see.
 */
import { BaseRemotableOperation, IMetadataProvider, RunView, UserInfo } from '@memberjunction/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import {
    OrdersListRecognitionRebuildCandidatesOperation as OrdersListRecognitionRebuildCandidatesOperationBase,
    type OrdersListRecognitionRebuildCandidatesInput,
    type OrdersListRecognitionRebuildCandidatesOutput,
    type OrdersRecognitionRebuildCandidate,
} from '@mj-biz-apps/orders-entities';
import { EntityIDFor } from './AccountingBridge.js';
import { ORDER_HEADER_ENTITY, ORDER_LINE_ENTITY } from './entity-names.js';
import { RequireUUID, RequireUUIDs } from './sql-guards.js';

const JE_TYPE_ENTITY = 'MJ_BizApps_Accounting: Journal Entry Types';
const JE_ENTITY = 'MJ_BizApps_Accounting: Journal Entries';
const SUBSCRIPTION_TERM_ENTITY = 'MJ_BizApps_Orders: Subscription Terms';

const quoted = (ids: readonly string[]) => ids.map((id) => `'${id}'`).join(', ');

@RegisterClass(BaseRemotableOperation, 'Orders.ListRecognitionRebuildCandidates')
export class ListRecognitionRebuildCandidatesOperation extends OrdersListRecognitionRebuildCandidatesOperationBase {
    protected async InternalExecute(
        input: OrdersListRecognitionRebuildCandidatesInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<OrdersListRecognitionRebuildCandidatesOutput> {
        const productID = RequireUUID(input?.ProductID, 'ProductID');
        const rv = RunView.FromMetadataProvider(provider);
        const read = async <T>(params: Parameters<RunView['RunView']>[0]): Promise<T[]> => {
            const res = await rv.RunView<T>({ ...params, ResultType: 'simple', BypassCache: true }, user);
            if (!res?.Success) throw new Error(`Reading ${params.EntityName} failed: ${res?.ErrorMessage}`);
            return res.Results ?? [];
        };

        const lines = await read<{ ID: string; OrderHeaderID: string; LineNumber: number }>({
            EntityName: ORDER_LINE_ENTITY,
            ExtraFilter: `ProductID = '${productID}' AND ReversesOrderLineID IS NULL AND Quantity > 0 AND SubscriptionID IS NULL`,
            Fields: ['ID', 'OrderHeaderID', 'LineNumber'],
        });
        if (lines.length === 0) return { Success: true, Lines: [] };

        const lineIDs = RequireUUIDs(lines.map((l) => l.ID), 'OrderLineID');
        const [headers, terms, types] = await Promise.all([
            read<{ ID: string; OrderNumber: string; ConfirmedAt: string | null }>({
                EntityName: ORDER_HEADER_ENTITY,
                ExtraFilter: `ID IN (${quoted(RequireUUIDs([...new Set(lines.map((l) => l.OrderHeaderID.toLowerCase()))], 'OrderHeaderID'))}) AND ConfirmedAt IS NOT NULL`,
                Fields: ['ID', 'OrderNumber', 'ConfirmedAt'],
            }),
            read<{ OrderLineID: string }>({ EntityName: SUBSCRIPTION_TERM_ENTITY, ExtraFilter: `OrderLineID IN (${quoted(lineIDs)})`, Fields: ['OrderLineID'] }),
            read<{ ID: string }>({ EntityName: JE_TYPE_ENTITY, ExtraFilter: `Code = 'RevenueRecognition'`, Fields: ['ID'] }),
        ]);
        if (!types[0]) return { Success: true, Lines: [] };
        const booked = lines.filter(
            (l) => headers.some((h) => UUIDsEqual(h.ID, l.OrderHeaderID)) && !terms.some((t) => UUIDsEqual(t.OrderLineID, l.ID)),
        );
        if (booked.length === 0) return { Success: true, Lines: [] };

        const pending = await read<{ LinkedRecordID: string }>({
            EntityName: JE_ENTITY,
            ExtraFilter:
                `LinkedEntityID = '${EntityIDFor(ORDER_LINE_ENTITY)}' AND LinkedRecordID IN (${quoted(RequireUUIDs(booked.map((l) => l.ID), 'OrderLineID'))}) ` +
                `AND EntryTypeID = '${RequireUUID(types[0].ID, 'EntryTypeID')}' AND Status = 'Pending' AND JournalEntryBatchID IS NULL`,
            Fields: ['LinkedRecordID'],
        });

        const out: OrdersRecognitionRebuildCandidate[] = [];
        for (const line of booked) {
            const count = pending.filter((p) => UUIDsEqual(p.LinkedRecordID, line.ID)).length;
            if (count === 0) continue;
            const header = headers.find((h) => UUIDsEqual(h.ID, line.OrderHeaderID))!;
            out.push({ OrderLineID: line.ID, OrderHeaderID: header.ID, OrderNumber: header.OrderNumber, LineNumber: line.LineNumber, PendingEntries: count });
        }
        out.sort((a, b) => a.OrderNumber.localeCompare(b.OrderNumber) || a.LineNumber - b.LineNumber);
        return { Success: true, Lines: out };
    }
}

/** Registers {@link ListRecognitionRebuildCandidatesOperation}. Called from the server bootstrap. */
export function LoadListRecognitionRebuildCandidatesOperation(): void {
    void ListRecognitionRebuildCandidatesOperation;
}
