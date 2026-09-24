/**
 * OrderLineProgressMeasurement server subclass — the half of the posting guard a trigger cannot see
 * (golive #241, Jeremy on PR #227).
 *
 * A Posted observation carries a `RecognitionAmount` and a `JournalEntryID`, and the only thing that
 * makes those true is that `Orders.RecordProgress` wrote the journal entry in the same transaction.
 * A row posted by any other route asserts revenue the ledger never saw — and because the subledger
 * and the ledger are read by different reports, neither would contradict the other.
 *
 * WHY THIS EXISTS ALONGSIDE THE TRIGGER RATHER THAN INSTEAD OF IT. The two paths split by what each
 * layer can observe:
 *
 *   `Draft` → `Posted` by update is refused in the TRIGGER (51031), unconditionally, because no
 *   legitimate path performs it — the operation writes its row Posted from the outset. A rule with
 *   no false positives belongs in the database, where a bypassed class cannot reach past it.
 *
 *   INSERT of a row already `Posted` is exactly what the operation itself does, so the trigger
 *   cannot distinguish it from a hand-written one. This class can, because the operation tells it:
 *   {@link RegisterOperationPost} names the row immediately before saving it and clears it in a
 *   `finally`, so the window is one save wide and survives a throw.
 *
 * THE SIGNAL NAMES A ROW, IT IS NOT A FLAG. A boolean "the operation is running" would authorise
 * every save that happened to overlap it, which on a shared process is any save at all. Naming the
 * row means an unrelated insert riding the same moment is still refused.
 *
 * WHAT IS NOT COVERED, stated rather than implied: a raw `INSERT` issued outside the entity layer
 * bypasses this class, and the trigger cannot tell it from the operation's own write. That is the
 * residual gap named in the migration, and it is the reason the ordering rule and the amount are
 * also asserted by the operation rather than trusted from the row.
 *
 * @module @mj-biz-apps/orders-core-entities-server
 */
import { BaseEntity, BaseEntityResult, EntitySaveOptions } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { mjBizAppsOrdersOrderLineProgressMeasurementEntity } from '@mj-biz-apps/orders-entities';
import { ORDER_LINE_PROGRESS_MEASUREMENT_ENTITY } from './entity-names.js';

/**
 * Rows `Orders.RecordProgress` is posting right now, by NATURAL KEY — line plus measurement date.
 *
 * Not by `ID`, because on an insert there isn't one yet: the column defaults to `newsequentialid()`
 * and the value comes back with the row. Line plus date is `UQ_OLPM_Period`'s key — filtered to rows
 * that replace nothing, so a replacement may share its date with the row it replaces, which is already
 * saved — and it is known before the save, which is all this needs: the one row being saved now.
 *
 * Module-level rather than per-instance because the operation and the entity it saves are different
 * objects; the operation cannot hand a flag to a class it does not construct.
 */
const posting = new Set<string>();

const key = (orderLineID: string, measurementDate: string): string =>
    `${String(orderLineID).toLowerCase()}|${measurementDate.slice(0, 10)}`;

/** Announce the row the operation is about to save Posted. Always paired with {@link ReleaseOperationPost}. */
export function RegisterOperationPost(orderLineID: string, measurementDate: string): void {
    posting.add(key(orderLineID, measurementDate));
}

/** Clear the announcement. Called from a `finally`, so a throw cannot leave the door open. */
export function ReleaseOperationPost(orderLineID: string, measurementDate: string): void {
    posting.delete(key(orderLineID, measurementDate));
}

@RegisterClass(BaseEntity, ORDER_LINE_PROGRESS_MEASUREMENT_ENTITY)
export class OrderLineProgressMeasurementEntityServer extends mjBizAppsOrdersOrderLineProgressMeasurementEntity {
    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        const refusal = this.refusePostingOutsideTheOperation();
        if (refusal) {
            // Registered rather than thrown: a refusal is a business outcome the caller reads off
            // LatestResult, the contract every other save failure in this package uses.
            this.RegisterResultHistoryEntry(this.buildRejection(refusal));
            return false;
        }
        return super.Save(options);
    }

    /** The message to refuse with, or null when this save is allowed to write a Posted row. */
    private refusePostingOutsideTheOperation(): string | null {
        if (this.Status !== 'Posted') return null;
        // An already-saved Posted row being saved again is the trigger's business, not this one's:
        // 51030 refuses any change to it, and duplicating that here would report the wrong reason.
        if (this.IsSaved && this.GetFieldByName('Status')?.OldValue === 'Posted') return null;
        const date = this.MeasurementDate instanceof Date ? this.MeasurementDate.toISOString() : String(this.MeasurementDate ?? '');
        if (this.OrderLineID && posting.has(key(this.OrderLineID, date))) return null;
        return (
            `A progress observation can only be posted by Orders.RecordProgress. A Posted row carries a ` +
            `recognition amount and a journal entry id, and what makes those true is that the entry was ` +
            `written in the same transaction — a row posted any other way claims revenue the ledger never ` +
            `saw. Save it as Draft, or record the observation through the operation.`
        );
    }

    private buildRejection(message: string): BaseEntityResult {
        const result = new BaseEntityResult();
        result.Success = false;
        result.Type = this.IsSaved ? 'update' : 'create';
        result.Message = message;
        result.OriginalValues = this.Fields.map((f) => ({ FieldName: f.CodeName, Value: f.Value }));
        return result;
    }
}

/** Tree-shaking anchor — without it the decorator never runs and the guard is not registered. */
export function LoadOrderLineProgressMeasurementEntityServer(): void {
    void OrderLineProgressMeasurementEntityServer;
}
