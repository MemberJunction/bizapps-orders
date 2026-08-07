import { ChangeDetectorRef, Component, EventEmitter, HostListener, Input, OnDestroy, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
    OrderDraft,
    type OrderDraftLine,
    type OrdersPreviewOrderOutput,
} from '@mj-biz-apps/orders-entities';

import { ReadableSaveError } from '../../services/save-error';
import { MJOOrdersDataService } from '../../services/orders-data.service';
import { MJOOrderEntryService, type MJOPreviewState } from '../../services/order-entry.service';
import { MJODecompositionLadderComponent, type MJOLadderRow } from '../../panels/decomposition-ladder.component';
import { MJOConsequenceChipComponent, MJOPriceSourceBadgeComponent } from '../../panels/chips.component';
import { MJOMoneyPipe, FormatMoney, Initials } from '../../panels/money-format';
import { MJAlertComponent, MJButtonDirective } from '@memberjunction/ng-ui-components';
import type { MJOTenderOption } from '../payments/payment-entry.page';

/** A catalog row as the product picker shows it. */
export interface MJOProductOption {
    ID: string;
    Name: string;
    SKU: string;
    TypeName: string;
    CompanyName: string;
    ListPrice: number;
    Taxable: boolean;
}

/** The customer, and what an order taker needs to know before quoting. */
export interface MJOCustomerContext {
    DisplayName: string;
    OrganizationName?: string | null;
    Email?: string | null;
    Terms?: string | null;
    /** What they already owe. */
    OpenBalance: number;
    /** Spendable credit — a negative order balance, not a separate instrument. */
    AvailableCredit: number;
    /** How many of their open orders are past due. */
    OverdueCount: number;
    /** Why the organization is what it is, when it was inferred rather than stated. */
    OrganizationProvenance?: string | null;
}

/**
 * `mjo-fast-entry-page` — the 80% order, in one column.
 *
 * The fast lane. One customer, a few products, one tender, keyboard-completable.
 * Escalating to the full editor hands over the SAME `OrderDraft` instance rather
 * than a copy, which is what makes "open in full editor" lose nothing.
 *
 * THE DECOMPOSITION RAIL IS THE POINT. Every figure in it comes from
 * `Orders.PreviewOrder` — the engine's own arithmetic, run as a real save inside
 * a rolled-back transaction — and it dims the instant the draft changes, so stale
 * money is never presented as current. Nothing on this screen computes a price.
 *
 * ## Example
 *
 * ```html
 * <mjo-fast-entry-page
 *   [CompanyID]="companyID"
 *   [Customer]="customer"
 *   [Catalog]="products"
 *   (ConfirmRequested)="openPreflight($event)" />
 * ```
 */
@Component({
    selector: 'mjo-fast-entry-page',
    standalone: true,
    imports: [MJAlertComponent, MJButtonDirective, 
        CommonModule,
        FormsModule,
        MJODecompositionLadderComponent,
        MJOConsequenceChipComponent,
        MJOPriceSourceBadgeComponent,
        MJOMoneyPipe,
    ],
    templateUrl: './fast-entry.page.html',
    styleUrls: ['./fast-entry.page.css'],
})
export class MJOFastEntryPageComponent implements OnInit, OnDestroy {
    private readonly orders = inject(MJOOrderEntryService);
    private readonly data = inject(MJOOrdersDataService);
    private readonly cdr = inject(ChangeDetectorRef);

    /** Owning company for the draft. */
    @Input() CompanyID = '';

    /** Who the order is for. Null until a customer is chosen. */
    @Input() Customer: MJOCustomerContext | null = null;

    /** What the product picker searches. */
    @Input() Catalog: MJOProductOption[] = [];

    /**
     * The instance's payment types, so a tender tile maps to a REAL `PaymentType` row.
     *
     * Supplied by the section, which already loads and caches them. Without this, `SelectTender`
     * could set an amount but never a type — and `createInitialPayment` opens with
     * `if (!this.InitialPaymentTypeID || amount <= 0) return;`, so the order confirmed and the
     * payment was silently dropped. The customer paid and the order said Unpaid.
     */
    @Input() Tenders: MJOTenderOption[] = [];

    /**
     * The user asked to confirm. The page deliberately does NOT confirm itself:
     * the pre-flight review goes in front of it, because confirming books journal
     * entries and cannot be undone. The host owns that dialog.
     */
    @Output() ConfirmRequested = new EventEmitter<OrderDraft>();

