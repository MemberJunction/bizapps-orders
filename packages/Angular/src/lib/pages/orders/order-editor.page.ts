import {
    ChangeDetectorRef,
    Component,
    EventEmitter,
    HostListener,
    Input,
    OnDestroy,
    OnInit,
    Output,
    inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
    OrderDraft,
    type OrderDraftHeaderPayload,
    type OrderDraftLine,
    type OrdersPreviewOrderOutput,
} from '@mj-biz-apps/orders-entities';

import { MJO_ENTITIES, MJOOrdersDataService } from '../../services/orders-data.service';
import { MJOOrderEntryService, type MJOPreviewState } from '../../services/order-entry.service';
import { MJOMoneyStripComponent } from '../../panels/money-strip.component';
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
import { MJAlertComponent, MJButtonDirective, MJTabNavComponent, type TabConfig } from '@memberjunction/ng-ui-components';

/** Which tab is showing. */
export type MJOEditorTab = 'lines' | 'parties' | 'charges' | 'payment' | 'accounting';

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
 * explanation. The validation comes from `OrderDraft.SectionsWithErrors`, so the
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
 *   [Draft]="draft"
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
    imports: [MJAlertComponent, MJButtonDirective, MJTabNavComponent,
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
export class MJOOrderEditorPageComponent implements OnInit, OnDestroy {
    private readonly orders = inject(MJOOrderEntryService);
    private readonly data = inject(MJOOrdersDataService);
    // Required: this page is created imperatively and runs zoneless, so every assignment that
    // lands after an await or from a preview callback has to tick explicitly.
    private readonly cdr = inject(ChangeDetectorRef);

    /**
     * The order being edited. Supplied by the host — often the SAME instance fast
     * entry was working on, which is what makes escalation lossless.
     */
    @Input() Draft!: OrderDraft;

    /** Catalog for the product column and the add-line picker. */
    @Input() Catalog: MJOProductOption[] = [];

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
    @Output() ConfirmRequested = new EventEmitter<OrderDraft>();

    /** The draft was saved. */
    @Output() Saved = new EventEmitter<OrderDraft>();

    /** A line was opened. The host may show it in a slide-in instead of the built-in drawer. */
    @Output() LineOpened = new EventEmitter<OrderDraftLine>();

    /** An entry's Accounting link was followed. */
    @Output() OpenInAccounting = new EventEmitter<MJOJournalEntry>();

    /** Allocation lines that have landed on this order. */
    public AppliedPayments: Array<Record<string, unknown>> = [];

    /** Dimension tags across this order's lines. */
    public Dimensions: Array<Record<string, unknown>> = [];

    /** Active tab. */
    public ActiveTab: MJOEditorTab = 'lines';

    /** Latest preview. */
    public Preview: MJOPreviewState = { Result: null, Loading: false, Error: null };

    /** The line whose drawer is open, or null. */
    public OpenLine: OrderDraftLine | null = null;

    private stopWatching: (() => void) | null = null;

    public ngOnInit(): void {
        // Tolerate a host that forgot to supply one rather than throwing: a blank
        // editor is recoverable, a crashed tab is not.
        if (!this.Draft) this.Draft = new OrderDraft({ CompanyID: '' });

        // Both callbacks MUST tick — they land from a debounced timer and an awaited network
        // round-trip, outside anything Angular is watching on an imperatively-created, zoneless
        // page. Assigning alone repaints nothing, so the decomposition stays on "— resolving…"
        // and CanConfirm never turns true. Same defect as fast-entry.page.ts.
        this.stopWatching = this.Draft.Subscribe(() => {
            this.orders.SchedulePreview(this.Draft, (state) => {
                this.Preview = state;
                this.cdr.detectChanges();
            });
        });
        void this.orders.PreviewNow(this.Draft, (state) => {
            this.Preview = state;
            this.cdr.detectChanges();
        });

        // Payments and dimension tags exist only against a SAVED order, so this
        // resolves to empty for a fresh draft rather than querying for nothing.
        void this.loadPersistedDetail();
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

    /** Whether any line must ship — changes what the stepper says about Fulfilled. */
    public get RequiresFulfillment(): boolean {
        return (this.Preview.Result?.Lines ?? []).some((l) => l.RequiresFulfillment);
    }

    public get Totals(): OrdersPreviewOrderOutput['Totals'] | null {
        return this.Preview.Result?.Totals ?? null;
    }

    /** The five tabs, with counts and the red-dot state. */
    public get Tabs(): MJOEditorTabDef[] {
        // Same rule as `Issues`: a confirmed order carries no "still missing" state, so the red
        // dots come off with the banner rather than leaving Parties flagged on a booked order.
        const sections = this.IsEditable ? (this.Draft?.SectionsWithErrors ?? []) : [];
        const chargeCount = this.Preview.Result?.Charges?.length ?? 0;
        return [
            { Key: 'lines', Label: 'Lines', Count: this.Draft?.LineCount ?? 0, HasError: sections.includes('lines') },
            { Key: 'parties', Label: 'Parties', HasError: sections.includes('parties') },
            { Key: 'charges', Label: 'Charges & tax', Count: chargeCount || null, HasError: sections.includes('charges') },
            { Key: 'payment', Label: 'Payment', HasError: sections.includes('payment') },
            { Key: 'accounting', Label: 'Accounting' },
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
        const orderID = this.Draft?.Header?.OrderHeaderID ?? null;
        if (!orderID) {
            this.AppliedPayments = [];
            this.Dimensions = [];
            return;
        }
        // A draft line carries a CLIENT key, and the preview's projection carries
        // one too — neither is a database id, because a line has no id until it is
        // saved. Dimensions hang off the SAVED lines, so those are read first and
        // their ids are what the dimension query is given.
        const [payments, savedLines] = await Promise.all([
            this.data.GetPaymentLinesForOrder(orderID),
            this.data.GetOrderLines(orderID),
        ]);
        const dimensions = await this.data.GetLineDimensionsForOrder(
            savedLines.map((line) => String(line['ID'])),
        );
        this.AppliedPayments = payments;
        this.Dimensions = dimensions;
        this.cdr.detectChanges();
    }

    /** What has actually reached this order, summed from its allocations. */
    public get AppliedTotal(): number {
        return Math.round(
            this.AppliedPayments.reduce((sum, line) => sum + Number(line['Amount'] ?? 0), 0) * 100,
        ) / 100;
    }

    public get GrossTotal(): number {
        return this.Preview.Result?.Totals.GrossTotal ?? 0;
    }

    public get BalanceDue(): number {
        return Math.round((this.GrossTotal - this.AppliedTotal) * 100) / 100;
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

    public SelectTab(tab: MJOEditorTab): void {
        this.ActiveTab = tab;
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
     * Always cancels a move to Confirmed so the pre-flight runs first. Booking is
     * not undoable, and a stepper click is too easy a way to trigger it.
     */
    public OnBeforeStageChange(event: MJOStageChangeRequestEventArgs): void {
        if (event.To === 'Confirmed') {
            event.Cancel = true;
            event.CancelReason = 'Pre-flight review runs first.';
            this.ConfirmRequested.emit(this.Draft);
        }
    }

    /* ── Lines ──────────────────────────────────────────────────────────── */

    public get Lines(): OrderDraftLine[] {
        return this.Draft?.Lines ?? [];
    }

    public ProductFor(line: OrderDraftLine): MJOProductOption | undefined {
        return this.Catalog.find((p) => p.ID === line.ProductID);
    }

    public PricedLine(line: OrderDraftLine): OrdersPreviewOrderOutput['Lines'][number] | undefined {
        return this.Preview.Result?.Lines?.find((l) => l.ClientKey === line.ClientKey);
    }

    public SetQuantity(line: OrderDraftLine, raw: string): void {
        const n = Number.parseFloat(raw);
        this.Draft.UpdateLine(line.ClientKey, { Quantity: !Number.isFinite(n) || n === 0 ? 1 : n });
    }

    /**
     * Typing a price is DIRECT ENTRY and wins over any resolved one. Clearing the
     * field restores resolution, which is why an empty string maps to `undefined`
     * rather than to zero.
     */
    public SetUnitPrice(line: OrderDraftLine, raw: string): void {
        const trimmed = raw.trim();
        if (!trimmed) {
            this.Draft.UpdateLine(line.ClientKey, { UnitPrice: undefined });
            return;
        }
        const n = Number.parseFloat(trimmed.replace(/[^0-9.\-]/g, ''));
        if (Number.isFinite(n) && n >= 0) this.Draft.UpdateLine(line.ClientKey, { UnitPrice: n });
    }

    public Remove(line: OrderDraftLine): void {
        if (this.OpenLine?.ClientKey === line.ClientKey) this.OpenLine = null;
        this.Draft.RemoveLine(line.ClientKey);
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
    public AddProduct(option: MJOProductOption): void {
        this.Draft.AddLine({ ProductID: option.ID, Quantity: 1 });
        this.ProductQuery = '';
        this.ProductPickerOpen = false;
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
     * `OrderDraft.Validate()` requires before a confirm.
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
        if (role === 'bill') this.Draft.SetBillTo(party);
        else this.Draft.SetShipTo(party);
        this.PartyLabels[role] = match.Name;
        this.PartyQuery[role] = '';
        this.PartyMatches[role] = [];
    }

    public ClearParty(role: MJOPartyRole): void {
        const empty = { OrganizationID: null, PersonID: null };
        if (role === 'bill') this.Draft.SetBillTo(empty);
        else this.Draft.SetShipTo(empty);
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
        const h = this.Draft?.Header;
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

    public SetTender(paymentTypeID: string): void {
        if (!paymentTypeID) {
            // Choosing the blank option means "invoice on terms" — clear the intent rather than
            // leaving an amount attached to no tender, which the server would reject.
            this.Draft.ClearInitialPayment();
            return;
        }
        this.Draft.SetInitialPayment({ PaymentTypeID: paymentTypeID, Amount: this.Draft.Header.InitialPaymentAmount ?? 0 });
    }

    public SetInitialAmount(raw: string): void {
        const n = Number.parseFloat(raw.replace(/[^0-9.\-]/g, ''));
        this.Draft.SetInitialPayment({
            PaymentTypeID: this.Draft.Header.InitialPaymentTypeID ?? null,
            Amount: Number.isFinite(n) && n >= 0 ? n : 0,
        });
    }

    /** Offer the balance as the obvious amount — the common case is paying in full. */
    public PayInFull(): void {
        this.Draft.SetInitialPayment({
            PaymentTypeID: this.Draft.Header.InitialPaymentTypeID ?? null,
            Amount: this.Totals?.GrossTotal ?? 0,
        });
    }

    /**
     * Order types, from the draft's own union rather than a list typed here — CodeGen widens that
     * union when the CHECK constraint gains a value, and a hand-copied list would not follow.
     */
    public readonly OrderTypes: ReadonlyArray<NonNullable<OrderDraftHeaderPayload['OrderType']>> = [
        'Sale',
        'Return',
        'Cancellation',
        'Amendment',
        'AccountCredit',
    ];

    public SetOrderType(value: string): void {
        this.Draft.SetHeader({ OrderType: value as OrderDraftHeaderPayload['OrderType'] });
    }

    /**
     * `<input type="date">` will only accept `yyyy-MM-dd`. The draft stores whatever it was given —
     * often a full ISO timestamp from a loaded order — and handing that to the input makes the field
     * render EMPTY with no error, which reads as "this order has no date".
     */
    public DateValue(raw: string | null | undefined): string {
        if (!raw) return '';
        return raw.length >= 10 ? raw.slice(0, 10) : raw;
    }

    /** Free-text and date header fields, written straight through to the draft. */
    public SetHeaderField(
        field: 'Description' | 'Notes' | 'ExternalDocumentNumber' | 'RequestedDeliveryDate' | 'OrderDate' | 'DueDate',
        raw: string,
    ): void {
        const value = raw.trim();
        this.Draft.SetHeader({ [field]: value || null } as Partial<Parameters<OrderDraft['SetHeader']>[0]>);
    }

    /*
     * No re-preview call here on purpose. `ngOnInit` subscribes to the draft, and every mutator
     * above goes through `OrderDraft`, which notifies — so pricing re-runs by itself. An explicit
     * SchedulePreview in each mutator would be a second debounce for the same change and would
     * quietly suggest the subscription is not doing its job.
     */

    public Open(line: OrderDraftLine): void {
        this.OpenLine = line;
        this.LineOpened.emit(line);
    }

    public CloseDrawer(): void {
        this.OpenLine = null;
    }

    /* ── Charges & tax ──────────────────────────────────────────────────── */

    public get Charges() {
        return this.Preview.Result?.Charges ?? [];
    }

    public get TaxableBase() {
        return this.Preview.Result?.Totals.TaxableBase ?? null;
    }

    /** Lines with their tax outcome, for the "why did this tax" panel. */
    public get TaxExplanations(): OrdersPreviewOrderOutput['Lines'] {
        return this.Preview.Result?.Lines ?? [];
    }

    /* ── Totals ladder (Lines tab) ──────────────────────────────────────── */

    public get LadderRows(): MJOLadderRow[] {
        const t = this.Totals;
        if (!t) return [];
        const rows: MJOLadderRow[] = [{ Label: 'Subtotal at list', Amount: t.ListSubtotal }];
        if (t.DiscountTotal > 0) {
            rows.push({ Label: 'Discounts', Amount: t.DiscountTotal, IsSub: true, IsCredit: true });
            rows.push({ Label: '<b>Net after discounts</b>', Amount: t.NetTotal });
        }
        if (t.ChargeTotal) rows.push({ Label: 'Charges', Amount: t.ChargeTotal });
        if (t.TaxTotal) {
            rows.push({
                Label: 'Tax',
                Amount: t.TaxTotal,
                Detail: `on ${FormatMoney(t.TaxableBase.Base)}`,
                Why:
                    'Every layer computes on the same base — a non-tax charge enlarges it, a tax charge does not. ' +
                    'That is what "tax layers never compound" means.',
            });
        }
        rows.push({ Label: 'Total', Amount: t.GrossTotal, IsTotal: true });
        return rows;
    }

    /* ── Actions ────────────────────────────────────────────────────────── */

    public get IsEditable(): boolean {
        // Edit gating rides the status. After confirming, corrections are reversing
        // orders — so the fields lock and the verbs change rather than a Save
        // sitting there greyed out with no explanation.
        return this.Status === 'Draft' || this.Status === 'Quoted';
    }

    public get CanConfirm(): boolean {
        return this.IsEditable && this.Draft?.Validate().IsValid === true && !!this.Preview.Result;
    }

    /** Errors worth surfacing above the tabs, so a red dot is never the only clue. */
    public get Issues() {
        // ONLY WHILE THE ORDER CAN STILL BE CONFIRMED. `Validate()` answers "could this be
        // confirmed as it stands", which is a question with no meaning once it HAS been — a
        // confirmed order was showing "1 thing to sort out before this can confirm", and a red dot
        // on Parties, for an order already booked to the ledger. That reads as "something is wrong
        // with this order" when nothing is.
        if (!this.IsEditable) return [];
        return this.Draft?.Validate().Issues ?? [];
    }

    public async SaveDraft(): Promise<void> {
        const saved = await this.orders.Save(this.Draft);
        if (saved) this.Saved.emit(this.Draft);
    }

    public RequestConfirm(): void {
        if (!this.CanConfirm) return;
        this.ConfirmRequested.emit(this.Draft);
    }
}
