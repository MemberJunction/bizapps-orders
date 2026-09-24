import { ChangeDetectorRef, Component, EventEmitter, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RunView } from '@memberjunction/core';
import { MJAlertComponent, MJButtonDirective, MJConfirmService } from '@memberjunction/ng-ui-components';
import {
    OrdersGetExternalInvoicingWorklistOperation,
    OrdersIssueExternalInvoiceOperation,
    OrdersPollExternalPaymentsOperation,
    OrdersSendExternalInvoicesOperation,
    type ExternalInvoicingWorklistRow,
} from '@mj-biz-apps/orders-entities';
import { MJOStatTileComponent } from '../../panels/stat-tile.component';
import { MJOWorklistTableComponent, type MJOColumn, type MJOPreset } from '../../panels/worklist-table.component';
import { FormatDate, FormatMoney } from '../../panels/money-format';
import { DispositionChipClass, DispositionLabel } from '../../panels/external-invoice-view';

/** An `ExternalPayment` row that needs a person, as this page reads it. */
interface PaymentExceptionRow {
    ID: string;
    ExternalPaymentRef: string;
    Amount: number;
    PaymentDate: string | null;
    ExternalStatus: string | null;
    Disposition: 'Held' | 'Unmatched' | 'Refused' | 'ReversalNeeded';
    Reason: string | null;
    LastSeenAt: string | null;
}

const EXTERNAL_PAYMENT_ENTITY = 'MJ_BizApps_Orders: External Payments';

/** Dispositions that mean money is waiting on a person. `Captured` and `Ignored` are finished. */
const EXCEPTION_DISPOSITIONS = ['Held', 'Unmatched', 'Refused', 'ReversalNeeded'];

/**
 * `mjo-external-invoicing-queue-page` — the two queues the scheduled jobs leave behind.
 *
 * WHAT THIS SCREEN IS FOR. Both halves of the rail run unattended: one job sends invoices, another
 * records payments. When they succeed nobody needs to know. When they cannot, the work stops somewhere
 * a log file would be the only witness — an order whose send was refused, a payment against an invoice
 * we never issued. This is where that lands, and it is also the only way to run either job by hand,
 * which matters because both ship switched off and somebody has to prove them first.
 *
 * TWO TABS, BECAUSE THEY ARE TWO JOBS. Invoices out and payments in fail for unrelated reasons and are
 * fixed by different people. Merging them into one list would bury both.
 *
 * NAMED FROM DATA. Nothing here says Bill.com: the rail is a seam, and a company on a different
 * provider must read correctly on the same screen.
 *
 * ## Example
 *
 * ```html
 * <mjo-external-invoicing-queue-page (OrderOpened)="open($event)" />
 * ```
 *
 * @module @mj-biz-apps/orders-ng
 */
