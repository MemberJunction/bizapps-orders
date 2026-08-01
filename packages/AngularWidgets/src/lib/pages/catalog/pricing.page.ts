import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MJOWorklistTableComponent, type MJOColumn } from '../../panels/worklist-table.component';
import { MJOOrdersDataService } from '../../services/orders-data.service';
import { FormatDate, FormatMoney } from '../../panels/money-format';

/**
 * `mjo-pricing-page` — price rules, and the dates that switch them over.
 *
 * ONE ROW IS ONE PRICE RULE. Bands, seasons and time-of-day windows are several
 * rows rather than one row with more columns, and `Priority` disambiguates when
 * two of them match. That shape is what keeps a rule readable: "10% off
 * publications in March" is a row, not a clause inside a row.
 *
 * TIES ARE REFUSED AT WRITE TIME, not resolved at read time. A price that depends
 * on which of two equal-priority rules the database returned first is a price
 * nobody can explain, and the person who created the ambiguity is the one who
 * should resolve it — while they still remember what they meant.
 *
 * Direct entry on an order line always wins over every rule here. Pricing layers
 * suggestion on top of that rather than replacing it, so it can never block a
 * baseline flow.
 *
 * ## Example
 *
 * ```html
 * <mjo-pricing-page />
 * ```
 */
