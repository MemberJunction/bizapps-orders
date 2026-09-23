import { ChangeDetectorRef, Component, EventEmitter, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MJAlertComponent, MJButtonDirective, MJConfirmService } from '@memberjunction/ng-ui-components';
import {
    OrdersGetProgressWorklistOperation,
    OrdersRecordProgressOperation,
    type OrdersRecordProgressOutput,
    type ProgressWorklistRow,
} from '@mj-biz-apps/orders-entities';
import { MJOStatTileComponent } from '../../panels/stat-tile.component';
import { MJOWorklistTableComponent, type MJOColumn } from '../../panels/worklist-table.component';
import { FormatDate, FormatMoney } from '../../panels/money-format';

/**
 * `mjo-progress-page` — the monthly progress attestation (AIDP-26, plan §9.4 version 1).
 *
 * EVERY OPEN PERCENTAGE-OF-COMPLETION LINE, ITS LAST OBSERVATION, AND A FIELD FOR THIS PERIOD'S.
 * That is the whole feature. The delivery lead picks a line, states the cumulative percent complete
 * and the period date, previews what would move, and posts it. Revenue catches up to the attested
 * percent — forwards or backwards — through `Orders.RecordProgress`; a posted observation is
 * immutable, so the confirmation is the last chance to look.
 *
 * POSTING IS THE IRREVERSIBLE STEP, so it asks first — through `MJConfirmService`, never
 * `window.confirm`, which throws under the Electron host.
 *
 * ## Example
 *
 * ```html
 * <mjo-progress-page (OrderOpened)="open($event)" />
 * ```
 */
@Component({
    selector: 'mjo-progress-page',
    standalone: true,
    imports: [CommonModule, FormsModule, MJButtonDirective, MJAlertComponent, MJOStatTileComponent, MJOWorklistTableComponent],
    template: `
        <div class="mj-stat-grid mjo-pg__tiles">
            <mjo-stat-tile Label="Open project lines" Icon="fa-solid fa-diagram-project" [Value]="String(Rows.length)" Detail="Percentage of completion, not yet at 100%" />
            <mjo-stat-tile Label="Contract value" Icon="fa-solid fa-file-signature" [Value]="money(TotalAmount, true)" Detail="Across the open lines" />
            <mjo-stat-tile Label="Recognised to date" Icon="fa-solid fa-chart-line" Tone="alert" [Value]="money(TotalRecognized, true)" [Detail]="RemainingDetail" />
        </div>

        @if (LoadError) {
            <mj-alert Variant="error" Icon="fa-solid fa-triangle-exclamation" class="mjo-pg__note">
                <strong>The progress worklist did not load.</strong> {{ LoadError }}
            </mj-alert>
        }
        @if (Notice) {
            <mj-alert [Variant]="Notice.Tone" Icon="fa-solid fa-circle-info" class="mjo-pg__note">{{ Notice.Text }}</mj-alert>
        }
        @if (Truncated) {
            <mj-alert Variant="warning" Icon="fa-solid fa-triangle-exclamation" class="mjo-pg__note"><strong>List truncated.</strong> Not every open line is shown.</mj-alert>
        }

        <div class="row mjo-pg__actions">
            <button type="button" mjButton variant="outline" [disabled]="!Selected" (click)="OpenSelected()">
                <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i> Open order
            </button>
            <label class="mj-field mjo-pg__field">
                <span class="small muted">Period</span>
                <input class="mj-input" type="date" [(ngModel)]="MeasurementDate" name="measurementDate" [disabled]="!Selected" (ngModelChange)="Draft = null" aria-label="Measurement date">
            </label>
            <label class="mj-field mjo-pg__field">
                <span class="small muted">Complete to date (%)</span>
                <input class="mj-input is-num" type="number" min="0" max="100" step="0.01" [(ngModel)]="PercentInput" name="percent" [disabled]="!Selected" (ngModelChange)="Draft = null" aria-label="Percent complete">
            </label>
            <button type="button" mjButton variant="outline" [disabled]="!CanSubmit || Busy" (click)="PreviewSelected()">
                <i class="fa-solid fa-eye" aria-hidden="true"></i> Preview
            </button>
            <button type="button" mjButton variant="primary" [disabled]="!CanSubmit || Busy" (click)="PostSelected()">
                <i class="fa-solid fa-file-signature" aria-hidden="true"></i> {{ Busy ? 'Working…' : 'Attest & post' }}
            </button>
        </div>

        @if (Selected; as row) {
            <div class="small muted mjo-pg__context">
                {{ row.OrderNumber }} line {{ row.LineNumber }} · {{ row.ProductName }} · {{ money(row.LineAmount) }} ·
                last attested {{ row.LastMeasurementDate ? FormatDate(row.LastMeasurementDate, { Short: true }) + ' at ' + percent(row.LastPercentComplete) : 'never' }}
                · recognised {{ money(row.RecognizedToDate) }}
                @if (Draft) {
                    <strong> → {{ Draft.Message }}</strong>
                }
            </div>
            @if (Draft?.ClosedPeriodWarning; as closed) {
                <div class="mjo-pg__closed" role="status">
                    <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> {{ closed }}
                </div>
            }
        }

        <mjo-worklist-table
            [Columns]="Columns"
            [Rows]="Rows"
            [Searchable]="false"
            RowKey="OrderLineID"
            [SelectedKey]="Selected?.OrderLineID ?? null"
            EmptyTitle="Nothing to attest"
            EmptyHint="No booked percentage-of-completion line is below 100%."
            EmptyIcon="fa-solid fa-diagram-project"
            (RowClicked)="Select($event)" />
    `,
    styles: [
        `
            :host { display: block; height: 100%; overflow: auto; padding: var(--mj-space-6); }
            .mjo-pg__tiles { margin-bottom: var(--mj-space-4); }
            .mjo-pg__note { margin-bottom: var(--mj-space-4); }
            .mjo-pg__actions { align-items: flex-end; gap: var(--mj-space-3); margin-bottom: var(--mj-space-3); flex-wrap: wrap; }
            .mjo-pg__field { display: flex; flex-direction: column; gap: 2px; }
            .mjo-pg__field .mj-input { width: 160px; }
            .mjo-pg__context { margin-bottom: var(--mj-space-4); }
            .mjo-pg__closed {
                margin-bottom: var(--mj-space-4);
                padding: var(--mj-space-3) var(--mj-space-4);
                border-left: 3px solid var(--mj-color-warning, #b8860b);
                background: var(--mj-color-warning-subtle, rgba(184, 134, 11, 0.08));
                border-radius: var(--mj-radius-sm, 4px);
                font-size: 0.9rem;
            }
            @media (max-width: 760px) { :host { padding: var(--mj-space-4); } }
        `,
    ],
})
export class MJOProgressPageComponent implements OnInit {
    /** Same NG0100 reasoning as every other imperatively-created page here: write the DOM after a load. */
    private readonly cdr = inject(ChangeDetectorRef);
    private readonly confirm = inject(MJConfirmService);