    /** The draft was saved. Carries the draft so the host can update a tab title. */
    @Output() Saved = new EventEmitter<OrderDraft>();

    /** The user asked to continue in the full editor — same instance, nothing copied. */
    @Output() EscalateRequested = new EventEmitter<OrderDraft>();

    /** The draft. Public so the host can hand it to the full editor unchanged. */
    public Draft!: OrderDraft;

    /** Latest preview state — result, in-flight flag and error. */
    public Preview: MJOPreviewState = { Result: null, Loading: false, Error: null };

    /** Product search text. */
    public ProductQuery = '';

    /** Highlighted row in the picker, for keyboard selection. */
    public PickerCursor = 0;

    /** Whether the picker list is showing. */
    public PickerOpen = false;

    /** Promotion code being typed. */
    public CodeEntry = '';

    /** Which tender the customer said they would use. */
    public Tender: 'terms' | 'onfile' | 'newcard' | 'check' | 'credit' = 'terms';

    private stopWatching: (() => void) | null = null;

    /**
     * The order that was just booked, so the screen can say so after it clears.
     *
     * Cleared the moment the next order is touched — a stale "booked ORD-123" hanging over a
     * half-typed new order is worse than no message at all.
     */
    public JustBooked: string | null = null;

    /**
     * Empty the screen for the NEXT order.
     *
     * This lane is a queue of orders, not one form: an order taker who has just booked something is
     * about to take another, and leaving the previous customer and lines on screen means the next
     * order starts as an edit of the last one. Which is also how a line gets billed twice.
     *
     * Called by the section after a successful confirm, and by "New order" in the header.
     */
    public Reset(orderNumber?: string | null): void {
        this.stopWatching?.();
        this.orders.CancelPending();

        this.Customer = null;
        this.CustomerQuery = '';
        this.CustomerResults = [];
        this.ProductQuery = '';
        this.PickerOpen = false;
        this.CodeEntry = '';
        this.Tender = 'terms';
        this.Reference = '';
        this.SaveError = null;
        this.Preview = { Result: null, Loading: false, Error: null };
        this.JustBooked = orderNumber ?? null;

        this.startDraft();
        this.cdr.detectChanges();
        // Straight back to the first thing they will type.
        setTimeout(() => document.getElementById('mjo-customer-search')?.focus(), 0);
    }

    public ngOnInit(): void {
        this.startDraft();
    }

    /** Build a fresh draft and re-subscribe the preview. Shared by init and {@link Reset}. */
    private startDraft(): void {
        this.Draft = new OrderDraft({ CompanyID: this.CompanyID, OriginChannel: 'Staff' });
        // Every mutation reschedules the preview. The service owns the debounce and
        // the out-of-order guard, so this stays a one-liner.
        this.stopWatching = this.Draft.Subscribe(() => {
            // Changing anything retires the last save failure. It described a draft
            // that no longer exists, and leaving it up means an error about the old
            // state sits over the new one until the user saves again — which is
            // exactly when they least want to be reading stale bad news.
            this.SaveError = null;
            // Touching the next order retires the last one's confirmation. A stale "booked ORD-123"
            // sitting over a half-typed new order invites the reader to think THIS one is booked.
            this.JustBooked = null;
            this.orders.SchedulePreview(this.Draft, (state) => {
                this.Preview = state;
                // MUST tick. This callback fires from a debounced timer + an awaited network
                // round-trip, so it is outside anything Angular is watching: the page is created
                // imperatively via ViewContainerRef.createComponent and runs zoneless, which means
                // an assignment alone repaints nothing. Without this the preview lands, the line
                // stays on "— resolving…" forever, and CanConfirm never turns true because it
                // requires Preview.Result — a completed order that cannot be confirmed.
                this.cdr.detectChanges();
            });
        });
    }

    public ngOnDestroy(): void {
        this.stopWatching?.();
        this.orders.CancelPending();
    }

    /** Avatar initials for the customer card. */
    public get CustomerInitials(): string {
        return Initials(this.Customer?.OrganizationName ?? this.Customer?.DisplayName ?? null);
    }