@Component({
    selector: 'mjo-pricing-page',
    standalone: true,
    imports: [CommonModule, MJOWorklistTableComponent],
    template: `
        <div class="mj-banner mj-banner--neutral mjo-pr__note">
            <i class="fa-solid fa-tags" aria-hidden="true"></i>
            <div class="body">
                <strong>One row is one price rule.</strong>
                Bands and seasons are several rows rather than one row with more columns, and priority
                disambiguates. Ties between equal-priority rules are refused when the rule is
                <b>saved</b> — a price that depends on row order is a price nobody can explain.
            </div>
        </div>

        <mjo-worklist-table
            [Columns]="Columns"
            [Rows]="Rows"
            [Presets]="[]"
            [Searchable]="false"
            RowKey="ID"
            EmptyIcon="fa-solid fa-tags"
            EmptyTitle="No price rules"
            EmptyHint="Without a rule, a line falls back to the product's list price."
            FootNote="Direct entry on an order line always wins over every rule here — pricing layers suggestion on top of it rather than replacing it, so it can never block a baseline flow." />

        <div class="mjo-pr__grid">
            <div class="mj-card">
                <div class="mj-card-head">
                    <i class="fa-solid fa-tags" aria-hidden="true"></i>
                    <h3>Price lists</h3>
                    <span class="right small muted">{{ PriceLists.length }}</span>
                </div>
                <div class="mj-table-wrap">
                    <table class="mj-table mj-table--compact">
                        <thead>
                            <tr><th>List</th><th>Window</th><th>Status</th></tr>
                        </thead>
                        <tbody>
                            @for (list of PriceLists; track list['ID']) {
                                <tr>
                                    <td>
                                        {{ list['Name'] }}
                                        <div class="secondary mono">{{ list['Code'] }}</div>
                                    </td>
                                    <td class="small">{{ windowOf(list) }}</td>
                                    <td>
                                        <span class="mj-chip" [class]="statusChip(list['Status'])">
                                            {{ list['Status'] ?? '—' }}
                                        </span>
                                    </td>
                                </tr>
                            } @empty {
                                <tr>
                                    <td colspan="3" class="small muted">
                                        No price lists. Every product then prices from its own
                                        default — which is a valid configuration, not a gap.
                                    </td>
                                </tr>
                            }
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="mj-card">
                <div class="mj-card-head">
                    <i class="fa-solid fa-sitemap" aria-hidden="true"></i>
                    <h3>How a price resolves</h3>
                </div>
                <div class="mj-card-pad">
                    <ol class="mjo-pr__walk">
                        <li>
                            <b>A price typed on the line</b> — wins outright. Nothing below is
                            consulted, and the line records that it was stated.
                        </li>
                        <li>
                            <b>A rule on the customer's price list</b>, highest priority first,
                            within its effective window and recurrence.
                        </li>
                        <li>
                            <b>A rule on the standard list</b>, same ordering.
                        </li>
                        <li>
                            <b>The product's standalone selling price</b> — the floor, so a line can
                            always be priced.
                        </li>
                    </ol>
                    <div class="small muted mjo-pr__note">
                        The walk stops at the first answer. That is what makes a price explainable:
                        there is exactly one reason for it, and it can be named.
                    </div>
                </div>
            </div>
        </div>

        <div class="mjo-pr__grid mjo-pr__block">
            <div class="mj-card">
                <div class="mj-card-head">
                    <i class="fa-solid fa-layer-group" aria-hidden="true"></i>
                    <h3>Tiered bands</h3>
                </div>
                <div class="mj-table-wrap">
                    <table class="mj-table mj-table--compact">
                        <thead>
                            <tr><th>Quantity</th><th class="num">Unit</th></tr>
                        </thead>
                        <tbody>
                            @for (tier of Tiers; track tier['ID']) {
                                <tr>
                                    <td class="small">{{ bandOf(tier) }}</td>
                                    <td class="num">{{ money(tier['Amount']) }}</td>
                                </tr>
                            } @empty {
                                <tr>
                                    <td colspan="2" class="small muted">
                                        No banded prices. A product without bands charges one unit
                                        price at every quantity.
                                    </td>
                                </tr>
                            }
                        </tbody>
                    </table>
                </div>
                <div class="mj-card-pad small muted">
                    Bands are read by quantity, and the band that matches sets the unit price for
                    <b>every</b> unit — not just the ones above the threshold. That is the
                    difference between a tier and a bracket, and getting it wrong is a silent
                    overcharge.
                </div>
            </div>

            <div class="mj-card">
                <div class="mj-card-head">
                    <i class="fa-solid fa-clock" aria-hidden="true"></i>
                    <h3>Recurrence windows</h3>
                </div>
                <div class="mj-table-wrap">
                    <table class="mj-table mj-table--compact">
                        <thead>
                            <tr><th>Rule</th><th>When it applies</th></tr>
                        </thead>
                        <tbody>
                            @for (row of Recurring; track row.Key) {
                                <tr>
                                    <td class="small">{{ row.Product }}</td>
                                    <td class="small">{{ row.When }}</td>
                                </tr>
                            } @empty {
                                <tr>
                                    <td colspan="2" class="small muted">
                                        No recurrence restrictions — every rule applies whenever its
                                        effective window is open.
                                    </td>
                                </tr>
                            }
                        </tbody>
                    </table>
                </div>
                <div class="mj-card-pad small muted">
                    A happy hour or a weekday rate is the SAME rule with a narrower window, not a
                    second pricing system. Recurrence narrows when a rule is eligible; priority still
                    decides which eligible rule wins.
                </div>
            </div>
        </div>

        <div class="mj-banner mj-banner--warning mjo-pr__block">
            <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
            <div class="body">
                <strong>Ambiguity is refused at write time.</strong>
                Two rules with the same priority that could both match are rejected when the rule is
                SAVED, not resolved when a price is asked for. A price that depends on which row the
                database returned first is a price nobody can explain — and the person who created
                the ambiguity is the one who should resolve it, while they still remember what they
                meant.
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
            .mjo-pr__note { margin-bottom: var(--mj-space-4); }
            .mjo-pr__grid {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: var(--mj-space-4);
                margin-top: var(--mj-space-4);
            }
            .mjo-pr__block { margin-top: var(--mj-space-4); }
            .mjo-pr__walk { margin: 0; padding-left: var(--mj-space-5); }
            .mjo-pr__walk li { margin-bottom: var(--mj-space-2); }
            @media (max-width: 1000px) {
                .mjo-pr__grid { grid-template-columns: 1fr; }
            }
            @media (max-width: 760px) {
                :host { padding: var(--mj-space-4); }
            }
        `,
    ],
})
export class MJOPricingPageComponent implements OnInit {
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

    public Rows: Array<Record<string, unknown>> = [];

