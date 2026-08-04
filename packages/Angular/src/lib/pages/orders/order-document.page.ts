import { ChangeDetectorRef, Component, Input, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MJOMoneyPipe, FormatDate, FormatMoney } from '../../panels/money-format';
import { MJOOrdersDataService, type MJOOrderRow } from '../../services/orders-data.service';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';

/** Who issued the bill. */
export interface MJOIssuer {
    Name: string;
    AddressLines: string[];
    Email?: string | null;
    Phone?: string | null;
    TaxID?: string | null;
    RemittanceNote?: string | null;
}

/**
 * `mjo-order-document-page` — the bill the customer actually receives.
 *
 * THERE IS NO INVOICE RECORD. The confirmed order IS the receivable, so this is
 * that order rendered — which means the number quoted on the phone, the number in
 * the ledger and the number in the aging report are the same number, with nothing
 * to fall out of sync.
 *
 * A credit memo is the same document with a negative total and different words,
 * not a second template: a return is an order too.
 *
 * PRINT IS REAL, not an afterthought. The `@media print` rules drop the app
 * chrome, go white and run the document edge to edge, because a bill that only
 * looks right on screen is a bill somebody re-types into Word.
 *
 * ## Example
 *
 * ```html
 * <mjo-order-document-page [OrderID]="id" [Issuer]="issuer" />
 * ```
 */
@Component({
    selector: 'mjo-order-document-page',
    standalone: true,
    imports: [MJButtonDirective, CommonModule, MJOMoneyPipe],
    template: `
        <div class="mjo-doc__toolbar no-print">
            <button type="button" mjButton variant="outline" (click)="print()">
                <i class="fa-solid fa-print" aria-hidden="true"></i> Print
            </button>
            <span class="small muted spacer">
                The confirmed order <b>is</b> the receivable — this is that order rendered, not a
                separate invoice record.
            </span>
        </div>

        @if (Order) {
            <article class="mj-doc" [class.mjo-doc--credit]="IsCredit">
                @if (IsPaid) {
                    <div class="mj-doc-stamp">Paid</div>
                }

                <header class="mj-doc-head">
                    <div class="issuer">
                        <div class="co">
                            <i class="fa-solid fa-cart-shopping" aria-hidden="true"></i>
                            {{ Issuer.Name }}
                        </div>
                        <div class="addr">
                            @for (line of Issuer.AddressLines; track line) {
                                {{ line }}<br>
                            }
                            @if (Issuer.Email) { {{ Issuer.Email }} }
                            @if (Issuer.Phone) { · {{ Issuer.Phone }} }
                            @if (Issuer.TaxID) { <br>{{ Issuer.TaxID }} }
                        </div>
                    </div>

                    <div class="docmeta">
                        <div class="kind">{{ IsCredit ? 'Credit memo' : 'Invoice' }}</div>
                        <div class="num">{{ Order.OrderNumber }}</div>
                        <dl class="mj-doc-meta-grid">
                            <dt>{{ IsCredit ? 'Issued' : 'Order date' }}</dt>
                            <dd>{{ date(Order.OrderDate) }}</dd>
                            @if (Order.DueDate && !IsCredit) {
                                <dt>Due</dt>
                                <dd>{{ date(Order.DueDate) }}</dd>
                            }
                            @if (Order['ExternalDocumentNumber']) {
                                <dt>Your PO</dt>
                                <dd>{{ Order['ExternalDocumentNumber'] }}</dd>
                            }
                        </dl>
                    </div>
                </header>

                <div class="mj-doc-parties">
                    <div>
                        <div class="lbl">Bill to</div>
                        <div class="who">
                            <div class="nm">{{ Order.BillToOrganization ?? Order.BillToPerson }}</div>
                            @if (Order.BillToOrganization && Order.BillToPerson) {
                                <div>Attn: {{ Order.BillToPerson }}</div>
                            }
                        </div>
                    </div>
                    <div>
                        <div class="lbl">Ship to</div>
                        <div class="who">
                            <div>{{ Order['ShipToAddress'] ?? '—' }}</div>
                        </div>
                    </div>
                </div>

                <table class="mj-table">
                    <thead>
                        <tr>
                            <th class="mjo-doc__n">#</th>
                            <th>Description</th>
                            <th class="num mjo-doc__qty">Qty</th>
                            <th class="num mjo-doc__unit">Unit</th>
                            <th class="num mjo-doc__amt">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        @for (line of Lines; track $index) {
                            <tr>
                                <td class="muted">{{ line['LineNumber'] }}</td>
                                <td>
                                    <span class="primary">{{ line['Product'] }}</span>
                                    @if (line['ServicePeriodStart']) {
                                        <div class="secondary">
                                            Service period {{ date(line['ServicePeriodStart']) }} –
                                            {{ date(line['ServicePeriodEnd']) }}
                                        </div>
                                    }
                                </td>
                                <td class="num">{{ line['Quantity'] }}</td>
                                <td class="num">{{ money(line['UnitPrice']) }}</td>
                                <td class="num strong">{{ money(line['LineTotalNet']) }}</td>
                            </tr>
                        } @empty {
                            <tr><td colspan="5" class="muted">No line detail available.</td></tr>
                        }
                    </tbody>
                </table>

                <div class="mj-doc-totals">
                    <div class="box">
                        <div class="mj-ladder">
                            <div class="mj-ladder-row">
                                <span class="label">Subtotal</span>
                                <span class="amt">{{ Subtotal | mjoMoney: { Sign: 'parentheses' } }}</span>
                            </div>
                            @if (ChargeTotal) {
                                <div class="mj-ladder-row">
                                    <span class="label">Charges</span>
                                    <span class="amt">{{ ChargeTotal | mjoMoney: { Sign: 'parentheses' } }}</span>
                                </div>
                            }
                            @if (TaxTotal) {
                                <div class="mj-ladder-row">
                                    <span class="label">Sales tax</span>
                                    <span class="amt">{{ TaxTotal | mjoMoney: { Sign: 'parentheses' } }}</span>
                                </div>
                            }
                        </div>

                        <div class="mj-doc-due">
                            <span class="l">{{ IsCredit ? 'Credit due you' : IsPaid ? 'Balance' : 'Amount due' }}</span>
                            <span class="v">
                                {{ Order.Balance | mjoMoney: { Sign: 'parentheses' } }}
                            </span>
                        </div>
                    </div>
                </div>

                <footer class="mj-doc-foot">
                    @if (IsCredit) {
                        <strong>How this credit can be used.</strong>
                        Apply it against another invoice, or request a refund to the original payment
                        method. It does not expire.
                    } @else {
                        <strong>How to pay.</strong>
                        {{ Issuer.RemittanceNote ?? 'Please reference the order number with your payment.' }}
                    }
                    <div class="mjo-doc__foot-meta">
                        <span>{{ Order.OrderNumber }}</span>
                        <span>Generated {{ date(today) }}</span>
                    </div>
                </footer>
            </article>
        } @else {
            <div class="mj-empty mjo-doc__empty">
                <i class="fa-regular fa-file-lines" aria-hidden="true"></i>
                <div class="t">No document</div>
                <div class="small">A bill exists once an order confirms — a draft has no number yet.</div>
            </div>
        }
    `,
    styles: [
        `
            :host {
                display: block;
                height: 100%;
                overflow: auto;
                padding: var(--mj-space-6);
            }
            .mjo-doc__toolbar {
                display: flex;
                align-items: center;
                gap: var(--mj-space-2);
                max-width: 860px;
                margin: 0 auto var(--mj-space-4);
                flex-wrap: wrap;
            }
            .mj-doc {
                position: relative;
            }
            .mjo-doc__n { width: 34px; }
            .mjo-doc__qty { width: 70px; }
            .mjo-doc__unit { width: 100px; }
            .mjo-doc__amt { width: 110px; }
            .mjo-doc__foot-meta {
                margin-top: var(--mj-space-3);
                display: flex;
                gap: var(--mj-space-6);
                flex-wrap: wrap;
            }
            .mjo-doc__empty {
                padding: var(--mj-space-12);
            }

            @media (max-width: 760px) {
                :host {
                    padding: var(--mj-space-4);
                }
                :host ::ng-deep .mj-doc {
                    padding: var(--mj-space-6);
                }
                :host ::ng-deep .mj-doc-head,
                :host ::ng-deep .mj-doc-parties {
                    grid-template-columns: 1fr;
                    flex-direction: column;
                    gap: var(--mj-space-4);
                }
                :host ::ng-deep .mj-doc-head .docmeta {
                    text-align: left;
                }
                :host ::ng-deep .mj-doc-meta-grid {
                    text-align: left;
                    justify-content: start;
                }
            }

            /* Print is real, not an afterthought — a bill that only looks right on
               screen is a bill somebody re-types into Word. */
            @media print {
                :host {
                    padding: 0;
                    overflow: visible;
                }
                .no-print {
                    display: none !important;
                }
                :host ::ng-deep .mj-doc {
                    border: none;
                    max-width: none;
                    padding: 0;
                }
            }
        `,
    ],
})
export class MJOOrderDocumentPageComponent implements OnInit {
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