    /**
     * The tender choices, in the order an order taker reaches for them.
     *
     * Invoicing on terms leads because it is the default for an established
     * customer; account credit is last and disabled when there is none, rather
     * than hidden — a customer asking "can I use my credit?" should see the answer
     * rather than an absence.
     */
    public readonly TenderOptions: ReadonlyArray<{
        Key: 'terms' | 'onfile' | 'newcard' | 'check' | 'credit';
        Label: string;
        Icon: string;
        Hint: string;
    }> = [
        { Key: 'terms', Label: 'Invoice', Icon: 'fa-solid fa-file-invoice', Hint: 'On the customer\'s terms' },
        { Key: 'onfile', Label: 'Card on file', Icon: 'fa-solid fa-credit-card', Hint: 'Saved payment method' },
        { Key: 'newcard', Label: 'New card', Icon: 'fa-solid fa-credit-card', Hint: 'Hosted tokenization' },
        { Key: 'check', Label: 'Check', Icon: 'fa-solid fa-money-check', Hint: 'Reference required' },
        { Key: 'credit', Label: 'Account credit', Icon: 'fa-solid fa-piggy-bank', Hint: 'Spend existing credit' },
    ];

    /* ── Product picker ─────────────────────────────────────────────────── */

    /* ── Customer search ────────────────────────────────────────────────── */

    public CustomerQuery = '';
    public CustomerSearching = false;
    public CustomerResults: Array<{ ID: string; Name: string; IsOrganization: boolean; Email: string | null }> = [];
    private customerTimer: ReturnType<typeof setTimeout> | null = null;

    /**
     * Search as they type, debounced.
     *
     * The customer field was a placeholder with no bindings at all — the screen
     * looked complete and could not start an order, because nothing could ever be
     * chosen. The order draft needs a bill-to before it can price anything.
     */
    /** True while the list is showing recents rather than search hits. */
    public ShowingRecents = false;

    /**
     * Offer the recently-billed customers the moment the field is focused.
     *
     * Search-only meant an empty box taught you nothing: you had to already know a
     * name, and on seeded data you had to guess one. Showing the last few accounts
     * on focus turns the commonest case — the customer billed an hour ago — into
     * one click, and makes the field self-explanatory for anyone who has never
     * seen it. Typing still searches; these only fill the empty state.
     */
    public async OnCustomerFocus(): Promise<void> {
        if (this.CustomerQuery.trim().length >= 2 || this.CustomerResults.length) return;
        const recents = await this.data.RecentCustomers();
        // Assign only AFTER the await, never across it — an assignment that
        // straddles the boundary produces an NG0100 that aborts the DOM write and
        // freezes the view on its pre-load render.
        if (this.CustomerQuery.trim().length >= 2) return;
        this.ShowingRecents = true;
        this.CustomerResults = recents;
        this.cdr.detectChanges();
    }

    public OnCustomerQuery(): void {
        if (this.customerTimer) clearTimeout(this.customerTimer);
        const query = this.CustomerQuery;
        if (query.trim().length < 2) {
            // Falling back below the search threshold returns to the recents, so
            // clearing the box does not leave a dead panel behind.
            this.CustomerResults = [];
            this.CustomerSearching = false;
            this.ShowingRecents = false;
            void this.OnCustomerFocus();
            return;
        }
        this.ShowingRecents = false;
        this.CustomerSearching = true;
        this.customerTimer = setTimeout(async () => {
            const results = await this.data.SearchCustomers(query);
            // Assign both AFTER the await, never across it.
            this.CustomerResults = results;
            this.CustomerSearching = false;
            this.cdr.detectChanges();
        }, 300);
    }