@Component({
    selector: 'mjo-external-invoicing-queue-page',
    standalone: true,
    imports: [CommonModule, MJButtonDirective, MJAlertComponent, MJOStatTileComponent, MJOWorklistTableComponent],
    template: `
        <div class="mj-stat-grid mjo-xq__tiles">
            <mjo-stat-tile
                Label="Waiting to send"
                Icon="fa-solid fa-paper-plane"
                [Tone]="UnsentCount ? 'alert' : 'default'"
                [Value]="String(UnsentCount)"
                [Detail]="UnsentDetail" />

            <mjo-stat-tile
                Label="Sends that failed"
                Icon="fa-solid fa-triangle-exclamation"
                [Tone]="FailedCount ? 'alert' : 'default'"
                [Value]="String(FailedCount)"
                Detail="A person has to look at these" />

            <mjo-stat-tile
                Label="Payments needing attention"
                Icon="fa-solid fa-hand-holding-dollar"
                [Tone]="Exceptions.length ? 'alert' : 'default'"
                [Value]="String(Exceptions.length)"
                [Detail]="ExceptionDetail" />
        </div>

        @if (LoadError) {
            <mj-alert Variant="error" Icon="fa-solid fa-triangle-exclamation" class="mjo-xq__note">
                <strong>The queue did not load.</strong>
                {{ LoadError }}
            </mj-alert>
        }
        @if (Notice) {
            <mj-alert [Variant]="Notice.Tone" Icon="fa-solid fa-circle-info" class="mjo-xq__note">{{ Notice.Text }}</mj-alert>
        }
        @if (Truncated) {
            <mj-alert Variant="warning" Icon="fa-solid fa-triangle-exclamation" class="mjo-xq__note">
                <strong>List truncated.</strong>
                Not every waiting unit is shown.
            </mj-alert>
        }

        <div class="mjo-xq__tabs" role="tablist">
            <button type="button" role="tab" [attr.aria-selected]="Tab === 'invoices'" [class.is-active]="Tab === 'invoices'" (click)="Tab = 'invoices'">
                Invoices out
                <span class="mjo-xq__count">{{ Rows.length }}</span>
            </button>
            <button type="button" role="tab" [attr.aria-selected]="Tab === 'payments'" [class.is-active]="Tab === 'payments'" (click)="Tab = 'payments'">
                Payment exceptions
                <span class="mjo-xq__count">{{ Exceptions.length }}</span>
            </button>
        </div>

        @if (Tab === 'invoices') {
            <div class="row mjo-xq__actions">
                <button type="button" mjButton variant="outline" [disabled]="!SelectedInvoice" (click)="OpenSelected()">
                    <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i> Open order
                </button>
                <button type="button" mjButton variant="primary" [disabled]="!SelectedInvoice || Busy" (click)="SendSelected()">
                    <i class="fa-solid fa-paper-plane" aria-hidden="true"></i> Send this one
                </button>
                <button type="button" mjButton variant="outline" [disabled]="Busy || !Rows.length" (click)="RunSweep()">
                    <i class="fa-solid fa-rotate" aria-hidden="true"></i> {{ Busy ? 'Working…' : 'Send all waiting' }}
                </button>
                @if (SelectedInvoice; as row) {
                    <span class="small muted">{{ row.DocumentNumber }} · {{ money(row.Amount) }} · {{ row.CompanyName }}</span>
                }
            </div>

            <mjo-worklist-table
                [Columns]="InvoiceColumns"
                [Rows]="Rows"
                [Presets]="Presets"
                [ActivePreset]="Preset"
                [Searchable]="false"
                RowKey="DocumentNumber"
                [SelectedKey]="SelectedInvoice?.DocumentNumber ?? null"
                EmptyTitle="Nothing waiting"
                EmptyHint="Every confirmed order on a rail has been invoiced."
                EmptyIcon="fa-solid fa-paper-plane"
                (PresetChanged)="OnPreset($event)"
                (RowClicked)="SelectedInvoice = $event" />
        } @else {
            <div class="row mjo-xq__actions">
                <button type="button" mjButton variant="outline" [disabled]="Busy" (click)="RunPoll()">
                    <i class="fa-solid fa-rotate" aria-hidden="true"></i> {{ Busy ? 'Working…' : 'Check for payments now' }}
                </button>
                <span class="small muted">Captured payments are not listed — only what the poll could not finish.</span>
            </div>

            <mjo-worklist-table
                [Columns]="PaymentColumns"
                [Rows]="Exceptions"
                [Presets]="[]"
                [Searchable]="false"
                RowKey="ID"
                EmptyTitle="Nothing needs attention"
                EmptyHint="Every payment the rail reported has been recorded or set aside."
                EmptyIcon="fa-solid fa-hand-holding-dollar" />
        }
    `,
    styles: [
        `
            :host {
                display: block;
                height: 100%;
                overflow: auto;
                padding: var(--mj-space-6);
            }
            .mjo-xq__tiles { margin-bottom: var(--mj-space-4); }
            .mjo-xq__note { margin-bottom: var(--mj-space-4); }
            .mjo-xq__actions {
                align-items: center;
                gap: var(--mj-space-3);
                margin-bottom: var(--mj-space-4);
            }
            .mjo-xq__tabs {
                display: flex;
                gap: var(--mj-space-2);
                border-bottom: 1px solid var(--mj-color-border);
                margin-bottom: var(--mj-space-4);
            }
            .mjo-xq__tabs button {
                appearance: none;
                background: none;
                border: none;
                border-bottom: 2px solid transparent;
                padding: var(--mj-space-3) var(--mj-space-4);
                cursor: pointer;
                font: inherit;
                color: var(--mj-color-text-muted);
            }
            .mjo-xq__tabs button.is-active {
                color: var(--mj-color-text);
                border-bottom-color: var(--mj-color-primary, #2563eb);
                font-weight: 600;
            }
            .mjo-xq__count {
                display: inline-block;
                margin-left: var(--mj-space-2);
                padding: 0 var(--mj-space-2);
                border-radius: 999px;
                background: var(--mj-color-surface-subtle, rgba(0, 0, 0, 0.06));
                font-size: 0.8em;
            }
            @media (max-width: 760px) {
                :host { padding: var(--mj-space-4); }
            }
        `,
    ],
})
export class MJOExternalInvoicingQueuePageComponent implements OnInit {
    private readonly cdr = inject(ChangeDetectorRef);
    private readonly confirm = inject(MJConfirmService);

