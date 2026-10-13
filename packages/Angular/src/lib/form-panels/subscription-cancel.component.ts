import { ChangeDetectorRef, Component, EventEmitter, Input, Output, inject } from '@angular/core';
import type { IMetadataProvider } from '@memberjunction/core';
import {
    OrdersCancelSubscriptionOperation,
    ToISODate,
    type CancelSubscriptionInput,
    type CancelSubscriptionOutput,
    type mjBizAppsOrdersSubscriptionEntity,
} from '@mj-biz-apps/orders-entities';

/** The two timings a person cancelling can choose; the subscription type's grace applies to end of term only. */
export type MJOCancelTiming = NonNullable<CancelSubscriptionInput['Timing']>;

/** Statuses a subscription can be cancelled from. The operation refuses `Canceled` itself. */
const CANCELLABLE_STATUSES = new Set(['Active', 'Trialing', 'Paused']);

/**
 * `mjo-subscription-cancel` — cancel a subscription from its form: choose when coverage ends,
 * preview what that does, then confirm.
 *
 * The decision is the server's. Preview and confirm are the same `Orders.CancelSubscription` call,
 * the first with `Preview: true`, so what the person confirms is what the operation computed, not a
 * second calculation done here. Changing the timing or the reason throws the preview away, so a
 * stale preview can never be confirmed.
 *
 * Offered only to a viewer who may update subscriptions, and only while the subscription is in a
 * status it can be cancelled from.
 *
 * ```html
 * <mjo-subscription-cancel [Record]="Record" [Provider]="provider" (Canceled)="refresh()" />
 * ```
 */
@Component({
    standalone: false,
    selector: 'mjo-subscription-cancel',
    templateUrl: './subscription-cancel.component.html',
    styleUrls: ['./subscription-cancel.component.css'],
})
export class MJOSubscriptionCancelComponent {
    private readonly cdr = inject(ChangeDetectorRef);

    @Input({ required: true }) Record!: mjBizAppsOrdersSubscriptionEntity;
    /** The provider the record was loaded through; the operation and the permission check use it. */
    @Input({ required: true }) Provider!: IMetadataProvider;
    /** Emits after a confirmed cancellation, so the host can reload the record. */
    @Output() Canceled = new EventEmitter<CancelSubscriptionOutput>();

    public Open = false;
    public Busy = false;
    public Error: string | null = null;
    /** End of term by default: access runs to the end of what was paid for. */
    public Timing: MJOCancelTiming = 'EndOfTerm';
    public Reason = '';
    public Preview: CancelSubscriptionOutput | null = null;

    public get CanCancel(): boolean {
        if (!this.Record?.IsSaved || !CANCELLABLE_STATUSES.has(this.Record.Status)) return false;
        const user = this.Provider?.CurrentUser;
        return !!user && this.Record.EntityInfo.GetUserPermisions(user).CanUpdate;
    }

    public Day(value: string | null | undefined): string {
        return ToISODate(value) ?? '—';
    }

    public Start(): void {
        this.Open = true;
        this.Timing = 'EndOfTerm';
        this.Reason = '';
        this.Preview = null;
        this.Error = null;
    }

    public Close(): void {
        this.Open = false;
        this.Preview = null;
        this.Error = null;
    }

    /** Any change to what would be sent makes the preview describe something else. */
    public Changed(): void {
        this.Preview = null;
        this.Error = null;
    }

    public async RunPreview(): Promise<void> {
        const output = await this.execute(true);
        if (output) this.Preview = output;
    }

    public async Confirm(): Promise<void> {
        if (!this.Preview) return;
        const output = await this.execute(false);
        if (!output) return;
        this.Close();
        this.Canceled.emit(output);
    }

    private async execute(preview: boolean): Promise<CancelSubscriptionOutput | null> {
        this.Busy = true;
        this.Error = null;
        try {
            const result = await new OrdersCancelSubscriptionOperation().Execute({
                SubscriptionID: this.Record.ID,
                Timing: this.Timing,
                Reason: this.Reason.trim() || undefined,
                Preview: preview,
            }, { provider: this.Provider });
            if (!result.Success || !result.Output?.Success) {
                throw new Error(result.Output?.Message ?? result.ErrorMessage ?? 'The cancellation failed.');
            }
            return result.Output;
        } catch (err) {
            this.Error = err instanceof Error ? err.message : String(err);
            return null;
        } finally {
            this.Busy = false;
            this.cdr.detectChanges();
        }
    }
}