    /**
     * Choose a customer and put them on the draft.
     *
     * An ORGANIZATION and a PERSON are different columns on the order, not one
     * "customer" field — an employee's order billed to their employer is the
     * employer's receivable, and collapsing the two would lose that.
     */
    public async ChooseCustomer(option: { ID: string; Name: string; IsOrganization: boolean; Email: string | null }): Promise<void> {
        this.Draft.SetHeader(
            option.IsOrganization
                ? { BillToOrganizationID: option.ID, BillToPersonID: null }
                : { BillToPersonID: option.ID, BillToOrganizationID: null },
        );

        // What an order taker needs to know before quoting: what they already owe,
        // and what credit they are sitting on.
        // FILTERED ON THE SERVER, BOTH WAYS. The person branch used to pass `{}` — fetching every
        // order in the database and narrowing in the browser — so picking a customer got slower with
        // every order ever taken. The organization branch filtered server-side and the person branch
        // did not, which is why it looked intermittent.
        const theirs = await this.data.GetOrders(
            option.IsOrganization ? { BillToOrganizationID: option.ID } : { BillToPersonID: option.ID },
        );
        const today = new Date().toISOString().slice(0, 10);

        this.Customer = {
            DisplayName: option.Name,
            OrganizationName: option.IsOrganization ? option.Name : null,
            Email: option.Email,
            OpenBalance: Math.round(theirs.filter((o) => o.Balance > 0).reduce((s, o) => s + o.Balance, 0) * 100) / 100,
            AvailableCredit:
                Math.round(Math.abs(theirs.filter((o) => o.Balance < 0).reduce((s, o) => s + o.Balance, 0)) * 100) / 100,
            OverdueCount: theirs.filter((o) => o.Balance > 0 && o.DueDate && o.DueDate < today).length,
        };
        this.CustomerQuery = '';
        this.CustomerResults = [];
        this.cdr.detectChanges();
    }

    /**
     * Put the customer back to unchosen, so a different one can be picked.
     *
     * There was no way out of a wrong choice: `ChooseCustomer` set the card and nothing ever
     * cleared it, so mis-picking meant abandoning the order and starting again. Clearing the
     * DRAFT's bill-to as well as the card matters — leaving the header pointing at the old party
     * while the screen shows "no customer" is the worse failure, because the order would confirm
     * against someone the user believes they removed.
     *
     * The lines are deliberately kept. Someone correcting the payer has not changed their mind
     * about what is being bought, and re-typing the basket to fix a name is a punishment.
     */
    public ClearCustomer(): void {
        this.Draft.SetHeader({ BillToOrganizationID: null, BillToPersonID: null });
        this.Customer = null;
        this.CustomerQuery = '';
        this.CustomerResults = [];
        // Account credit is the customer's, so a tender that spends it cannot survive them leaving.
        if (this.Tender === 'credit') this.SelectTender('terms');
        this.cdr.detectChanges();
        // Put the cursor where the next action is, rather than making them find the box again.
        setTimeout(() => document.getElementById('mjo-customer-search')?.focus(), 0);
    }

    /** Catalog rows matching the query, capped — a picker is not a report. */
    public get PickerResults(): MJOProductOption[] {
        const q = this.ProductQuery.trim().toLowerCase();
        const matches = this.Catalog.filter(
            (p) => !q || p.Name.toLowerCase().includes(q) || p.SKU.toLowerCase().includes(q),
        );
        return matches.slice(0, 7);
    }

    public OpenPicker(): void {
        this.PickerOpen = true;
        this.PickerCursor = 0;
    }

    /** Closed on a timeout so a click on a row lands before the list disappears. */
    public ClosePickerSoon(): void {
        setTimeout(() => (this.PickerOpen = false), 140);
    }

    public AddProduct(product: MJOProductOption): void {
        // No UnitPrice — omitting it is what tells the engine to resolve one.
        // Sending the list price would register as direct entry and win over
        // whatever rule should actually have applied.
        this.Draft.AddLine({ ProductID: product.ID, Quantity: 1 });
        this.ProductQuery = '';
        this.PickerCursor = 0;
    }

    public OnPickerKey(event: KeyboardEvent): void {
        const results = this.PickerResults;
        switch (event.key) {
            case 'ArrowDown':
                this.PickerCursor = Math.min(this.PickerCursor + 1, results.length - 1);
                event.preventDefault();
                break;
            case 'ArrowUp':
                this.PickerCursor = Math.max(this.PickerCursor - 1, 0);
                event.preventDefault();
                break;
            case 'Enter':
                if (results[this.PickerCursor]) {
                    this.AddProduct(results[this.PickerCursor]);
                    event.preventDefault();
                }
                break;
            case 'Escape':
                this.PickerOpen = false;
                break;
            default:
                break;
        }
    }

    /* ── Lines ──────────────────────────────────────────────────────────── */

    public get Lines(): OrderDraftLine[] {
        return this.Draft?.Lines ?? [];
    }

    public ProductFor(line: OrderDraftLine): MJOProductOption | undefined {
        return this.Catalog.find((p) => p.ID === line.ProductID);
    }

