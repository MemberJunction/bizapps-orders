import { ChangeDetectorRef, Component, EventEmitter, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MJOAgingBarComponent, type MJOAgingBuckets } from '../../panels/aging-bar.component';
import { MJOMoneyStripComponent } from '../../panels/money-strip.component';
import { MJOWorklistTableComponent, type MJOColumn } from '../../panels/worklist-table.component';
import { MJOOrdersDataService, type MJOOrderRow, type MJOPaymentRow } from '../../services/orders-data.service';
import { DaysSince, FormatDate, FormatMoney, Initials } from '../../panels/money-format';
import { MJAlertComponent } from '@memberjunction/ng-ui-components';

/** A customer with a balance, as the left rail lists them. */
interface MJOCustomerSummary {
    Key: string;
    Name: string;
    IsOrganization: boolean;
    Open: number;
    Credit: number;
    Buckets: MJOAgingBuckets;
    Orders: MJOOrderRow[];
}

/**
 * `mjo-customer-ar-page` — one customer's whole money picture.
 *
 * WHY THIS IS ITS OWN SCREEN. The accounting team's job is not looking up an
 * invoice; it is knowing where a relationship stands before picking up the phone.
 * So aging, open items, credits held and payment history sit together rather than
 * across four surfaces.
 *
 * BALANCES ARE DERIVED FROM THE ORDER ROWS, never stored separately. A customer's
 * open balance is the sum of what their orders carry, and their credit is the sum
 * of the negative ones — because a credit IS a negative order balance and there
 * is no separate instrument. Two hand-maintained numbers would eventually
 * disagree; one derived number cannot.
 *
 * ## Example
 *
 * ```html
 * <mjo-customer-ar-page (OrderOpened)="open($event)" />
 * ```
 */