    public readonly Columns: MJOColumn[] = [
        // No SKU on a price row — it belongs to the product. The price list is the
        // useful second line here anyway: it says WHICH price this is.
        { Key: 'Product', Label: 'Product', Secondary: (r) => (r['Description'] as string) ?? null },
        { Key: 'PriceList', Label: 'Price list', Width: '150px' },
        { Key: 'PricingModel', Label: 'Model', Width: '110px' },
        {
            Key: 'Amount',
            Label: 'Unit',
            Kind: 'money',
            Width: '110px',
            // The column is Amount on Product Prices. UnitPrice is the ORDER LINE's
            // field; naming them alike is what made the mix-up easy.
            Format: (r) => FormatMoney(Number(r['Amount'] ?? 0)),
        },
        {
            Key: 'Priority',
            Label: 'Priority',
            Kind: 'number',
            Width: '90px',
            HideBelow: 760,
            // Higher wins. Shown because it is the only thing that resolves a
            // genuine overlap, and hiding it makes overlaps look arbitrary.
        },
        {
            Key: 'Effective',
            Label: 'Effective',
            Width: '190px',
            HideBelow: 1000,
            Format: (r) => {
                const from = r['EffectiveFrom'] ? FormatDate(String(r['EffectiveFrom']), { Short: true }) : '—';
                const to = r['EffectiveTo'] ? FormatDate(String(r['EffectiveTo']), { Short: true }) : 'open';
                return `${from} → ${to}`;
            },
        },
    ];

    public PriceLists: Array<Record<string, unknown>> = [];
    public Tiers: Array<Record<string, unknown>> = [];

    public async ngOnInit(): Promise<void> {
        const [rows, lists, tiers] = await Promise.all([
            this.data.GetProductPrices(),
            this.data.GetPriceLists(),
            this.data.GetPriceTiers(),
        ]);
        this.Rows = rows;
        this.PriceLists = lists;
        this.Tiers = tiers;
        this.cdr.detectChanges();
    }

    /**
     * Rules that only apply at certain times.
     *
     * Derived from the price rows already loaded rather than queried again — a
     * recurrence is a narrowing ON a rule, not a separate record, which is the
     * whole reason a happy hour is not a second pricing system.
     */
    public get Recurring(): Array<{ Key: string; Product: string; When: string }> {
        const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const list = (csv: unknown, names: string[]): string | null => {
            const raw = String(csv ?? '').trim();
            if (!raw) return null;
            return raw
                .split(',')
                .map((n) => names[Number(n.trim()) % names.length] ?? n.trim())
                .join(', ');
        };

        return this.Rows.flatMap((row) => {
            const days = list(row['RecurrenceDaysOfWeek'], DAYS);
            const months = list(row['RecurrenceMonths'], MONTHS);
            const from = row['TimeOfDayStart'] ? String(row['TimeOfDayStart']).slice(0, 5) : null;
            const to = row['TimeOfDayEnd'] ? String(row['TimeOfDayEnd']).slice(0, 5) : null;
            const time = from || to ? `${from ?? 'open'}–${to ?? 'close'}` : null;

            const parts = [days, months, time].filter(Boolean);
            if (!parts.length) return [];
            return [{
                Key: String(row['ID']),
                Product: `${row['Product'] ?? ''} · ${row['PriceList'] ?? 'standard'}`,
                When: parts.join(' · '),
            }];
        });
    }

    /** "5–9" or "10+" — a band with no ceiling is the last one. */
    protected bandOf(tier: Record<string, unknown>): string {
        const min = Number(tier['MinQuantity'] ?? 0);
        const max = tier['MaxQuantity'];
        return max == null || max === '' ? `${min}+` : `${min}–${Number(max)}`;
    }

    protected windowOf(row: Record<string, unknown>): string {
        const from = row['EffectiveFrom'] ? FormatDate(String(row['EffectiveFrom']), { Short: true }) : '—';
        const to = row['EffectiveTo'] ? FormatDate(String(row['EffectiveTo']), { Short: true }) : 'open';
        return `${from} → ${to}`;
    }

    protected statusChip(status: unknown): string {
        return status === 'Active' ? 'mj-chip--success' : 'mj-chip--outline';
    }

