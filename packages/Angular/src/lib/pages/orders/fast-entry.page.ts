import { ChangeDetectorRef, Component, EventEmitter, HostListener, Input, OnDestroy, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
    OrderHeaderEntity,
    type mjBizAppsOrdersOrderLineEntity,
} from '@mj-biz-apps/orders-entities';
import { Metadata } from '@memberjunction/core';


import { ReadableSaveError } from '../../services/save-error';

import { MJOPricingScheduler, type MJOLinePrice, type MJOPricingState } from '../../services/pricing-scheduler.service';
import { MJODecompositionLadderComponent, type MJOLadderRow } from '../../panels/decomposition-ladder.component';
import { MJOConsequenceChipComponent, MJOPriceSourceBadgeComponent } from '../../panels/chips.component';
import { MJOMoneyPipe, FormatMoney, Initials } from '../../panels/money-format';
import { MJAlertComponent, MJButtonDirective } from '@memberjunction/ng-ui-components';
import type { MJOTenderOption } from '../payments/payment-entry.page';
import { GetOrders, RecentCustomers, SearchCustomers } from '../../data/orders-queries';
import { MJO_ENTITIES } from '../../data/entity-names';

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
 * Escalating to the full editor hands over the SAME order entity rather
 * than a copy, which is what makes "open in full editor" lose nothing.
 *
 * THE DECOMPOSITION RAIL IS THE POINT. Every figure in it comes from
 * `Orders.PreviewPrice` — the engine's own price resolver, run without any write inside
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
    private readonly orders = inject(MJOPricingScheduler);
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
    @Output() ConfirmRequested = new EventEmitter<OrderHeaderEntity>();

    /** The draft was saved. Carries the draft so the host can update a tab title. */
    @Output() Saved = new EventEmitter<OrderHeaderEntity>();

    /** The user asked to continue in the full editor — same instance, nothing copied. */
    @Output() EscalateRequested = new EventEmitter<OrderHeaderEntity>();

    /** The draft. Public so the host can hand it to the full editor unchanged. */
    /** The order being composed — a real entity, bound directly. */
    public Order!: OrderHeaderEntity;

    /** Latest preview state — result, in-flight flag and error. */
    public Pricing: MJOPricingState = { Result: null, Loading: false, Error: null };

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
        this.Pricing = { Result: null, Loading: false, Error: null };
        this.JustBooked = orderNumber ?? null;

        void this.startDraft();
        this.cdr.detectChanges();
        // Straight back to the first thing they will type.
        setTimeout(() => document.getElementById('mjo-customer-search')?.focus(), 0);
    }

    public ngOnInit(): void {
        void this.startDraft();
    }

    /** Build a fresh draft and re-subscribe the preview. Shared by init and {@link Reset}. */
    private async startDraft(): Promise<void> {
        const md = new Metadata();
        this.Order = await md.GetEntityObject<OrderHeaderEntity>(MJO_ENTITIES.OrderHeader);
        this.Order.NewRecord();
        this.Order.CompanyID = this.CompanyID;
        void this.onEdited();
        // `this.Order` was assigned after an await and the entire page renders from it — without a
        // tick the form stays on its pre-load render, which looks like a page that failed to open.
        this.cdr.detectChanges();
    }

    /**
     * Called by every setter on this page after it mutates the order.
     *
     * Replaces `Draft.Subscribe`: the page knows when the user edited, because they edited through a
     * control it owns. Retires stale messages and reschedules the preview.
     */
    private onEdited(): void {
        // Changing anything retires the last save failure. It described an order that no longer
        // exists, and leaving it up means an error about the old state sits over the new one until
        // the user saves again — exactly when they least want to be reading stale bad news.
        this.SaveError = null;
        // Touching the next order retires the last one's confirmation. A stale "booked ORD-123"
        // sitting over a half-typed new order invites the reader to think THIS one is booked.
        this.JustBooked = null;
        this.orders.SchedulePricing(this.Order, (state) => {
            this.Pricing = state;
            // Re-state the tender now that the gross is known — amount is taken from this result.
            if (this.Order) this.applyTenderIntent();
            // MUST tick. This callback fires from a debounced timer + an awaited network round trip,
            // so it is outside anything Angular is watching: the page is created imperatively via
            // ViewContainerRef.createComponent and runs zoneless, which means an assignment alone
            // repaints nothing. Without this the prices land and the line stays on "— resolving…"
            // for ever.
            this.cdr.detectChanges();
        });
    }

    public ngOnDestroy(): void {
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
        const recents = await RecentCustomers();
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
            const results = await SearchCustomers(query);
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
        this.Order.BillToOrganizationID = option.IsOrganization ? option.ID : null;
        this.Order.BillToPersonID = option.IsOrganization ? null : option.ID;
        this.onEdited();

        // What an order taker needs to know before quoting: what they already owe,
        // and what credit they are sitting on.
        // FILTERED ON THE SERVER, BOTH WAYS. The person branch used to pass `{}` — fetching every
        // order in the database and narrowing in the browser — so picking a customer got slower with
        // every order ever taken. The organization branch filtered server-side and the person branch
        // did not, which is why it looked intermittent.
        const theirs = await GetOrders(
            option.IsOrganization ? { BillToOrganizationID: option.ID } : { BillToPersonID: option.ID },
        );
        // Local midnight, so "overdue" means the calendar day the operator is looking at rather
        // than a UTC instant that flips hours early or late depending on where they are.
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        this.Customer = {
            DisplayName: option.Name,
            OrganizationName: option.IsOrganization ? option.Name : null,
            Email: option.Email,
            OpenBalance: Math.round(theirs.filter((o) => (o.Balance ?? 0) > 0).reduce((s, o) => s + (o.Balance ?? 0), 0) * 100) / 100,
            AvailableCredit:
                Math.round(Math.abs(theirs.filter((o) => (o.Balance ?? 0) < 0).reduce((s, o) => s + (o.Balance ?? 0), 0)) * 100) / 100,
            OverdueCount: theirs.filter((o) => (o.Balance ?? 0) > 0 && !!o.DueDate && o.DueDate < today).length,
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
        this.Order.BillToOrganizationID = null;
        this.Order.BillToPersonID = null;
        this.onEdited();
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

    public async AddProduct(product: MJOProductOption): Promise<void> {
        // No UnitPrice — omitting it is what tells the engine to resolve one.
        // Sending the list price would register as direct entry and win over
        // whatever rule should actually have applied.
        const line = await this.Order.Lines.Create();
        line.ProductID = product.ID;
        line.Quantity = 1;
        this.onEdited();
        this.ProductQuery = '';
        this.PickerCursor = 0;
        // Assigned after an await, so nothing repaints them on its own. Fast entry is the surface
        // where that matters most: the whole point is typing the next product immediately.
        this.cdr.detectChanges();
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

    public get Lines(): mjBizAppsOrdersOrderLineEntity[] {
        return [...(this.Order?.Lines.Items ?? [])];
    }

    public ProductFor(line: mjBizAppsOrdersOrderLineEntity): MJOProductOption | undefined {
        return this.Catalog.find((p) => p.ID === line.ProductID);
    }

    public Bump(line: mjBizAppsOrdersOrderLineEntity, delta: number): void {
        line.Quantity = Math.max(1, Number(line.Quantity ?? 0) + delta);
        this.onEdited();
    }

    public SetQuantity(line: mjBizAppsOrdersOrderLineEntity, raw: string): void {
        const n = Number.parseFloat(raw);
        line.Quantity = !Number.isFinite(n) || n <= 0 ? 1 : n;
        this.onEdited();
    }

    public Remove(line: mjBizAppsOrdersOrderLineEntity): void {
        this.Order.Lines.Remove(line);
        this.onEdited();
    }

    /** The priced result for a line, matched by the key the client sent. */
    public PricedLine(line: mjBizAppsOrdersOrderLineEntity): MJOLinePrice | undefined {
        return this.Pricing.Result?.Lines?.find((l) => l.ClientKey === line.ID);
    }

    /* ── Codes ──────────────────────────────────────────────────────────── */

    public AddCode(): void {
        if (!this.CodeEntry.trim()) return;
        this.Order.PromotionCodes.Add(this.CodeEntry.trim());
        this.CodeEntry = '';
        this.onEdited();
    }

    public DropCode(code: string): void {
        this.Order.PromotionCodes.Remove(code);
        this.onEdited();
    }

    /**
     * Whether a code was accepted, rejected, or is still being decided.
     *
     * ALWAYS 'pending' NOW, and honestly so. Promotions are qualified inside the
     * confirm transaction; the old answer came from a rolled-back booking run on
     * every keystroke. Claiming 'applied' without having run the qualifier would be
     * a promise the confirm might not keep.
     */
    public CodeState(code: string): 'applied' | 'rejected' | 'pending' {
        void code;
        return 'pending';
    }

    public CodeReason(code: string): string | null {
        void code;
        return null;
    }

    /* ── The rail ───────────────────────────────────────────────────────── */

    /**
     * Turn the resolved line prices into ladder rows.
     *
     * IT STOPS AT THE NET SUBTOTAL, AND SAYS SO. It used to run list → promotions →
     * net → charges → tax layers → gross, because `Orders.PreviewOrder` had produced
     * every one of those figures by performing the REAL save and rolling it back —
     * on every keystroke. Without that run, charges, tax and promotions are not
     * known, and a `$0.00` tax row on the screen someone reads before committing is
     * a statement rather than a gap.
     *
     * This is still a PROJECTION, not a calculation: the prices are the engine's own
     * (`Orders.PreviewPrice` calls the same `ResolvePrice`), and the only arithmetic
     * is which figure goes on which row.
     */
    public get LadderRows(): MJOLadderRow[] {
        const result = this.Pricing.Result;
        if (!result) return [];

        const rows: MJOLadderRow[] = [
            {
                Label: 'Subtotal',
                Amount: result.Totals.ListSubtotal,
                Why: `${result.Lines.length} line${result.Lines.length === 1 ? '' : 's'} at resolved prices, before any discount.`,
            },
        ];

        if (result.Totals.DiscountTotal > 0) {
            rows.push({
                Label: 'Discounts',
                Amount: result.Totals.DiscountTotal,
                IsSub: true,
                IsCredit: true,
            });
        }

        rows.push({
            Label: 'Net before tax &amp; charges',
            Amount: result.Totals.NetTotal,
            IsTotal: true,
            Why:
                'Charges, tax and promotion codes are decided when the order is confirmed, inside the ' +
                'same transaction that books it. The confirmed order states the final amount.',
        });
        return rows;
    }

    public get LadderFootnote(): string | null {
        const t = this.Pricing.Result?.Totals;
        if (!t) return null;
        const unpriced = this.Pricing.Result?.HasUnpricedLines
            ? ' Some lines have no price rule, so this subtotal is short.'
            : '';
        return (
            `Subtotal ${FormatMoney(t.ListSubtotal)} − discounts ${FormatMoney(t.DiscountTotal)} = ` +
            `${FormatMoney(t.NetTotal)}, before tax and charges.${unpriced}`
        );
    }

    /**
     * What the customer pays now versus on terms.
     *
     * ADVISORY. It is the net subtotal, not the gross — tax and charges are added by
     * the confirm. The tender still captures the full amount the engine computes;
     * this is what the screen can honestly display beforehand.
     */
    public get DueNow(): number {
        const net = this.Pricing.Result?.Totals.NetTotal ?? 0;
        return this.Tender === 'terms' ? 0 : net;
    }

    public get DueLater(): number {
        return (this.Pricing.Result?.Totals.NetTotal ?? 0) - this.DueNow;
    }

    /**
     * Companies the order will book to, read from the CATALOGUE.
     *
     * Revenue follows the PRODUCT's company (`OrderLine.CompanyID` is stamped from it
     * and the UI can never set it), so the split is knowable from the lines without
     * asking the engine — which is what the per-company breakdown on the old preview
     * was really reporting. Amounts are the net line figures, so they carry the same
     * before-tax-and-charges caveat as everything else on this rail.
     */
    public get BookingSummary(): Array<{ CompanyName: string; NetTotal: number }> {
        const byCompany = new Map<string, number>();
        for (const line of this.Order?.Lines.Items ?? []) {
            const company = this.ProductFor(line)?.CompanyName;
            if (!company) continue;
            byCompany.set(company, (byCompany.get(company) ?? 0) + (this.PricedLine(line)?.NetAmount ?? 0));
        }
        return [...byCompany].map(([CompanyName, NetTotal]) => ({
            CompanyName,
            NetTotal: Math.round(NetTotal * 100) / 100,
        }));
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
        if (!this.Order) return 'Nothing to confirm yet.';
        if (this.Saving) return 'Saving…';

        const issues = this.Order.Validate().Errors;
        if (issues.length) return issues[0].Message;

        if (this.RequiresReference && !this.Reference.trim()) {
            return `Enter the ${this.SelectedTenderType?.Name ?? 'payment'} number — it is needed to match the payment to the bank statement.`;
        }
        // NOT BLOCKED ON A PRICE. These used to end with `if (!Preview.Result) return
        // 'Waiting for the order total.'`, which meant a preview that failed for any reason
        // left a complete order permanently unconfirmable. Pricing is for the person reading
        // the screen; the engine prices the order again, for real, inside the confirm.
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
     * Tender is INTENT, not a payment. It rides the draft, and `createInitialPayment` turns it
     * into a real PaymentHeader inside the same transaction as the booking.
     */
    private applyTenderIntent(): void {
        if (this.Tender === 'terms') {
            this.Order.InitialPaymentTypeID = null;
            this.Order.InitialPaymentAmount = 0;
            this.Order.InitialPaymentReference = null;
            return;
        }
        // THE TENDER AMOUNT IS THE GROSS, and the client can finally know it.
        //
        // This was a documented gap: `createInitialPayment` takes `InitialPaymentAmount` at face
        // value, and the client could only offer the NET subtotal because the only thing that ever
        // produced a gross was a rolled-back preview that ran the whole booking walk. Harmless while
        // no charge or tax rule was configured, and an UNDER-PAYMENT the moment tax landed — the
        // order books at gross, the payment covers net, and the difference shows up as a
        // PartiallyPaid order nobody chased.
        //
        // `Orders.PriceOrder` returns the real gross from the same engine the booking uses, so this
        // is no longer a client-side guess at tax — which is what the gap note rightly refused to do.
        this.Order.InitialPaymentTypeID = this.SelectedTenderType?.ID ?? null;
        this.Order.InitialPaymentAmount = this.Pricing.Result?.Totals.GrossTotal ?? 0;
        // Always copy the typed number. Gating on RequiresReference wiped it when the
        // tender catalog had not loaded yet (pricing callback) and confirm then saw nothing.
        this.Order.InitialPaymentReference = this.Reference.trim() || null;
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
     * Deliberately NOT `!!Pricing.Result` alone: a stale result from the previous keystroke is
     * present while the next pass is in flight, and treating that as settled would flash
     * "no price rule" at a line that is simply being recomputed.
     */
    public get PricingSettled(): boolean {
        return !this.Pricing.Loading && !!this.Pricing.Result;
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
            await this.Order.SaveOrThrow();
            this.Saved.emit(this.Order);
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
        // Last chance: bind the typed check number onto the order before the save ships.
        this.applyTenderIntent();
        this.ConfirmRequested.emit(this.Order);
    }

    /**
     * Continue in the full editor. Emits the SAME draft instance rather than a
     * copy, which is what makes escalation lose nothing.
     */
    public Escalate(): void {
        this.EscalateRequested.emit(this.Order);
    }

    /** Whether the user typed this line's price rather than the engine resolving one. */
    public PriceStated(line: mjBizAppsOrdersOrderLineEntity): boolean {
        return line.GetFieldByName('UnitPrice')?.Dirty === true;
    }

    /** Promotion codes presented but not yet saved — screen state, held by the entry service. */
    public get PromotionCodes(): string[] {
        return this.Order.PromotionCodes.Codes;
    }

}
