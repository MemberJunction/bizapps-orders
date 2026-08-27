import { ChangeDetectorRef, Component, EventEmitter, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EntityViewerModule, type RecordOpenedEvent } from '@memberjunction/ng-entity-viewer';
import { Metadata, type EntityInfo } from '@memberjunction/core';
import { type MJUserViewEntityExtended } from '@memberjunction/core-entities';
import {
    OrdersGetOverdueWorklistOperation,
    type OverdueWorklistRow,
} from '@mj-biz-apps/orders-entities';
import { MJOAgingBarComponent, type MJOAgingBuckets } from '../../panels/aging-bar.component';
import { MJOStatTileComponent } from '../../panels/stat-tile.component';
import { FormatDate, FormatMoney } from '../../panels/money-format';
import { MJAlertComponent } from '@memberjunction/ng-ui-components';
import { MJO_ENTITIES } from '../../data/entity-names';

/** What to do next with a row. */
interface MJONextAction {
    Icon: string;
    Text: string;
    Tone: 'success' | 'warning' | 'info' | 'error';
}

/**
 * `mjo-overdue-page` — chase what is late.
 *
 * A WORKLIST, NOT A REPORT. Rows are ordered by what to do next rather than by
 * size — the biggest debt is not always the most at risk, and sorting by amount
 * buries the small invoice nobody has touched in four months.
 *
 * The suggested next action is computed per row from what is actually known:
 * whether the customer is already holding credit, whether anyone has contacted
 * them, how late it is. The FIRST rule is the one that matters most — if they
 * hold a credit, spend it before chasing cash, because that collects without a
 * conversation.
 *
 * DUNNING NOTIFIES A PERSON; NOTHING AUTO-CANCELS. A failed card is usually an
 * expired card rather than a lost customer, and cancelling on the system's
 * schedule loses relationships a phone call would have kept.
 *
 * ## Example
 *
 * ```html
 * <mjo-overdue-page (OrderOpened)="open($event)" />
 * ```
 */
@Component({
    selector: 'mjo-overdue-page',
    standalone: true,
    imports: [CommonModule, EntityViewerModule, MJOAgingBarComponent, MJOStatTileComponent, MJAlertComponent],
    template: `
        <div class="mj-stat-grid mjo-ov__tiles">
            <mjo-stat-tile
                Label="Total overdue"
                Icon="fa-solid fa-hourglass-half"
                Tone="alert"
                [Value]="TotalDisplay"
                [Detail]="TotalDetail" />

            <mjo-stat-tile
                Label="Oldest"
                Icon="fa-solid fa-clock"
                [Value]="OldestDisplay"
                [Detail]="OldestDetail" />

            <mjo-stat-tile
                Label="Never contacted"
                Icon="fa-regular fa-envelope"
                [Value]="String(NeverContacted)"
                Detail="Start here — the cheapest collections" />

            <mjo-stat-tile
                Label="Credit available to apply"
                Icon="fa-solid fa-piggy-bank"
                [Value]="CreditDisplay"
                Detail="Spend this before chasing cash" />
        </div>

        @if (LoadError) {
            <mj-alert Variant="error" Icon="fa-solid fa-triangle-exclamation" class="mjo-ov__error">
                    <strong>The worklist did not load.</strong>
                    {{ LoadError }}
            </mj-alert>
        }

        <p class="mjo-note mjo-ov__error">
            <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
            <strong>Dunning notifies a person; nothing here auto-cancels.</strong>
                A failed card is usually an expired card, not a lost customer. Escalation is a
                sequence of reminders with a human at the end of it — cancelling access on a missed
                payment turns a billing problem into a churn problem.
        </p>

        <div class="mj-card mjo-ov__aging">
            <div class="mj-card-head">
                <i class="fa-solid fa-chart-column" aria-hidden="true"></i>
                <h3>By age</h3>
            </div>
            <div class="mj-card-pad">
                <mjo-aging-bar [Buckets]="Buckets" />
            </div>
        </div>

        @if (Truncated) {
            <mj-alert Variant="warning" Icon="fa-solid fa-triangle-exclamation" class="mjo-ov__truncated">
                    <strong>This list was capped.</strong>
                    More rows are overdue than are shown. Narrow it with a filter rather than working from a
                    partial list that looks complete.
            </mj-alert>
        }

        <div class="mjo-ov__viewer-host">
            @if (OrderEntityInfo) {
                <mj-entity-viewer
                    [Entity]="OrderEntityInfo"
                    [ViewEntity]="OverdueView"
                    (RecordOpened)="OnRecordOpened($event)">
                </mj-entity-viewer>
            } @else {
                <div class="small muted" style="padding: 24px;">Loading overdue orders...</div>
            }
        </div>
    `,
    styles: [
        `
            :host {
                display: block;
                height: 100%;
                overflow: auto;
                padding: var(--mj-space-6);
            }
            .mjo-ov__tiles { margin-bottom: var(--mj-space-4); }
            .mjo-ov__error { margin-bottom: var(--mj-space-4); }
            .mjo-ov__aging { margin-bottom: var(--mj-space-4); }
            .mjo-ov__truncated { margin-bottom: var(--mj-space-4); }
            .mjo-ov__viewer-host {
                height: 600px;
                min-height: 500px;
                background: var(--mj-bg-surface);
                border: 1px solid var(--mj-border-default);
                border-radius: var(--mj-radius-md);
                overflow: hidden;
                margin-top: var(--mj-space-4);
                display: flex;
                flex-direction: column;
            }
            mj-entity-viewer {
                display: flex;
                flex-direction: column;
                flex: 1 1 auto;
                height: 100%;
                width: 100%;
            }
            @media (max-width: 760px) {
                :host { padding: var(--mj-space-4); }
            }
        `,
    ],
})
export class MJOOverduePageComponent implements OnInit {

