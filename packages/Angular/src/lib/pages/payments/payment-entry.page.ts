import { ChangeDetectorRef, Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
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
    imports: [CommonModule, FormsModule, MJOAllocationGridComponent, MJOStatedValueComponent, MJOMoneyPipe],
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
                                class="mj-input is-num"
                                [value]="Amount"
                                (change)="SetAmount($any($event.target).value)"
                                aria-label="Amount received">
                        </label>

                        <label class="mj-field">
                            <label>Date received</label>
                            <input class="mj-input" type="date" [(ngModel)]="PaymentDate" name="paymentDate">
                        </label>

                        <label class="mj-field">
                            <label>Tender</label>
                            <select class="mj-select" [(ngModel)]="TenderCode" name="tender">
                                @for (tender of Tenders; track tender.ID) {
                                    <option [value]="tender.Code">{{ tender.Name }}</option>
                                }
                            </select>
                            <div class="hint">
                                Reversal types are absent because the data says they are reversals — not
                                because this list hardcodes an exclusion.
                            </div>
                        </label>

                        <!-- Instrument fields follow the tender's own requirements. -->
                        @if (SelectedTender?.RequiresReference) {
                            <label class="mj-field">
                                <label>Reference</label>
                                <input class="mj-input" [(ngModel)]="Reference" name="reference"
                                       placeholder="Cheque number, wire confirmation…">
                            </label>
                        }
                        @if (SelectedTender?.RequiresInstrument) {
                            <label class="mj-field">
                                <label>Instrument</label>
                                <select class="mj-select" [(ngModel)]="Instrument" name="instrument">
                                    <option value="">Saved payment method…</option>
                                    <option value="new">New card — hosted tokenization</option>
                                </select>
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
                        <mjo-stated-value Label="Dr Cash">{{ NetCash | mjoMoney }}</mjo-stated-value>
                        @if (Fee > 0) {
                            <mjo-stated-value Label="Dr Processing fee">{{ Fee | mjoMoney }}</mjo-stated-value>
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
                <mjo-allocation-grid
                    [Orders]="OpenOrders"
                    [Amount]="Amount"
                    [Allocations]="Allocations"
                    (AllocationsChanged)="Allocations = $event"
                    (AutoApplyRequested)="AutoApply()" />

                <div class="mjo-pe__actions">
                    <button
                        type="button"
                        class="mj-btn mj-btn--primary"
                        [disabled]="!CanCapture"
                        (click)="Capture()">
                        <i class="fa-solid fa-check" aria-hidden="true"></i> Capture payment
                    </button>
                    <button type="button" class="mj-btn mj-btn--outline">Save as pending</button>
                    <span class="small muted spacer">
                        Allocations freeze at capture. A pending payment is still a draft.
                    </span>
                </div>
            </div>
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
            .mjo-pe__actions {
                display: flex;
                align-items: center;
                gap: var(--mj-space-2);
                margin-top: var(--mj-space-4);
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
    @Output() CaptureRequested = new EventEmitter<{
        Amount: number;
        Allocations: MJOAllocationMap;
        TenderCode: string;
        Reference: string;
        PaymentDate: string;
    }>();

    public Amount = 0;
    public PaymentDate = new Date().toISOString().slice(0, 10);
    public TenderCode = '';
    public Reference = '';
    public Instrument = '';
    public Allocations: MJOAllocationMap = {};
    public OpenOrders: MJOAllocatableOrder[] = [];

    public async ngOnInit(): Promise<void> {
        if (this.Tenders.length && !this.TenderCode) this.TenderCode = this.Tenders[0].Code;
        await this.loadOpenOrders();
        this.cdr.detectChanges();
    }

    public get SelectedTender(): MJOTenderOption | undefined {
        return this.Tenders.find((t) => t.Code === this.TenderCode);
    }

    /** Card processing costs money; a cheque does not. Illustrative until a provider quotes it. */
    public get Fee(): number {
        if (this.TenderCode !== 'Card') return 0;
        return Math.round(this.Amount * 0.029 * 100) / 100;
    }

    public get NetCash(): number {
        return Math.round((this.Amount - this.Fee) * 100) / 100;
    }

    /** Capture waits for the allocations to balance. */
    public get CanCapture(): boolean {
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

    public Capture(): void {
        if (!this.CanCapture) return;
        this.CaptureRequested.emit({
            Amount: this.Amount,
            Allocations: this.Allocations,
            TenderCode: this.TenderCode,
            Reference: this.Reference,
            PaymentDate: this.PaymentDate,
        });
    }

    private async loadOpenOrders(): Promise<void> {
        const rows = await this.data.GetOrders({
            Preset: 'unpaid',
            BillToOrganizationID: this.CustomerID ?? undefined,
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
