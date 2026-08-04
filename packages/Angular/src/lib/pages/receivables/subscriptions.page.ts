import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MJOWorklistTableComponent, type MJOColumn, type MJOPreset } from '../../panels/worklist-table.component';
import { MJOStatedValueComponent } from '../../panels/chips.component';
import { MJOMoneyPipe, FormatDate, FormatMoney, DaysSince } from '../../panels/money-format';
import { MJOOrdersDataService, MJO_ENTITIES } from '../../services/orders-data.service';
import { RunView, Metadata } from '@memberjunction/core';
import { MJAlertComponent } from '@memberjunction/ng-ui-components';

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
    imports: [CommonModule, MJOWorklistTableComponent, MJOStatedValueComponent, MJOMoneyPipe, MJAlertComponent],
    template: `
        <div class="mjo-sub__split">
            <div class="mjo-sub__left">
                <mj-alert Variant="info" Icon="fa-solid fa-shield-halved" class="mjo-sub__note">
                        <strong>Why this cannot double-bill.</strong>
                        A renewal is refused when a term already covers the period it would create.
                        The check is against COVERAGE, not against whether a job has run — so a
                        retried batch, a manual nudge and a scheduled sweep all reach the same
                        answer.
                </mj-alert>

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
                            <mjo-stated-value Label="Covered through" From="the last term's end">
                                {{ CoveredThrough }}
                            </mjo-stated-value>
                            <mjo-stated-value Label="Auto-renew" From="the consent switch">
                                {{ Selected.AutoRenew ? 'On' : 'Off — it simply ends' }}
                            </mjo-stated-value>

                            <mj-alert Variant="info" Icon="fa-solid fa-user-group" class="mjo-sub__note">
                                    Holder and beneficiary are separate on purpose, and it decides what counts
                                    as a duplicate — which is why ten seats for ten staff are ten subscriptions
                                    rather than ten collisions.
                            </mj-alert>

                            @if (RenewalDue) {
                                <mj-alert Variant="warning" Icon="fa-solid fa-hourglass-half" class="mjo-sub__note">
                                        <strong>Renews in {{ DaysToRenewal }} days.</strong>
                                        With auto-renew on, the system places a confirmed order at lead time —
                                        invoicing ahead of the period, which is how subscription billing works.
                                </mj-alert>
                            }
                        </div>
                    </div>


                    <div class="mj-card mjo-sub__recog">
                        <div class="mj-card-head">
                            <i class="fa-solid fa-timeline" aria-hidden="true"></i>
                            <h3>Coverage terms</h3>
                            <span class="right small muted">{{ Terms.length }}</span>
                        </div>
                        <div class="mj-table-wrap">
                            <table class="mj-table mj-table--compact">
                                <thead>
                                    <tr>
                                        <th>#</th>
                                        <th>Covers</th>
                                        <th class="num">Amount</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    @for (term of Terms; track term['ID']) {
                                        <tr [class.is-current]="isCurrentTerm(term)">
                                            <td class="small">{{ term['TermNumber'] }}</td>
                                            <td class="small">
                                                {{ dateOf(term['StartDate']) }} → {{ dateOf(term['EndDate']) }}
                                                @if (term['IsProrated']) {
                                                    <span class="mj-chip mj-chip--outline">prorated</span>
                                                }
                                            </td>
                                            <td class="num">{{ moneyOf(term['Amount']) }}</td>
                                            <td>
                                                <span class="mj-chip" [class]="termClass(term)">
                                                    {{ isCurrentTerm(term) ? 'current' : (term['Status'] ?? '—') }}
                                                </span>
                                            </td>
                                        </tr>
                                    } @empty {
                                        <tr><td colspan="4" class="small muted">No terms recorded.</td></tr>
                                    }
                                </tbody>
                            </table>
                        </div>
                        <div class="mj-card-pad small muted">
                            A renewal APPENDS a term rather than moving a pointer, so "current" is
                            the term whose window covers today — a fact that cannot go stale. It
                            also keeps the difference visible between a customer buying more
                            coverage and the system renewing them under standing authority.
                        </div>
                    </div>

                    <div class="mj-card mjo-sub__recog">
                        <div class="mj-card-head">
                            <i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i>
                            <h3>History</h3>
                        </div>
                        <div class="mj-card-pad">
                            @for (event of Events; track event['ID']) {
                                <div class="mjo-sub__event">
                                    <span class="mj-chip mj-chip--outline">{{ event['EventType'] }}</span>
                                    <span class="small muted">{{ dateOf(event['OccurredAt']) }}</span>
                                </div>
                            } @empty {
                                <div class="small muted">
                                    No events yet. A subscription that has only ever been sold has
                                    nothing to say here.
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
            .mjo-sub__event {
                display: flex;
                align-items: center;
                gap: var(--mj-space-2);
                padding: 4px 0;
                border-bottom: 1px solid var(--mj-border-subtle);
            }
            .mjo-sub__event:last-child { border-bottom: none; }
            tr.is-current { background: var(--mj-status-success-bg); }
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
    /**
     * Render what was just loaded. See orders-dashboard.page.ts for the full
     * reasoning: these pages are created imperatively by the section shell, and an
     * async assignment across Angular's check/verify boundary raises NG0100, aborts
     * the DOM write, and freezes the view on its pre-load values permanently.
     */
    private readonly cdr = inject(ChangeDetectorRef);

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
        if (this.Rows.length) {
            this.SelectedID = this.Rows[0].ID;
            await this.loadDetail(this.SelectedID);
        }
        this.cdr.detectChanges();
    }

    public Terms: Array<Record<string, unknown>> = [];
    public Events: Array<Record<string, unknown>> = [];

    public async Select(row: MJOSubscriptionRow): Promise<void> {
        this.SelectedID = row.ID;
        await this.loadDetail(row.ID);
        this.cdr.detectChanges();
    }

    /**
     * Terms and history for one subscription.
     *
     * Fetched on selection, and both awaits settle before either is assigned —
     * assigning between awaits is what puts the view into the NG0100 freeze.
     */
    private async loadDetail(subscriptionID: string): Promise<void> {
        const [terms, events] = await Promise.all([
            this.data.GetSubscriptionTerms(subscriptionID),
            this.data.GetSubscriptionEvents(subscriptionID),
        ]);
        this.Terms = terms;
        this.Events = events;
        this.cdr.detectChanges();
    }

    /**
     * The term whose window covers today.
     *
     * Not a stored flag — renewals append terms, so "current" is a question about
     * the calendar and answering it from the dates cannot go stale.
     */
    protected isCurrentTerm(term: Record<string, unknown>): boolean {
        const today = new Date().toISOString().slice(0, 10);
        const from = term['StartDate'] ? String(term['StartDate']).slice(0, 10) : null;
        const to = term['EndDate'] ? String(term['EndDate']).slice(0, 10) : null;
        return (!from || from <= today) && (!to || to >= today);
    }

    protected termClass(term: Record<string, unknown>): string {
        if (this.isCurrentTerm(term)) return 'mj-chip--success';
        return term['Status'] === 'Canceled' ? 'mj-chip--outline' : 'mj-chip--outline';
    }

    /**
     * Dates and amounts arrive as `unknown` off a loosely-typed row.
     *
     * TERM WINDOWS SHOW THE YEAR. Consecutive terms differ only by it — a renewal
     * of an annual subscription runs Jul 31 → Jul 30 exactly like the term before
     * it — so the short format rendered two different years as the same window and
     * made an appended renewal look like a duplicate.
     */
    protected dateOf(value: unknown): string {
        return value ? FormatDate(String(value)) : '—';
    }

    /**
     * The furthest date any term reaches.
     *
     * The subscription's own EndDate can be null while its terms know exactly how
     * far coverage runs — terms are where renewals are recorded, so they are the
     * authority. Reading the header field alone showed "—" for a subscription
     * covered for another year.
     */
    public get CoveredThrough(): string {
        const ends = this.Terms
            .map((t) => (t['EndDate'] ? String(t['EndDate']).slice(0, 10) : null))
            .filter((d): d is string => !!d)
            .sort();
        const furthest = ends[ends.length - 1] ?? this.Selected?.EndDate ?? null;
        return furthest ? FormatDate(furthest) : '—';
    }

    protected moneyOf(value: unknown): string {
        return FormatMoney(Number(value ?? 0));
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