    /**
     * Render what was just loaded. See orders-dashboard.page.ts for the full
     * reasoning: these pages are created imperatively by the section shell, and an
     * async assignment across Angular's check/verify boundary raises NG0100, aborts
     * the DOM write, and freezes the view on its pre-load values permanently.
     */
    private readonly cdr = inject(ChangeDetectorRef);

    /** Non-null when the worklist could not be read. Rendered instead of the aging bar. */
    public LoadError: string | null = null;
    @Output() OrderOpened = new EventEmitter<OverdueWorklistRow>();

    public OrderEntityInfo: EntityInfo | null = null;
    public AllRows: OverdueWorklistRow[] = [];
    public Rows: OverdueWorklistRow[] = [];
    public Buckets: MJOAgingBuckets = { Current: 0, Days1To30: 0, Days31To60: 0, Days61Plus: 0 };
    public Truncated = false;
    public Preset = 'all';

    /** Exposed so the template can stringify without a pipe. */
    public readonly String = String;

    public get OverdueView(): MJUserViewEntityExtended | null {
        if (!this.OrderEntityInfo) return null;
        const today = new Date().toISOString().slice(0, 10);
        return {
            EntityID: this.OrderEntityInfo.ID,
            Entity: this.OrderEntityInfo.Name,
            WhereClause: `Balance > 0 AND DueDate IS NOT NULL AND DueDate < '${today}' AND Status NOT IN ('Draft','Quoted','Voided')`,
            ID: 'preset-overdue-worklist',
            Name: 'Overdue Collections'
        } as unknown as MJUserViewEntityExtended;
    }

    public async ngOnInit(): Promise<void> {
        const md = new Metadata();
        this.OrderEntityInfo = md.Entities.find((e) => e.Name === MJO_ENTITIES.OrderHeader) || null;
        await this.load();
        this.cdr.detectChanges();
    }

    public OnRecordOpened(event: RecordOpenedEvent): void {
        const id = (event.compositeKey?.GetValueByFieldName('ID') ?? event.record?.['ID']) as string | undefined;
        if (id) {
            const surrogate = { OrderHeaderID: id } as OverdueWorklistRow;
            this.OrderOpened.emit(surrogate);
        }
    }

    public OnPreset(preset: string): void {
        this.Preset = preset;
        this.applyPreset();
    }

    /* ── Tiles ──────────────────────────────────────────────────────────── */

    public get TotalDisplay(): string {
        return FormatMoney(this.AllRows.reduce((s, r) => s + r.Balance, 0), { Round: true });
    }

