import { ChangeDetectorRef, Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
    OrdersCapturePaymentOperation,
    type OrdersCapturePaymentInput,
    type OrdersCapturePaymentOutput,
} from '@mj-biz-apps/orders-entities';
import { FormsModule } from '@angular/forms';
import {
    MJOAllocationGridComponent,
    type MJOAllocatableOrder,
    type MJOAllocationMap,
} from '../../panels/allocation-grid.component';
import { AllocateOldestFirst, UnallocatedRemainder } from '../../panels/allocation-math';
import { MJOMoneyPipe, DaysSince } from '../../panels/money-format';
import { MJOStatedValueComponent } from '../../panels/chips.component';
import { MJOOrdersDataService } from '../../services/orders-data.service';
import { MJDropdownComponent, MJAlertComponent, MJButtonDirective } from '@memberjunction/ng-ui-components';

/** A tender the customer can pay with. */
export interface MJOTenderOption {
    ID: string;
    Code: string;
    Name: string;
    RequiresReference: boolean;
    RequiresInstrument: boolean;
}

/**
 * `mjo-payment-entry-page` — take the cash, then say what it settles.
 *
 * Two panels: the payment facts on the left, the allocation grid on the right.
 * The unallocated readout is the centre of the screen and capture waits for it to
 * reach zero, because a payment's amount must equal the sum of what it settles.
 *
 * OVER-APPLYING IS NOT AN ERROR. It drives an order's balance negative, and that
 * negative balance IS the customer's credit. The grid says so rather than
 * refusing — refusing would make an everyday event unrecordable while the money
 * sat in the bank, and modelling "unapplied cash" as its own thing would create a
 * second record that can disagree with the first.
 *
 * THE INSTRUMENT FIELDS FOLLOW THE TENDER, from the tender's own flags rather
 * than a hardcoded list. A cheque wants a reference; a card wants an instrument;
 * account credit wants neither. Asking for a card number on a cheque is how forms
 * teach people to ignore them.
 *
 * ## Example
 *
 * ```html
 * <mjo-payment-entry-page
 *   [CustomerID]="orgID"
 *   [Tenders]="tenders"
 *   (CaptureRequested)="capture($event)" />
 * ```
 */
