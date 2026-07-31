import { Injectable } from '@angular/core';
import {
    OrderDraft,
    OrdersConfirmOrderOperation,
    OrdersPreviewOrderOperation,
    OrdersSaveOrderOperation,
    type OrdersConfirmOrderOutput,
    type OrdersPreviewOrderOutput,
    type OrdersSaveOrderOutput,
} from '@mj-biz-apps/orders-entities';

/** What a preview attempt produced. */
export interface MJOPreviewState {
    /** The decomposition, or null before the first successful preview. */
    Result: OrdersPreviewOrderOutput | null;
    /** A preview is in flight. */
    Loading: boolean;
    /**
     * Why the last attempt failed. Distinct from a *blocked* preview: this is the
     * call not completing, not the engine refusing to price.
     */
    Error: string | null;
}

/**
 * `MJOOrderEntryService` — the seam between a draft and the engine.
 *
 * Every screen that composes an order goes through here, so the debounce, the
 * out-of-order guard and the staleness bookkeeping exist once instead of in each
 * screen that happens to need them.
 *
 * WHY DEBOUNCE AND SEQUENCE-GUARD. Preview is a server round trip fired on every
 * keystroke. Two things go wrong without care, and both show the user a wrong
 * number rather than an obvious failure:
 *
 * - **Too many calls.** Each one runs a real save-and-roll-back, so an
 *   un-debounced editor would hammer the database with transactions nobody reads.
 * - **Out-of-order responses.** Request 3 can return after request 4. Applying it
 *   would show the totals for a draft the user has already moved past — stale
 *   money presented as current, which is exactly what this design exists to
 *   prevent. Every response carries the sequence number it was issued with, and
 *   anything not from the newest request is discarded.
 *
 * Provided in root: the debounce state is per-draft, not per-service, so one
 * instance serves the whole app.
 *
 * ## Example
 *
 * ```typescript
 * const draft = new OrderDraft({ CompanyID });
 * this.stop = draft.Subscribe(() => this.orders.SchedulePreview(draft, s => this.preview = s));
 * ```
 */
@Injectable({ providedIn: 'root' })
export class MJOOrderEntryService {
    /** Milliseconds of quiet before a preview fires. */
    public DebounceMs = 350;

    private sequence = 0;
    private applied = 0;
    private timer: ReturnType<typeof setTimeout> | null = null;

    /**
     * Price a draft after a quiet period, calling back with each state change.
     *
     * Calling again before the timer elapses replaces the pending request rather
     * than queueing another — the user is still typing, and only the final state
     * is worth asking about.
     */
    public SchedulePreview(draft: OrderDraft, onState: (state: MJOPreviewState) => void): void {
        if (this.timer) clearTimeout(this.timer);

        // Announce immediately that what is on screen no longer matches the draft,
        // so the ladder dims now rather than after the round trip.
        onState({ Result: draft.Preview as OrdersPreviewOrderOutput | null, Loading: true, Error: null });

        this.timer = setTimeout(() => {
            void this.PreviewNow(draft, onState);
        }, this.DebounceMs);
    }

    /** Price a draft immediately, bypassing the debounce. */
    public async PreviewNow(draft: OrderDraft, onState: (state: MJOPreviewState) => void): Promise<void> {
        // An empty draft has nothing to price, and asking costs a transaction.
        if (!draft.LineCount) {
            draft.ClearPreview();
            onState({ Result: null, Loading: false, Error: null });
            return;
        }

        const issued = ++this.sequence;
        try {
            const op = new OrdersPreviewOrderOperation();
            const result = await op.Execute({ Draft: draft.ToInput() });

            // Discard anything overtaken by a newer request.
            if (issued <= this.applied) return;
            this.applied = issued;

            if (!result.Success || !result.Output) {
                onState({
                    Result: null,
                    Loading: false,
                    Error: result.ErrorMessage ?? 'The draft could not be priced.',
                });
                return;
            }

            draft.ApplyPreview(result.Output);
            onState({ Result: result.Output, Loading: false, Error: null });
        } catch (e) {
            if (issued <= this.applied) return;
            this.applied = issued;
            onState({
                Result: null,
                Loading: false,
                Error: e instanceof Error ? e.message : String(e),
            });
        }
    }

    /** Persist a draft. Never confirms — confirming is a separate, deliberate step. */
    public async Save(draft: OrderDraft): Promise<OrdersSaveOrderOutput | null> {
        const op = new OrdersSaveOrderOperation();
        const result = await op.Execute({ Draft: draft.ToInput() });
        if (!result.Success || !result.Output) return null;

        // Carry the assigned id back onto the draft, so the next save updates the
        // same order rather than creating a second one.
        if (result.Output.OrderHeaderID) {
            draft.SetHeader({ OrderHeaderID: result.Output.OrderHeaderID });
        }
        return result.Output;
    }

    /**
     * Confirm an order — the irreversible step.
     *
     * Passes `ExpectedGrossTotal` from the draft, which is `undefined` while the
     * stored preview is stale. That is deliberate: if the user has typed since the
     * last preview there is no number they were agreeing to, so there is nothing
     * to guard against, and sending a stale figure would assert agreement to an
     * amount they never saw.
     */
    public async Confirm(draft: OrderDraft): Promise<OrdersConfirmOrderOutput | null> {
        const op = new OrdersConfirmOrderOperation();
        const result = await op.Execute({
            Draft: draft.ToInput(),
            ExpectedGrossTotal: draft.ConfirmableGrossTotal,
        });
        return result.Success && result.Output ? result.Output : (result.Output ?? null);
    }

    /** Cancel any pending preview — call from a component's `ngOnDestroy`. */
    public CancelPending(): void {
        if (this.timer) clearTimeout(this.timer);
        this.timer = null;
    }
}
