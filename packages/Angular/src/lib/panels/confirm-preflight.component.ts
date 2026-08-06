import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MJOMoneyPipe } from './money-format';
import { MJOJournalEntryPreviewComponent, type MJOJournalEntry } from './journal-entry-preview.component';
import { MJAlertComponent, MJButtonDirective } from '@memberjunction/ng-ui-components';

/** Something that makes confirming impossible, in the words of the rule that failed. */
export interface MJOBlocker {
    Code: string;
    Message: string;
    /** Where to go to fix it, when there is somewhere. */
    ResolutionHint?: string | null;
    LineNumber?: number | null;
}

/** What confirming will do to a subscription. */
export interface MJOSubscriptionDecision {
    Action: 'Create' | 'Extend' | 'Renew' | 'None';
    SubscriptionNumber?: string | null;
    HolderName?: string | null;
    BeneficiaryName?: string | null;
    CoverageThrough?: string | null;
    ProrationFactor?: number | null;
    Notes?: string | null;
}

/** A grant that will issue, with the policy that shaped it. */
export interface MJOEntitlementGrant {
    EntitlementName: string;
    BeneficiaryName?: string | null;
    GrantTiming?: string | null;
    QuantityMode?: string | null;
    ValidityMode?: string | null;
    Quantity?: number | null;
    ValidFrom?: string | null;
    ValidTo?: string | null;
}

/** A sales rule that will escalate rather than refuse. */
export interface MJOApprovalRequirement {
    RuleName: string;
    Reason: string;
    ApproverRoleName?: string | null;
}

/** A line that will hold the order at Posted because it must ship. */
export interface MJOFulfillmentHold {
    LineNumber: number;
    ProductName: string;
    Quantity: number;
}

/** Everything the pre-flight renders. Mirrors `OrdersPreviewConfirmOutput`. */
export interface MJOPreflight {
    CanConfirm: boolean;
    GrossTotal?: number | null;
    JournalEntries: MJOJournalEntry[];
    EntryCount: number;
    CompanyCount: number;
    AllBalanced: boolean;
    SubscriptionDecisions: MJOSubscriptionDecision[];
    EntitlementGrants: MJOEntitlementGrant[];
    Approvals: MJOApprovalRequirement[];
    FulfillmentHolds?: MJOFulfillmentHold[];
    InitialPayment?: {
        PaymentTypeName: string;
        Amount: number;
        ProcessingFeeAmount?: number | null;
        InstrumentSummary?: string | null;
    } | null;
    Blockers: MJOBlocker[];
}

/**
 * `mjo-confirm-preflight` — what will happen, before it happens.
 *
 * THE COMPONENT THIS WHOLE DESIGN EXISTS FOR. Confirming books journal entries,
 * writes subscriptions, issues grants and captures payment, and it is not
 * undoable. The conventional design puts a button there and a red failure banner
 * after it — which means the user learns about an unresolvable GL account by
 * being told to go somewhere else and try again. This states it first.
 *
 * Two distinctions the layout makes deliberately:
 *
 * - **Blockers are not approvals.** A blocker makes confirming impossible and
 *   genuinely disables the button. A sales rule over the rep's authority
 *   ESCALATES — it raises an approval task and proceeds — so it appears in its own
 *   section while `CanConfirm` stays true. Conflating them would either refuse a
 *   legitimate exception or hide a real obstacle.
 * - **The button is unavailable, not merely discouraged.** A red-but-clickable
 *   confirm invites someone to try it and read the failure afterwards, which is
 *   the behaviour this screen replaces.
 *
 * ## Example
 *
 * ```html
 * <mjo-confirm-preflight
 *   [Preflight]="preflight"
 *   [Busy]="confirming"
 *   (Confirmed)="doConfirm()"
 *   (Cancelled)="close()"
 *   (ResolutionRequested)="openAccounting($event)" />
 * ```
 */
