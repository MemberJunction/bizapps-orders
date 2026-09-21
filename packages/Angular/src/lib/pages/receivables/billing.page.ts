import { ChangeDetectorRef, Component, EventEmitter, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MJAlertComponent, MJButtonDirective, MJConfirmService } from '@memberjunction/ng-ui-components';
import {
    OrdersGetBillingWorklistOperation,
    OrdersIssueInstalmentInvoiceOperation,
    type BillingWorklistRow,
} from '@mj-biz-apps/orders-entities';
import { MJOStatTileComponent } from '../../panels/stat-tile.component';
import { MJOWorklistTableComponent, type MJOColumn, type MJOPreset } from '../../panels/worklist-table.component';
import { FormatDate, FormatMoney } from '../../panels/money-format';

/** How far ahead the worklist looks. Finance's renewal lead is 90 days; a month is the working view. */
const WINDOW_DAYS = 30;

/**
 * `mjo-billing-page` — instalments due with no invoice behind them (AIDP-24, plan §6.3).
 *
 * THE CONTROL FINANCE RUNS BY HAND TODAY. A multi-year contract billed in instalments has rows due
 * in 2027 and 2029 that nobody will remember. This screen is where they surface on their own: every
 * `Scheduled` instalment whose due date is inside the window, earliest first, with the act that
 * turns it into a receivable document one confirmation away.
 *
 * ISSUING IS THE IRREVERSIBLE STEP, so it asks first — through `MJConfirmService`, never
 * `window.confirm`, which throws under the Electron host. Once issued the number is frozen on the
 * row and the row leaves this list.
 *
 * ## Example
 *
 * ```html
 * <mjo-billing-page (OrderOpened)="open($event)" />
 * ```
 */
@Component({
    selector: 'mjo-billing-page',
    standalone: true,
    imports: [CommonModule, MJButtonDirective, MJAlertComponent, MJOStatTileComponent, MJOWorklistTableComponent],
    template: `
        <div class="mj-stat-grid mjo-bl__tiles">
            <mjo-stat-tile
                Label="Due in the next {{ WindowDays }} days"
                Icon="fa-solid fa-file-invoice-dollar"
                Tone="alert"
                [Value]="TotalDisplay"
                [Detail]="TotalDetail" />

            <mjo-stat-tile
                Label="Past due, never invoiced"
                Icon="fa-solid fa-hourglass-half"
                [Value]="String(PastDueCount)"
                Detail="Issue these first" />

            <mjo-stat-tile
                Label="Window"
                Icon="fa-regular fa-calendar"
                [Value]="WindowDisplay"
                Detail="Scheduled instalments only" />
        </div>

        @if (LoadError) {
            <mj-alert Variant="error" Icon="fa-solid fa-triangle-exclamation" class="mjo-bl__note">
                <strong>The billing worklist did not load.</strong>
                {{ LoadError }}
            </mj-alert>
        }
        @if (Notice) {
            <mj-alert [Variant]="Notice.Tone" Icon="fa-solid fa-circle-info" class="mjo-bl__note">
                {{ Notice.Text }}
            </mj-alert>
        }
        @if (Truncated) {
            <mj-alert Variant="warning" Icon="fa-solid fa-triangle-exclamation" class="mjo-bl__note">
                <strong>List truncated.</strong>
                Not every due instalment is shown.
            </mj-alert>
        }

        <div class="row mjo-bl__actions">
            <button type="button" mjButton variant="outline" [disabled]="!Selected" (click)="OpenSelected()">
                <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i> Open order
            </button>
            <button type="button" mjButton variant="primary" [disabled]="!Selected || Issuing" (click)="IssueSelected()">
                <i class="fa-solid fa-file-invoice" aria-hidden="true"></i>
                {{ Issuing ? 'Issuing…' : 'Issue invoice' }}
            </button>
            @if (Selected; as row) {
                <span class="small muted">{{ row.OrderNumber }} · instalment {{ row.InstallmentNumber }} of {{ row.InstallmentCount }} · {{ money(row.Amount) }}</span>
            }
        </div>

        <mjo-worklist-table
            [Columns]="Columns"
            [Rows]="Rows"
            [Presets]="Presets"
            [ActivePreset]="Preset"
            [Searchable]="false"
            RowKey="OrderHeaderPaymentScheduleID"
            [SelectedKey]="Selected?.OrderHeaderPaymentScheduleID ?? null"
            EmptyTitle="Nothing to bill"
            EmptyHint="No scheduled instalment falls inside the window."
            EmptyIcon="fa-solid fa-file-invoice-dollar"
            (PresetChanged)="OnPreset($event)"
            (RowClicked)="Selected = $event" />
    `,
    styles: [
        `
            :host {
                display: block;
                height: 100%;
                overflow: auto;
                padding: var(--mj-space-6);
            }
            .mjo-bl__tiles { margin-bottom: var(--mj-space-4); }
            .mjo-bl__note { margin-bottom: var(--mj-space-4); }
            .mjo-bl__actions {
                align-items: center;
                gap: var(--mj-space-3);
                margin-bottom: var(--mj-space-4);
            }
            @media (max-width: 760px) {
                :host { padding: var(--mj-space-4); }
            }
        `,
    ],
})
export class MJOBillingPageComponent implements OnInit {
    /** Same NG0100 reasoning as every other imperatively-created page here: write the DOM after a load. */
    private readonly cdr = inject(ChangeDetectorRef);
    private readonly confirm = inject(MJConfirmService);