    /** Which order to render. */
    @Input() OrderID: string | null = null;

    /** The issuing company's letterhead. */
    @Input() Issuer: MJOIssuer = { Name: '', AddressLines: [] };

    public Order: MJOOrderRow | null = null;
    public Lines: Array<Record<string, unknown>> = [];
    public readonly today = new Date().toISOString().slice(0, 10);

    public async ngOnInit(): Promise<void> {
        if (!this.OrderID) return;
        const orders = await this.data.GetOrders({ Preset: 'all' });
        this.Order = orders.find((o) => o.ID === this.OrderID) ?? null;
        if (this.Order) this.Lines = await this.data.GetOrderLines(this.Order.ID);
        this.cdr.detectChanges();
    }

    /** A credit memo is a return — the same document with a negative total. */
    public get IsCredit(): boolean {
        return this.Order?.OrderType === 'Return' || (this.Order?.TotalGross ?? 0) < 0;
    }

    public get IsPaid(): boolean {
        return this.Order?.PaymentStatus === 'Paid' && (this.Order?.Balance ?? 0) === 0;
    }

    public get Subtotal(): number {
        return this.Lines.reduce((s, l) => s + Number(l['LineTotalNet'] ?? 0), 0);
    }

    public get ChargeTotal(): number {
        return this.Lines.reduce((s, l) => s + Number(l['ChargeAmount'] ?? 0), 0);
    }

    public get TaxTotal(): number {
        return this.Lines.reduce((s, l) => s + Number(l['LineTax'] ?? 0), 0);
    }

    protected date(value: unknown): string {
        return FormatDate(value as string);
    }

    protected money(value: unknown): string {
        return FormatMoney(Number(value ?? 0), { Sign: 'parentheses' });
    }

    protected print(): void {
        globalThis.print?.();
    }
}