@Component({
    selector: 'mjo-customer-ar-page',
    standalone: true,
    imports: [CommonModule, MJOAgingBarComponent, MJOMoneyStripComponent, MJOWorklistTableComponent, MJAlertComponent],
    template: `
        <div class="mjo-ar__split">
            <!-- ── Customers ── -->
            <aside class="mjo-ar__left">
                <div class="mj-card mjo-ar__total">
                    <div class="mj-card-head">
                        <i class="fa-solid fa-chart-column" aria-hidden="true"></i>
                        <h3>Total A/R by age</h3>
                        <span class="right mj-num small strong">{{ money(TotalOpen) }}</span>
                    </div>
                    <div class="mj-card-pad">
                        <mjo-aging-bar [Buckets]="TotalBuckets" />
                        <div class="small muted mjo-ar__note">
                            All customers with an open balance.
                        </div>
                    </div>
                </div>

                <div class="mj-card">
                    <div class="mj-card-head">
                        <i class="fa-solid fa-user-tag" aria-hidden="true"></i>
                        <h3>Customers with a balance</h3>
                    </div>
                    <div class="mj-card-pad mjo-ar__list">
                        @for (customer of Customers; track customer.Key) {
                            <button
                                type="button"
                                class="mjo-ar__cust"
                                [class.is-active]="customer.Key === SelectedKey"
                                (click)="Select(customer.Key)">
                                <span class="mj-avatar mjo-ar__avatar">{{ initials(customer.Name) }}</span>
                                <span class="mjo-ar__cust-body">
                                    <span class="mjo-ar__cust-name">{{ customer.Name }}</span>
                                    <span class="small muted mjo-ar__cust-sub">
                                        {{ customer.IsOrganization ? 'Organization' : 'Individual' }}
                                    </span>
                                </span>
                                <span class="mjo-ar__cust-amt">
                                    <b class="mj-num">{{ money(customer.Open) }}</b>
                                    @if (customer.Credit > 0) {
                                        <span class="small mj-money--credit mjo-ar__cust-credit">
                                            +{{ money(customer.Credit) }} cr
                                        </span>
                                    }
                                </span>
                            </button>
                        } @empty {
                            <div class="small muted">Nobody owes anything.</div>
                        }
                    </div>
                </div>
            </aside>

            <!-- ── Detail ── -->
            <div class="mjo-ar__right">
                @if (Selected) {
                    <div class="mj-card">
                        <div class="mj-card-pad">
                            <div class="mjo-ar__header">
                                <span class="mj-avatar mjo-ar__avatar-lg">{{ initials(Selected.Name) }}</span>
                                <div class="mjo-ar__header-body">
                                    <div class="mjo-ar__header-name">{{ Selected.Name }}</div>
                                    <div class="small muted">
                                        {{ Selected.IsOrganization ? 'Organization' : 'Individual' }} ·
                                        {{ Selected.Orders.length }} order{{ Selected.Orders.length === 1 ? '' : 's' }}
                                    </div>
                                </div>
                            </div>

                            <mjo-money-strip
                                class="mjo-ar__strip"
                                TotalLabel="Open balance"
                                [Total]="Selected.Open"
                                [ShowPaid]="false"
                                [Balance]="NetOwed"
                                [ShowStatus]="false" />

                            <div class="mjo-ar__aging">
                                <mjo-aging-bar [Buckets]="Selected.Buckets" />
                            </div>

                            @if (Selected.Credit > 0) {
                                <mj-alert Variant="success" Icon="fa-solid fa-piggy-bank" class="mjo-ar__credit">
                                        <strong>{{ money(Selected.Credit) }} of credit is sitting unused</strong>
                                        while {{ money(Selected.Open) }} is owed. Applying it first is almost always
                                        the right move — and it is one click, because the credit is just another
                                        order balance.
                                </mj-alert>
                            }
                        </div>
                    </div>

                    <div class="mj-card mjo-ar__items">
                        <div class="mj-card-head">
                            <i class="fa-solid fa-file-invoice-dollar" aria-hidden="true"></i>
                            <h3>Open items</h3>
                            <span class="right small muted">oldest first</span>
                        </div>
                        <mjo-worklist-table
                            [Columns]="Columns"
                            [Rows]="OpenItems"
                            [Presets]="[]"
                            [Searchable]="false"
                            RowKey="ID"
                            EmptyIcon="fa-solid fa-check"
                            EmptyTitle="Nothing outstanding"
                            EmptyHint="Every confirmed order is settled."
                            (RowClicked)="OrderOpened.emit($any($event))" />
                    </div>

                    <div class="mjo-ar__grid">
                        <div class="mj-card">
                            <div class="mj-card-head">
                                <i class="fa-solid fa-piggy-bank" aria-hidden="true"></i>
                                <h3>Credits they hold</h3>
                            </div>
                            <div class="mj-card-pad">
                                @for (credit of CreditItems; track credit.ID) {
                                    <div class="mjo-ar__row">
                                        <span class="mono small">{{ credit.OrderNumber }}</span>
                                        <b class="mj-num mj-money--credit">
                                            {{ money(-Math.abs(credit.Balance)) }}
                                        </b>
                                    </div>
                                } @empty {
                                    <div class="small muted">
                                        No credit on file. A credit is an order paid for more than it
                                        was worth — there is no separate instrument to look up.
                                    </div>
                                }
                                @if (CreditItems.length) {
                                    <div class="small muted mjo-ar__note">
                                        Spend this before invoicing them again. Chasing cash from a
                                        customer already holding your money is the call nobody wants
                                        to make twice.
                                    </div>
                                }
                            </div>
                        </div>

                        <div class="mj-card">
                            <div class="mj-card-head">
                                <i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i>
                                <h3>Payment history</h3>
                            </div>
                            <div class="mj-card-pad">
                                @for (payment of Payments; track payment.ID) {
                                    <div class="mjo-ar__row">
                                        <span class="small">
                                            <span class="mono">{{ payment.PaymentNumber }}</span>
                                            <span class="muted"> · {{ dateOf(payment.PaymentDate) }}</span>
                                        </span>
                                        <b class="mj-num">{{ money(payment.Amount) }}</b>
                                    </div>
                                } @empty {
                                    <div class="small muted">
                                        No payments recorded for this customer.
                                    </div>
                                }
                            </div>
                        </div>
                    </div>

                    <div class="mj-card mjo-ar__block">
                        <div class="mj-card-head">
                            <i class="fa-solid fa-rotate" aria-hidden="true"></i>
                            <h3>Subscriptions</h3>
                            <span class="right small muted">{{ Subscriptions.length }}</span>
                        </div>
                        <div class="mj-table-wrap">
                            <table class="mj-table mj-table--compact">
                                <thead>
                                    <tr>
                                        <th>Subscription</th>
                                        <th>Product</th>
                                        <th>Covered to</th>
                                        <th>Renews</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    @for (sub of Subscriptions; track sub['ID']) {
                                        <tr>
                                            <td class="mono small">{{ sub['SubscriptionNumber'] }}</td>
                                            <td class="small">{{ sub['Product'] ?? '—' }}</td>
                                            <td class="small">{{ dateOf(sub['EndDate']) }}</td>
                                            <td class="small">
                                                {{ sub['AutoRenew'] ? 'automatically' : 'it simply ends' }}
                                            </td>
                                            <td>
                                                <span class="mj-chip" [class]="subClass(sub)">
                                                    {{ sub['Status'] ?? '—' }}
                                                </span>
                                            </td>
                                        </tr>
                                    } @empty {
                                        <tr>
                                            <td colspan="5" class="small muted">
                                                No subscriptions. Nothing here renews on its own.
                                            </td>
                                        </tr>
                                    }
                                </tbody>
                            </table>
                        </div>
                    </div>
                } @else {
                    <div class="mj-empty mjo-ar__empty">
                        <i class="fa-solid fa-user-tag" aria-hidden="true"></i>
                        <div class="t">Pick a customer</div>
                        <div class="small">Their aging, open items and credits appear here.</div>
                    </div>
                }
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
            .mjo-ar__split {
                display: flex;
                gap: var(--mj-space-4);
                align-items: flex-start;
            }
            .mjo-ar__left { flex: 0 0 300px; min-width: 0; }
            .mjo-ar__right { flex: 1; min-width: 0; }
            .mjo-ar__list { padding: var(--mj-space-2); }

            .mjo-ar__cust {
                display: flex;
                align-items: center;
                gap: var(--mj-space-3);
                padding: var(--mj-space-3);
                border-radius: var(--mj-radius-md);
                cursor: pointer;
                border: 1px solid transparent;
                background: none;
                width: 100%;
                text-align: left;
                font-family: inherit;
                color: inherit;
            }
            .mjo-ar__cust:hover { background: var(--mj-bg-surface-hover); }
            .mjo-ar__cust.is-active {
                background: color-mix(in srgb, var(--mj-brand-primary) 8%, transparent);
                border-color: color-mix(in srgb, var(--mj-brand-primary) 35%, transparent);
            }
            .mjo-ar__avatar { width: 30px; height: 30px; font-size: 11px; }
            .mjo-ar__avatar-lg { width: 44px; height: 44px; font-size: 15px; }
            .mjo-ar__cust-body { flex: 1; min-width: 0; }
            .mjo-ar__cust-name { font-size: 13px; font-weight: var(--mj-font-medium); display: block; }
            .mjo-ar__cust-sub { display: block; }
            .mjo-ar__cust-amt { text-align: right; }
            .mjo-ar__cust-credit { display: block; }

            .mjo-ar__header { display: flex; align-items: flex-start; gap: var(--mj-space-4); }
            .mjo-ar__header-body { flex: 1; min-width: 0; }
            .mjo-ar__header-name { font-size: 17px; font-weight: var(--mj-font-semibold); }
            .mjo-ar__strip { display: block; margin-top: var(--mj-space-4); }
            .mjo-ar__aging { margin-top: var(--mj-space-4); }
            .mjo-ar__credit { margin-top: var(--mj-space-4); }
            .mjo-ar__items { margin-top: var(--mj-space-4); }
            .mjo-ar__empty { padding: var(--mj-space-12); }

            /* These four hooks were in the markup with no rule anywhere, so the
               two lower cards stacked full-width instead of pairing, and each
               order/amount pair ran together as one line of text. */
            .mjo-ar__grid {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: var(--mj-space-4);
                margin-top: var(--mj-space-4);
            }
            .mjo-ar__row {
                display: flex;
                align-items: baseline;
                justify-content: space-between;
                gap: var(--mj-space-3);
                padding: var(--mj-space-2) 0;
                border-bottom: 1px solid var(--mj-border-subtle);
            }
            .mjo-ar__row:last-child { border-bottom: none; }
            .mjo-ar__block { margin-top: var(--mj-space-4); }
            .mjo-ar__total { display: block; }

            @media (max-width: 900px) {
                .mjo-ar__grid { grid-template-columns: 1fr; }
            }

            @media (max-width: 1100px) {
                .mjo-ar__split { flex-direction: column; }
                .mjo-ar__left, .mjo-ar__right { flex: 1 1 auto; width: 100%; }
            }
            @media (max-width: 760px) {
                :host { padding: var(--mj-space-4); }
            }
        `,
    ],
})
export class MJOCustomerARPageComponent implements OnInit {
    private readonly data = inject(MJOOrdersDataService);
    /**
     * Render what was just loaded. See orders-dashboard.page.ts for the full
     * reasoning: these pages are created imperatively by the section shell, and an
     * async assignment across Angular's check/verify boundary raises NG0100, aborts
     * the DOM write, and freezes the view on its pre-load values permanently.
     */
    private readonly cdr = inject(ChangeDetectorRef);