    @Output() OrderOpened = new EventEmitter<{ ID: string }>();

    public readonly WindowDays = WINDOW_DAYS;
    public readonly String = String;

    public LoadError: string | null = null;
    public Notice: { Tone: 'success' | 'error' | 'warning'; Text: string } | null = null;
    public Truncated = false;
    public Issuing = false;
    public AllRows: BillingWorklistRow[] = [];
    public Rows: BillingWorklistRow[] = [];
    public Selected: BillingWorklistRow | null = null;
    public Preset = 'all';
    public AsOf = '';
    public WindowEnd = '';

    public readonly Columns: MJOColumn<BillingWorklistRow>[] = [
        { Key: 'DueDate', Label: 'Due', Kind: 'date', Width: '110px', Format: (r) => FormatDate(r.DueDate, { Short: true }), Secondary: (r) => this.dueNote(r) },
        { Key: 'OrderNumber', Label: 'Order', Kind: 'mono', Width: '120px', Secondary: (r) => `${r.InstallmentNumber} of ${r.InstallmentCount}` },
        { Key: 'CustomerName', Label: 'Customer' },
        { Key: 'CompanyName', Label: 'Billed by', HideBelow: 1000 },
        { Key: 'Description', Label: 'For', HideBelow: 760 },
        { Key: 'Amount', Label: 'Amount', Kind: 'money', Width: '120px', Format: (r) => FormatMoney(r.Amount) },
        { Key: 'OrderStatus', Label: 'Order', Kind: 'chip', Width: '110px', HideBelow: 560, ChipClass: (r) => (r.OrderStatus === 'Confirmed' ? 'mj-chip--success' : 'mj-chip--outline') },
    ];

    /**
     * A FIELD, rebuilt when the rows change — not a getter. A getter returning a fresh array is a
     * new input reference on every change-detection pass, which dev mode reports as NG0100 and
     * which re-renders the chip row for nothing.
     */
    public Presets: MJOPreset[] = [];

    public async ngOnInit(): Promise<void> {
        await this.load();
        this.cdr.detectChanges();
    }

    /* ── Tiles ──────────────────────────────────────────────────────────── */

    public get TotalDisplay(): string {
        return FormatMoney(this.AllRows.reduce((s, r) => s + r.Amount, 0), { Round: true });
    }

    public get TotalDetail(): string {
        const orders = new Set(this.AllRows.map((r) => r.OrderHeaderID)).size;
        return `${this.AllRows.length} instalment${this.AllRows.length === 1 ? '' : 's'} across ${orders} order${orders === 1 ? '' : 's'}`;
    }

    public get PastDueCount(): number {
        return this.AllRows.filter((r) => r.DaysUntilDue < 0).length;
    }