    public Bump(line: OrderDraftLine, delta: number): void {
        this.Draft.UpdateLine(line.ClientKey, { Quantity: Math.max(1, line.Quantity + delta) });
    }

    public SetQuantity(line: OrderDraftLine, raw: string): void {
        const n = Number.parseFloat(raw);
        this.Draft.UpdateLine(line.ClientKey, { Quantity: !Number.isFinite(n) || n <= 0 ? 1 : n });
    }

    public Remove(line: OrderDraftLine): void {
        this.Draft.RemoveLine(line.ClientKey);
    }

    /** The priced result for a line, matched by the key the client sent. */
    public PricedLine(line: OrderDraftLine): OrdersPreviewOrderOutput['Lines'][number] | undefined {
        return this.Preview.Result?.Lines?.find((l) => l.ClientKey === line.ClientKey);
    }

    /* ── Codes ──────────────────────────────────────────────────────────── */

    public AddCode(): void {
        if (!this.CodeEntry.trim()) return;
        this.Draft.AddPromotionCode(this.CodeEntry);
        this.CodeEntry = '';
    }

    public DropCode(code: string): void {
        this.Draft.RemovePromotionCode(code);
    }

    /** Whether a code was accepted, rejected, or is still being decided. */
    public CodeState(code: string): 'applied' | 'rejected' | 'pending' {
        const promo = this.Preview.Result?.Promotions?.find((p) => p.Code === code);
        if (!promo) return 'pending';
        return promo.Applied ? 'applied' : 'rejected';
    }

    public CodeReason(code: string): string | null {
        return this.Preview.Result?.Promotions?.find((p) => p.Code === code)?.NotAppliedReason ?? null;
    }

    /* ── The rail ───────────────────────────────────────────────────────── */

    /**
     * Turn the engine's decomposition into ladder rows, in the engine's own order:
     * list → promotions → net → charges → tax layers → gross.
     *
     * This is a PROJECTION, not a calculation. Every number is read from the
     * preview; the only arithmetic is picking which figure goes on which row.
     */
    public get LadderRows(): MJOLadderRow[] {
        const result = this.Preview.Result;
        if (!result) return [];

        const rows: MJOLadderRow[] = [
            {
                Label: 'Subtotal',
                Amount: result.Totals.ListSubtotal,
                Why: `${result.Lines.length} line${result.Lines.length === 1 ? '' : 's'} at resolved prices, before any discount.`,
            },
        ];

        for (const promo of result.Promotions ?? []) {
            if (promo.Applied) {
                rows.push({
                    Label: `${promo.Code} <span class="muted">· ${promo.Scope.toLowerCase()}</span>`,
                    Amount: promo.Amount,
                    IsSub: true,
                    IsCredit: true,
                    Why:
                        `<b>${promo.Name}</b> — ` +
                        (promo.Kind === 'Percent'
                            ? `${promo.Value * 100}% off`
                            : `${FormatMoney(promo.Value)} fixed`) +
                        (promo.Scope === 'Order'
                            ? '<br>Order-level, so it is <b>allocated onto the lines</b> — tax and GL both operate on line amounts.'
                            : ''),
                });
            } else {
                rows.push({
                    Label: `${promo.Code} <span class="muted">offered, not applied</span>`,
                    Amount: 0,
                    IsSub: true,
                    IsInactive: true,
                    Why: promo.NotAppliedReason ?? 'This code did not apply to anything on the order.',
                });
            }
        }

        if (result.Totals.DiscountTotal > 0) {
            rows.push({ Label: '<b>Net after discounts</b>', Amount: result.Totals.NetTotal });
        }

        for (const charge of (result.Charges ?? []).filter((c) => !c.IsTax)) {
            rows.push({
                Label: charge.Name,
                Amount: charge.Amount,
                Why:
                    `Charge type <b>${charge.Name}</b>, basis <code>${charge.Basis}</code>. ` +
                    'Computed, never hand-typed — but overridable on the record, which stores who, when, why, ' +
                    'and the value it replaced.',
            });
        }

        const taxLayers = (result.Charges ?? []).filter((c) => c.IsTax);
        if (taxLayers.length) {
            const base = result.Totals.TaxableBase;
            rows.push({
                Label: 'Tax',
                Amount: result.Totals.TaxTotal,
                Why:
                    `${taxLayers.length} jurisdiction layer${taxLayers.length === 1 ? '' : 's'}, each computing on the ` +
                    `<b>same</b> base of ${FormatMoney(base.Base)} — taxable goods ${FormatMoney(base.TaxableGoods)} ` +
                    `plus non-tax charges ${FormatMoney(base.NonTaxCharges)}.<br><br>` +
                    '<b>Tax layers never compound.</b> A non-tax charge enlarges the taxable base; a tax charge does not. ' +
                    'That is why every layer below shares one base instead of stacking on the one above.',
            });
            for (const layer of taxLayers) {
                rows.push({
                    Label: layer.Name,
                    Amount: layer.Amount,
                    IsSub: true,
                    Detail: layer.Rate != null ? `${layer.Rate * 100}% on ${FormatMoney(layer.BasisAmount ?? 0)}` : null,
                });
            }
        } else {
            const zeroReason = result.Lines.find((l) => l.TaxZeroReason)?.TaxZeroReason;
            rows.push({
                Label: 'Tax',
                Amount: 0,
                Why:
                    'A zero always records <b>which</b> of four reasons produced it — untaxable, no nexus, exempt, ' +
                    `or no jurisdiction.${zeroReason ? ` Here: ${zeroReason}.` : ''}`,
            });
        }

        rows.push({ Label: 'Total', Amount: result.Totals.GrossTotal, IsTotal: true });
        return rows;
    }

