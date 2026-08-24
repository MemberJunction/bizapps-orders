import { ChangeDetectorRef, Component, EventEmitter, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EntityViewerModule, type RecordOpenedEvent } from '@memberjunction/ng-entity-viewer';
import { Metadata, type EntityInfo } from '@memberjunction/core';
import { type MJUserViewEntityExtended } from '@memberjunction/core-entities';
import { MJOAgingBarComponent, type MJOAgingBuckets } from '../../panels/aging-bar.component';
import { MJOMoneyStripComponent } from '../../panels/money-strip.component';
import { DaysSince, FormatDate, FormatMoney, Initials } from '../../panels/money-format';
import { MJAlertComponent } from '@memberjunction/ng-ui-components';
import { GetOrders, GetPaymentsForCustomer, GetSubscriptionsForCustomer } from '../../data/orders-queries';
import { MJO_ENTITIES } from '../../data/entity-names';
import type { mjBizAppsOrdersOrderHeaderEntity, mjBizAppsOrdersPaymentHeaderEntity, mjBizAppsOrdersSubscriptionEntity } from '@mj-biz-apps/orders-entities';

/** A customer with a balance, as the left rail lists them. */
interface MJOCustomerSummary {
    Key: string;
    Name: string;
    IsOrganization: boolean;
    Open: number;
    Credit: number;
    Buckets: MJOAgingBuckets;
    Orders: mjBizAppsOrdersOrderHeaderEntity[];
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
    imports: [CommonModule, EntityViewerModule, MJOAgingBarComponent, MJOMoneyStripComponent, MJAlertComponent],
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
                        <div class="mjo-ar__viewer-host">
                            @if (OrderEntityInfo) {
                                <mj-entity-viewer
                                    [Entity]="OrderEntityInfo"
                                    [ViewEntity]="CustomerOpenOrdersView"
                                    (RecordOpened)="OnRecordOpened($event)">
                                </mj-entity-viewer>
                            } @else {
                                <div class="small muted" style="padding: 24px;">Loading open items...</div>
                            }
                        </div>
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
                                            {{ money(-Math.abs((credit.Balance ?? 0))) }}
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
                                        <b class="mj-num">{{ money((payment.Amount ?? 0)) }}</b>
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
            .mjo-ar__items {
                margin-top: var(--mj-space-4);
                display: flex;
                flex-direction: column;
                height: 520px;
                min-height: 450px;
            }
            .mjo-ar__viewer-host {
                flex: 1 1 auto;
                height: 100%;
                min-height: 380px;
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
    private readonly cdr = inject(ChangeDetectorRef);

    @Output() OrderOpened = new EventEmitter<mjBizAppsOrdersOrderHeaderEntity>();

    public OrderEntityInfo: EntityInfo | null = null;
    public Customers: MJOCustomerSummary[] = [];
    public SelectedKey: string | null = null;

    public get CustomerOpenOrdersView(): MJUserViewEntityExtended | null {
        if (!this.OrderEntityInfo || !this.Selected) return null;
        const col = this.Selected.IsOrganization ? 'BillToOrganizationID' : 'BillToPersonID';
        return {
            EntityID: this.OrderEntityInfo.ID,
            Entity: this.OrderEntityInfo.Name,
            WhereClause: `${col} = '${this.Selected.Key}' AND Balance > 0`,
            ID: `preset-customer-orders-${this.Selected.Key}`,
            Name: `${this.Selected.Name} Open Items`
        } as unknown as MJUserViewEntityExtended;
    }

    public async ngOnInit(): Promise<void> {
        const md = new Metadata();
        this.OrderEntityInfo = md.Entities.find((e) => e.Name === MJO_ENTITIES.OrderHeader) || null;
        await this.load();
        this.cdr.detectChanges();
    }

    public OnRecordOpened(event: RecordOpenedEvent): void {
        const id = (event.compositeKey?.GetValueByFieldName('ID') ?? event.record?.['ID']) as string | undefined;
        if (id) {
            const surrogate = { ID: id } as mjBizAppsOrdersOrderHeaderEntity;
            this.OrderOpened.emit(surrogate);
        }
    }

    public Payments: mjBizAppsOrdersPaymentHeaderEntity[] = [];
    public Subscriptions: mjBizAppsOrdersSubscriptionEntity[] = [];

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
            GetPaymentsForCustomer(identity),
            GetSubscriptionsForCustomer(identity),
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
    public get CreditItems(): mjBizAppsOrdersOrderHeaderEntity[] {
        return (this.Selected?.Orders ?? []).filter((o) => (o.Balance ?? 0) < 0);
    }

    protected dateOf(value: unknown): string {
        return value ? FormatDate(String(value), { Short: true }) : '—';
    }

    /**
     * The chip for a subscription's state.
     *
     * `'Grace'` was here and is not a status this schema has — the union is
     * Active / Paused / Canceled / Migrated / Trialing — so the warning chip could never render and
     * a paused subscription looked exactly like a cancelled one. Paused is the state that wants
     * attention: the customer still holds the seat and is not currently being served by it.
     */
    protected subClass(sub: mjBizAppsOrdersSubscriptionEntity): string {
        switch (sub.Status) {
            case 'Active':
                return 'mj-chip--success';
            case 'Trialing':
                return 'mj-chip--info';
            case 'Paused':
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

    public get OpenItems(): mjBizAppsOrdersOrderHeaderEntity[] {
        return (this.Selected?.Orders ?? [])
            .filter((o) => (o.Balance ?? 0) !== 0)
            .slice()
            // Undated last: an order with no due date is not "due first", and an empty string
            // sorted ahead of every real date, which put unscheduled work at the top of an aging list.
            .sort((a, b) => (a.DueDate?.getTime() ?? Infinity) - (b.DueDate?.getTime() ?? Infinity));
    }

    protected initials(name: string): string {
        return Initials(name);
    }

    protected money(value: number): string {
        return FormatMoney(value);
    }

    private ageLabel(row: mjBizAppsOrdersOrderHeaderEntity): string {
        if (!row.DueDate || (row.Balance ?? 0) <= 0) return 'Current';
        const late = DaysSince(row.DueDate, new Date().toISOString().slice(0, 10));
        return late > 0 ? `${late}d` : 'Current';
    }

    private ageClass(row: mjBizAppsOrdersOrderHeaderEntity): string {
        if (!row.DueDate || (row.Balance ?? 0) <= 0) return '';
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
        const orders = await GetOrders({ Preset: 'all' });
        const open = orders.filter((o) => !['Draft', 'Quoted', 'Voided'].includes(o.Status) && (o.Balance ?? 0) !== 0);

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

            if ((order.Balance ?? 0) < 0) {
                // A negative balance IS the credit — no separate instrument.
                existing.Credit += Math.abs((order.Balance ?? 0));
            } else {
                existing.Open += (order.Balance ?? 0);
                const late = order.DueDate ? DaysSince(order.DueDate, today) : 0;
                if (late <= 0) existing.Buckets.Current += (order.Balance ?? 0);
                else if (late <= 30) existing.Buckets.Days1To30 += (order.Balance ?? 0);
                else if (late <= 60) existing.Buckets.Days31To60 += (order.Balance ?? 0);
                else existing.Buckets.Days61Plus += (order.Balance ?? 0);
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
