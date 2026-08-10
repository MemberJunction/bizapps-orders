import {
    ChangeDetectorRef,
    Component,
    EventEmitter,
    HostListener,
    Input,
    OnChanges,
    OnDestroy,
    OnInit,
    type SimpleChanges,
    Output,
    inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
    OrderHeaderEntity,
    type mjBizAppsOrdersOrderLineEntity,
} from '@mj-biz-apps/orders-entities';
import { Metadata } from '@memberjunction/core';

const ORDER_ENTITY = 'MJ_BizApps_Orders: Orders';

import {
    MJO_ENTITIES,
    MJOOrdersDataService,
    type MJOCompanyOption,
    type MJOOrderRow,
} from '../../services/orders-data.service';
import {
    MJOOrderEntryService,
    type MJOEstimatedTotals,
    type MJOLinePrice,
    type MJOPricingState,
} from '../../services/order-entry.service';
import { MJOMoneyStripComponent, type MJOPaymentStatus } from '../../panels/money-strip.component';
import { MJOStatusStepperComponent } from '../../panels/status-stepper.component';
import { MJOJournalEntryPreviewComponent, type MJOJournalEntry } from '../../panels/journal-entry-preview.component';
import { MJODecompositionLadderComponent, type MJOLadderRow } from '../../panels/decomposition-ladder.component';
import {
    MJOConsequenceChipComponent,
    MJOOriginChipComponent,
    MJOPriceSourceBadgeComponent,
    MJOStatedValueComponent,
} from '../../panels/chips.component';
import { MJOMoneyPipe, FormatDate, FormatMoney } from '../../panels/money-format';
import { BuildOrderStages, type MJOOrderStage, type MJOStageChangeRequestEventArgs } from '../../panels/order-stages';
import type { MJOProductOption } from './fast-entry.page';
import type { MJOTenderOption } from '../payments/payment-entry.page';
import type { RunViewParams } from '@memberjunction/core';
import { MJButtonDirective, MJDropdownComponent, MJTabNavComponent, type TabConfig } from '@memberjunction/ng-ui-components';
// The MODULE, not the component: `mj-entity-data-grid` is declared (standalone: false), so a
// standalone host imports its module. Same route accounting's generated forms take.
import { EntityViewerModule } from '@memberjunction/ng-entity-viewer';

/** Which tab is showing. */
export type MJOEditorTab =
    | 'lines'
    | 'parties'
    | 'charges'
    | 'payment'
    | 'accounting'
    // The order's CONSEQUENCES, after the fact. Both are read-only, both exist only for a booked
    // order, and both are somebody else's records — the ledger belongs to accounting, and a
    // subscription outlives the order that started it.
    | 'journal'
    | 'subscriptions';

/** A tab, with the red-dot state that drives completeness gating. */
export interface MJOEditorTabDef {
    Key: MJOEditorTab;
    Label: string;
    /** Count badge — lines, charges. Omit where a count says nothing. */
    Count?: number | null;
    /** Something on this tab is required and missing. */
    HasError?: boolean;
}

/**
 * `mjo-order-editor-page` — the hard order, in five tabs.
 *
 * The full lane. Where fast entry covers one customer and a few products, this
 * covers the order that has per-line ship-to parties, charge overrides, dimension
 * tags and lines belonging to different companies.
 *
 * FIVE NUMBERS ON THE ROW, THE REST IN A DRAWER. An order line carries around
 * eighteen meaningful fields. Putting them all inline makes the common case
 * unreadable to serve the rare one, so the row shows product, quantity, unit
 * price, discount and line total, and everything else opens on click.
 *
 * REQUIRED STATE IS A RED DOT ON THE TAB, never a disabled Save with no
 * explanation. The validation comes from `OrderHeaderEntity.SectionsWithErrors()`, so the
 * dot and the reason are the same source.
 *
 * CONFIRMING IS INTERCEPTED. The stepper's stage change is cancelable, and this
 * page always cancels a move to `Confirmed` so the pre-flight review can run
 * first — booking journal entries is not undoable, and an irreversible action
 * gets a review step.
 *
 * ## Example
 *
 * ```html
 * <mjo-order-editor-page
 *   [Order]="order"
 *   [Catalog]="products"
 *   [Status]="'Draft'"
 *   (ConfirmRequested)="openPreflight($event)" />
 * ```
 */
/** Which party a picker is editing. Bill-to and ship-to fall back independently. */
export type MJOPartyRole = 'bill' | 'ship';

/** One customer-search hit, as `MJOOrdersDataService.SearchCustomers` returns it. */
export interface MJOPartyMatch {
    ID: string;
    Name: string;
    IsOrganization: boolean;
    Email: string | null;
}

@Component({
    selector: 'mjo-order-editor-page',
    standalone: true,
    imports: [MJButtonDirective, MJDropdownComponent, MJTabNavComponent,
        EntityViewerModule,
        CommonModule,
        FormsModule,
        MJOMoneyStripComponent,
        MJOStatusStepperComponent,
        MJOJournalEntryPreviewComponent,
        MJODecompositionLadderComponent,
        MJOConsequenceChipComponent,
        MJOOriginChipComponent,
        MJOPriceSourceBadgeComponent,
        MJOStatedValueComponent,
        MJOMoneyPipe,
    ],
    templateUrl: './order-editor.page.html',
    styleUrls: ['./order-editor.page.css'],
})
export class MJOOrderEditorPageComponent implements OnInit, OnChanges, OnDestroy {
    private readonly orders = inject(MJOOrderEntryService);
    private readonly data = inject(MJOOrdersDataService);
    // Required: this page is created imperatively and runs zoneless, so every assignment that
    // lands after an await or from a preview callback has to tick explicitly.
    private readonly cdr = inject(ChangeDetectorRef);

    /**
     * The order being edited. Supplied by the host — often the SAME instance fast
     * entry was working on, which is what makes escalation lossless.
     */
    /**
     * The order being edited — a real entity, not a parallel model of one.
     *
     * Bound directly: the object the screen mutates is the object that gets saved, so there is no
     * mapping layer to drift and no second definition of what an order is.
     */
    @Input() Order!: OrderHeaderEntity;

    /** True when the chosen tender needs a reference number — read from the PaymentType, not stored. */
    public RequiresPaymentReference = false;

