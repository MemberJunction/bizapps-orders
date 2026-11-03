import { Component } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {
    OrdersReplayCheckoutStepOperation,
    UserHasAuthorization,
    type mjBizAppsOrdersCheckoutSessionStepEntity,
} from '@mj-biz-apps/orders-entities';
import { mjBizAppsOrdersCheckoutSessionStepFormComponent } from '../../generated/Entities/mjBizAppsOrdersCheckoutSessionStep/mjbizappsorderscheckoutsessionstep.form.component';

/** Held by the Checkout Operator role (`Orders.ReplayCheckoutStep`, #326/#853). */
export const CHECKOUT_REPLAY_AUTH = 'MJ.BizApps.Orders.Checkout.Replay';

/** A Running step older than this threshold is considered interrupted and eligible for operator replay. */
export const STALE_RUNNING_MINUTES = 15;

/**
 * True when a `CheckoutSessionStep` record can be re-driven by an operator (#853):
 * only `Capture` is replayable, and only when `Failed` or `Running` longer than `STALE_RUNNING_MINUTES`.
 */
export function IsStepReplayEligible(
    step: Pick<mjBizAppsOrdersCheckoutSessionStepEntity, 'StepName' | 'Status' | 'LastAttemptAt'> | null | undefined,
    now: Date = new Date(),
): boolean {
    if (!step || step.StepName !== 'Capture') {
        return false;
    }
    if (step.Status === 'Failed') {
        return true;
    }
    if (step.Status === 'Running' && step.LastAttemptAt) {
        return now.getTime() - new Date(step.LastAttemptAt).getTime() > STALE_RUNNING_MINUTES * 60_000;
    }
    return false;
}

/**
 * Custom form component for `MJ_BizApps_Orders: Checkout Session Steps` (#853).
 *
 * Surfaces a Replay button for operators holding `MJ.BizApps.Orders.Checkout.Replay` so a failed
 * or stale-running `Capture` step from the "Checkouts: Needs Review" view can be re-driven via
 * `Orders.ReplayCheckoutStep` without leaving the form.
 */
@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Checkout Session Steps', 10)
@Component({
    standalone: false,
    selector: 'bizapps-checkout-session-step-form',
    templateUrl: './checkout-session-step-form.component.html',
    styleUrls: ['./checkout-session-step-form.component.css'],
})
export class BizAppsCheckoutSessionStepFormComponent extends mjBizAppsOrdersCheckoutSessionStepFormComponent {
    public declare record: mjBizAppsOrdersCheckoutSessionStepEntity;

    public Replaying = false;
    public ReplayMessage: string | null = null;
    public ReplaySucceeded: boolean | null = null;

    /** Whether the current user holds `MJ.BizApps.Orders.Checkout.Replay`. */
    public get CanUseReplay(): boolean {
        const provider = this.ProviderToUse;
        return UserHasAuthorization(CHECKOUT_REPLAY_AUTH, provider?.CurrentUser, provider);
    }

    /** Whether the current step row is in a state that `Orders.ReplayCheckoutStep` can re-drive. */
    public get IsReplayEligible(): boolean {
        return IsStepReplayEligible(this.record);
    }

    /** Whether the Replay button is currently enabled. */
    public get CanReplay(): boolean {
        return !this.Replaying && this.CanUseReplay && this.IsReplayEligible;
    }

    /** Invokes `Orders.ReplayCheckoutStep` for the current step record and updates its displayed state. */
    public async ReplayStep(): Promise<void> {
        if (!this.CanReplay || !this.record?.CheckoutSessionID || !this.record?.StepName) {
            return;
        }
        this.Replaying = true;
        this.ReplayMessage = null;
        this.ReplaySucceeded = null;
        try {
            const result = await new OrdersReplayCheckoutStepOperation().Execute({
                CheckoutSessionID: this.record.CheckoutSessionID,
                StepName: this.record.StepName,
            });
            const output = result.Output;
            if (output) {
                if (output.Status === 'Running' || output.Status === 'Succeeded' || output.Status === 'Failed') {
                    this.record.Status = output.Status;
                }
                if (typeof output.Attempts === 'number') {
                    this.record.Attempts = output.Attempts;
                }
                if (output.LastError !== undefined) {
                    this.record.LastError = output.LastError;
                }
            }
            const ok = Boolean(result.Success && output?.Success);
            this.ReplaySucceeded = ok;
            this.ReplayMessage = output?.Message ?? result.ErrorMessage ?? (ok ? 'Step replayed.' : 'Replay failed.');
        } catch (err) {
            this.ReplaySucceeded = false;
            this.ReplayMessage = err instanceof Error ? err.message : String(err);
        } finally {
            this.Replaying = false;
            this.cdr?.markForCheck?.();
        }
    }
}

/** Tree-shaking prevention anchor function */
export function LoadCheckoutSessionStepFormComponent(): void {
    // Anchors BizAppsCheckoutSessionStepFormComponent in bundlers
}