    @Output() OrderOpened = new EventEmitter<MJOOrderRow>();

    public Customers: MJOCustomerSummary[] = [];
    public SelectedKey: string | null = null;

    public readonly Columns: MJOColumn<MJOOrderRow>[] = [
        { Key: 'OrderNumber', Label: 'Order', Kind: 'mono', Width: '116px' },
        { Key: 'Description', Label: 'Memo', Format: (r) => (r.Description as string) ?? '—' },
        { Key: 'Company', Label: 'Co.', Width: '96px', HideBelow: 1000 },
        {
            Key: 'DueDate',
            Label: 'Due',
            Width: '100px',
            Format: (r) => (r.DueDate ? FormatDate(r.DueDate, { Short: true }) : '—'),
        },
        { Key: 'TotalGross', Label: 'Total', Kind: 'money', Width: '112px', Format: (r) => FormatMoney(r.TotalGross) },
        { Key: 'Balance', Label: 'Balance', Kind: 'money', Width: '116px', Format: (r) => FormatMoney(r.Balance) },
        {
            Key: 'Age',
            Label: 'Age',
            Width: '86px',
            Kind: 'chip',
            Format: (r) => this.ageLabel(r),
            ChipClass: (r) => this.ageClass(r),
        },
    ];

    public async ngOnInit(): Promise<void> {
        await this.load();
    }