    public get LadderFootnote(): string | null {
        const t = this.Preview.Result?.Totals;
        if (!t) return null;
        return (
            `Subtotal ${FormatMoney(t.ListSubtotal)} − discounts ${FormatMoney(t.DiscountTotal)} ` +
            `+ charges ${FormatMoney(t.ChargeTotal)} + tax ${FormatMoney(t.TaxTotal)} = ${FormatMoney(t.GrossTotal)}`
        );
    }

    /** What the customer pays now versus on terms. */
    public get DueNow(): number {
        const gross = this.Preview.Result?.Totals.GrossTotal ?? 0;
        return this.Tender === 'terms' ? 0 : gross;
    }

    public get DueLater(): number {
        return (this.Preview.Result?.Totals.GrossTotal ?? 0) - this.DueNow;
    }

    /** Companies the order will book to, from the preview's per-company split. */
    public get BookingSummary(): OrdersPreviewOrderOutput['Totals']['ByCompany'] {
        return this.Preview.Result?.Totals.ByCompany ?? [];
    }

    /* ── Actions ────────────────────────────────────────────────────────── */

    public get CanConfirm(): boolean {
        return this.ConfirmBlockedReason === null;
    }

    /**
     * WHY the confirm is unavailable, or null when it is available.
     *
     * A disabled button that says nothing is the worst control on a screen: the user can see the
     * action they want, cannot have it, and is given no way to work out what to change. This page
     * had exactly that — `[disabled]="!CanConfirm"` with no title and no hint — so every blocking
     * condition, old and new, presented identically as "the confirm button does not work".
     *
     * Ordered by what the user should fix FIRST, not by how the checks happen to be written: there
     * is no point telling someone to add a check number when they have not chosen a customer yet.
     */
    public get ConfirmBlockedReason(): string | null {
        if (!this.Draft) return 'Nothing to confirm yet.';
        if (this.Saving) return 'Saving…';

        const issues = this.Draft.Validate().Issues.filter((i) => i.Severity === 'error');
        if (issues.length) return issues[0].Message;

        if (this.RequiresReference && !this.Reference.trim()) {
            return `Enter the ${this.SelectedTenderType?.Name ?? 'payment'} number — it is needed to match the payment to the bank statement.`;
        }
        if (this.Preview.Error) return this.Preview.Error;
        if (this.Preview.Loading) return 'Working out what this order comes to…';
        if (!this.Preview.Result) return 'Waiting for the order total.';
        return null;
    }

    /**
     * Which `PaymentType` each tile means.
     *
     * 'terms' is deliberately absent: invoicing on terms is the ABSENCE of an initial payment, not
     * a payment of a different kind, so it clears the intent instead of naming a type.
     */
    private static readonly TENDER_CODES: Readonly<Record<string, string>> = {
        onfile: 'CreditCard',
        newcard: 'CreditCard',
        check: 'Check',
        credit: 'AccountCredit',
    };

