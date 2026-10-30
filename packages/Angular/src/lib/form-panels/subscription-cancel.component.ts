import { ChangeDetectorRef, Component, EventEmitter, Input, Output, inject } from '@angular/core';
import type { IMetadataProvider } from '@memberjunction/core';
import {
    OrdersCancelSubscriptionOperation,
    ToISODate,
    type CancelSubscriptionInput,
    type CancelSubscriptionOutput,
    type mjBizAppsOrdersSubscriptionEntity,
} from '@mj-biz-apps/orders-entities';

/**
 * What the person cancelling picks: the subscription type's own rule (`Type`, which sends no timing),
 * or one of the two timings that override it. Only the type's own rule applies its grace period; a
 * chosen timing ends access on the day it names.
 */
export type MJOCancelTiming = 'Type' | NonNullable<CancelSubscriptionInput['Timing']>;

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
 * status it can be cancelled from. While the form is in edit mode the control is shown disabled: the
 * form reloads the record after a cancellation, and it will not reload over unsaved edits
 * (bizapps-orders#749).
 *
 * ```html
 * <mjo-subscription-cancel [Record]="Record" [Provider]="provider" [EditMode]="editing" (Canceled)="refresh()" />
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
    /** True while the host form has unsaved edits open; cancelling waits until they are saved or discarded. */
    @Input() EditMode = false;
    /** Emits after a confirmed cancellation, so the host can reload the record. */
    @Output() Canceled = new EventEmitter<CancelSubscriptionOutput>();

    public Open = false;
    public Busy = false;
    public Error: string | null = null;
    /**
     * The type's own rule by default, so cancelling from here means what the type says it means; an
     * `EndOfBillingPeriod` type ends at its billing period, not the term. A timing is an override.
     */
    public Timing: MJOCancelTiming = 'Type';
    public Reason = '';
    public Preview: CancelSubscriptionOutput | null = null;

    public get CanCancel(): boolean {
        if (!this.Record?.IsSaved || !CANCELLABLE_STATUSES.has(this.Record.Status)) return false;
        const user = this.Provider?.CurrentUser;
        return !!user && this.Record.EntityInfo.GetUserPermisions(user).CanUpdate;
    }

    /**
     * The payment gateway's subscription id when a gateway bills this subscription (E2b). Cancelling
     * then also cancels it at the gateway, first; the panel says so before anything is pressed.
     */
    public get GatewaySubscriptionID(): string | null {
        return this.Record?.ProviderSubscriptionID ?? null;
    }

    /**
     * What the gateway will do (preview) or did (after), in words, for the preview's row. Named by the
     * coverage end beside it: the gateway's own bound (`BillingEndsAt`) is 00:00 the day AFTER coverage
     * in the business zone, which reads as a day too late next to "Coverage ends".
     */
    public GatewayLine(gateway: NonNullable<CancelSubscriptionOutput['Gateway']>, coverageEnds?: string | null): string {
        if (gateway.When === 'Now') return 'Stops billing today';
        const day = this.Day(coverageEnds);
        return day === '—' ? `Won't renew; nothing charged after coverage ends` : `Won't renew; nothing charged after coverage ends ${day}`;
    }

    /** The type's name for the default option, from the subscription's own view field. */
    public get TypeName(): string {
        return this.Record?.SubscriptionType || 'the subscription type';
    }

    public Day(value: string | null | undefined): string {
        return ToISODate(value) ?? '—';
    }

    public Start(): void {
        if (this.EditMode) return;
        this.Open = true;
        this.Timing = 'Type';
        this.Reason = '';
        this.Preview = null;
        this.Error = null;
    }

    public Close(): void {
        this.Open = false;
        this.Timing = 'Type';
        this.Reason = '';
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
        if (!this.Preview || this.EditMode) return;
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
                Timing: this.Timing === 'Type' ? undefined : this.Timing,
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