@Component({
    selector: 'mjo-payment-entry-page',
    standalone: true,
    imports: [MJButtonDirective, MJDropdownComponent, CommonModule, FormsModule, MJOAllocationGridComponent, MJOStatedValueComponent, MJOMoneyPipe, MJAlertComponent],
    template: `
        <div class="mjo-pe__split">
            <!-- ── Left: the money ── -->
            <div class="mjo-pe__left">
                <div class="mj-card">
                    <div class="mj-card-head">
                        <i class="fa-solid fa-hand-holding-dollar" aria-hidden="true"></i>
                        <h3>The money</h3>
                    </div>
                    <div class="mj-card-pad">
                        <label class="mj-field">
                            <label>Amount received</label>
                            <input
                                class="mj-input is-num" [disabled]="IsCaptured"
                                [value]="Amount"
                                (change)="SetAmount($any($event.target).value); SchedulePreview()"
                                aria-label="Amount received">
                        </label>

                        <label class="mj-field">
                            <label>Date received</label>
                            <input class="mj-input" type="date" [(ngModel)]="PaymentDate" name="paymentDate" [disabled]="IsCaptured">
                        </label>

                        <label class="mj-field">
                            <label>Tender</label>
                            <mj-dropdown
                                [Data]="Tenders"
                                TextField="Name"
                                ValueField="Code"
                                [ValuePrimitive]="true"
                                [Disabled]="IsCaptured"
                                [(ngModel)]="TenderCode"
                                name="tender"
                                (ngModelChange)="OnTenderChanged()" />
                            <div class="hint">
                                Reversal types are absent because the data says they are reversals — not
                                because this list hardcodes an exclusion.
                            </div>
                        </label>

                        <!-- Instrument fields follow the tender's own requirements. -->
                        @if (SelectedTender?.RequiresReference) {
                            <label class="mj-field">
                                <label>Reference</label>
                                <input class="mj-input" [(ngModel)]="Reference" name="reference" [disabled]="IsCaptured"
                                       placeholder="Cheque number, wire confirmation…">
                            </label>
                        }
                        @if (SelectedTender?.RequiresInstrument) {
                            <label class="mj-field">
                                <label>Instrument</label>
                                <mj-dropdown
                                    [Data]="InstrumentOptions"
                                    TextField="Label"
                                    ValueField="Value"
                                    [ValuePrimitive]="true"
                                    [Disabled]="IsCaptured"
                                    [(ngModel)]="Instrument"
                                    name="instrument" />
                                <div class="hint">
                                    A wallet entry is <b>copied</b> onto the payment, never shared, so the
                                    snapshot cannot drift if the saved card changes later.
                                </div>
                            </label>
                        }
                    </div>
                </div>

                <div class="mj-card mjo-pe__books">
                    <div class="mj-card-head">
                        <i class="fa-solid fa-scale-balanced" aria-hidden="true"></i>
                        <h3>What this will book</h3>
                    </div>
                    <div class="mj-card-pad">
                        @if (NetCash !== null) {
                            <mjo-stated-value Label="Dr Cash">{{ NetCash | mjoMoney }}</mjo-stated-value>
                        } @else {
                            <mjo-stated-value Label="Dr Cash" From="pending the server's fee">—</mjo-stated-value>
                        }
                        @if (Fee) {
                            <mjo-stated-value Label="Dr Processing fee" From="the provider's cut, computed server-side">
                                {{ Fee | mjoMoney }}
                            </mjo-stated-value>
                        }
                        <mjo-stated-value Label="Cr A/R" From="at GROSS">{{ Amount | mjoMoney }}</mjo-stated-value>

                        <div class="small muted mjo-pe__note">
                            A/R is credited at <b>gross</b>. Netting the processing fee against it would leave a
                            residue on the customer's balance that no payment could ever clear — the fee is our
                            cost, not their debt.
                        </div>
                    </div>
                </div>
            </div>

            <!-- ── Right: what it settles ── -->
            <div class="mjo-pe__right">
                <!-- Anchored like the product picker: see fast-entry for why. -->
                <div class="mj-typeahead mjo-pe__payer">
                    <div class="mjo-search">
                        <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
                        <input
                            id="mjo-payer-search"
                            [(ngModel)]="PayerQuery"
                            (ngModelChange)="OnPayerQuery()"
                            name="payerSearch"
                            placeholder="Who is paying? Find a person or organization…"
                            autocomplete="off"
                            aria-label="Find the payer">
                    </div>
                    @if (Payer) {
                        <span class="mj-chip mj-chip--brand">
                            {{ Payer.Name }}
                            <button type="button" class="mj-why" (click)="ClearPayer()" aria-label="Clear payer">
                                <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                            </button>
                        </span>
                    }
                </div>

                @if (PayerResults.length) {
                    <div class="mj-typeahead-list is-open" role="listbox">
                        @for (option of PayerResults; track option.ID) {
                            <div class="mj-typeahead-item" role="option" (mousedown)="ChoosePayer(option)">
                                <div class="fe-picker__body">
                                    <div class="name">{{ option.Name }}</div>
                                    <div class="sub">{{ option.IsOrganization ? 'Organization' : 'Person' }}</div>
                                </div>
                            </div>
                        }
                    </div>
                }

                @if (!Payer) {
                    <mj-alert Variant="info" Icon="fa-solid fa-circle-info" class="mjo-pe__note">
                            Showing every open order across all customers. Choose who is paying to
                            narrow it — a payment belongs to one payer, and allocating across
                            customers is almost always a mistake rather than an intention.
                    </mj-alert>
                }

                <mjo-allocation-grid
                    [Orders]="OpenOrders"
                    [Amount]="Amount"
                    [Allocations]="Allocations"
                    (AllocationsChanged)="Allocations = $event; SchedulePreview()"
                    (AutoApplyRequested)="AutoApply(); SchedulePreview()" />

                <div class="mjo-pe__actions">
                    <button
                        type="button"
                        mjButton variant="primary"
                        [disabled]="!CanCapture || Busy"
                        (click)="Capture()">
                        <i class="fa-solid fa-check" aria-hidden="true"></i>
                        {{ Busy ? 'Capturing…' : 'Capture payment' }}
                    </button>
                    <button type="button" mjButton variant="outline">Save as pending</button>
                    <span class="small muted spacer">
                        Allocations freeze at capture. A pending payment is still a draft.
                    </span>
                </div>
            </div>
        </div>

        @if (Error) {
            <mj-alert Variant="error" Icon="fa-solid fa-triangle-exclamation" class="mjo-pe__result" role="alert">
<strong>Nothing was captured.</strong> {{ Error }}
            </mj-alert>
        }

        @if (Result) {
            <mj-alert
                class="mjo-pe__result"
                [Variant]="Result.WasRetry ? 'info' : 'success'"
                Icon="fa-solid fa-circle-check"
                Role="status">
                    @if (Result.WasRetry) {
                        <strong>Already captured — no money moved.</strong>
                        {{ Result.PaymentNumber }} was taken by an earlier attempt carrying the same
                        token. This is that payment, not a second charge.
                    } @else {
                        <strong>{{ Result.PaymentNumber }} captured.</strong>
                        {{ Result.EntryCount }} journal
                        {{ Result.EntryCount === 1 ? 'entry' : 'entries' }},
                        {{ Result.AllBalanced ? 'all balanced' : 'NOT balanced — investigate' }}.
                    }

                    @for (effect of Result.OrderEffects ?? []; track effect.OrderHeaderID) {
                        <div class="small mjo-pe__effect">
                            {{ effect.OrderNumber }} — {{ effect.PaymentStatus }}, balance
                            {{ effect.Balance | mjoMoney }}
                            @if (effect.HasCredit) {
                                <span class="mj-chip mj-chip--info">now holding credit</span>
                            }
                        </div>
                    }
            </mj-alert>
        }
    `,
    styles: [
        `
            .mjo-pe__result { margin-top: var(--mj-space-4); }
            .mjo-pe__effect { margin-top: 4px; }
            /*
             * overflow:auto alone computed to hidden here — the host inherits a clip
             * from the content area it is mounted into. overflow-y is specific
             * enough to win, and min-height:0 lets a flex parent actually
             * give this element a scrollable box rather than stretching it.
             */
            :host {
                display: block;
                height: 100%;
                min-height: 0;
                overflow-y: auto !important;
                padding: var(--mj-space-6);
            }
            .mjo-pe__split {
                display: flex;
                gap: var(--mj-space-4);
                align-items: flex-start;
            }
            .mjo-pe__left {
                flex: 0 0 380px;
                min-width: 0;
            }
            .mjo-pe__right {
                flex: 1;
                min-width: 0;
            }
            .mjo-pe__books {
                margin-top: var(--mj-space-4);
            }
            .mjo-pe__note {
                margin-top: var(--mj-space-3);
            }
            /*
             * STICKY. With every open order listed the page runs to several
             * thousand pixels, and the capture button sat at 3947px inside an
             * 802px viewport — present in the DOM, unreachable in practice. An
             * action bar that scrolls away is an action nobody can take.
             */
            .mjo-pe__actions {
                position: sticky;
                /* Negative offset cancels the host's own space-6 padding, which is
                   inside the scrollport; a plain bottom:0 left the bar floating 24px
                   clear of the viewport edge instead of flush against it. */
                bottom: calc(-1 * var(--mj-space-6));
                z-index: 5;
                display: flex;
                align-items: center;
                gap: var(--mj-space-2);
                margin-top: var(--mj-space-4);
                padding: var(--mj-space-3) 0;
                flex-wrap: wrap;
                background: var(--mj-bg-page);
                border-top: 1px solid var(--mj-border-default);
            }
            .mjo-pe__payer {
                display: flex;
                align-items: center;
                gap: var(--mj-space-2);
                margin-bottom: var(--mj-space-3);
                flex-wrap: wrap;
            }

            @media (max-width: 1100px) {
                .mjo-pe__split {
                    flex-direction: column;
                }
                .mjo-pe__left,
                .mjo-pe__right {
                    flex: 1 1 auto;
                    width: 100%;
                }
            }
            @media (max-width: 760px) {
                :host {
                    padding: var(--mj-space-4);
                }
            }
        `,
    ],
})
export class MJOPaymentEntryPageComponent implements OnInit {
    private readonly data = inject(MJOOrdersDataService);
    /**
     * Render what was just loaded.
     *
     * These pages are created imperatively by the section shell through
     * `ViewContainerRef.createComponent`. When an async load assigns across
     * Angular's check/verify boundary, dev mode raises NG0100 and ABORTS the DOM
     * write. Nothing re-renders afterwards, so the recorded "previous" value stays
     * pre-load while the getter returns the loaded one — the mismatch then repeats
     * on every tick and the view is frozen for good. It is not a flicker: the
     * Orders dashboard sat at "0 open orders / $0.00" against 73 real orders, and
     * read as a quiet day rather than a broken screen.
     *
     * Writing the DOM here ends it: the rendered value matches the getter from the
     * first pass on, so later verify passes agree.
     */
    private readonly cdr = inject(ChangeDetectorRef);

