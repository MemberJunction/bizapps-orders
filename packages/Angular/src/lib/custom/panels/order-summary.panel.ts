import { Component, inject } from '@angular/core';
import { CompositeKey } from '@memberjunction/core';
import { RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel, MJFormPresenterService } from '@memberjunction/ng-base-forms';
import { mjBizAppsOrdersOrderHeaderEntity } from '@mj-biz-apps/orders-entities';
import type {
    MJOOrderSummaryHeader,
    MJORecordOpenRequestedEventArgs,
    MJOStageChangeRequestEventArgs,
} from '@mj-biz-apps/orders-ng-widgets';

/**
 * Order summary — the Orders UI, on the Order record itself. **Layer 3.**
 *
 * ## The gap this closes
 *
 * The Orders app had a rich UI and no forms layer. Everything good — the stage stepper, the money
 * strip, the lines — lived behind the four Explorer **section tabs**. Reaching an Order record any
 * other way (a search result, a related-entity grid, a link from a journal entry) landed on the
 * stock generated form: a field dump with no stage, no money and no lines. One order, two
 * different-looking screens depending on how you arrived.
 *
 * ## Why this is a panel and not a custom form
 *
 * The obvious move is a `*Extended` form registered against `MJ_BizApps_Orders: Order Headers`.
 * **Don't.** That replaces the generated form outright, which means copying its ~400-line template
 * and then hand-maintaining it every time CodeGen adds a field. MJ already solved this: generated
 * forms emit `<mj-form-panel-slot>` hosts, and a `BaseFormPanel` registered against a slot mounts
 * into the *generated* form with no override and no duplication. The generated form keeps
 * regenerating; this panel keeps rendering.
 *
 * That is the same instinct as the rest of this work — **check what the platform already does
 * before building a parallel version of it.**
 *
 * ## What this class owns
 *
 * Three things, all genuinely layer 3's business:
 *   1. projecting the record into the composite's view model,
 *   2. refusing a stage change from a surface that has no pre-flight review,
 *   3. turning `RecordOpenRequested` into an MJ presentation.
 *
 * Everything visual is `<mjo-order-summary>` from `@mj-biz-apps/orders-ng-widgets`, which knows
 * nothing about Explorer — which is exactly why it could be mounted here at all.
 *
 * @see The MJ repo's `guides/UI_LAYERING_GUIDE.md`, and `docs/UI_LAYERING.md` here.
 */
@RegisterClassEx(BaseFormPanel, {
    key: 'bizapps-orders:order-summary',
    skipNullKeyWarning: true,
    metadata: {
        entity: 'MJ_BizApps_Orders: Order Headers',
        // Above the field panels: where the order IS and what it is WORTH are the first questions
        // anyone opening an order asks. Field values answer later questions.
        slot: 'before-fields',
        sortKey: 100,
    },
})
@Component({
    standalone: false,
    selector: 'mjo-order-summary-panel',
    templateUrl: './order-summary.panel.html',
    styleUrls: ['./order-summary.panel.css'],
})
export class OrderSummaryPanel extends BaseFormPanel<mjBizAppsOrdersOrderHeaderEntity> {
    private readonly forms = inject(MJFormPresenterService);

    /**
     * The record, in the shape the composite renders.
     *
     * A projection, not a cast. Reading the generated properties means the compiler checks this
     * against the schema, so a renamed column breaks the build instead of rendering `undefined`.
     * (In the sibling accounting repo, exactly that kind of cast hid a drill-through button that
     * had silently stopped working after a column was replaced.)
     */
    public get SummaryHeader(): MJOOrderSummaryHeader | null {
        const r = this.Record;
        if (!r?.ID) return null;
        return {
            ID: r.ID,
            OrderNumber: r.OrderNumber,
            Status: r.Status,
            // The bill-to party is an organization OR a person, never both.
            Customer: r.BillToOrganization ?? r.BillToPerson ?? null,
            OrderDate: r.OrderDate,
            TotalAmount: r.TotalGross,
            PaidAmount: r.AmountPaid,
            BalanceAmount: r.Balance,
            PaymentStatus: r.PaymentStatus,
            // OrderHeader.OriginChannel is not in the schema yet — MJOOrdersDataService's 'lxp'
            // preset reports the same gap. Null renders no chip; a guessed channel on an order
            // document would be worse than none.
            OriginChannel: null,
        };
    }

    /**
     * Refuse stage changes from this surface.
     *
     * Not a limitation — a decision. Confirming an order books journal entries, which is not
     * undoable, so it goes through the pre-flight review the Orders workspace provides. This
     * surface has no pre-flight, so it must not offer the verb. The composite is bound
     * `[AllowStageChange]="false"`; this handler is the belt to that braces, and it explains
     * itself rather than failing silently.
     *
     * MUST be synchronous — `emit()` runs listeners inline, so an `async` handler would return at
     * its first `await` and set `Cancel` too late to matter.
     */
    public OnBeforeStageChange(event: MJOStageChangeRequestEventArgs): void {
        event.Cancel = true;
        event.CancelReason =
            'Change an order stage from the Orders workspace — confirming books journal entries, and that needs the pre-flight review.';
    }

    /** Intent → presentation. Never `Router`, which would desync the Explorer shell's tab state. */
    public OnRecordOpenRequested(event: MJORecordOpenRequestedEventArgs): void {
        this.forms.Open({
            EntityName: event.EntityName,
            PrimaryKey: CompositeKey.FromID(event.RecordID),
            Title: event.Title,
            Presentation: event.Preference === 'tab' ? 'dialog' : event.Preference,
        });
    }
}

/** Tree-shaking prevention — anchors the @RegisterClassEx registration. */
export function LoadOrderSummaryPanel(): void {
    // No-op.
}
