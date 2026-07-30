import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MJOWorklistTableComponent, type MJOColumn, type MJOPreset } from '../../panels/worklist-table.component';
import { MJOStatedValueComponent } from '../../panels/chips.component';
import { MJOMoneyPipe, FormatDate, FormatMoney, DaysSince } from '../../panels/money-format';
import { MJOOrdersDataService, MJO_ENTITIES } from '../../services/orders-data.service';
import { RunView, Metadata } from '@memberjunction/core';

/** A subscription row. */
interface MJOSubscriptionRow extends Record<string, unknown> {
    ID: string;
    SubscriptionNumber: string;
    Status: string;
    StartDate: string;
    EndDate: string;
    AutoRenew: boolean;
    Product?: string | null;
    HolderOrganization?: string | null;
    BeneficiaryPerson?: string | null;
}

/** One period of the recognition waterfall. */
interface MJORecognitionPeriod {
    Label: string;
    Amount: number;
    Released: boolean;
}

/**
 * `mjo-subscriptions-page` — will it renew, and will it get paid?
 *
 * SUBSCRIPTIONS LIVE UNDER RECEIVABLES, not Orders, because that is the daily
 * question about one. The purchase is an order; the ongoing relationship is a
 * collections and retention concern.
 *
 * "CURRENT" IS NOT A FIELD — it is the term whose window covers today. Renewals
 * and extensions APPEND a term rather than moving a pointer, so nothing goes
 * stale, and the difference between a customer buying more coverage and the
 * system renewing them under standing authority stays visible in the history
 * instead of collapsing into one event.
 *
 * REVENUE RECOGNITION ENTRIES ARE REAL AND FORWARD-DATED, written at booking
 * rather than materialised by a nightly job. The waterfall shows them as what
 * they are: entries that already exist and sit harmlessly until their period
 * arrives. A change nets against them; they are never edited.
 *
 * ## Example
 *
 * ```html
 * <mjo-subscriptions-page />
 * ```
 */