    /** Whose payment this is. Drives which orders are open. */
    @Input() CustomerID: string | null = null;

    /** Available tenders, with their own requirement flags. */
    @Input() Tenders: MJOTenderOption[] = [];

    /** The user asked to capture. The host calls the operation. */
    /** Emitted AFTER the payment is captured, carrying what the server booked. */
    @Output() CaptureRequested = new EventEmitter<OrdersCapturePaymentOutput>();

    /**
     * Instrument choices, as data rather than markup.
     *
     * They were hard-coded `<option>` elements. A dropdown takes a list, and a list is also the
     * thing a wallet lookup would eventually replace — the markup form could not be swapped for
     * loaded data without rewriting the template.
     */
    public readonly InstrumentOptions: ReadonlyArray<{ Value: string; Label: string }> = [
        // Exactly the two the <option> list carried — converting a control must not quietly
        // change what it offers.
        { Value: '', Label: 'Saved payment method…' },
        { Value: 'new', Label: 'New card — hosted tokenization' },
    ];

    public Amount = 0;
    public PaymentDate = new Date().toISOString().slice(0, 10);
    public TenderCode = '';
    public Reference = '';
    public Instrument = '';
    public Allocations: MJOAllocationMap = {};

    /**
     * Makes Capture safe to retry, generated when the FORM OPENS.
     *
     * Deliberately not derived from the amount: two people legitimately paying the
     * same amount on the same day must both go through. Regenerated after a
     * successful capture so the next payment on this screen is a new one — a
     * reused token would make a genuine second payment look like a retry and take
     * no money at all.
     */
    private idempotencyKey = crypto.randomUUID();

