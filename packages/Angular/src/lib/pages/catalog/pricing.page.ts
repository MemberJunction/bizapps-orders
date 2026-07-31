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
        { Key: 'Product', Label: 'Product', Secondary: (r) => (r['SKU'] as string) ?? null },
        { Key: 'PriceList', Label: 'Price list', Width: '150px' },
        { Key: 'PricingModel', Label: 'Model', Width: '110px' },
        {
            Key: 'UnitPrice',
            Label: 'Unit',
            Kind: 'money',
            Width: '110px',
            Format: (r) => FormatMoney(Number(r['UnitPrice'] ?? 0)),
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

    public async ngOnInit(): Promise<void> {
        this.Rows = await this.data.GetProductPrices();
        this.cdr.detectChanges();
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

    public Rows: Array<Record<string, unknown>> = [];

    public readonly Columns: MJOColumn[] = [
        { Key: 'Name', Label: 'Promotion', Secondary: (r) => (r['Description'] as string) ?? null },
        { Key: 'PromotionType', Label: 'Type', Width: '130px' },
        {
            Key: 'Scope',
            Label: 'Scope',
            Kind: 'chip',
            Width: '100px',
            Format: (r) => String(r['Scope'] ?? 'Line'),
            ChipClass: () => 'mj-chip--outline',
        },
        {
            Key: 'Window',
            Label: 'Window',
            Width: '190px',
            HideBelow: 1000,
            Format: (r) => {
                const from = r['StartDate'] ? FormatDate(String(r['StartDate']), { Short: true }) : '—';
                const to = r['EndDate'] ? FormatDate(String(r['EndDate']), { Short: true }) : 'open';
                return `${from} → ${to}`;
            },
        },
        {
            Key: 'IsActive',
            Label: 'Status',
            Kind: 'chip',
            Width: '100px',
            Format: (r) => (r['IsActive'] === false ? 'Inactive' : 'Active'),
            ChipClass: (r) => (r['IsActive'] === false ? 'mj-chip--outline' : 'mj-chip--success'),
        },
    ];

    public async ngOnInit(): Promise<void> {
        this.Rows = await this.data.GetPromotions();
    }
}