    public Payments: MJOPaymentRow[] = [];
    public Subscriptions: Array<Record<string, unknown>> = [];

    /** Exposed for the template — `Math` is not in Angular's expression scope. */
    protected readonly Math = Math;

    public async Select(key: string): Promise<void> {
        this.SelectedKey = key;
        await this.loadCustomerDetail();
        this.cdr.detectChanges();
    }

    /**
     * Payments and subscriptions for the selected customer only.
     *
     * Fetched on selection rather than up front: this screen shows one customer at
     * a time, and loading a hundred payment histories to render one is work with
     * no answer attached to it. Both awaits complete BEFORE either is assigned, so
     * no assignment straddles the boundary that produces NG0100.
     */
    private async loadCustomerDetail(): Promise<void> {
        const selected = this.Selected;
        if (!selected) {
            this.Payments = [];
            this.Subscriptions = [];
            return;
        }
        const identity = {
            OrganizationID: selected.IsOrganization ? selected.Key : null,
            PersonID: selected.IsOrganization ? null : selected.Key,
        };
        const [payments, subscriptions] = await Promise.all([
            this.data.GetPaymentsForCustomer(identity),
            this.data.GetSubscriptionsForCustomer(identity),
        ]);
        this.Payments = payments;
        this.Subscriptions = subscriptions;
        this.cdr.detectChanges();
    }

    /**
     * The whole portfolio's aging, summed from the per-customer buckets.
     *
     * Derived rather than queried — the customers are already grouped and bucketed
     * in memory, and asking the database to age the same rows again would be a
     * second implementation of the same rule.
     */
    public get TotalBuckets(): MJOAgingBuckets {
        const total: MJOAgingBuckets = { Current: 0, Days1To30: 0, Days31To60: 0, Days61Plus: 0 };
        for (const customer of this.Customers) {
            total.Current += customer.Buckets.Current;
            total.Days1To30 += customer.Buckets.Days1To30;
            total.Days31To60 += customer.Buckets.Days31To60;
            total.Days61Plus += customer.Buckets.Days61Plus;
        }
        (Object.keys(total) as Array<keyof MJOAgingBuckets>).forEach(
            (k) => (total[k] = Math.round(total[k] * 100) / 100),
        );
        return total;
    }

    /** What the whole book is owed, before credits are spent. */
    public get TotalOpen(): number {
        return Math.round(this.Customers.reduce((sum, c) => sum + c.Open, 0) * 100) / 100;
    }

    /** Orders this customer has OVER-paid — their spendable credit. */
    public get CreditItems(): MJOOrderRow[] {
        return (this.Selected?.Orders ?? []).filter((o) => o.Balance < 0);
    }