    public Busy = false;
    public Error: string | null = null;

    /** Set after a capture. The screen reports what happened rather than assuming. */
    public Result: OrdersCapturePaymentOutput | null = null;

    private previewTimer: ReturnType<typeof setTimeout> | null = null;
    public OpenOrders: MJOAllocatableOrder[] = [];

    /* ── Payer ──────────────────────────────────────────────────────────── */

    public PayerQuery = '';
    public PayerResults: Array<{ ID: string; Name: string; IsOrganization: boolean }> = [];
    public Payer: { ID: string; Name: string; IsOrganization: boolean } | null = null;
    private payerTimer: ReturnType<typeof setTimeout> | null = null;

    /**
     * Find who is paying.
     *
     * Without this the grid listed every open order in the business — 67 of them
     * on this database — and allocating a payment across unrelated customers is
     * almost always a mistake rather than an intention. A payment belongs to one
     * payer, so naming them first is the natural order of the task, not a filter
     * bolted on afterwards.
     */
    public OnPayerQuery(): void {
        if (this.payerTimer) clearTimeout(this.payerTimer);
        const query = this.PayerQuery;
        if (query.trim().length < 2) {
            this.PayerResults = [];
            return;
        }
        this.payerTimer = setTimeout(async () => {
            const results = await this.data.SearchCustomers(query);
            this.PayerResults = results.map((r) => ({
                ID: r.ID,
                Name: r.Name,
                IsOrganization: r.IsOrganization,
            }));
            this.cdr.detectChanges();
        }, 300);
    }

    public async ChoosePayer(option: { ID: string; Name: string; IsOrganization: boolean }): Promise<void> {
        this.Payer = option;
        this.PayerQuery = '';
        this.PayerResults = [];
        // The allocations belonged to the previous payer's orders; keeping them
        // would apply this payment to someone else's balance. The amount goes too:
        // it was defaulted to everything owing across ALL customers, which is not
        // a number this payer would ever hand over.
        this.Allocations = {};
        this.Amount = 0;
        this.Fee = null;
        this.NetCash = null;
        await this.loadOpenOrders();
        this.cdr.detectChanges();
    }

