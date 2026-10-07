import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EntityViewerModule, type RecordSelectedEvent, type RecordOpenedEvent } from '@memberjunction/ng-entity-viewer';
import { MJOStatedValueComponent } from '../../panels/chips.component';
import { FormatDate, FormatMoney, DaysSince } from '../../panels/money-format';
import { MJO_ENTITIES } from '../../data/entity-names';
import { RunView, Metadata, type EntityInfo } from '@memberjunction/core';
import { MJAlertComponent } from '@memberjunction/ng-ui-components';
import { DeferredRevenueWaterfallModule } from '@mj-biz-apps/accounting-ng';
import type { mjBizAppsAccountingJournalEntryEntity } from '@mj-biz-apps/accounting-entities';
import {
    GetSubscriptionEvents,
    GetSubscriptionTerms,
    GetSubscriptionTypeRenewalLeadDays,
    LoadSubscriptionRevRec,
    type SubscriptionTermLookup,
} from '../../data/orders-queries';
import {
    ToISODate,
    Today,
    type DateCell,
    type mjBizAppsOrdersSubscriptionEventEntity,
    type mjBizAppsOrdersSubscriptionTermEntity,
} from '@mj-biz-apps/orders-entities';

/** A subscription row. */
interface MJOSubscriptionRow extends Record<string, unknown> {
    ID: string;
    SubscriptionNumber: string;
    Status: string;
    // DateCell, not string: these come off a `'simple'` read, whose date columns used to arrive as
    // ISO text and now arrive as `Date`. Read them with `ToISODate`, never `String(x).slice(0, 10)`.
    StartDate: DateCell;
    EndDate: DateCell;
    AutoRenew: boolean;
    RenewalLeadDays?: number | null;
    SubscriptionTypeID?: string | null;
    OrderLineID?: string | null;
    Product?: string | null;
    HolderOrganization?: string | null;
    BeneficiaryPerson?: string | null;
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
    imports: [CommonModule, EntityViewerModule, DeferredRevenueWaterfallModule, MJOStatedValueComponent, MJAlertComponent],
    template: `
        <div class="mjo-sub__split">
            <div class="mjo-sub__left">
                <p class="mjo-note mjo-sub__note">
                    <i class="fa-solid fa-shield-halved" aria-hidden="true"></i>
                    A renewal is blocked when a term already covers the period, so a subscription
                    cannot be billed twice for the same period.
                </p>

                <div class="mjo-sub__viewer-host">
                    @if (SubscriptionEntityInfo) {
                        <mj-entity-viewer
                            [Entity]="SubscriptionEntityInfo"
                            (RecordSelected)="OnRecordSelected($event)"
                            (RecordOpened)="OnRecordOpened($event)">
                        </mj-entity-viewer>
                    } @else {
                        <div class="small muted" style="padding: 24px;">Loading subscriptions...</div>
                    }
                </div>
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

                            <p class="mjo-note mjo-sub__note">
                                <i class="fa-solid fa-user-group" aria-hidden="true"></i>
                                Holder is the paying party. Beneficiary receives the service. Each beneficiary
                                has its own subscription.
                            </p>

                            @if (RenewalDue) {
                                <mj-alert Variant="warning" Icon="fa-solid fa-hourglass-half" class="mjo-sub__note">
                                        <strong>Renews in {{ DaysToRenewal }} days.</strong>
                                        With auto-renew on, a renewal order is created and invoiced before the
                                        new term starts.
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
                                                {{ termDateOf(term['StartDate']) }} → {{ termDateOf(term['EndDate']) }}
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
                                <div class="small muted">No history yet.</div>
                            }
                        </div>
                    </div>

                    <div class="mj-card mjo-sub__recog">
                        <div class="mj-card-head">
                            <i class="fa-solid fa-chart-line" aria-hidden="true"></i>
                            <h3>Revenue recognition</h3>
                        </div>
                        <div class="mj-card-pad">
                            @if (CanReadRecognition) {
                                <mj-deferred-revenue-waterfall
                                    [JournalEntries]="RecognitionEntries"
                                    [Title]="'Subscription deferred revenue'"
                                    [TermLookup]="RecognitionTermLookup">
                                </mj-deferred-revenue-waterfall>
                            } @else {
                                <div class="small muted">
                                    You do not have permission to view journal entries, so the recognition
                                    schedule cannot be shown.
                                </div>
                            }

                            <div class="small muted mjo-sub__note">
                                Recognition entries are created at booking with future dates and post when their
                                period arrives. Changes are recorded as adjusting entries.
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
            .mjo-sub__viewer-host {
                height: 600px;
                min-height: 500px;
                background: var(--mj-bg-surface);
                border: 1px solid var(--mj-border-default);
                border-radius: var(--mj-radius-md);
                overflow: hidden;
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
    private readonly cdr = inject(ChangeDetectorRef);

    public SubscriptionEntityInfo: EntityInfo | null = null;
    public AllRows: MJOSubscriptionRow[] = [];
    public Rows: MJOSubscriptionRow[] = [];
    public SelectedID: string | null = null;
    public Preset = 'active';

    public async ngOnInit(): Promise<void> {
        const md = new Metadata();
        this.SubscriptionEntityInfo = md.Entities.find((e) => e.Name === MJO_ENTITIES.Subscription) || null;
        const rv = new RunView();
        const result = await rv.RunView<MJOSubscriptionRow>(
            {
                EntityName: MJO_ENTITIES.Subscription,
                OrderBy: 'EndDate',
                ResultType: 'simple',
            },
            md.CurrentUser,
        );
        this.AllRows = result.Success ? (result.Results ?? []) : [];
        this.applyPreset();
        if (this.Rows.length) {
            this.SelectedID = this.Rows[0].ID;
            await this.loadDetail(this.SelectedID);
        }
        this.cdr.detectChanges();
    }

    public OnRecordSelected(event: RecordSelectedEvent): void {
        const id = (event.compositeKey?.GetValueByFieldName('ID') ?? event.record?.['ID']) as string | undefined;
        if (id) {
            this.SelectedID = id;
            void this.loadDetail(id);
        }
    }

    public OnRecordOpened(event: RecordOpenedEvent): void {
        const id = (event.compositeKey?.GetValueByFieldName('ID') ?? event.record?.['ID']) as string | undefined;
        if (id) {
            this.SelectedID = id;
            void this.loadDetail(id);
        }
    }

    public Terms: mjBizAppsOrdersSubscriptionTermEntity[] = [];
    public Events: mjBizAppsOrdersSubscriptionEventEntity[] = [];
    public RecognitionEntries: mjBizAppsAccountingJournalEntryEntity[] = [];
    public RecognitionTermLookup: SubscriptionTermLookup = {};
    public CanReadRecognition = true;
    /** The subscription type's lead days, the engine's fallback when the subscription sets none. */
    public TypeRenewalLeadDays: number | null = null;

    public async Select(row: MJOSubscriptionRow): Promise<void> {
        this.SelectedID = row.ID;
        await this.loadDetail(row.ID);
        this.cdr.detectChanges();
    }

    /**
     * Terms, history, recognition entries and renewal lead days for one subscription.
     *
     * Recognition waits for the terms so they are read once; the other reads run
     * alongside. Every await settles before anything is assigned —
     * assigning between awaits is what puts the view into the NG0100 freeze. A
     * result that lands after the user has selected another subscription is
     * dropped, so one subscription's schedule never renders under another's header.
     */
    private async loadDetail(subscriptionID: string): Promise<void> {
        const row = this.AllRows.find((r) => r.ID === subscriptionID);
        const termsAndRecognition = (async () => {
            const terms = await GetSubscriptionTerms(subscriptionID);
            const recognition = await LoadSubscriptionRevRec(
                { ID: subscriptionID, OrderLineID: row?.OrderLineID ?? null },
                Metadata.Provider,
                terms,
            );
            return { terms, recognition };
        })();
        const typeLeadDays = row?.RenewalLeadDays == null && row?.SubscriptionTypeID
            ? GetSubscriptionTypeRenewalLeadDays(row.SubscriptionTypeID)
            : Promise.resolve(null);
        const [{ terms, recognition }, events, leadDays] = await Promise.all([
            termsAndRecognition,
            GetSubscriptionEvents(subscriptionID),
            typeLeadDays,
        ]);
        if (this.SelectedID !== subscriptionID) return;
        this.Terms = terms;
        this.Events = events;
        this.RecognitionEntries = recognition.Entries;
        this.RecognitionTermLookup = recognition.TermLookup;
        this.CanReadRecognition = recognition.CanRead;
        this.TypeRenewalLeadDays = leadDays;
        this.cdr.detectChanges();
    }

    /**
     * The term whose window covers today.
     *
     * Not a stored flag — renewals append terms, so "current" is a question about
     * the calendar and answering it from the dates cannot go stale.
     */
    protected isCurrentTerm(term: mjBizAppsOrdersSubscriptionTermEntity): boolean {
        const today = Today();
        const from = ToISODate(term.StartDate);
        const to = ToISODate(term.EndDate);
        return (!from || from <= today) && (!to || to >= today);
    }

    protected termClass(term: mjBizAppsOrdersSubscriptionTermEntity): string {
        if (this.isCurrentTerm(term)) return 'mj-chip--success';
        return term['Status'] === 'Canceled' ? 'mj-chip--outline' : 'mj-chip--outline';
    }

    /**
     * Dates and amounts arrive as `unknown` off a loosely-typed row.
     *
     * The value goes to `FormatDate` as it is. Terms and events are entity objects,
     * so their dates are `Date`, and `String(date)` is 'Mon Aug 10 2026 …', which
     * no ISO reader parses — every term window and history row rendered '—'.
     *
     * TERM WINDOWS SHOW THE YEAR. Consecutive terms differ only by it — a renewal
     * of an annual subscription runs Jul 31 → Jul 30 exactly like the term before
     * it — so the short format rendered two different years as the same window and
     * made an appended renewal look like a duplicate.
     */
    protected dateOf(value: unknown): string {
        if (value instanceof Date || typeof value === 'string') return FormatDate(value);
        return '—';
    }

    /**
     * A term's start or end date.
     *
     * TERM DATES ARE CALENDAR DAYS, NOT INSTANTS. They arrive as midnight UTC, and
     * `dateOf` reads local parts, so west of Greenwich Jan 1 rendered as Dec 31 and
     * a renewal term appeared to overlap the one before it by a day. `ToISODate`
     * reads the stored day, the same way `CoveredThrough` does. History timestamps
     * are real instants and stay on `dateOf`.
     */
    protected termDateOf(value: unknown): string {
        const day = ToISODate(value);
        return day ? FormatDate(day) : '—';
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
        const furthest = this.latestTermEnd ?? this.Selected?.EndDate ?? null;
        return furthest ? FormatDate(furthest) : '—';
    }

    /** `YYYY-MM-DD` of the furthest term end, or null when no term has one. */
    private get latestTermEnd(): string | null {
        const ends = this.Terms
            .map((t) => ToISODate(t.EndDate))
            .filter((d): d is string => !!d)
            .sort();
        return ends[ends.length - 1] ?? null;
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

    /**
     * Days until the latest term ends, which is when a renewal takes effect.
     *
     * Not `Subscription.EndDate`: that column is the final service date, set only
     * after a cancellation or migration, so it is empty on every subscription that
     * could still renew.
     */
    public get DaysToRenewal(): number {
        const end = this.latestTermEnd;
        if (!this.Selected || !end) return 0;
        return -DaysSince(end, Today());
    }

    /**
     * Whether the renewal engine will renew this subscription soon.
     *
     * Mirrors the engine's due query: auto-renew on, subscription Active or
     * Trialing (a paused one does not renew), latest term Scheduled or Active, and
     * the term end inside the lead window — the subscription's own lead days,
     * falling back to its type's, then 0.
     */
    public get RenewalDue(): boolean {
        const subscription = this.Selected;
        if (!subscription?.AutoRenew) return false;
        if (subscription.Status !== 'Active' && subscription.Status !== 'Trialing') return false;
        const latest = this.Terms[this.Terms.length - 1];
        if (latest && latest.Status !== 'Scheduled' && latest.Status !== 'Active') return false;
        const leadDays = subscription.RenewalLeadDays ?? this.TypeRenewalLeadDays ?? 0;
        return this.DaysToRenewal > 0 && this.DaysToRenewal <= leadDays;
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
        const today = Today();
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