    /**
     * The reference the user typed for the initial payment — a check number, wire confirmation, or
     * transfer id.
     *
     * Held on the page, not the order: `OrderHeader` has no such column. It lives on the
     * `PaymentDetail` row the order points at, which is created by the confirm, so until then this
     * is genuinely screen state. That is exactly the kind of thing an Angular component may own.
     */
    public InitialPaymentReference: string | null = null;

    /** Catalog for the product column and the add-line picker. */
    @Input() Catalog: MJOProductOption[] = [];

    /**
     * The companies this order could be raised under.
     *
     * The OWNING company decides which chart of accounts the order books into and who can see it,
     * and it was previously taken silently from the first product in the catalog and never shown.
     * A default nobody can see is a decision made on the user's behalf in secret — and with more
     * than one company it is a decision they may well want to make differently.
     */
    @Input() Companies: MJOCompanyOption[] = [];

    /** Where the order is. Drives the stepper and which verbs are offered. */
    @Input() Status: MJOOrderStage = 'Draft';

    /** Document number, once the order has one. Drafts have none. */
    @Input() OrderNumber: string | null = null;

    /** Where the order came from. */
    @Input() OriginChannel: string | null = 'Staff';

    /** The originating system's reference, when there is one. */
    @Input() OriginExternalID: string | null = null;

    /**
     * Show this page's own Save/Confirm bar.
     *
     * The order workspace hosts this editor inside `mj-workspace-card`, which already provides
     * Confirm / Keep as draft / Discard for the active tab. Left on, the screen shows two action
     * bars that appear to do different things and do not.
     */
    @Input() ShowActions = true;

    /**
     * Tenders the instance accepts, for the initial-payment picker. Supplied by the host — the
     * section already loads and caches them.
     */
    @Input() Tenders: MJOTenderOption[] = [];

    /** Journal entries — populated on the Accounting tab from a preview. */
    @Input() JournalEntries: MJOJournalEntry[] = [];

    /** The user asked to confirm. The host runs the pre-flight. */
    @Output() ConfirmRequested = new EventEmitter<OrderHeaderEntity>();

    /** The draft was saved. */
    @Output() Saved = new EventEmitter<OrderHeaderEntity>();

    /** A line was opened. The host may show it in a slide-in instead of the built-in drawer. */
    @Output() LineOpened = new EventEmitter<mjBizAppsOrdersOrderLineEntity>();

    /** An entry's Accounting link was followed. */
    @Output() OpenInAccounting = new EventEmitter<MJOJournalEntry>();

    /** Allocation lines that have landed on this order. */
    public AppliedPayments: Array<Record<string, unknown>> = [];

    /** Dimension tags across this order's lines. */
    public Dimensions: Array<Record<string, unknown>> = [];

    /** Active tab. */
    public ActiveTab: MJOEditorTab = 'lines';

    /**
     * What the consequence grids ask for, or null when this order has no saved lines.
     *
     * Set in `loadPersistedDetail`, which only runs for a persisted order — a draft that has never
     * been saved has booked nothing and started nothing, and the panes say so rather than
     * rendering an empty grid that looks like a failed query.
     */
    public get JournalEntryParams(): RunViewParams | null {
        return this.consequences.get(this.currentOrderID ?? '')?.Journal ?? null;
    }
    public get SubscriptionParams(): RunViewParams | null {
        return this.consequences.get(this.currentOrderID ?? '')?.Subscriptions ?? null;
    }

    /**
     * Params PER ORDER, not per editor instance.
     *
     * The workspace holds one tab per order but renders ONE editor for whichever is active, so
     * anything stored as a plain field on this component belongs to "the last order that loaded"
     * rather than to the order on screen — which is exactly how the journal tab came to show the
     * previous tab's entries. Keyed by order id, a tab switch is a different map lookup and cannot
     * be stale; the query runs once per order and only when someone opens one of the two tabs.
     *
     * A null result is NOT cached: an order with no saved lines yet has nothing to ask for, and
     * caching that would keep answering "nothing" after its lines are saved.
     */
    private readonly consequences = new Map<
        string,
        { Journal: RunViewParams | null; Subscriptions: RunViewParams | null }
    >();

    /** The order on screen, or null for a draft that has never been saved. */
    private get currentOrderID(): string | null {
        return this.Order?.ID ?? null;
    }

    /**
     * Latest line pricing.
     *
     * LINE PRICES ONLY, and the name says so. It is what `Orders.PreviewPrice`
     * resolved per line — the same `ResolvePrice` the engine's own pricing walk
     * calls — summed to a net subtotal. Charges, tax and promotions are decided
     * inside the confirm transaction and are NOT here; the screen says so rather
     * than showing them as zero.
     */
    public Pricing: MJOPricingState = { Result: null, Loading: false, Error: null };

    /** The line whose drawer is open, or null. */
    public OpenLine: mjBizAppsOrdersOrderLineEntity | null = null;

    private stopWatching: (() => void) | null = null;

    public async ngOnInit(): Promise<void> {
        // Tolerate a host that forgot to supply one rather than throwing: a blank
        // editor is recoverable, a crashed tab is not.
        if (!this.Order) {
            const md = new Metadata();
            this.Order = await md.GetEntityObject<OrderHeaderEntity>(ORDER_ENTITY);
            this.Order.NewRecord();
        }

        // Both callbacks MUST tick — they land from a debounced timer and an awaited network
        // round-trip, outside anything Angular is watching on an imperatively-created, zoneless
        // page. Assigning alone repaints nothing, so the decomposition stays on "— resolving…"
        // and CanConfirm never turns true. Same defect as fast-entry.page.ts.
        // NO SUBSCRIBE. The draft raised a change event this page listened to in order to re-price —
        // a loop through an observable to learn something the page already knew, because every edit
        // arrives through a setter the page owns. `onEdited()` is called from those setters instead:
        // simpler, and an edit path that forgets to call it fails review rather than silently
        // ceasing to re-price.
        void this.orders.PriceNow(this.Order, (state) => {
            this.Pricing = state;
            this.cdr.detectChanges();
        });

        // Payments and dimension tags exist only against a SAVED order, so this
        // resolves to empty for a fresh draft rather than querying for nothing.
        void this.loadPersistedDetail();
    }