    @Output() OrderOpened = new EventEmitter<{ ID: string }>();

    public readonly String = String;
    public readonly money = (n: number): string => FormatMoney(n);

    public Tab: 'invoices' | 'payments' = 'invoices';
    public LoadError: string | null = null;
    public Notice: { Tone: 'success' | 'error' | 'warning'; Text: string } | null = null;
    public Truncated = false;
    public Busy = false;

    public AllRows: ExternalInvoicingWorklistRow[] = [];
    public Rows: ExternalInvoicingWorklistRow[] = [];
    public SelectedInvoice: ExternalInvoicingWorklistRow | null = null;
    public Preset = 'all';

    public Exceptions: PaymentExceptionRow[] = [];

    public readonly InvoiceColumns: MJOColumn<ExternalInvoicingWorklistRow>[] = [
        { Key: 'DocumentNumber', Label: 'Document', Kind: 'mono', Width: '150px', Secondary: (r) => (r.InstallmentNumber ? `instalment ${r.InstallmentNumber}` : 'whole order') },
        { Key: 'CustomerName', Label: 'Customer' },
        { Key: 'CompanyName', Label: 'Billed by', HideBelow: 1000 },
        { Key: 'Amount', Label: 'Amount', Kind: 'money', Width: '120px', Format: (r) => FormatMoney(r.Amount) },
        { Key: 'DueDate', Label: 'Due', Kind: 'date', Width: '110px', Format: (r) => (r.DueDate ? FormatDate(r.DueDate, { Short: true }) : '—') },
        {
            Key: 'State',
            Label: 'State',
            Kind: 'chip',
            Width: '120px',
            ChipClass: (r) => (r.State === 'Failed' ? 'mj-chip--danger' : r.State === 'InFlight' ? 'mj-chip--info' : 'mj-chip--outline'),
            Format: (r) => (r.State === 'InFlight' ? 'In flight' : r.State),
            Secondary: (r) => r.LastError ?? null,
        },
    ];

    public readonly PaymentColumns: MJOColumn<PaymentExceptionRow>[] = [
        { Key: 'ExternalPaymentRef', Label: 'Rail payment', Kind: 'mono', Width: '190px' },
        { Key: 'Amount', Label: 'Amount', Kind: 'money', Width: '120px', Format: (r) => FormatMoney(r.Amount) },
        { Key: 'PaymentDate', Label: 'Dated', Kind: 'date', Width: '110px', Format: (r) => (r.PaymentDate ? FormatDate(r.PaymentDate, { Short: true }) : '—') },
        {
            Key: 'Disposition',
            Label: 'Why',
            Kind: 'chip',
            Width: '150px',
            ChipClass: (r) => DispositionChipClass(r.Disposition),
            Format: (r) => DispositionLabel(r.Disposition),
        },
        { Key: 'Reason', Label: 'What happened', Format: (r) => r.Reason ?? '—' },
    ];