    /**
     * Blank the form for a new payment.
     *
     * "Take a payment" re-inserts this page from the section's cache — deliberately, because
     * detaching rather than destroying is what stops a half-entered payment being lost on a trip
     * to another rail item. The cost is that the CACHED STATE comes back with it: open an existing
     * payment, press Take a payment, and you get the previous payer, amount and allocations with
     * no way to clear them. The caching is right; what was missing is an explicit way to start over.
     *
     * The idempotency key is regenerated here for the same reason it is regenerated after a
     * capture: a fresh form is a NEW payment, and reusing the token would make it look like a retry
     * of the last one and take no money at all.
     */
    public async Reset(): Promise<void> {
        this.Payer = null;
        this.PayerQuery = '';
        this.PayerResults = [];
        this.Allocations = {};
        this.Amount = 0;
        this.Fee = null;
        this.NetCash = null;
        this.Reference = '';
        this.Instrument = '';
        this.PaymentDate = new Date().toISOString().slice(0, 10);
        this.TenderCode = this.Tenders.length ? this.Tenders[0].Code : '';
        this.Result = null;
        this.Error = null;
        this.idempotencyKey = crypto.randomUUID();
        await this.loadOpenOrders();
        this.cdr.detectChanges();
    }

    public async ClearPayer(): Promise<void> {
        this.Payer = null;
        this.Allocations = {};
        this.Amount = 0;
        await this.loadOpenOrders();
        this.cdr.detectChanges();
    }

    public async ngOnInit(): Promise<void> {
        if (this.Tenders.length && !this.TenderCode) this.TenderCode = this.Tenders[0].Code;
        await this.loadOpenOrders();
        this.cdr.detectChanges();
    }

    /**
     * The tender decides the fee, and the fee is the server's number.
     *
     * Clearing it here rather than leaving the previous tender's figure on screen:
     * a card fee still showing beside a cheque is worse than an em dash, because
     * it is a specific wrong number rather than an obvious absence.
     */
    public OnTenderChanged(): void {
        this.Fee = null;
        this.NetCash = null;
        this.SchedulePreview();
    }

    public get SelectedTender(): MJOTenderOption | undefined {
        return this.Tenders.find((t) => t.Code === this.TenderCode);
    }

    /**
     * The provider's cut, as the SERVER computed it.
     *
     * This was a 2.9%-on-card guess until `Orders.CapturePayment` landed. A
     * client-side fee is a client-side general-ledger amount: the browser cannot
     * see the provider's schedule, and a screen that invents one will eventually
     * disagree with the ledger it is describing. Null until a preview has run —
     * "unknown" is honest, a stale number is not.
     */
    public Fee: number | null = null;

    /** What actually reaches the bank. Server's number, same reasoning. */
    public NetCash: number | null = null;

    /** Capture waits for the allocations to balance. */
    /**
     * True once this form represents a payment that HAS been taken.
     *
     * Captured money is immutable at the database — `trg_PaymentHeader_ImmutableAfterCapture`,
     * `trg_PaymentDetail_Immutable` and `trg_PaymentLine_ImmutableAfterCapture` all refuse the
     * update. Leaving the fields live after a capture invites someone to edit a payment that
     * cannot be edited, and the only feedback they would get is a trigger error. "Take a payment"
     * resets the form, which is the real way forward from here.
     */
    public get IsCaptured(): boolean {
        return !!this.Result;
    }

    public get CanCapture(): boolean {
        if (this.IsCaptured) return false;
        return this.Amount > 0 && UnallocatedRemainder(this.Amount, this.Allocations) === 0;
    }

    public SetAmount(raw: string): void {
        const parsed = Number.parseFloat(String(raw).replace(/[^0-9.]/g, ''));
        this.Amount = Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
    }

    /** Oldest first, with any surplus parked so the payment still balances. */
    public AutoApply(): void {
        this.Allocations = AllocateOldestFirst(this.Amount, this.OpenOrders);
    }