    /**
     * The workspace swaps `[Draft]` when you change order tabs — the component is never remounted,
     * so this is the only signal that the order on screen has changed.
     */
    public ngOnChanges(changes: SimpleChanges): void {
        if (changes['Draft']) void this.loadConsequences();

        // STATUS IS THE CONFIRM SIGNAL. The workspace confirms in place and never remounts this
        // component — it just flips `[Status]` to 'Confirmed'. Without re-reading here, the money
        // on screen stays whatever the DRAFT implied, so an order that is Paid in the database went
        // on saying "BALANCE $560.00 · Unpaid" to the person who had just paid it.
        //
        // Also covers `Draft`, because a tab switch swaps the draft and its persisted money with it.
        if (changes['Status'] || changes['Draft']) void this.loadPersistedDetail();
    }

    public ngOnDestroy(): void {
        if (this.partyTimer) clearTimeout(this.partyTimer);
        this.stopWatching?.();
        this.orders.CancelPending();
    }

    /* ── Chrome ─────────────────────────────────────────────────────────── */

    public get Stages() {
        return BuildOrderStages(this.Status, this.RequiresFulfillment);
    }

    /**
     * Whether any line must ship — changes what the stepper says about Fulfilled.
     *
     * Read from the CATALOGUE, not from a priced line. It used to come off the
     * preview's projection, which meant the stepper could not say whether an order
     * shipped until a whole rolled-back booking had run. Whether a product is
     * physical is a property of the product; the order does not decide it.
     */
    public get RequiresFulfillment(): boolean {
        return this.Lines.some((line) => this.ProductFor(line)?.TypeName === 'Goods');
    }

    /** The line subtotal, BEFORE tax and charges. Null until the first pass returns. */
    public get Totals(): MJOEstimatedTotals | null {
        return this.Pricing.Result?.Totals ?? null;
    }

    /** True when at least one line has no resolvable price, so the subtotal is short. */
    public get HasUnpricedLines(): boolean {
        return this.Pricing.Result?.HasUnpricedLines === true;
    }

    /** The five tabs, with counts and the red-dot state. */
    public get Tabs(): MJOEditorTabDef[] {
        // Same rule as `Issues`: a confirmed order carries no "still missing" state, so the red
        // dots come off with the banner rather than leaving Parties flagged on a booked order.
        const sections = this.IsEditable ? (this.Order?.SectionsWithErrors() ?? []) : [];
        // Charges are decided inside the confirm transaction, so a draft has no count to show.
        const chargeCount = 0;
        return [
            { Key: 'lines', Label: 'Lines', Count: this.Order?.Lines.Count ?? 0, HasError: sections.includes('lines') },
            { Key: 'parties', Label: 'Parties', HasError: sections.includes('parties') },
            { Key: 'charges', Label: 'Charges & tax', Count: chargeCount || null, HasError: sections.includes('charges') },
            { Key: 'payment', Label: 'Payment', HasError: sections.includes('payment') },
            { Key: 'accounting', Label: 'Accounting' },
            // AFTER Accounting, in the order the consequences happen: the entries are written
            // inside the confirm, the subscription is decided from the line that caused it.
            { Key: 'journal', Label: 'Journal entries' },
            { Key: 'subscriptions', Label: 'Subscriptions' },
        ];
    }

    /**
     * The same five tabs, shaped for MJ's own tab component.
     *
     * WHY mj-tab-nav AND NOT accounting's mj-workspace-card. The workspace card
     * models OPEN DOCUMENTS — its strip closes, reorders and adds tabs, and it
     * carries a New button. These five are PANES OF ONE ORDER: you cannot close
     * Parties or add a sixth, so those affordances would be lies. It also lives in
     * accounting's transfer-pending/ folder, which is explicitly parked code owed
     * to another home, so depending on it now would buy a migration later.
     * mj-tab-nav is the shared, shipped component whose semantics actually match.
     *
     * The red dot becomes an error-variant badge. A bare dot is a signifier with
     * no meaning attached — only the aria-label said what it meant, so a sighted
     * user saw a dot and had to guess. "!" in the same badge slot the count uses
     * reads as attention-needed on sight, and severity is carried by colour rather
     * than by a second element competing with the count.
     */
    public get TabNav(): TabConfig[] {
        return this.Tabs.map((tab) => ({
            key: tab.Key,
            label: tab.Label,
            // A tab can need attention without having a count (Parties has no
            // number), so the badge falls back to "!" rather than rendering
            // nothing and losing the signal entirely.
            // A tab nobody can act on yet gets a muted marker rather than looking like a place
            // the user forgot to visit. MJ's TabConfig has no `disabled`, so this is the closest
            // honest signal available — the pane itself explains why (see the Accounting tab).
            badge: tab.Count ?? (tab.HasError ? '!' : this.IsTabInert(tab.Key) ? '—' : null),
            badgeVariant: tab.HasError ? ('error' as const) : ('default' as const),
        }));
    }

    /**
     * Load what only a SAVED order can have.
     *
     * Payments and dimension tags exist against persisted rows, so a draft that
     * has never been saved has neither — and asking for them with no id would be a
     * query guaranteed to return nothing. Both awaits settle before either is
     * assigned.
     */
    private async loadPersistedDetail(): Promise<void> {
        const orderID = this.Order?.ID ?? null;
        if (!orderID) {
            this.AppliedPayments = [];
            this.Dimensions = [];
            return;
        }
        // A draft line carries a CLIENT key, and the preview's projection carries
        // one too — neither is a database id, because a line has no id until it is
        // saved. Dimensions hang off the SAVED lines, so those are read first and
        // their ids are what the dimension query is given.
        const [payments, savedLines, rows] = await Promise.all([
            this.data.GetPaymentLinesForOrder(orderID),
            this.data.GetOrderLines(orderID),
            // THE ORDER'S OWN MONEY, READ BACK. Once an order is saved its total, amount paid,
            // balance and payment status are FACTS the engine computed and triggers maintain —
            // not something to re-derive here from client-side line pricing, which knows nothing
            // about charges or tax and would disagree the moment either exists.
            this.data.GetOrders({ OrderHeaderID: orderID, MaxRows: 1 }),
        ]);
        const dimensions = await this.data.GetLineDimensionsForOrder(
            savedLines.map((line) => String(line['ID'])),
        );
        this.AppliedPayments = payments;
        this.Dimensions = dimensions;
        this.Persisted = rows[0] ?? null;
        this.cdr.detectChanges();
    }

