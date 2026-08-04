import {
    ChangeDetectorRef,
    Component,
    EventEmitter,
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
    type OrderDraftLine,
    type OrdersPreviewOrderOutput,
} from '@mj-biz-apps/orders-entities';

import { MJOOrdersDataService } from '../../services/orders-data.service';
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
        const sections = this.Draft?.SectionsWithErrors ?? [];
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
            badge: tab.Count ?? (tab.HasError ? '!' : null),
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