    @Output() OrderOpened = new EventEmitter<{ ID: string }>();

    public readonly String = String;
    public readonly FormatDate = FormatDate;

    public LoadError: string | null = null;
    public Notice: { Tone: 'success' | 'error' | 'warning'; Text: string } | null = null;
    public Truncated = false;
    public Busy = false;
    public Rows: ProgressWorklistRow[] = [];
    public Selected: ProgressWorklistRow | null = null;
    public MeasurementDate = new Date().toISOString().slice(0, 10);
    public PercentInput: number | null = null;
    /** The last preview for the current inputs; cleared whenever they change. */
    public Draft: OrdersRecordProgressOutput | null = null;

    public readonly Columns: MJOColumn<ProgressWorklistRow>[] = [
        { Key: 'OrderNumber', Label: 'Order', Kind: 'mono', Width: '120px', Secondary: (r) => `line ${r.LineNumber}` },
        { Key: 'ProductName', Label: 'Project' },
        { Key: 'CustomerName', Label: 'Customer', HideBelow: 760 },
        { Key: 'CompanyName', Label: 'Sold by', HideBelow: 1000 },
        { Key: 'LineAmount', Label: 'Contract', Kind: 'money', Width: '120px', Format: (r) => FormatMoney(r.LineAmount) },
        { Key: 'LastMeasurementDate', Label: 'Last attested', Kind: 'date', Width: '130px', Format: (r) => (r.LastMeasurementDate ? FormatDate(r.LastMeasurementDate, { Short: true }) : 'never'), Secondary: (r) => (r.LastAttestedBy ? `by ${r.LastAttestedBy}` : null) },
        { Key: 'LastPercentComplete', Label: 'Complete', Kind: 'chip', Width: '100px', Format: (r) => this.percent(r.LastPercentComplete), ChipClass: (r) => (r.LastPercentComplete > 0 ? 'mj-chip--success' : 'mj-chip--outline') },
        { Key: 'RecognizedToDate', Label: 'Recognised', Kind: 'money', Width: '120px', HideBelow: 560, Format: (r) => FormatMoney(r.RecognizedToDate) },
    ];

    public async ngOnInit(): Promise<void> {
        await this.load();
        this.cdr.detectChanges();
    }

