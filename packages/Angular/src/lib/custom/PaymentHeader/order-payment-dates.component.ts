import { ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, Output, inject } from '@angular/core';
import { Metadata, RunView } from '@memberjunction/core';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { PAYMENT_STATUSES_WITH_ENTRIES, PaymentHeaderEntity, RequireUUID, ToISODate, UserCanChangePaymentDate } from '@mj-biz-apps/orders-entities';
import { MJO_ENTITIES } from '../../data/entity-names';
import { MJOChangePaymentDateComponent } from './change-payment-date.component';

/**
 * The order's captured payments with "Change payment date" on each, for finance, under the order's
 * Payments tab (bc-aidp-next-golive#448). The grid above it is the generic one and has no row
 * actions; this lists the same payments (those allocated to the order) and nothing else.
 */
@Component({
    standalone: true,
    selector: 'mjo-order-payment-dates',
    imports: [SharedGenericModule, MJOChangePaymentDateComponent],
    template: `
        @if (Visible) {
            <section class="mjo-opd" aria-label="Payment dates">
                <h3 class="mjo-opd__title">Payment dates</h3>
                @if (Loading) {
                    <mj-loading text="Loading payments…" size="small"></mj-loading>
                } @else if (LoadError) {
                    <div class="mjo-opd__error" role="alert">{{ LoadError }}</div>
                } @else {
                    <ul class="mjo-opd__list">
                        @for (p of Payments; track p.ID) {
                            <li class="mjo-opd__row">
                                <span class="mjo-opd__number">{{ p.PaymentNumber }}</span>
                                <span class="mjo-opd__date">{{ DayOf(p) }}</span>
                                <mjo-change-payment-date [Payment]="p" (Changed)="OnChanged()"></mjo-change-payment-date>
                            </li>
                        }
                    </ul>
                }
            </section>
        }
    `,
    styles: [`
        .mjo-opd { margin-top: 12px; }
        .mjo-opd__title { font-size: 13px; font-weight: 600; margin: 0 0 6px; }
        .mjo-opd__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
        .mjo-opd__row { display: flex; align-items: flex-start; gap: 12px; font-size: 13px; }
        .mjo-opd__number { font-weight: 600; min-width: 110px; }
        .mjo-opd__date { min-width: 90px; color: var(--mj-text-secondary); }
        .mjo-opd__error { font-size: 12px; color: var(--mj-status-error); }
    `],
})
export class MJOOrderPaymentDatesComponent implements OnChanges {
    private readonly cdr = inject(ChangeDetectorRef);

    @Input({ required: true }) public OrderHeaderID!: string;
    /** Emits after a payment's date changed, so the page can refresh what it shows. */
    @Output() public readonly Changed = new EventEmitter<void>();

    public Payments: PaymentHeaderEntity[] = [];
    public Loading = false;
    public LoadError: string | null = null;

    /** Finance only, and only when the order has a payment whose date can be corrected. */
    public get Visible(): boolean {
        return UserCanChangePaymentDate(new Metadata().CurrentUser) && (this.Loading || !!this.LoadError || this.Payments.length > 0);
    }

    public async ngOnChanges(): Promise<void> {
        await this.load();
    }

    public DayOf(payment: PaymentHeaderEntity): string {
        return ToISODate(payment.PaymentDate) ?? '';
    }

    public OnChanged(): void {
        this.Changed.emit();
        this.cdr.markForCheck();
    }

    private async load(): Promise<void> {
        if (!this.OrderHeaderID || !UserCanChangePaymentDate(new Metadata().CurrentUser)) return;
        this.Loading = true;
        this.LoadError = null;
        this.cdr.markForCheck();
        const result = await new RunView().RunView<PaymentHeaderEntity>({
            EntityName: MJO_ENTITIES.PaymentHeader,
            ExtraFilter: `ID IN (SELECT PaymentHeaderID FROM [__mj_BizAppsOrders].[vwPaymentLines] WHERE OrderHeaderID = '${RequireUUID(this.OrderHeaderID, 'OrderHeaderID')}')`,
            OrderBy: 'PaymentDate ASC',
            ResultType: 'entity_object',
        });
        this.Loading = false;
        if (result.Success) {
            this.Payments = (result.Results ?? []).filter((p) => PAYMENT_STATUSES_WITH_ENTRIES.has(p.Status));
        } else {
            this.LoadError = `Could not load the order's payments: ${result.ErrorMessage ?? 'unknown error'}`;
        }
        this.cdr.markForCheck();
    }
}
