import { ChangeDetectorRef, Component, EventEmitter, Input, Output, inject } from '@angular/core';
import type { IMetadataProvider } from '@memberjunction/core';
import {
    OrdersCancelSubscriptionOperation,
    Today,
    ToISODate,
    UserCanReverse,
    type CancelSubscriptionInput,
    type CancelSubscriptionOutput,
    type mjBizAppsOrdersSubscriptionEntity,
} from '@mj-biz-apps/orders-entities';
import { LoadCancelRefundDefault, type MJOCancelRefundDefault } from '../data/cancel-refund-default';

/**
 * What the person cancelling picks: the subscription type's own rule (`Type`, which sends no timing),
 * or one of the two timings that override it. Only the type's own rule applies its grace period; a
 * chosen timing ends access on the day it names.
 */
export type MJOCancelTiming = 'Type' | NonNullable<CancelSubscriptionInput['Timing']>;

/**
 * What to give back: the subscription type's own refund rule (`Type`, which sends no refund), or one
 * of the two choices that override it for this cancellation (golive #384).
 */
export type MJOCancelRefund = 'Type' | NonNullable<CancelSubscriptionInput['Refund']>;

/** Statuses a subscription can be cancelled from. The operation refuses `Canceled` itself. */
const CANCELLABLE_STATUSES = new Set(['Active', 'Trialing', 'Paused']);

/**
 * `mjo-subscription-cancel` — cancel a subscription from its form: choose when coverage ends and what
 * is given back, preview what that does, then confirm.
 *
 * The decision is the server's. Preview and confirm are the same `Orders.CancelSubscription` call,
 * the first with `Preview: true`, so what the person confirms is what the operation computed, not a
 * second calculation done here. Changing the timing, the refund or the reason throws the preview away, so a
 * stale preview can never be confirmed.
 *
 * Offered only to a viewer who may update subscriptions and holds MJ.BizApps.Orders.Order.Reverse
 * (the Finance role; the operation refuses everyone else, bc-aidp-next-golive#454), and only while the subscription is in a
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
    /**
     * The type's own rule, except on a term that has not started and whose order has received no money:
     * that one starts on `Full` (see `PickCancelRefundDefault`), so cancelling it takes back the unbilled
     * receivable and the revenue still scheduled, and refunds nothing.
     */
    public Refund: MJOCancelRefund = 'Type';
    /** Why `Refund` started on `Full`, for the hint; null when it started on the type's rule. */
    public RefundDefault: MJOCancelRefundDefault | null = null;
    public Reason = '';
    public Preview: CancelSubscriptionOutput | null = null;

    public get CanCancel(): boolean {
        if (!this.Record?.IsSaved || !CANCELLABLE_STATUSES.has(this.Record.Status)) return false;
        const user = this.Provider?.CurrentUser;
        return !!user && this.Record.EntityInfo.GetUserPermisions(user).CanUpdate && UserCanReverse(user, this.Provider);
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

    public async Start(): Promise<void> {
        if (this.EditMode) return;
        this.Open = true;
        this.Timing = 'Type';
        this.Refund = 'Type';
        this.RefundDefault = null;
        this.Reason = '';
        this.Preview = null;
        this.Error = null;
        await this.applyRefundDefault();
    }

    public Close(): void {
        this.Open = false;
        this.Timing = 'Type';
        this.Refund = 'Type';
        this.RefundDefault = null;
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

    /**
     * Start on `Full` when the term a cancellation today would cut has not started and nothing was paid
     * on its order. A failed read leaves the type's rule, which the preview then shows.
     */
    private async applyRefundDefault(): Promise<void> {
        let found: MJOCancelRefundDefault | null = null;
        try {
            found = await LoadCancelRefundDefault(this.Record.ID, this.Provider, Today());
        } catch {
            found = null;
        }
        // The person may have chosen, or closed the panel, while the read was out.
        if (!this.Open || this.Refund !== 'Type' || this.Preview) return;
        this.RefundDefault = found;
        if (found) this.Refund = found.Refund;
        this.cdr.detectChanges();
    }

    private async execute(preview: boolean): Promise<CancelSubscriptionOutput | null> {
        this.Busy = true;
        this.Error = null;
        try {
            const result = await new OrdersCancelSubscriptionOperation().Execute({
                SubscriptionID: this.Record.ID,
                Timing: this.Timing === 'Type' ? undefined : this.Timing,
                Refund: this.Refund === 'Type' ? undefined : this.Refund,
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