    /**
     * Build the operation input from what is on screen.
     *
     * `ReceivingCompanyID` comes from the orders being settled rather than from a
     * picker: the money is received by whoever is owed it, and asking the user to
     * restate that invites the two disagreeing.
     */
    private buildInput(preview: boolean): OrdersCapturePaymentInput | null {
        const allocations = Object.entries(this.Allocations)
            .map(([OrderHeaderID, Amount]) => ({ OrderHeaderID, Amount: Number(Amount) }))
            .filter((a) => a.Amount > 0);
        if (!allocations.length) return null;

        const first = this.OpenOrders.find((o) => o.ID === allocations[0].OrderHeaderID);
        if (!first) return null;

        return {
            Amount: this.Amount,
            ReceivingCompanyID: first.CompanyID,
            BillToOrganizationID: this.Payer?.IsOrganization ? this.Payer.ID : (this.CustomerID ?? null),
            BillToPersonID: this.Payer && !this.Payer.IsOrganization ? this.Payer.ID : null,
            TenderCode: this.TenderCode,
            PaymentDate: this.PaymentDate,
            Reference: this.Reference || null,
            Allocations: allocations,
            IdempotencyKey: this.idempotencyKey,
            Preview: preview,
        };
    }

    /**
     * Ask the server what this would book, debounced.
     *
     * The fee and the net are the server's to compute, so the only way to show
     * them before capturing is to run the real capture and roll it back — which is
     * exactly what `Preview: true` does. Debounced because it fires on every
     * keystroke in the amount field.
     */
    public SchedulePreview(): void {
        if (this.previewTimer) clearTimeout(this.previewTimer);
        this.previewTimer = setTimeout(() => void this.PreviewNow(), 400);
    }

    public async PreviewNow(): Promise<void> {
        const input = this.buildInput(true);
        if (!input || !this.CanCapture) {
            this.Fee = null;
            this.NetCash = null;
            this.cdr.detectChanges();
            return;
        }
        const op = new OrdersCapturePaymentOperation();
        const result = await op.Execute(input);
        const output = result.Output;
        if (output?.Success) {
            this.Fee = output.ProcessingFeeAmount ?? 0;
            this.NetCash = output.NetAmount ?? this.Amount;
        } else {
            this.Fee = null;
            this.NetCash = null;
        }
        this.cdr.detectChanges();
    }

    /**
     * Take the money.
     *
     * A repeat call with the same key returns the ORIGINAL payment with
     * `WasRetry`, so a double click or a retry after a timeout is reported as what
     * it was rather than charging twice or showing a spurious failure.
     */
    public async Capture(): Promise<void> {
        if (!this.CanCapture || this.Busy) return;
        const input = this.buildInput(false);
        if (!input) return;

        this.Busy = true;
        this.Error = null;
        try {
            const op = new OrdersCapturePaymentOperation();
            const result = await op.Execute(input);
            const output = result.Output;

            if (!output?.Success) {
                this.Error =
                    output?.Blockers?.map((b) => b.Message).join(' ') ??
                    output?.Message ??
                    result.ErrorMessage ??
                    'The payment was not captured.';
                return;
            }

            this.Result = output;
            this.Fee = output.ProcessingFeeAmount ?? 0;
            this.NetCash = output.NetAmount ?? this.Amount;

            // A new token, so the NEXT payment on this screen is a new payment
            // rather than a retry of this one.
            this.idempotencyKey = crypto.randomUUID();
            this.CaptureRequested.emit(output);
        } catch (e) {
            this.Error = e instanceof Error ? e.message : String(e);
        } finally {
            this.Busy = false;
            this.cdr.detectChanges();
        }
    }

    private async loadOpenOrders(): Promise<void> {
        const organizationID = this.Payer?.IsOrganization
            ? this.Payer.ID
            : (this.CustomerID ?? undefined);
        const rows = (await this.data.GetOrders({
            Preset: 'unpaid',
            BillToOrganizationID: organizationID,
        })).filter((row) => {
            if (!this.Payer) return true;
            const key = this.Payer.IsOrganization ? 'BillToOrganizationID' : 'BillToPersonID';
            return row[key] === this.Payer.ID;
        });
        const today = new Date().toISOString().slice(0, 10);
        this.OpenOrders = rows.map((row) => ({
            ID: row.ID,
            OrderNumber: row.OrderNumber,
            Description: row.Description,
            CompanyID: row.CompanyID,
            CompanyName: (row.Company as string) ?? null,
            DueDate: row.DueDate,
            DaysLate: row.DueDate ? DaysSince(row.DueDate, today) : null,
            Balance: row.Balance,
        }));
        // Default the amount to everything owing — the common case is settling a
        // statement, and typing the total again is work the screen can save.
        if (!this.Amount) {
            this.Amount = Math.round(this.OpenOrders.reduce((s, o) => s + o.Balance, 0) * 100) / 100;
        }
        this.cdr.detectChanges();
    }

}