@Component({
    selector: 'mjo-confirm-preflight',
    standalone: true,
    imports: [MJButtonDirective, CommonModule, MJOMoneyPipe, MJOJournalEntryPreviewComponent, MJAlertComponent],
    template: `
        @if (Preflight) {
            <div class="mjo-preflight">
                <!-- Blockers first: the answer to "can I do this" belongs above
                     everything that assumes the answer is yes. -->
                @if (Preflight.Blockers.length) {
                    @for (blocker of Preflight.Blockers; track blocker.Code) {
                        <mj-alert Variant="error" Icon="fa-solid fa-circle-exclamation" class="mjo-preflight__banner">
                                <strong>{{ blocker.Message }}</strong>
                                @if (blocker.LineNumber != null) {
                                    <span class="muted"> (line {{ blocker.LineNumber }})</span>
                                }
                                @if (blocker.ResolutionHint) {
                                    <div class="mjo-preflight__hint">
                                        <a href="#" (click)="requestResolution($event, blocker)">
                                            {{ blocker.ResolutionHint }}
                                            <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>
                                        </a>
                                    </div>
                                }
                        </mj-alert>
                    }
                } @else {
                    <mj-alert Variant="success" Icon="fa-solid fa-circle-check" class="mjo-preflight__banner">
                            <strong>Nothing is blocking this confirm.</strong>
                            Every line resolved an account for each role it needs.
                    </mj-alert>
                }

                <!-- Journal entries -->
                <details class="mj-panel" open>
                    <summary>
                        <i class="fa-solid fa-scale-balanced" aria-hidden="true"></i> Journal entries
                        <span class="right">
                            <span class="mj-chip" [class.mj-chip--success]="Preflight.AllBalanced" [class.mj-chip--error]="!Preflight.AllBalanced">
                                {{ Preflight.EntryCount }} {{ Preflight.EntryCount === 1 ? 'entry' : 'entries' }} ·
                                {{ Preflight.CompanyCount }} {{ Preflight.CompanyCount === 1 ? 'company' : 'companies' }} ·
                                {{ Preflight.AllBalanced ? 'balanced' : 'NOT balanced' }}
                            </span>
                        </span>
                    </summary>
                    <div class="mj-panel-body">
                        <mjo-journal-entry-preview
                            [Entries]="Preflight.JournalEntries"
                            [Pending]="true"
                            (OpenInAccounting)="OpenInAccounting.emit($event)" />
                    </div>
                </details>

                <!-- Subscriptions -->
                @if (Preflight.SubscriptionDecisions.length) {
                    <details class="mj-panel" open>
                        <summary>
                            <i class="fa-solid fa-rotate" aria-hidden="true"></i> Subscriptions
                            <span class="right">
                                <span class="mj-chip mj-chip--violet">{{ Preflight.SubscriptionDecisions.length }}</span>
                            </span>
                        </summary>
                        <div class="mj-panel-body small">
                            @for (decision of Preflight.SubscriptionDecisions; track $index) {
                                <div class="mjo-preflight__row">
                                    <b>{{ decision.Action }}s {{ decision.SubscriptionNumber }}</b>
                                    @if (decision.HolderName) {
                                        — held by {{ decision.HolderName }}
                                    }
                                    @if (decision.BeneficiaryName) {
                                        , benefiting <b>{{ decision.BeneficiaryName }}</b>
                                    }
                                    @if (decision.CoverageThrough) {
                                        <div class="muted">Coverage through {{ decision.CoverageThrough }}.</div>
                                    }
                                    @if (decision.ProrationFactor != null && decision.ProrationFactor !== 1) {
                                        <div class="muted">
                                            Partial period — the line's quantity is scaled to
                                            {{ decision.ProrationFactor }}, so billed, term and recognised all agree.
                                        </div>
                                    }
                                    @if (decision.Notes) {
                                        <div class="muted">{{ decision.Notes }}</div>
                                    }
                                </div>
                            }
                        </div>
                    </details>
                }

                <!-- Payment -->
                @if (Preflight.InitialPayment) {
                    <details class="mj-panel">
                        <summary>
                            <i class="fa-solid fa-credit-card" aria-hidden="true"></i> Payment
                            <span class="right">
                                <span class="mj-chip mj-chip--info">captures {{ Preflight.InitialPayment.Amount | mjoMoney }}</span>
                            </span>
                        </summary>
                        <div class="mj-panel-body small">
                            {{ Preflight.InitialPayment.PaymentTypeName }}
                            @if (Preflight.InitialPayment.InstrumentSummary) {
                                · {{ Preflight.InitialPayment.InstrumentSummary }}
                            }
                            <div class="muted mjo-preflight__note">
                                Books the cash leg in the same transaction: Dr Cash net of fees, Dr Processing Fee,
                                Cr A/R at <b>gross</b>. Crediting A/R net of the fee would leave a residue on the
                                customer's balance that no payment could ever clear.
                            </div>
                            <div class="muted">If the card declines, nothing persists — not the payment, not the booking, not the confirm.</div>
                        </div>
                    </details>
                }

                <!-- Entitlements -->
                @if (Preflight.EntitlementGrants.length) {
                    <details class="mj-panel">
                        <summary>
                            <i class="fa-solid fa-id-badge" aria-hidden="true"></i> Entitlement grants
                            <span class="right"><span class="mj-chip">{{ Preflight.EntitlementGrants.length }}</span></span>
                        </summary>
                        <div class="mj-panel-body small">
                            @for (grant of Preflight.EntitlementGrants; track $index) {
                                <div class="mjo-preflight__row">
                                    <b>{{ grant.EntitlementName }}</b>
                                    @if (grant.BeneficiaryName) { → {{ grant.BeneficiaryName }} }
                                    @if (grant.Quantity != null) {
                                        <span class="muted"> · {{ grant.Quantity }} seat{{ grant.Quantity === 1 ? '' : 's' }}</span>
                                    }
                                    <div class="muted">
                                        @if (grant.ValidFrom || grant.ValidTo) {
                                            {{ grant.ValidFrom }} – {{ grant.ValidTo }}
                                        }
                                        @if (grant.GrantTiming) { · timing {{ grant.GrantTiming }} }
                                        @if (grant.QuantityMode) { · quantity {{ grant.QuantityMode }} }
                                        @if (grant.ValidityMode) { · validity {{ grant.ValidityMode }} }
                                    </div>
                                </div>
                            }
                            <div class="muted mjo-preflight__note">Downstream apps poll for grants; nothing is pushed at them.</div>
                        </div>
                    </details>
                }

                <!-- Fulfillment -->
                @if (Preflight.FulfillmentHolds?.length) {
                    <details class="mj-panel">
                        <summary>
                            <i class="fa-solid fa-dolly" aria-hidden="true"></i> Fulfillment
                            <span class="right"><span class="mj-chip mj-chip--warning">stops at Posted</span></span>
                        </summary>
                        <div class="mj-panel-body small">
                            @for (hold of Preflight.FulfillmentHolds ?? []; track hold.LineNumber) {
                                <div>{{ hold.Quantity }} × {{ hold.ProductName }} must ship.</div>
                            }
                            <div class="muted mjo-preflight__note">
                                No entry fires when it ships — fulfillment is logistics, not revenue.
                            </div>
                        </div>
                    </details>
                }

                <!-- Approvals: present does NOT mean blocked -->
                <details class="mj-panel" [open]="Preflight.Approvals.length > 0">
                    <summary>
                        <i class="fa-solid fa-user-check" aria-hidden="true"></i> Approvals
                        <span class="right">
                            <span class="mj-chip" [class.mj-chip--warning]="Preflight.Approvals.length" [class.mj-chip--outline]="!Preflight.Approvals.length">
                                {{ Preflight.Approvals.length ? Preflight.Approvals.length + ' required' : 'none required' }}
                            </span>
                        </span>
                    </summary>
                    <div class="mj-panel-body small">
                        @if (Preflight.Approvals.length) {
                            @for (approval of Preflight.Approvals; track $index) {
                                <div class="mjo-preflight__row">
                                    <b>{{ approval.RuleName }}</b> — {{ approval.Reason }}
                                    @if (approval.ApproverRoleName) {
                                        <div class="muted">Raises an approval task for <b>{{ approval.ApproverRoleName }}</b>.</div>
                                    }
                                </div>
                            }
                            <div class="muted mjo-preflight__note">
                                Confirming still proceeds. Absence of authority is not permission, but it is not a
                                dead end either — the exception is recorded and routed.
                            </div>
                        } @else {
                            <span class="muted">No sales rule matched.</span>
                        }
                    </div>
                </details>
            </div>
        } @else {
            <div class="mjo-preflight__loading" role="status" aria-live="polite">
                <i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>
                Working out what this will do…
            </div>
        }

        <!--
          The commit. This panel declared \`Confirmed\`, the host wires it to
          ConfirmFromPreflight(), and CanConfirm exists to gate exactly this control — but
          nothing ever emitted it, so the pre-flight could say "nothing is blocking this
          confirm" and offer no way to proceed. Confirm → journal entries was therefore
          unreachable from the UI. Added 2026-08-03.

          The button is UNAVAILABLE rather than merely discouraged when the pre-flight says
          so (see the header note): booking journal entries is not undoable.
        -->
        <div class="mjo-preflight__actions">
            <button type="button" mjButton variant="outline" [disabled]="Busy" (click)="Cancelled.emit()">
                Cancel
            </button>
            <button type="button" mjButton variant="primary" [disabled]="!CanConfirm" (click)="Confirmed.emit()">
                @if (Busy) {
                    <i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Confirming…
                } @else {
                    <i class="fa-solid fa-check" aria-hidden="true"></i> Confirm and book
                }
            </button>
        </div>
    `,
    styles: [
        `
            .mjo-preflight__actions {
                display: flex;
                justify-content: flex-end;
                gap: var(--mj-space-2);
                margin-top: var(--mj-space-4);
            }
            .mjo-preflight__banner {
                margin-bottom: var(--mj-space-4);
            }
            .mjo-preflight__hint {
                margin-top: var(--mj-space-2);
            }
            .mjo-preflight__row {
                padding: var(--mj-space-2) 0;
                border-bottom: 1px solid var(--mj-border-subtle);
            }
            .mjo-preflight__row:last-child {
                border-bottom: none;
            }
            .mjo-preflight__note {
                margin-top: var(--mj-space-2);
            }
            .mjo-preflight__loading {
                display: flex;
                align-items: center;
                gap: var(--mj-space-2);
                padding: var(--mj-space-8);
                justify-content: center;
                color: var(--mj-text-muted);
                font-size: 13px;
            }
        `,
    ],
})
export class MJOConfirmPreflightComponent {
    /** What will happen. Null renders the loading state. */
    @Input() Preflight: MJOPreflight | null = null;

    /** A confirm is in flight — used by the host to disable its footer button. */
    @Input() Busy = false;

    /** The user accepted. Only reachable when `CanConfirm` is true. */
    @Output() Confirmed = new EventEmitter<void>();

    /** The user backed out. */
    @Output() Cancelled = new EventEmitter<void>();

    /** A blocker's resolution link was followed. The host decides where to go. */
    @Output() ResolutionRequested = new EventEmitter<MJOBlocker>();

    /** An entry's "open in Accounting" link was followed. */
    @Output() OpenInAccounting = new EventEmitter<MJOJournalEntry>();

    /** Whether the host's confirm button should be live. */
    public get CanConfirm(): boolean {
        return !!this.Preflight?.CanConfirm && !this.Busy;
    }

    protected requestResolution(event: Event, blocker: MJOBlocker): void {
        event.preventDefault();
        this.ResolutionRequested.emit(blocker);
    }
}