    /* ── Tiles ──────────────────────────────────────────────────────────── */

    public get TotalAmount(): number {
        return this.Rows.reduce((s, r) => s + r.LineAmount, 0);
    }

    public get TotalRecognized(): number {
        return this.Rows.reduce((s, r) => s + r.RecognizedToDate, 0);
    }

    public get RemainingDetail(): string {
        return `${FormatMoney(this.TotalAmount - this.TotalRecognized, { Round: true })} still deferred`;
    }

    public get CanSubmit(): boolean {
        const p = Number(this.PercentInput);
        return !!this.Selected && !!this.MeasurementDate && this.PercentInput !== null && Number.isFinite(p) && p >= 0 && p <= 100;
    }

    /* ── Actions ────────────────────────────────────────────────────────── */

    public Select(row: ProgressWorklistRow): void {
        this.Selected = row;
        this.PercentInput = Math.round(row.LastPercentComplete * 10000) / 100;
        this.Draft = null;
        this.Notice = null;
    }

    public OpenSelected(): void {
        if (this.Selected) this.OrderOpened.emit({ ID: this.Selected.OrderHeaderID });
    }

    public async PreviewSelected(): Promise<void> {
        const output = await this.record(true);
        if (output) this.Draft = output;
        this.cdr.detectChanges();
    }

    public async PostSelected(): Promise<void> {
        const row = this.Selected;
        if (!row) return;
        const draft = this.Draft ?? (await this.record(true));
        if (!draft) return;
        const proceed = await this.confirm.Confirm({
            title: `Attest ${row.OrderNumber} line ${row.LineNumber} at ${this.percent(Number(this.PercentInput) / 100)}?`,
            message: draft.Message ?? '',
            // THE WARNING RIDES THE CONFIRM, not just the strip above the table. It is advisory —
            // nothing blocks a closed period — so the one place it has to be unmissable is the
            // moment before the entry is written, which is exactly where this dialog sits.
            detail:
                `Signed by you, dated ${FormatDate(this.MeasurementDate, { Short: true })}. A posted observation cannot be changed; a correction is a new observation in a later period.` +
                (draft.ClosedPeriodWarning ? `\n\n${draft.ClosedPeriodWarning}` : ''),
            type: 'warning',
            confirmText: 'Attest & post',
            cancelText: 'Not yet',
        });
        if (!proceed) return;
        const output = await this.record(false);
        if (!output) return;
        this.Notice = output.ClosedPeriodWarning
            ? { Tone: 'warning', Text: `${output.Message ?? 'Posted.'} ${output.ClosedPeriodWarning}` }
            : { Tone: 'success', Text: output.Message ?? 'Posted.' };
        this.Selected = null;
        this.Draft = null;
        await this.load();
        this.cdr.detectChanges();
    }

    /** One call shape for both buttons. Returns null (and shows why) when the operation refused. */
    private async record(preview: boolean): Promise<OrdersRecordProgressOutput | null> {
        if (!this.Selected || !this.CanSubmit) return null;
        this.Busy = true;
        this.Notice = null;
        this.cdr.detectChanges();
        try {
            const result = await new OrdersRecordProgressOperation().Execute({
                OrderLineID: this.Selected.OrderLineID,
                MeasurementDate: this.MeasurementDate,
                PercentComplete: Number(this.PercentInput) / 100,
                Preview: preview,
            });
            const output = result.Output;
            if (!result.Success || !output?.Success) {
                this.Notice = { Tone: 'error', Text: output?.Message?.trim() || result.ErrorMessage?.trim() || 'The observation could not be recorded.' };
                return null;
            }
            return output;
        } finally {
            this.Busy = false;
            this.cdr.detectChanges();
        }
    }

    /* ── Loading ────────────────────────────────────────────────────────── */

    private async load(): Promise<void> {
        const result = await new OrdersGetProgressWorklistOperation().Execute({});
        const output = result.Output;
        if (!result.Success || !output?.Success) {
            // SAY SO. An empty worklist and a failed one look identical, and "nothing to attest" is
            // the most reassuring sentence on the screen.
            this.LoadError = output?.Message?.trim() || result.ErrorMessage?.trim() || 'The progress worklist could not be loaded.';
            this.Rows = [];
            this.cdr.detectChanges();
            return;
        }
        this.LoadError = null;
        this.Rows = output.Rows;
        this.Truncated = output.Truncated;
        this.cdr.detectChanges();
    }

    protected money(value: number, round = false): string {
        return FormatMoney(value, { Round: round });
    }

    protected percent(fraction: number): string {
        return `${(Math.round(fraction * 10000) / 100).toString()}%`;
    }
}