    /**
     * The saved order row, or null while this is a draft that has never been saved.
     *
     * The DIVIDING LINE of this screen. Before a save there is no order, so the only money
     * available is what `Orders.PreviewPrice` resolved per line — an estimate that excludes
     * charges and tax and says so. After a save the engine's own figures exist, and they are
     * authoritative; nothing here should be recomputing them.
     */
    public Persisted: MJOOrderRow | null = null;

    /** True once this order exists in the database, so its own money can be shown. */
    public get IsPersisted(): boolean {
        return this.Persisted !== null;
    }

    /**
     * The money strip's four values, persisted-first.
     *
     * These exist because the strip used to be bound to `[Paid]="0"` and
     * `[PaymentStatus]="Status === 'Draft' ? null : 'Unpaid'"` — LITERALS, not stale reads. So a
     * confirmed, fully-paid order reported "PAID — · BALANCE $560.00 · Unpaid" for ever, and no
     * amount of refreshing would have changed it. Verified against ORD-000122, which the database
     * had as Paid / AmountPaid 560 / Balance 0 while the screen said otherwise.
     *
     * A draft still shows the estimate — it has nothing else to show — but it is labelled as one
     * and, being a Draft, the strip hides Paid entirely.
     */
    public get DisplayTotal(): number | null {
        return this.Persisted ? Number(this.Persisted.TotalGross ?? 0) : (this.Totals?.NetTotal ?? null);
    }

    public get DisplayPaid(): number {
        // The header's rollup when it exists; otherwise the allocations, which is the same figure
        // reached the long way and is what a not-yet-rolled-up read can still answer.
        return this.Persisted ? Number(this.Persisted.AmountPaid ?? 0) : this.AppliedTotal;
    }

    public get DisplayBalance(): number | null {
        return this.Persisted ? Number(this.Persisted.Balance ?? 0) : (this.Totals?.NetTotal ?? null);
    }

    /**
     * Null while the order is a draft — an unsaved order has no payment state to report.
     *
     * Narrowed rather than cast. `MJOOrderRow.PaymentStatus` is a plain `string` off the view,
     * and the strip takes the union; a cast would compile and then render an unstyled chip for
     * any value the column grows later. Checking against the union means an unrecognised value
     * shows nothing at all, which is the honest outcome.
     */
    public get DisplayPaymentStatus(): MJOPaymentStatus | null {
        const status = this.Persisted?.PaymentStatus;
        const known: MJOPaymentStatus[] = ['Unpaid', 'PartiallyPaid', 'Paid', 'Overdue', 'WrittenOff'];
        return known.find((s) => s === status) ?? null;
    }

    /** What has actually reached this order, summed from its allocations. */
    public get AppliedTotal(): number {
        return Math.round(
            this.AppliedPayments.reduce((sum, line) => sum + Number(line['Amount'] ?? 0), 0) * 100,
        ) / 100;
    }

    /**
     * The line subtotal. NOT the order's gross — tax and charges are not known here.
     * Named for what it is so no caller mistakes it for the amount that will book.
     */
    public get EstimatedTotal(): number {
        return this.Pricing.Result?.Totals.NetTotal ?? 0;
    }

    public get BalanceDue(): number {
        return Math.round((this.EstimatedTotal - this.AppliedTotal) * 100) / 100;
    }

    protected dateOf(value: unknown): string {
        return value ? FormatDate(String(value), { Short: true }) : '—';
    }

    protected moneyOf(value: unknown): string {
        return FormatMoney(Number(value ?? 0));
    }

    /**
     * True when a tab has nothing to show and nothing to edit for this order yet.
     *
     * Accounting is derived entirely from a confirm: an unbooked order has no journal entries and
     * no dimensions to read, and nothing on that tab is authored by hand at any point.
     */
    public IsTabInert(key: MJOEditorTab): boolean {
        return key === 'accounting' && !this.JournalEntries.length;
    }

    /** Human name for a draft section, used in the to-do strip's tooltips. */
    public SectionLabel(section: string): string {
        return this.Tabs.find((t) => t.Key === section)?.Label ?? 'this order';
    }

    /**
     * Jump to whichever tab owns an outstanding item.
     *
     * `OrderEditorSection` includes `header`, which has no tab — those fields live in the identity
     * strip, which is always on screen. Navigating somewhere arbitrary for them would be worse
     * than staying put, so a header issue simply does not move you.
     */
    public GoToIssue(section: string): void {
        if (section === 'header') return;
        if (this.Tabs.some((t) => t.Key === section)) this.SelectTab(section as MJOEditorTab);
    }

    public SelectTab(tab: MJOEditorTab): void {
        this.ActiveTab = tab;
        // LOAD ON OPEN, not just on mount. `loadPersistedDetail` used to run only in `ngOnInit`,
        // and this editor is mounted ONCE and re-fed through `[Draft]` — opening an existing order
        // swaps the input without re-running the hook, so the consequence params stayed null and
        // both tabs claimed nothing was booked for orders that plainly had entries.
        //
        // Keyed on the ORDER, so it re-reads when you switch to a different one, and after a
        // confirm (which is when the entries first exist) rather than serving the pre-confirm
        // answer for the rest of the session.
        void this.loadConsequences();
    }

    /**
     * Read the current order's consequence params, once, on demand.
     *
     * ON DEMAND is the point: nothing needs refreshing from the five places an order can change,
     * because the answer is fetched the first time someone opens the tab for THAT order and is
     * then keyed to it. Switching workspace tabs needs no notification — the getters read a
     * different key.
     */
    private async loadConsequences(): Promise<void> {
        if (this.ActiveTab !== 'journal' && this.ActiveTab !== 'subscriptions') return;
        const orderID = this.currentOrderID;
        if (!orderID || this.consequences.has(orderID)) return;

        const lineIDs = (await this.data.GetOrderLines(orderID)).map((line) => String(line['ID']));
        const journal = this.data.JournalEntryViewParams(lineIDs);
        const subscriptions = this.data.SubscriptionViewParams(lineIDs);
        // Only a real answer is remembered — see `consequences`.
        if (journal || subscriptions) {
            this.consequences.set(orderID, { Journal: journal, Subscriptions: subscriptions });
        }
        this.cdr.detectChanges();
    }

