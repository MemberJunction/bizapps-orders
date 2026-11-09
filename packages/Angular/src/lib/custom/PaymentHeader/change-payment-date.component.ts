import { ChangeDetectorRef, Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Metadata } from '@memberjunction/core';
import {
    AsDateValue,
    PAYMENT_STATUSES_WITH_ENTRIES,
    PaymentHeaderEntity,
    ToISODate,
    UserCanChangePaymentDate,
} from '@mj-biz-apps/orders-entities';

/**
 * "Change payment date" for finance on a captured payment (bc-aidp-next-golive#448).
 *
 * Sets the payment's `PaymentDate` and saves it. The save moves the payment's journal entries to
 * the same day (`PaymentHeaderEntityServer`, through `Accounting.RedatePendingJournalEntries`), and
 * refuses with accounting's message once any of them is batched; that message is shown here and
 * the date goes back to what it was. Shown only to holders of the authorization the save checks.
 */
@Component({
    standalone: true,
    selector: 'mjo-change-payment-date',
    imports: [FormsModule],
    template: `
        @if (CanChange) {
            @if (!Editing) {
                <button type="button" class="mjo-cpd__open" (click)="Open()" [attr.aria-label]="'Change the date of payment ' + Payment.PaymentNumber">
                    <i class="fa-solid fa-calendar-days" aria-hidden="true"></i> Change payment date
                </button>
            } @else {
                <span class="mjo-cpd__edit">
                    <input type="date" class="mj-input" [(ngModel)]="NewDay" [disabled]="Saving" aria-label="New payment date">
                    <button type="button" class="mjo-cpd__save" (click)="SaveDate()" [disabled]="!CanSave">
                        {{ Saving ? 'Saving…' : 'Save date' }}
                    </button>
                    <button type="button" class="mjo-cpd__cancel" (click)="Cancel()" [disabled]="Saving">Cancel</button>
                </span>
            }
            @if (ErrorMessage) {
                <div class="mjo-cpd__error" role="alert">{{ ErrorMessage }}</div>
            }
        }
    `,
    styles: [`
        :host { display: inline-flex; flex-direction: column; gap: 4px; }
        .mjo-cpd__edit { display: inline-flex; align-items: center; gap: 6px; }
        .mjo-cpd__open, .mjo-cpd__save, .mjo-cpd__cancel { font-size: 12px; padding: 3px 10px; border-radius: 6px; cursor: pointer;
            border: 1px solid var(--mj-border-default); background: var(--mj-bg-surface); color: var(--mj-text-primary); }
        .mjo-cpd__save { background: var(--mj-brand-primary); border-color: var(--mj-brand-primary); color: var(--mj-text-inverse); }
        .mjo-cpd__error { font-size: 12px; color: var(--mj-status-error); max-width: 480px; }
    `],
})
export class MJOChangePaymentDateComponent {
    private readonly cdr = inject(ChangeDetectorRef);

    @Input({ required: true }) public Payment!: PaymentHeaderEntity;
    /** Emits the new day (`YYYY-MM-DD`) after a successful save. */
    @Output() public readonly Changed = new EventEmitter<string>();

    public Editing = false;
    public Saving = false;
    public NewDay = '';
    public ErrorMessage: string | null = null;

    /** A saved payment with journal entries behind it, and a user who holds the authorization. */
    public get CanChange(): boolean {
        if (!this.Payment?.IsSaved || !PAYMENT_STATUSES_WITH_ENTRIES.has(this.Payment.Status)) return false;
        return UserCanChangePaymentDate(new Metadata().CurrentUser);
    }

    public get CanSave(): boolean {
        return !this.Saving && !!AsDateValue(this.NewDay) && this.NewDay !== ToISODate(this.Payment.PaymentDate);
    }

    public Open(): void {
        this.NewDay = ToISODate(this.Payment.PaymentDate) ?? '';
        this.ErrorMessage = null;
        this.Editing = true;
    }

    public Cancel(): void {
        this.Editing = false;
        this.ErrorMessage = null;
    }

    public async SaveDate(): Promise<void> {
        const day = AsDateValue(this.NewDay);
        if (!day || !this.CanSave) return;
        const previous = this.Payment.PaymentDate;
        this.Saving = true;
        this.ErrorMessage = null;
        this.cdr.markForCheck();
        try {
            this.Payment.PaymentDate = day;
            if (await this.Payment.Save()) {
                this.Editing = false;
                this.Changed.emit(this.NewDay);
            } else {
                this.Payment.PaymentDate = previous;
                this.ErrorMessage = this.Payment.LatestResult?.Message || this.Payment.LatestResult?.CompleteMessage || 'The payment date was not changed.';
            }
        } finally {
            this.Saving = false;
            this.cdr.markForCheck();
        }
    }
}