    public Presets: MJOPreset[] = [];

    public async ngOnInit(): Promise<void> {
        await this.load();
        this.cdr.detectChanges();
    }

    /* ── Tiles ──────────────────────────────────────────────────────────── */

    public get UnsentCount(): number {
        return this.AllRows.filter((r) => r.State === 'Unsent').length;
    }

    public get FailedCount(): number {
        return this.AllRows.filter((r) => r.State === 'Failed').length;
    }

    public get UnsentDetail(): string {
        const total = this.AllRows.filter((r) => r.State === 'Unsent').reduce((s, r) => s + r.Amount, 0);
        return this.UnsentCount ? `${FormatMoney(total, { Round: true })} of invoices` : 'The queue is clear';
    }

    public get ExceptionDetail(): string {
        const reversals = this.Exceptions.filter((e) => e.Disposition === 'ReversalNeeded').length;
        if (!this.Exceptions.length) return 'Nothing waiting';
        return reversals ? `${reversals} needing a reversal` : 'Money the poll could not place';
    }

    /* ── Actions ────────────────────────────────────────────────────────── */

    public OnPreset(preset: string): void {
        this.Preset = preset;
        this.applyPreset();
    }

    public OpenSelected(): void {
        if (this.SelectedInvoice) this.OrderOpened.emit({ ID: this.SelectedInvoice.OrderHeaderID });
    }

    /** One unit, deliberately. A Failed or in-flight unit needs the person to have checked the rail. */
    public async SendSelected(): Promise<void> {
        const row = this.SelectedInvoice;
        if (!row || this.Busy) return;
        const risky = row.State !== 'Unsent';
        const proceed = await this.confirm.Confirm({
            title: `Send ${row.DocumentNumber}?`,
            message: `${row.CustomerName} · ${FormatMoney(row.Amount)} · billed by ${row.CompanyName}.`,
            detail: risky
                ? 'This unit has been attempted before. Check the rail first: if an invoice already exists there, sending again bills the customer twice.'
                : 'The scheduled send would pick this up on its own; this sends it now.',
            type: 'warning',
            confirmText: 'Send it',
            cancelText: 'Not yet',
        });
        if (!proceed) return;

        await this.run(async () => {
            const result = await new OrdersIssueExternalInvoiceOperation().Execute({
                OrderHeaderID: row.OrderHeaderID,
                CompanyID: row.CompanyID,
                OrderHeaderPaymentScheduleID: row.OrderHeaderPaymentScheduleID,
                AllowReissue: risky,
            });
            const out = result.Output;
            if (!result.Success || !out?.Success) {
                return { Tone: 'error' as const, Text: out?.Message?.trim() || result.ErrorMessage?.trim() || 'The invoice could not be sent.' };
            }
            this.SelectedInvoice = null;
            this.cdr.detectChanges();
            return { Tone: 'success' as const, Text: out.Message ?? `${row.DocumentNumber} sent.` };
        });
    }

    /** The sweep, by hand. Never retries a unit a person has to look at — the operation decides that. */
    public async RunSweep(): Promise<void> {
        if (this.Busy) return;
        const proceed = await this.confirm.Confirm({
            title: 'Send every waiting invoice?',
            message: `${this.UnsentCount} unit${this.UnsentCount === 1 ? '' : 's'} would go out now.`,
            detail: 'Units that failed permanently, or whose last send was never confirmed, are left for a person.',
            type: 'warning',
            confirmText: 'Send them',
            cancelText: 'Not yet',
        });
        if (!proceed) return;

        await this.run(async () => {
            const result = await new OrdersSendExternalInvoicesOperation().Execute({ Preview: false });
            const out = result.Output;
            if (!result.Success || !out) {
                return { Tone: 'error' as const, Text: result.ErrorMessage?.trim() || 'The sweep could not run.' };
            }
            this.SelectedInvoice = null;
            this.cdr.detectChanges();
            return { Tone: out.Success ? ('success' as const) : ('warning' as const), Text: out.Message ?? `${out.Sent} sent.` };
        });
    }