    /**
     * Narrowing entry point for MJ's tab component, whose (TabChange) is a plain
     * string — it cannot know our union.
     *
     * Checked against the real tab list rather than cast. A cast would compile and
     * then quietly set ActiveTab to a key that matches no pane, leaving the editor
     * showing nothing with no error to explain it; this simply ignores a key that
     * is not ours, and the current tab stays put.
     */
    public SelectTabKey(key: string): void {
        const match = this.Tabs.find((tab) => tab.Key === key);
        if (match) this.SelectTab(match.Key);
    }

    /**
     * Always cancels a move to Confirmed and routes through the confirm action instead.
     * Booking is not undoable, and a stepper click is too easy a way to trigger it.
     */
    public OnBeforeStageChange(event: MJOStageChangeRequestEventArgs): void {
        if (event.To === 'Confirmed') {
            event.Cancel = true;
            event.CancelReason = 'Use Confirm — booking is not undoable.';
            this.ConfirmRequested.emit(this.Order);
        }
    }

    /* ── Lines ──────────────────────────────────────────────────────────── */

    public get Lines(): mjBizAppsOrdersOrderLineEntity[] {
        return [...(this.Order?.Lines.Items ?? [])];
    }

    public ProductFor(line: mjBizAppsOrdersOrderLineEntity): MJOProductOption | undefined {
        return this.Catalog.find((p) => p.ID === line.ProductID);
    }

    public PricedLine(line: mjBizAppsOrdersOrderLineEntity): MJOLinePrice | undefined {
        return this.Pricing.Result?.Lines?.find((l) => l.ClientKey === line.ID);
    }

    /** What one line's discount comes to, derived rather than reported. */
    public DiscountAmount(line: mjBizAppsOrdersOrderLineEntity): number | null {
        const priced = this.PricedLine(line);
        if (!priced || priced.ExtendedAmount === null || priced.NetAmount === null) return null;
        const discount = Math.round((priced.ExtendedAmount - priced.NetAmount) * 100) / 100;
        return discount > 0 ? discount : null;
    }

    public SetQuantity(line: mjBizAppsOrdersOrderLineEntity, raw: string): void {
        const n = Number.parseFloat(raw);
        line.Quantity = !Number.isFinite(n) || n === 0 ? 1 : n;
        this.onEdited();
    }

    /**
     * Typing a price is DIRECT ENTRY and wins over any resolved one. Clearing the
     * field restores resolution, which is why an empty string maps to `undefined`
     * rather than to zero.
     */
    public SetUnitPrice(line: mjBizAppsOrdersOrderLineEntity, raw: string): void {
        const trimmed = raw.trim();
        if (!trimmed) {
            // Clearing a stated price hands the line back to the engine to resolve.
            line.Set('UnitPrice', null);
            this.onEdited();
            return;
        }
        const n = Number.parseFloat(trimmed.replace(/[^0-9.\-]/g, ''));
        if (Number.isFinite(n) && n >= 0) {
            line.UnitPrice = n;
            this.onEdited();
        }
    }

    public Remove(line: mjBizAppsOrdersOrderLineEntity): void {
        if (this.OpenLine?.ID === line.ID) this.OpenLine = null;
        // Remove() tracks the removal so a persisted line is DELETED rather than orphaned, and
        // renumbers the survivors gap-free.
        this.Order.Lines.Remove(line);
        this.onEdited();
    }

    /* ── Adding a line ──────────────────────────────────────────────────────
     *
     * This screen could REMOVE a line and never ADD one, so the empty state
     * ("No lines yet. An order needs at least one line before it can confirm.")
     * was a dead end — it named the requirement and gave you no way to meet it.
     * Fast entry was the only way to put a line on an order, which is why the
     * full editor read as a viewer.
     *
     * The catalogue is already an `@Input`, so this is a local filter rather
     * than a query — no round trip, and it works the same for a new order and
     * an existing one.
     */

    /** What the user has typed into the add-product box. */
    public ProductQuery = '';

    /** True once the box has focus — the list opens on click, not on the second keystroke. */
    public ProductPickerOpen = false;

    /**
     * What the product list shows.
     *
     * OPENS ON FOCUS, showing the catalogue, and narrows as you type. Requiring two characters
     * first meant clicking the box did nothing at all, so there was no way to see what was for
     * sale without already knowing its name — fine for a desk that has the catalogue memorised,
     * useless for everyone else.
     *
     * ONE search over BOTH name and SKU, deliberately: an order taker reading off a purchase order
     * has a code, one working from a conversation has a name, and asking them to pick the right box
     * first is the kind of thing that makes people use the wrong one.
     *
     * `SKU ?? ''` is not defensive noise. Products in a freshly-migrated instance have a NULL SKU
     * (the code ends up in the name instead), and `null.toLowerCase()` throws — which would take
     * the whole picker down on the first keystroke rather than simply matching nothing.
     *
     * The cap is generous rather than tight because the list SCROLLS: it exists to stop a
     * pathological catalogue rendering thousands of DOM nodes, not to make the user type.
     */
    public get ProductMatches(): MJOProductOption[] {
        if (!this.ProductPickerOpen) return [];
        const q = this.ProductQuery.trim().toLowerCase();
        const pool = q
            ? this.Catalog.filter(
                  (p) => (p.Name ?? '').toLowerCase().includes(q) || (p.SKU ?? '').toLowerCase().includes(q),
              )
            : this.Catalog;
        return pool.slice(0, 50);
    }

    public OnProductFocus(): void {
        this.ProductPickerOpen = true;
    }

    /**
     * Typing reopens the picker.
     *
     * Escape closes the list but does NOT blur the box — so without this, carrying on typing
     * produced nothing and the field looked broken until you clicked away and back. Focus alone is
     * not enough of a trigger, because the element already had it.
     */
    public OnProductQueryChange(): void {
        this.ProductPickerOpen = true;
    }

    /**
     * True when the catalogue this picker filters was itself capped at the fetch.
     *
     * The section loads products with `MaxRows` (200 by default) and caches the result, so this
     * picker filters a SUBSET and cannot see past it. Saying so is the difference between "no such
     * product" and "not in the first 200" — the second is the one that wastes an afternoon.
     */
    public get CatalogTruncated(): boolean {
        return this.data.WasTruncated(MJO_ENTITIES.Product);
    }