    protected dateOf(value: unknown): string {
        return value ? FormatDate(String(value), { Short: true }) : '—';
    }

    protected subClass(sub: Record<string, unknown>): string {
        switch (sub['Status']) {
            case 'Active':
                return 'mj-chip--success';
            case 'Grace':
                return 'mj-chip--warning';
            default:
                return 'mj-chip--outline';
        }
    }

    public get Selected(): MJOCustomerSummary | undefined {
        return this.Customers.find((c) => c.Key === this.SelectedKey);
    }

    /** What they owe after their credit is spent — the number that matters. */
    public get NetOwed(): number {
        if (!this.Selected) return 0;
        return Math.round((this.Selected.Open - this.Selected.Credit) * 100) / 100;
    }

    public get OpenItems(): MJOOrderRow[] {
        return (this.Selected?.Orders ?? [])
            .filter((o) => o.Balance !== 0)
            .slice()
            .sort((a, b) => (a.DueDate ?? '').localeCompare(b.DueDate ?? ''));
    }

    protected initials(name: string): string {
        return Initials(name);
    }

    protected money(value: number): string {
        return FormatMoney(value);
    }

    private ageLabel(row: MJOOrderRow): string {
        if (!row.DueDate || row.Balance <= 0) return 'Current';
        const late = DaysSince(row.DueDate, new Date().toISOString().slice(0, 10));
        return late > 0 ? `${late}d` : 'Current';
    }

    private ageClass(row: MJOOrderRow): string {
        if (!row.DueDate || row.Balance <= 0) return '';
        const late = DaysSince(row.DueDate, new Date().toISOString().slice(0, 10));
        if (late > 60) return 'mj-chip--error';
        if (late > 0) return 'mj-chip--warning';
        return '';
    }

    /**
     * Group open orders by customer and derive every figure from them.
     *
     * The organization wins over the person when both are present: an employee's
     * order billed to their employer is the employer's receivable.
     */
    private async load(): Promise<void> {
        const orders = await this.data.GetOrders({ Preset: 'all' });
        const open = orders.filter((o) => !['Draft', 'Quoted', 'Voided'].includes(o.Status) && o.Balance !== 0);

        const byCustomer = new Map<string, MJOCustomerSummary>();
        const today = new Date().toISOString().slice(0, 10);

        for (const order of open) {
            const key = (order['BillToOrganizationID'] as string) ?? (order['BillToPersonID'] as string) ?? 'unknown';
            const name = (order.BillToOrganization ?? order.BillToPerson ?? 'Unknown') as string;
            const isOrg = !!order['BillToOrganizationID'];

            const existing =
                byCustomer.get(key) ??
                ({
                    Key: key,
                    Name: name,
                    IsOrganization: isOrg,
                    Open: 0,
                    Credit: 0,
                    Buckets: { Current: 0, Days1To30: 0, Days31To60: 0, Days61Plus: 0 },
                    Orders: [],
                } satisfies MJOCustomerSummary);

            existing.Orders.push(order);

            if (order.Balance < 0) {
                // A negative balance IS the credit — no separate instrument.
                existing.Credit += Math.abs(order.Balance);
            } else {
                existing.Open += order.Balance;
                const late = order.DueDate ? DaysSince(order.DueDate, today) : 0;
                if (late <= 0) existing.Buckets.Current += order.Balance;
                else if (late <= 30) existing.Buckets.Days1To30 += order.Balance;
                else if (late <= 60) existing.Buckets.Days31To60 += order.Balance;
                else existing.Buckets.Days61Plus += order.Balance;
            }

            byCustomer.set(key, existing);
        }

        const round = (v: number): number => Math.round((v + Number.EPSILON) * 100) / 100;
        this.Customers = [...byCustomer.values()]
            .map((c) => ({
                ...c,
                Open: round(c.Open),
                Credit: round(c.Credit),
                Buckets: {
                    Current: round(c.Buckets.Current),
                    Days1To30: round(c.Buckets.Days1To30),
                    Days31To60: round(c.Buckets.Days31To60),
                    Days61Plus: round(c.Buckets.Days61Plus),
                },
            }))
            .sort((a, b) => b.Open - a.Open);

        if (!this.SelectedKey && this.Customers.length) this.SelectedKey = this.Customers[0].Key;
        this.cdr.detectChanges();
    }
}