    protected money(value: unknown): string {
        return FormatMoney(Number(value ?? 0));
    }
}

/**
 * `mjo-promotions-page` — offers, and the codes that redeem them.
 *
 * A PROMOTION IS THE OFFER; A CODE IS A REDEEMABLE STRING POINTING AT IT. Keeping
 * them separate is what lets one offer carry several codes — a partner code, a
 * conference code, a win-back code — all reporting into the same offer rather than
 * into three offers whose numbers have to be added up by hand.
 *
 * STACKING IS CONFIGURED PER COMPANY and defaults to sequential, because
 * sequential discounts LESS. When two configurations are both defensible, the
 * safer one should be what happens when nobody chose.
 *
 * ## Example
 *
 * ```html
 * <mjo-promotions-page />
 * ```
 */
@Component({
    selector: 'mjo-promotions-page',
    standalone: true,
    imports: [CommonModule, MJOWorklistTableComponent],
    template: `
        <div class="mj-banner mj-banner--neutral mjo-pr__note">
            <i class="fa-solid fa-percent" aria-hidden="true"></i>
            <div class="body">
                <strong>A promotion is the offer; a code is a string pointing at it.</strong>
                One offer can carry several codes — partner, conference, win-back — all reporting into the
                same promotion rather than into three whose numbers have to be added up by hand.
            </div>
        </div>

        <mjo-worklist-table
            [Columns]="Columns"
            [Rows]="Rows"
            [Presets]="[]"
            [Searchable]="false"
            RowKey="ID"
            EmptyIcon="fa-solid fa-percent"
            EmptyTitle="No promotions"
            EmptyHint="An order with no matching promotion simply prices at list."
            FootNote="Stacking is configured per company and defaults to Sequential, because sequential discounts less — when two configurations are both defensible, the safer one should be what happens when nobody chose." />
    `,
    styles: [
        `
            :host {
                display: block;
                height: 100%;
                overflow: auto;
                padding: var(--mj-space-6);
            }
            .mjo-pr__note { margin-bottom: var(--mj-space-4); }
            @media (max-width: 760px) {
                :host { padding: var(--mj-space-4); }
            }
        `,
    ],
})
export class MJOPromotionsPageComponent implements OnInit {
    private readonly data = inject(MJOOrdersDataService);
    /**
     * Render what was just loaded. See orders-dashboard.page.ts for the full
     * reasoning: these pages are created imperatively by the section shell, and an
     * async assignment across Angular's check/verify boundary raises NG0100, aborts
     * the DOM write, and freezes the view on its pre-load values permanently.
     */
    private readonly cdr = inject(ChangeDetectorRef);

    public Rows: Array<Record<string, unknown>> = [];

    public readonly Columns: MJOColumn[] = [
        { Key: 'Name', Label: 'Promotion', Secondary: (r) => (r['Description'] as string) ?? null },
        { Key: 'PromotionType', Label: 'Type', Width: '130px' },
        {
            Key: 'AppliesAt',
            Label: 'Scope',
            Kind: 'chip',
            Width: '100px',
            Format: (r) => String(r['AppliesAt'] ?? 'Line'),
            ChipClass: () => 'mj-chip--outline',
        },
        {
            Key: 'Window',
            Label: 'Window',
            Width: '190px',
            HideBelow: 1000,
            Format: (r) => {
                const from = r['EffectiveFrom'] ? FormatDate(String(r['EffectiveFrom']), { Short: true }) : '—';
                const to = r['EffectiveTo'] ? FormatDate(String(r['EffectiveTo']), { Short: true }) : 'open';
                return `${from} → ${to}`;
            },
        },
        {
            Key: 'Status',
            Label: 'Status',
            Kind: 'chip',
            Width: '100px',
            Format: (r) => String(r['Status'] ?? 'Active'),
            ChipClass: (r) => (r['Status'] === 'Active' ? 'mj-chip--success' : 'mj-chip--outline'),
        },
    ];

    public async ngOnInit(): Promise<void> {
        this.Rows = await this.data.GetPromotions();
        this.cdr.detectChanges();
    }
}
