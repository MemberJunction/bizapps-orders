import { ChangeDetectorRef, Component, EventEmitter, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MJOWorklistTableComponent, type MJOColumn, type MJOPreset } from '../../panels/worklist-table.component';
import { MJOOrdersDataService, type MJOPaymentRow } from '../../services/orders-data.service';
import { FormatDate, FormatMoney } from '../../panels/money-format';

/**
 * `mjo-payments-list-page` — find any payment, and see exactly what it settled.
 *
 * THERE IS NO "UNAPPLIED" COLUMN because there is no unapplied cash. A payment's
 * amount always equals the sum of its allocations, so every row reconciles by
 * construction. A column for something that cannot happen would imply it can.
 *
 * A refund is a NEW payment rather than an edit of the capture, which is why
 * reversals appear as their own rows in their own preset rather than as a state
 * on the original.
 *
 * ## Example
 *
 * ```html
 * <mjo-payments-list-page (PaymentOpened)="openPreview($event)" />
 * ```
 */
@Component({
    selector: 'mjo-payments-list-page',
    standalone: true,
    imports: [CommonModule, MJOWorklistTableComponent],
    template: `
        <mjo-worklist-table
            [Columns]="Columns"
            [Rows]="Rows"
            [Presets]="Presets"
            [ActivePreset]="Preset"
            [Search]="Search"
            SearchPlaceholder="Payment №, customer, or reference…"
            RowKey="ID"
            EmptyIcon="fa-solid fa-money-check-dollar"
            EmptyTitle="No payments match"
            EmptyHint="Try a different preset, or clear the search."
            FootNote="Every row reconciles: a payment's amount always equals the sum of its allocations, so there is no unapplied-cash column because there is no unapplied cash."
            (PresetChanged)="OnPreset($event)"
            (SearchChanged)="OnSearch($event)"
            (RowClicked)="PaymentOpened.emit($any($event))" />
    `,
    styles: [
        `
            :host {
                display: block;
                height: 100%;
                overflow: auto;
                padding: var(--mj-space-6);
            }
            @media (max-width: 760px) {
                :host { padding: var(--mj-space-4); }
            }
        `,
    ],
})
export class MJOPaymentsListPageComponent implements OnInit {
    private readonly data = inject(MJOOrdersDataService);
    /**
     * Render what was just loaded.
     *
     * These pages are created imperatively by the section shell through
     * `ViewContainerRef.createComponent`. When an async load assigns across
     * Angular's check/verify boundary, dev mode raises NG0100 and ABORTS the DOM
     * write. Nothing re-renders afterwards, so the recorded "previous" value stays
     * pre-load while the getter returns the loaded one — the mismatch then repeats
     * on every tick and the view is frozen for good. It is not a flicker: the
     * Orders dashboard sat at "0 open orders / $0.00" against 73 real orders, and
     * read as a quiet day rather than a broken screen.
     *
     * Writing the DOM here ends it: the rendered value matches the getter from the
     * first pass on, so later verify passes agree.
     */
    private readonly cdr = inject(ChangeDetectorRef);

    @Output() PaymentOpened = new EventEmitter<MJOPaymentRow>();

    public Rows: MJOPaymentRow[] = [];
    public Preset = 'all';
    public Search = '';

    public readonly Presets: MJOPreset[] = [
        { Key: 'all', Label: 'All' },
        { Key: 'captured', Label: 'Captured' },
        { Key: 'pending', Label: 'Awaiting capture', Icon: 'fa-solid fa-clock' },
        { Key: 'refunds', Label: 'Refunds', Icon: 'fa-solid fa-arrow-rotate-left' },
    ];

    public readonly Columns: MJOColumn<MJOPaymentRow>[] = [
        { Key: 'PaymentNumber', Label: 'Payment', Kind: 'mono', Width: '118px', Sortable: true },
        {
            Key: 'PaymentDate',
            Label: 'Date',
            Width: '96px',
            Sortable: true,
            Format: (r) => FormatDate(r.PaymentDate, { Short: true }),
        },
        {
            Key: 'From',
            Label: 'From',
            Format: (r) => (r.BillToOrganization ?? r.BillToPerson ?? '—') as string,
        },
        { Key: 'PaymentType', Label: 'Tender', Width: '130px', HideBelow: 760 },
        { Key: 'Company', Label: 'Into', Width: '96px', HideBelow: 1000 },
        {
            Key: 'Status',
            Label: 'Status',
            Kind: 'chip',
            Width: '110px',
            ChipClass: (r) =>
                r.Status === 'Captured'
                    ? 'mj-chip--success'
                    : r.Status === 'Pending'
                      ? 'mj-chip--warning'
                      : r.Status === 'Refunded'
                        ? 'mj-chip--violet'
                        : r.Status === 'Failed' || r.Status === 'Disputed'
                          ? 'mj-chip--error'
                          : '',
        },
        {
            Key: 'Amount',
            Label: 'Amount',
            Kind: 'money',
            Width: '116px',
            Sortable: true,
            // A refund stores a positive magnitude with negative lines, so the sign
            // here comes from the STATUS rather than from the stored number.
            Format: (r) => (r.Status === 'Refunded' ? '−' : '') + FormatMoney(r.Amount, { Sign: 'absolute' }),
        },
        {
            Key: 'ProcessingFeeAmount',
            Label: 'Fee',
            Kind: 'money',
            Width: '92px',
            HideBelow: 560,
            Format: (r) => FormatMoney(r.ProcessingFeeAmount, { Zero: '—' }),
        },
    ];

    public async ngOnInit(): Promise<void> {
        await this.load();
    }

    public async OnPreset(preset: string): Promise<void> {
        this.Preset = preset;
        await this.load();
        this.cdr.detectChanges();
    }

    public async OnSearch(text: string): Promise<void> {
        this.Search = text;
        await this.load();
        this.cdr.detectChanges();
    }

    private async load(): Promise<void> {
        this.Rows = await this.data.GetPayments({ Preset: this.Preset as never, Search: this.Search });
        this.cdr.detectChanges();
    }
}