    /**
     * Add the product as a line.
     *
     * Quantity 1 and NO unit price: leaving `UnitPrice` undefined is what lets the
     * pricing walk resolve it (`SetUnitPrice` documents the same rule from the
     * other direction). Seeding it with the catalogue's list price would look
     * helpful and would silently turn every line into a direct-entry price that
     * ignores the customer's price list.
     */
    public async AddProduct(option: MJOProductOption): Promise<void> {
        const line = await this.Order.Lines.Create();
        line.ProductID = option.ID;
        line.Quantity = 1;
        this.onEdited();
        this.ProductQuery = '';
        this.ProductPickerOpen = false;
        // The new line, the cleared box and the closed picker were all assigned AFTER an await, so
        // nothing repaints them on its own. Without this the product just typed appears to vanish.
        this.cdr.detectChanges();
    }

    /* ── Dismissing the pickers ─────────────────────────────────────────────
     *
     * A typeahead that only closes when you pick something is a trap: the list stays over the
     * table, and the only way out is to choose a product you did not want or to clear the box by
     * hand. Clicking away is what everyone tries first.
     */

    /**
     * Close any open picker when the click lands outside all of them.
     *
     * `pointerdown`, not `click`: the list is inside the same subtree, so a pointerdown that
     * started on an option is excluded by the `closest()` test below and the option's own click
     * still fires. Using blur instead would race the click and swallow the selection.
     */
    @HostListener('document:pointerdown', ['$event'])
    public OnDocumentPointerDown(event: Event): void {
        const target = event.target as HTMLElement | null;
        if (target?.closest('.ed-addline, .ed-party')) return;
        this.ClosePickers();
    }

    /** Escape closes the open picker without touching what is already on the order. */
    @HostListener('document:keydown.escape')
    public OnEscape(): void {
        this.ClosePickers();
    }

    /**
     * Clears the SEARCH state only — never a chosen product or party. Guarded so an ordinary click
     * anywhere on the page does not schedule a change-detection pass for nothing.
     */
    private ClosePickers(): void {
        const open =
            this.ProductQuery !== '' ||
            this.ProductPickerOpen ||
            this.PartyQuery.bill !== '' ||
            this.PartyQuery.ship !== '' ||
            this.PartyMatches.bill.length > 0 ||
            this.PartyMatches.ship.length > 0;
        if (!open) return;

        this.ProductQuery = '';
        this.ProductPickerOpen = false;
        this.PartyQuery = { bill: '', ship: '' };
        this.PartyMatches = { bill: [], ship: [] };
        this.cdr.detectChanges();
    }

    /* ── Parties ────────────────────────────────────────────────────────────
     *
     * The parties tab printed raw GUIDs through `mjo-stated-value` and had no
     * inputs at all, so an order's payer could not be set here — the one field
     * `OrderHeaderEntity.Validate()` requires before a confirm.
     */

    /** Search text per role, so bill-to and ship-to can be edited independently. */
    public PartyQuery: Record<MJOPartyRole, string> = { bill: '', ship: '' };
    public PartyMatches: Record<MJOPartyRole, MJOPartyMatch[]> = { bill: [], ship: [] };
    public PartySearching: MJOPartyRole | null = null;

    /**
     * Focusing a party box shows who we have billed most recently, before anything is typed.
     *
     * A desk bills the same handful of accounts over and over, so the last few orders predict the
     * next one better than an empty box does. `RecentCustomers` returns the same shape as
     * `SearchCustomers`, so one template renders both and selection behaves identically.
     */
    public async OnPartyFocus(role: MJOPartyRole): Promise<void> {
        if (this.PartyQuery[role].trim()) return; // already searching — do not overwrite the results
        this.PartySearching = role;
        try {
            this.PartyMatches[role] = await this.data.RecentCustomers();
        } finally {
            this.PartySearching = null;
            this.cdr.detectChanges();
        }
    }

    private partyTimer: ReturnType<typeof setTimeout> | null = null;

    /**
     * Search as they type, DEBOUNCED.
     *
     * This is bound to `ngModelChange`, so without the timer every keystroke is a server
     * round-trip — eight requests to spell "Northgate", each a LIKE scan, arriving out of order so
     * a slow early one can overwrite a fast late one. Fast entry already solved this the same way;
     * this had simply not learned it.
     */
    public SearchParty(role: MJOPartyRole): void {
        if (this.partyTimer) clearTimeout(this.partyTimer);
        const q = this.PartyQuery[role].trim();
        if (q.length < 2) {
            // Falling back to recents rather than to nothing: clearing the box should return you
            // to where focusing it started, not to an empty list.
            void this.OnPartyFocus(role);
            return;
        }
        this.partyTimer = setTimeout(async () => {
            this.PartySearching = role;
            try {
                this.PartyMatches[role] = await this.data.SearchCustomers(q);
            } finally {
                this.PartySearching = null;
                // Lands from a timer AND an awaited request, so nothing is watching this — it has
                // to tick explicitly or the results never paint.
                this.cdr.detectChanges();
            }
        }, 250);
    }

    /**
     * A customer is an organization OR a person, never both — the database says so
     * (`CK_*_Party`), so the picker sets one and clears the other rather than
     * leaving whichever was chosen first behind.
     */
    public ChooseParty(role: MJOPartyRole, match: MJOPartyMatch): void {
        const party = match.IsOrganization
            ? { OrganizationID: match.ID, PersonID: null }
            : { PersonID: match.ID, OrganizationID: null };
        this.applyParty(role, party);
        this.onEdited();
        this.PartyLabels[role] = match.Name;
        this.PartyQuery[role] = '';
        this.PartyMatches[role] = [];
    }

    public ClearParty(role: MJOPartyRole): void {
        const empty = { OrganizationID: null, PersonID: null };
        this.applyParty(role, null);
        this.onEdited();
        this.PartyLabels[role] = null;
    }

    /**
     * Display names for the chosen parties.
     *
     * Held here rather than read back from the draft because the draft stores IDs
     * only — showing a GUID is what the old read-only tab did, and it told the
     * user nothing.
     */
    public PartyLabels: Record<MJOPartyRole, string | null> = { bill: null, ship: null };

    public PartyIdFor(role: MJOPartyRole): string | null {
        const h = this.Order;
        if (!h) return null;
        return role === 'bill' ? (h.BillToOrganizationID ?? h.BillToPersonID ?? null) : (h.ShipToOrganizationID ?? h.ShipToPersonID ?? null);
    }