@Component({
    selector: 'mjo-subscriptions-page',
    standalone: true,
    imports: [CommonModule, MJOWorklistTableComponent, MJOStatedValueComponent, MJOMoneyPipe],
    template: `
        <div class="mjo-sub__split">
            <div class="mjo-sub__left">
                <mjo-worklist-table
                    [Columns]="Columns"
                    [Rows]="Rows"
                    [Presets]="Presets"
                    [ActivePreset]="Preset"
                    [Searchable]="false"
                    RowKey="ID"
                    [SelectedKey]="SelectedID"
                    EmptyIcon="fa-solid fa-rotate"
                    EmptyTitle="No subscriptions"
                    EmptyHint="A subscription is created the first time a recurring product is sold."
                    (PresetChanged)="OnPreset($event)"
                    (RowClicked)="Select($any($event))" />
            </div>

            @if (Selected) {
                <aside class="mjo-sub__right">
                    <div class="mj-card">
                        <div class="mj-card-head">
                            <i class="fa-solid fa-rotate" aria-hidden="true"></i>
                            <h3>{{ Selected.SubscriptionNumber }}</h3>
                            <span class="right">
                                <span class="mj-chip" [class]="statusClass(Selected)">{{ Selected.Status }}</span>
                            </span>
                        </div>
                        <div class="mj-card-pad">
                            <mjo-stated-value Label="Product">{{ Selected.Product ?? '—' }}</mjo-stated-value>
                            <mjo-stated-value Label="Holder" From="who owns it">
                                {{ Selected.HolderOrganization ?? '—' }}
                            </mjo-stated-value>
                            <mjo-stated-value Label="Beneficiary" From="who it is for">
                                {{ Selected.BeneficiaryPerson ?? '—' }}
                            </mjo-stated-value>
                            <mjo-stated-value Label="Covered through">
                                {{ date(Selected.EndDate) }}
                            </mjo-stated-value>
                            <mjo-stated-value Label="Auto-renew" From="the consent switch">
                                {{ Selected.AutoRenew ? 'On' : 'Off — it simply ends' }}
                            </mjo-stated-value>

                            <div class="mj-banner mj-banner--info mjo-sub__note">
                                <i class="fa-solid fa-user-group" aria-hidden="true"></i>
                                <div class="body">
                                    Holder and beneficiary are separate on purpose, and it decides what counts
                                    as a duplicate — which is why ten seats for ten staff are ten subscriptions
                                    rather than ten collisions.
                                </div>
                            </div>

                            @if (RenewalDue) {
                                <div class="mj-banner mj-banner--warning mjo-sub__note">
                                    <i class="fa-solid fa-hourglass-half" aria-hidden="true"></i>
                                    <div class="body">
                                        <strong>Renews in {{ DaysToRenewal }} days.</strong>
                                        With auto-renew on, the system places a confirmed order at lead time —
                                        invoicing ahead of the period, which is how subscription billing works.
                                    </div>
                                </div>
                            }
                        </div>
                    </div>

                    <div class="mj-card mjo-sub__recog">
                        <div class="mj-card-head">
                            <i class="fa-solid fa-chart-line" aria-hidden="true"></i>
                            <h3>Revenue recognition</h3>
                        </div>
                        <div class="mj-card-pad">
                            <div class="mjo-sub__waterfall">
                                @for (period of Recognition; track period.Label) {
                                    <div class="mjo-sub__period" [class.is-released]="period.Released">
                                        <div class="tiny muted">{{ period.Label }}</div>
                                        <div class="mj-num small strong">{{ period.Amount | mjoMoney }}</div>
                                    </div>
                                } @empty {
                                    <div class="small muted">No recognition schedule for this subscription.</div>
                                }
                            </div>

                            <div class="small muted mjo-sub__note">
                                These are <b>real forward-dated entries written at booking</b>, not a schedule a
                                nightly job materialises. Batches only sweep them when the date filter explicitly
                                reaches forward, so they sit harmlessly until their period arrives. A change nets
                                against them; they are never edited.
                            </div>
                        </div>
                    </div>
                </aside>
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
            .mjo-sub__split { display: flex; gap: var(--mj-space-4); align-items: flex-start; }
            .mjo-sub__left { flex: 1; min-width: 0; }
            .mjo-sub__right { flex: 0 0 360px; min-width: 0; }
            .mjo-sub__recog { margin-top: var(--mj-space-4); }
            .mjo-sub__note { margin-top: var(--mj-space-3); }
            .mjo-sub__waterfall {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(74px, 1fr));
                gap: 5px;
            }
            .mjo-sub__period {
                border: 1px solid var(--mj-border-default);
                border-radius: var(--mj-radius-sm);
                padding: 5px 6px;
                text-align: center;
            }
            .mjo-sub__period.is-released {
                background: var(--mj-status-success-bg);
                border-color: color-mix(in srgb, var(--mj-status-success) 35%, transparent);
            }

            @media (max-width: 1100px) {
                .mjo-sub__split { flex-direction: column; }
                .mjo-sub__left, .mjo-sub__right { flex: 1 1 auto; width: 100%; }
            }
            @media (max-width: 760px) {
                :host { padding: var(--mj-space-4); }
            }
        `,
    ],
})
export class MJOSubscriptionsPageComponent implements OnInit {
    private readonly data = inject(MJOOrdersDataService);

    public AllRows: MJOSubscriptionRow[] = [];
    public Rows: MJOSubscriptionRow[] = [];
    public SelectedID: string | null = null;
    public Preset = 'active';

    public readonly Presets: MJOPreset[] = [
        { Key: 'active', Label: 'Active' },
        { Key: 'renewing', Label: 'Renewing soon', Icon: 'fa-solid fa-hourglass-half' },
        { Key: 'norenew', Label: 'Will not renew' },
        { Key: 'all', Label: 'All' },
    ];