    /** The `PaymentType` row behind the current tile, or null for invoice-on-terms. */
    public get SelectedTenderType(): MJOTenderOption | null {
        const code = MJOFastEntryPageComponent.TENDER_CODES[this.Tender];
        if (!code) return null;
        return this.Tenders.find((t) => t.Code === code) ?? null;
    }

    /** True when this tender cannot be captured without a check/wire/transfer number. */
    public get RequiresReference(): boolean {
        return this.SelectedTenderType?.RequiresReference === true;
    }

    /** The check number / wire confirmation, while it is being typed. */
    public Reference = '';

    public SetReference(value: string): void {
        this.Reference = value;
        // Re-state the whole intent rather than patching it: the amount and type must stay together
        // with the reference, and SetInitialPayment is the one place that knows the shape.
        this.applyTenderIntent();
    }

    public SelectTender(tender: typeof this.Tender): void {
        this.Tender = tender;
        // Switching tender abandons a reference typed for the previous one — a check number is not
        // a wire confirmation, and carrying it across would attach the wrong id to the payment.
        this.Reference = '';
        this.applyTenderIntent();
    }

    /**
     * Push the current tender choice onto the draft.
     *
     * Tender is INTENT, not a payment. It rides the draft so the pre-flight can say what confirming
     * will capture, and `createInitialPayment` turns it into a real PaymentHeader inside the same
     * transaction as the booking.
     */
    private applyTenderIntent(): void {
        if (this.Tender === 'terms') {
            this.Draft.ClearInitialPayment();
            return;
        }
        this.Draft.SetInitialPayment({
            PaymentTypeID: this.SelectedTenderType?.ID ?? null,
            Amount: this.Preview.Result?.Totals.GrossTotal ?? 0,
            Reference: this.Reference,
        });
    }

    /** ⌘↵ / Ctrl+↵ confirms; ⌘S saves; `/` jumps to the product field. */
    @HostListener('document:keydown', ['$event'])
    public onKey(event: KeyboardEvent): void {
        const meta = event.metaKey || event.ctrlKey;
        if (meta && event.key === 'Enter' && this.CanConfirm) {
            event.preventDefault();
            this.RequestConfirm();
        } else if (meta && event.key.toLowerCase() === 's') {
            event.preventDefault();
            void this.SaveDraft();
        } else if (event.key === '/' && (event.target as HTMLElement)?.tagName !== 'INPUT') {
            event.preventDefault();
            document.getElementById('mjo-product-search')?.focus();
        }
    }

    /**
     * True once pricing has RETURNED, so an empty price source means "there is no rule" rather
     * than "not yet". Drives the price badge's missing-rule state.
     *
     * Deliberately NOT `!!Preview.Result` alone: a stale result from the previous keystroke is
     * present while the next preview is in flight, and treating that as settled would flash
     * "no price rule" at a line that is simply being recomputed.
     */
    public get PricingSettled(): boolean {
        return !this.Preview.Loading && !!this.Preview.Result;
    }

    public SaveError: string | null = null;
    public Saving = false;

    /**
     * Drop the save failure.
     *
     * Cleared from OUR state rather than left to the alert's own dismiss: the
     * banner is inside an `@if (SaveError)`, so hiding it internally would leave
     * the same component instance alive and already-dismissed — and the NEXT
     * failure would then set SaveError, re-enter the @if with that same instance,
     * and render nothing at all. A save could fail silently because the user had
     * dismissed an earlier one.
     */
    public ClearSaveError(): void {
        this.SaveError = null;
        this.cdr.detectChanges();
    }

    public async SaveDraft(): Promise<void> {
        this.Saving = true;
        this.SaveError = null;
        try {
            const saved = await this.orders.Save(this.Draft);
            if (saved) this.Saved.emit(this.Draft);
        } catch (e) {
            this.SaveError = ReadableSaveError(e);
        } finally {
            this.Saving = false;
            this.cdr.detectChanges();
        }
    }

    /** Ask the host to run the pre-flight and confirm. */
    public RequestConfirm(): void {
        if (!this.CanConfirm) return;
        this.ConfirmRequested.emit(this.Draft);
    }

    /**
     * Continue in the full editor. Emits the SAME draft instance rather than a
     * copy, which is what makes escalation lose nothing.
     */
    public Escalate(): void {
        this.EscalateRequested.emit(this.Draft);
    }
}