    /* ── Initial payment ────────────────────────────────────────────────────
     *
     * INTENT, not a payment. On confirm this becomes a real PaymentHeader in the same
     * transaction as the booking; until then it is two fields on the draft. The tab said as much
     * and then showed both of them read-only, so an order taken over the counter could not record
     * that it had been paid for.
     */

    /** True when there is a real choice to make — one company needs no picker. */
    public get HasCompanyChoice(): boolean {
        return this.IsEditable && this.Companies.length > 1;
    }

    /** The owning company's name, for the read-only case. */
    public get OwningCompanyName(): string {
        const id = this.Order?.CompanyID;
        return this.Companies.find((c) => c.ID === id)?.Name ?? '—';
    }

    /**
     * Change which company owns the order.
     *
     * Only meaningful while the order is a draft: the owning company anchors the document and the
     * ledger it books into, so moving it after confirm would rewrite history rather than edit a form.
     * `IsEditable` already gates the control.
     */
    public SetOwningCompany(companyID: string): void {
        if (!companyID) return;
        this.Order.CompanyID = companyID;
        this.onEdited();
    }

    /** The `PaymentType` row behind the chosen tender, or null for invoice-on-terms. */
    public get SelectedTenderType(): MJOTenderOption | null {
        const id = this.Order?.InitialPaymentTypeID;
        if (!id) return null;
        return this.Tenders.find((t) => t.ID === id) ?? null;
    }

    /** True when this tender cannot be captured without a check/wire/transfer number. */
    public get RequiresReference(): boolean {
        return this.SelectedTenderType?.RequiresReference === true;
    }

    /** The reference as typed. Read from the DRAFT, so it survives a tab switch or a remount. */
    public get Reference(): string {
        return this.InitialPaymentReference ?? '';
    }

    public SetReference(value: string): void {
        this.restateIntent({ Reference: value });
    }

    public SetTender(paymentTypeID: string): void {
        if (!paymentTypeID) {
            // Choosing the blank option means "invoice on terms" — clear the intent rather than
            // leaving an amount attached to no tender, which the server would reject.
            this.Order.InitialPaymentTypeID = null;
            this.Order.InitialPaymentAmount = 0;
            this.InitialPaymentReference = null;
            this.onEdited();
            return;
        }
        // Switching tender drops a reference typed for the previous one: a check number is not a
        // wire confirmation, and carrying it across would put the wrong id on the payment.
        this.restateIntent({ PaymentTypeID: paymentTypeID, Reference: '' });
    }

    /**
     * Re-state the WHOLE initial-payment intent with one part changed.
     *
     * `SetInitialPayment` deliberately takes the complete intent, so patching one field means
     * restating the others — and the two setters here used to omit the reference entirely, which
     * would have wiped a typed check number the moment the amount changed.
     */
    private restateIntent(patch: { PaymentTypeID?: string | null; Amount?: number; Reference?: string | null }): void {
        const paymentTypeID = patch.PaymentTypeID !== undefined ? patch.PaymentTypeID : (this.Order.InitialPaymentTypeID ?? null);
        const requiresReference = this.Tenders.find((t) => t.ID === paymentTypeID)?.RequiresReference === true;
        this.Order.InitialPaymentTypeID = paymentTypeID;
        this.Order.InitialPaymentAmount =
            patch.Amount !== undefined ? patch.Amount : (this.Order.InitialPaymentAmount ?? 0);
        this.InitialPaymentReference =
            patch.Reference !== undefined ? patch.Reference : (this.InitialPaymentReference ?? null);
        // Whether this tender needs a reference is a property of the TENDER, not of the order, so it
        // is not stored — it is looked up when the rule is evaluated. The draft carried a copy of it
        // that could go stale against the PaymentType row.
        this.RequiresPaymentReference = requiresReference;
        this.onEdited();
    }

    public SetInitialAmount(raw: string): void {
        const n = Number.parseFloat(raw.replace(/[^0-9.\-]/g, ''));
        this.restateIntent({ Amount: Number.isFinite(n) && n >= 0 ? n : 0 });
    }

    /**
     * Offer the balance as the obvious amount — the common case is paying in full.
     *
     * ⚠ It offers the NET subtotal, not the gross. See the same note in
     * `fast-entry.page.ts` (`applyTenderIntent`): `createInitialPayment` takes the
     * stated amount at face value and has no pay-in-full intent to settle against the
     * total it computes, and the client can no longer know that total. Harmless while
     * no charge or tax rule is configured; it UNDER-PAYS the moment one is. The fix is
     * an engine-side intent, and it is backlogged rather than guessed at here.
     */
    public PayInFull(): void {
        this.restateIntent({ Amount: this.Totals?.NetTotal ?? 0 });
    }

    /**
     * Order types, from the draft's own union rather than a list typed here — CodeGen widens that
     * union when the CHECK constraint gains a value, and a hand-copied list would not follow.
     */
    public readonly OrderTypes: ReadonlyArray<NonNullable<OrderHeaderEntity['OrderType']>> = [
        'Sale',
        'Return',
        'Cancellation',
        'Amendment',
        'AccountCredit',
    ];

    /** The "no tender" row. A real option meaning invoice on terms, not a placeholder. */
    public readonly TenderNone = { ID: '', Name: '— invoice on terms —' };

    public SetOrderType(value: string): void {
        this.Order.OrderType = value as OrderHeaderEntity['OrderType'];
        this.onEdited();
    }

    /**
     * `<input type="date">` will only accept `yyyy-MM-dd`. The draft stores whatever it was given —
     * often a full ISO timestamp from a loaded order — and handing that to the input makes the field
     * render EMPTY with no error, which reads as "this order has no date".
     */
    /**
     * True once pricing has RETURNED, so an empty price source means "there is no rule" rather
     * than "not yet". Drives the price badge's missing-rule state.
     *
     * Deliberately NOT `!!Pricing.Result` alone: a stale result from the previous keystroke is
     * present while the next pass is in flight, and treating that as settled would flash
     * "no price rule" at a line that is simply being recomputed.
     */
    public get PricingSettled(): boolean {
        return !this.Pricing.Loading && !!this.Pricing.Result;
    }