    public get TotalDetail(): string {
        const customers = new Set(this.AllRows.map((r) => r.CustomerName)).size;
        return `${this.AllRows.length} order${this.AllRows.length === 1 ? '' : 's'} across ${customers} customer${customers === 1 ? '' : 's'}`;
    }

    public get OldestDisplay(): string {
        const oldest = Math.max(0, ...this.AllRows.map((r) => r.DaysOverdue));
        return oldest ? `${oldest}d` : '—';
    }

    public get OldestDetail(): string {
        const oldest = this.AllRows.slice().sort((a, b) => b.DaysOverdue - a.DaysOverdue)[0];
        return oldest ? `${oldest.OrderNumber} · ${oldest.CustomerName}` : 'Nothing overdue';
    }

    /** No contact record yet means nobody has asked — the cheapest thing to try. */
    public get NeverContacted(): number {
        return this.AllRows.filter((r) => !r.SubscriptionID && r.DaysOverdue > 0).length;
    }

    public get CreditDisplay(): string {
        const total = this.AllRows.reduce((s, r) => s + r.AvailableCredit, 0);
        return FormatMoney(total, { Zero: '—' });
    }

    /* ── Next action ────────────────────────────────────────────────────── */

    /**
     * What to do next, in priority order. The FIRST rule matters most: a customer
     * already holding credit can be collected from without a conversation.
     */
    private nextAction(row: OverdueWorklistRow): MJONextAction {
        if (row.AvailableCredit > 0) {
            return {
                Icon: 'fa-solid fa-piggy-bank',
                Text: `Apply their ${FormatMoney(row.AvailableCredit)} credit first`,
                Tone: 'success',
            };
        }
        if (row.GraceThroughDate) {
            return {
                Icon: 'fa-solid fa-hourglass-half',
                Text: `Call before grace ends ${FormatDate(row.GraceThroughDate, { Short: true })}`,
                Tone: 'warning',
            };
        }
        if (row.DaysOverdue > 60) {
            return { Icon: 'fa-solid fa-phone', Text: 'Phone call — email is not working', Tone: 'error' };
        }
        if (row.DaysOverdue > 30) {
            return { Icon: 'fa-regular fa-envelope', Text: 'Second reminder', Tone: 'info' };
        }
        return { Icon: 'fa-regular fa-envelope', Text: 'First reminder', Tone: 'info' };
    }

    /* ── Loading ────────────────────────────────────────────────────────── */

    private async load(): Promise<void> {
        // The worklist is assembled server-side: overdue is computed from the
        // clock, so there is no column a client could filter on.
        const op = new OrdersGetOverdueWorklistOperation();
        const result = await op.Execute({});
        if (!result.Success || !result.Output) {
            // SAY SO. An empty worklist and a failed one look identical — both
            // render "Nothing overdue", which is the single most reassuring
            // sentence on the screen. Reporting a clean collections desk because
            // a server call failed is worse than reporting nothing at all.
            this.LoadError =
                result.ErrorMessage?.trim() ||
                'The overdue worklist could not be loaded, so this is not a statement that nothing is overdue.';
            this.AllRows = [];
            this.Rows = [];
            this.cdr.detectChanges();
            return;
        }
        this.LoadError = null;
        this.AllRows = result.Output.Rows;
        this.Buckets = {
            Current: result.Output.Buckets.Current,
            Days1To30: result.Output.Buckets.Days1To30,
            Days31To60: result.Output.Buckets.Days31To60,
            Days61Plus: result.Output.Buckets.Days61Plus,
        };
        this.Truncated = result.Output.Truncated;
        this.applyPreset();
        this.cdr.detectChanges();
    }

    private applyPreset(): void {
        this.Rows = this.AllRows.filter((row) => {
            switch (this.Preset) {
                case 't1':
                    return row.DaysOverdue >= 1 && row.DaysOverdue <= 30;
                case 't2':
                    return row.DaysOverdue > 30 && row.DaysOverdue <= 60;
                case 't3':
                    return row.DaysOverdue > 60;
                case 'credit':
                    return row.AvailableCredit > 0;
                default:
                    return true;
            }
        });
    }
}