    /** The poll, by hand. Reports ATTENTION as a warning, because that means money is still waiting. */
    public async RunPoll(): Promise<void> {
        if (this.Busy) return;
        await this.run(async () => {
            const result = await new OrdersPollExternalPaymentsOperation().Execute({ Preview: false });
            const out = result.Output;
            if (!result.Success || !out) {
                return { Tone: 'error' as const, Text: result.ErrorMessage?.trim() || 'The payment check could not run.' };
            }
            return { Tone: out.Success ? ('success' as const) : ('warning' as const), Text: out.Message ?? `${out.Captured} payment(s) recorded.` };
        });
    }

    private async run(work: () => Promise<{ Tone: 'success' | 'error' | 'warning'; Text: string }>): Promise<void> {
        this.Busy = true;
        this.Notice = null;
        this.cdr.detectChanges();
        try {
            this.Notice = await work();
            await this.load();
        } catch (err) {
            this.Notice = { Tone: 'error', Text: err instanceof Error ? err.message : String(err) };
        } finally {
            this.Busy = false;
            this.cdr.detectChanges();
        }
    }

    /* ── Loading ────────────────────────────────────────────────────────── */

    private async load(): Promise<void> {
        await Promise.all([this.loadInvoices(), this.loadExceptions()]);
        this.cdr.detectChanges();
    }

    private async loadInvoices(): Promise<void> {
        const result = await new OrdersGetExternalInvoicingWorklistOperation().Execute({ IncludeFailed: true });
        const output = result.Output;
        if (!result.Success || !output?.Success) {
            // An empty queue and a broken one look identical, and "nothing waiting" is the most
            // reassuring sentence here — so a failure has to say so.
            this.LoadError = output?.Message?.trim() || result.ErrorMessage?.trim() || 'The invoicing worklist could not be loaded.';
            this.AllRows = [];
            this.Rows = [];
            this.Presets = [];
            this.cdr.detectChanges();
            return;
        }
        this.LoadError = null;
        this.AllRows = output.Rows;
        this.Truncated = output.Truncated;
        this.applyPreset();
        if (this.SelectedInvoice) {
            this.SelectedInvoice = this.Rows.find((r) => r.DocumentNumber === this.SelectedInvoice!.DocumentNumber) ?? null;
        }
        this.cdr.detectChanges();
    }

    private async loadExceptions(): Promise<void> {
        const rv = new RunView();
        const list = EXCEPTION_DISPOSITIONS.map((d) => `'${d}'`).join(',');
        const result = await rv.RunView<PaymentExceptionRow>({
            EntityName: EXTERNAL_PAYMENT_ENTITY,
            ExtraFilter: `Disposition IN (${list})`,
            OrderBy: 'LastSeenAt DESC',
            ResultType: 'simple',
        });
        this.Exceptions = result.Success ? (result.Results ?? []) : [];
        this.cdr.detectChanges();
    }

    private applyPreset(): void {
        this.Presets = [
            { Key: 'all', Label: 'Everything waiting', Count: this.AllRows.length },
            { Key: 'unsent', Label: 'Never sent', Count: this.UnsentCount },
            { Key: 'failed', Label: 'Failed', Count: this.FailedCount, Icon: 'fa-solid fa-triangle-exclamation' },
        ];
        this.Rows =
            this.Preset === 'unsent'
                ? this.AllRows.filter((r) => r.State === 'Unsent')
                : this.Preset === 'failed'
                  ? this.AllRows.filter((r) => r.State === 'Failed')
                  : this.AllRows;
    }

}