    public readonly Columns: MJOColumn<MJOSubscriptionRow>[] = [
        { Key: 'SubscriptionNumber', Label: 'Subscription', Kind: 'mono', Width: '140px' },
        {
            Key: 'Beneficiary',
            Label: 'Beneficiary',
            Format: (r) => (r.BeneficiaryPerson ?? r.HolderOrganization ?? '—') as string,
            Secondary: (r) => (r.BeneficiaryPerson ? (r.HolderOrganization as string) : null),
        },
        { Key: 'Product', Label: 'Product', HideBelow: 1000 },
        {
            Key: 'EndDate',
            Label: 'Covered to',
            Width: '120px',
            Format: (r) => FormatDate(r.EndDate, { Short: true }),
        },
        {
            Key: 'AutoRenew',
            Label: 'Auto-renew',
            Kind: 'chip',
            Width: '120px',
            HideBelow: 760,
            Format: (r) => (r.AutoRenew ? 'On' : 'Off'),
            ChipClass: (r) => (r.AutoRenew ? 'mj-chip--success' : 'mj-chip--outline'),
        },
        {
            Key: 'Status',
            Label: 'Status',
            Kind: 'chip',
            Width: '110px',
            ChipClass: (r) => this.statusClass(r),
        },
    ];

    public async ngOnInit(): Promise<void> {
        const rv = new RunView();
        const result = await rv.RunView<MJOSubscriptionRow>(
            {
                EntityName: MJO_ENTITIES.Subscription,
                OrderBy: 'EndDate',
                ResultType: 'simple',
            },
            new Metadata().CurrentUser,
        );
        this.AllRows = result.Success ? (result.Results ?? []) : [];
        this.applyPreset();
        if (this.Rows.length) this.SelectedID = this.Rows[0].ID;
    }

    public Select(row: MJOSubscriptionRow): void {
        this.SelectedID = row.ID;
    }

    public OnPreset(preset: string): void {
        this.Preset = preset;
        this.applyPreset();
    }

    public get Selected(): MJOSubscriptionRow | undefined {
        return this.AllRows.find((r) => r.ID === this.SelectedID);
    }

    public get DaysToRenewal(): number {
        if (!this.Selected) return 0;
        return -DaysSince(this.Selected.EndDate, new Date().toISOString().slice(0, 10));
    }

    /** Within the lead window, and consented to. */
    public get RenewalDue(): boolean {
        return !!this.Selected?.AutoRenew && this.DaysToRenewal > 0 && this.DaysToRenewal <= 45;
    }

    /**
     * The recognition waterfall.
     *
     * Twelve monthly periods across the term. Released periods are the ones whose
     * date has passed — the entry already existed, so "released" is a statement
     * about the calendar rather than about anything the system did.
     */
    public get Recognition(): MJORecognitionPeriod[] {
        const subscription = this.Selected;
        if (!subscription) return [];

        const amount = Number(subscription['AmountPerTerm'] ?? 0);
        if (!amount) return [];

        const periods = 12;
        const perPeriod = Math.round((amount / periods) * 100) / 100;
        const start = new Date(String(subscription.StartDate).slice(0, 10));
        const today = new Date();

        return Array.from({ length: periods }, (_, index) => {
            const date = new Date(start.getFullYear(), start.getMonth() + index, 1);
            return {
                Label: date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
                Amount: perPeriod,
                Released: date <= today,
            };
        });
    }

    protected statusClass(row: MJOSubscriptionRow): string {
        switch (row.Status) {
            case 'Active':
                return 'mj-chip--success';
            case 'Grace':
                return 'mj-chip--warning';
            case 'Cancelled':
            case 'Expired':
                return 'mj-chip--outline';
            default:
                return '';
        }
    }

    protected date(value: string): string {
        return FormatDate(value);
    }

    protected money(value: number): string {
        return FormatMoney(value);
    }

    private applyPreset(): void {
        const today = new Date().toISOString().slice(0, 10);
        this.Rows = this.AllRows.filter((row) => {
            switch (this.Preset) {
                case 'active':
                    return row.Status === 'Active';
                case 'renewing': {
                    const days = -DaysSince(row.EndDate, today);
                    return row.AutoRenew && days > 0 && days <= 45;
                }
                case 'norenew':
                    return !row.AutoRenew;
                default:
                    return true;
            }
        });
    }
}