    public get WindowDisplay(): string {
        return this.AsOf ? `${FormatDate(this.AsOf, { Short: true })} – ${FormatDate(this.WindowEnd, { Short: true })}` : '—';
    }

    /* ── Actions ────────────────────────────────────────────────────────── */

    public OnPreset(preset: string): void {
        this.Preset = preset;
        this.applyPreset();
    }

    public OpenSelected(): void {
        if (this.Selected) this.OrderOpened.emit({ ID: this.Selected.OrderHeaderID });
    }

    public async IssueSelected(): Promise<void> {
        const row = this.Selected;
        if (!row || this.Issuing) return;
        const proceed = await this.confirm.Confirm({
            title: `Issue instalment ${row.InstallmentNumber} of ${row.InstallmentCount}?`,
            message: `${row.OrderNumber} · ${row.CustomerName} · ${FormatMoney(row.Amount)} due ${FormatDate(row.DueDate, { Short: true })}.`,
            detail: 'The invoice number is frozen on the instalment and cannot be changed afterwards. Corrections go through a credit memo.',
            type: 'warning',
            confirmText: 'Issue invoice',
            cancelText: 'Not yet',
        });
        if (!proceed) return;

        this.Issuing = true;
        this.Notice = null;
        this.cdr.detectChanges();
        try {
            const result = await new OrdersIssueInstalmentInvoiceOperation().Execute({ OrderHeaderPaymentScheduleID: row.OrderHeaderPaymentScheduleID });
            const output = result.Output;
            if (!result.Success || !output?.Success) {
                this.Notice = { Tone: 'error', Text: output?.Message?.trim() || result.ErrorMessage?.trim() || 'The instalment could not be issued.' };
                return;
            }
            this.Notice = { Tone: 'success', Text: output.Message ?? `Issued as ${output.DocumentNumber}.` };
            this.Selected = null;
            await this.load();
        } finally {
            this.Issuing = false;
            this.cdr.detectChanges();
        }
    }

    /* ── Loading ────────────────────────────────────────────────────────── */

    private async load(): Promise<void> {
        const result = await new OrdersGetBillingWorklistOperation().Execute({ WindowDays: WINDOW_DAYS });
        const output = result.Output;
        if (!result.Success || !output?.Success) {
            // SAY SO. An empty worklist and a failed one look identical, and "nothing to bill" is
            // the most reassuring sentence on the screen.
            this.LoadError = output?.Message?.trim() || result.ErrorMessage?.trim() || 'The billing worklist could not be loaded.';
            this.AllRows = [];
            this.Rows = [];
            this.Presets = [];
            this.cdr.detectChanges();
            return;
        }
        this.LoadError = null;
        this.AllRows = output.Rows;
        this.Truncated = output.Truncated;
        this.AsOf = output.AsOfDate;
        this.WindowEnd = output.WindowEnd;
        this.applyPreset();
        this.cdr.detectChanges();
    }

    private applyPreset(): void {
        this.Presets = [
            { Key: 'all', Label: 'All in window', Count: this.AllRows.length },
            { Key: 'pastdue', Label: 'Past due', Count: this.PastDueCount, Icon: 'fa-solid fa-hourglass-half' },
            { Key: 'week', Label: 'Next 7 days', Count: this.AllRows.filter((r) => r.DaysUntilDue >= 0 && r.DaysUntilDue <= 7).length },
        ];
        this.Rows = this.AllRows.filter((row) => {
            switch (this.Preset) {
                case 'pastdue':
                    return row.DaysUntilDue < 0;
                case 'week':
                    return row.DaysUntilDue >= 0 && row.DaysUntilDue <= 7;
                default:
                    return true;
            }
        });
    }

    private dueNote(row: BillingWorklistRow): string | null {
        if (row.DaysUntilDue < 0) return `${-row.DaysUntilDue}d past due`;
        if (row.DaysUntilDue === 0) return 'due today';
        return `in ${row.DaysUntilDue}d`;
    }

    protected money(value: number): string {
        return FormatMoney(value);
    }
}