    public DateValue(raw: string | Date | null | undefined): string {
        if (!raw) return '';
        // `<input type="date">` accepts only yyyy-MM-dd. The entity hands back a real Date now
        // rather than whatever string the draft was given, so this normalises both: a Date is
        // formatted in LOCAL time, because toISOString() would shift a date-only value across the
        // day boundary for anyone west of UTC and silently show yesterday.
        if (raw instanceof Date) {
            const y = raw.getFullYear();
            const m = String(raw.getMonth() + 1).padStart(2, '0');
            const d = String(raw.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
        }
        return raw.length >= 10 ? raw.slice(0, 10) : raw;
    }

    /**
     * True when this header field is showing a DEFAULT the user has not confirmed — drives the
     * muted styling and the explanatory tooltip on the identity strip.
     *
     * Guarded on `Draft` because the editor renders before a draft is bound in the imperative path.
     */
    public IsDefault(field: 'OrderDate' | 'OrderType'): boolean {
        // A field the user has not touched. BaseEntity tracks this per field, so the draft's
        // parallel bookkeeping is unnecessary.
        return this.Order?.GetFieldByName(field)?.Dirty === false;
    }

    /** Free-text and date header fields, written straight through to the draft. */
    public SetHeaderField(
        field: 'Description' | 'Notes' | 'ExternalDocumentNumber' | 'RequestedDeliveryDate' | 'OrderDate' | 'DueDate',
        raw: string,
    ): void {
        const value = raw.trim();
        this.Order.Set(field, value || null);
        this.onEdited();
    }

    /*
     * No re-pricing call here on purpose. `ngOnInit` subscribes to the draft, and every mutator
     * above calls `onEdited()`, which reprices — so an explicit
     * SchedulePricing in each mutator would be a second debounce for the same change and would
     * quietly suggest the subscription is not doing its job.
     */

    public Open(line: mjBizAppsOrdersOrderLineEntity): void {
        this.OpenLine = line;
        this.LineOpened.emit(line);
    }

    public CloseDrawer(): void {
        this.OpenLine = null;
    }

    /* ── Totals ladder (Lines tab) ──────────────────────────────────────── */

    /**
     * The decomposition ladder, as far as the browser can honestly go.
     *
     * It stops at the net subtotal, and SAYS it stops there. Charges and tax used to
     * appear here because the rolled-back preview had run the engine's whole walk;
     * without that run they are unknown, and an unknown rendered as `$0.00` on the
     * screen that tells someone what they are committing to is the exact defect this
     * ladder was built to prevent. A missing row is honest; a zero is not.
     */
    public get LadderRows(): MJOLadderRow[] {
        const t = this.Totals;
        if (!t) return [];
        const rows: MJOLadderRow[] = [{ Label: 'Subtotal at list', Amount: t.ListSubtotal }];
        if (t.DiscountTotal > 0) {
            rows.push({ Label: 'Discounts', Amount: t.DiscountTotal, IsSub: true, IsCredit: true });
        }
        rows.push({
            Label: 'Net before tax & charges',
            Amount: t.NetTotal,
            IsTotal: true,
            Why:
                'Charges, tax and promotions are decided when the order is confirmed, inside the same ' +
                'transaction that books it. They are not shown here because they are not known here — ' +
                'the confirmed order is what states the final amount.',
        });
        return rows;
    }

    /* ── Actions ────────────────────────────────────────────────────────── */

    public get IsEditable(): boolean {
        // Edit gating rides the status. After confirming, corrections are reversing
        // orders — so the fields lock and the verbs change rather than a Save
        // sitting there greyed out with no explanation.
        return this.Status === 'Draft' || this.Status === 'Quoted';
    }

    /**
     * NOT GATED ON A PRICE. It used to require a returned preview, so a failed or
     * still-running preview left a completed order permanently unconfirmable with a
     * dead button and no reason on it. The engine decides whether an order can be
     * confirmed; this checks only what the client can know for itself.
     */
    public get CanConfirm(): boolean {
        return this.IsEditable && this.Order?.Validate().Success === true;
    }

    /** Errors worth surfacing above the tabs, so a red dot is never the only clue. */
    public get Issues() {
        // ONLY WHILE THE ORDER CAN STILL BE CONFIRMED. `Validate()` answers "could this be
        // confirmed as it stands", which is a question with no meaning once it HAS been — a
        // confirmed order was showing "1 thing to sort out before this can confirm", and a red dot
        // on Parties, for an order already booked to the ledger. That reads as "something is wrong
        // with this order" when nothing is.
        if (!this.IsEditable) return [];
        return (this.Order?.Validate().Errors ?? []).map((e) => ({
            Code: e.Source ?? 'INVALID',
            Section: OrderHeaderEntity.SectionForField(e.Source),
            Severity: 'error' as const,
            Message: e.Message,
        }));
    }

    public async SaveDraft(): Promise<void> {
        await this.orders.Save(this.Order);
        this.Saved.emit(this.Order);
    }

    public RequestConfirm(): void {
        if (!this.CanConfirm) return;
        this.ConfirmRequested.emit(this.Order);
    }

    /**
     * Called by every setter on this page after it mutates the order.
     *
     * Reprices (debounced) and repaints. Both matter on a zoneless, imperatively-created page: the
     * pricing callback lands from a timer and an awaited round trip, so assigning alone paints
     * nothing and the strip stays on "— resolving…" while CanConfirm never turns true.
     */
    private onEdited(): void {
        this.orders.SchedulePricing(this.Order, (state) => {
            this.Pricing = state;
            this.cdr.detectChanges();
        });
        this.cdr.detectChanges();
    }

    /** Apply a chosen party to the bill-to or ship-to side. Null clears it. */
    private applyParty(role: 'bill' | 'ship', party: { PersonID?: string | null; OrganizationID?: string | null; AddressID?: string | null } | null): void {
        if (role === 'bill') {
            this.Order.BillToPersonID = party?.PersonID ?? null;
            this.Order.BillToOrganizationID = party?.OrganizationID ?? null;
        } else {
            this.Order.ShipToPersonID = party?.PersonID ?? null;
            this.Order.ShipToOrganizationID = party?.OrganizationID ?? null;
            this.Order.ShipToAddressID = party?.AddressID ?? null;
        }
    }


    /** Whether the user typed this line's price rather than the engine resolving one. */
    public PriceStated(line: mjBizAppsOrdersOrderLineEntity): boolean {
        return line.GetFieldByName('UnitPrice')?.Dirty === true;
    }

    /** Promotion codes presented but not yet saved — screen state, held by the entry service. */
    public get PromotionCodes(): string[] {
        return this.orders.PromotionCodes;
    }

}
