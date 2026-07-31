import { ChangeDetectorRef, Component, EventEmitter, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MJOWorklistTableComponent, type MJOColumn } from '../../panels/worklist-table.component';
import { MJOOrdersDataService } from '../../services/orders-data.service';
import { FormatMoney } from '../../panels/money-format';

/** A catalog row. */
interface MJOProductRow extends Record<string, unknown> {
    ID: string;
    Name: string;
    SKU: string;
    Status: string;
    ProductType?: string | null;
    Company?: string | null;
    ProductCategory?: string | null;
    SubscriptionTypeID?: string | null;
}

/**
 * `mjo-products-page` — the catalog, which is the behaviour root.
 *
 * WHY THE CATALOG IS THE MOST CONSEQUENTIAL ADMIN SCREEN. A product's TYPE decides
 * how its revenue recognises, whether it is taxable, whether it must ship and
 * whether buying it creates a subscription. Every order that ever includes it
 * inherits those answers. Getting a product wrong is not one wrong row — it is
 * every future order line quietly booking the wrong way.
 *
 * So the list leads with type and behaviour rather than with price: price is
 * visible and correctable, whereas a wrong recognition shape produces a balanced
 * journal entry in the wrong period and nothing downstream disagrees.
 *
 * ## Example
 *
 * ```html
 * <mjo-products-page (ProductOpened)="openForm($event)" />
 * ```
 */
@Component({
    selector: 'mjo-products-page',
    standalone: true,
    imports: [CommonModule, MJOWorklistTableComponent],
    template: `
        <div class="mj-banner mj-banner--neutral mjo-cat__note">
            <i class="fa-solid fa-sitemap" aria-hidden="true"></i>
            <div class="body">
                <strong>The catalog is the behaviour root.</strong>
                A product's type decides recognition, taxability, fulfillment and recurrence, and every
                order line inherits those answers — which is why an order screen never asks for them
                again.
            </div>
        </div>

        <mjo-worklist-table
            [Columns]="Columns"
            [Rows]="Rows"
            [Presets]="[]"
            [Search]="Search"
            SearchPlaceholder="Product name or SKU…"
            RowKey="ID"
            EmptyIcon="fa-solid fa-boxes-stacked"
            EmptyTitle="No products match"
            EmptyHint="Try a different search."
            (SearchChanged)="OnSearch($event)"
            (RowClicked)="ProductOpened.emit($any($event))" />
    `,
    styles: [
        `
            :host {
                display: block;
                height: 100%;
                overflow: auto;
                padding: var(--mj-space-6);
            }
            .mjo-cat__note { margin-bottom: var(--mj-space-4); }
            @media (max-width: 760px) {
                :host { padding: var(--mj-space-4); }
            }
        `,
    ],
})
export class MJOProductsPageComponent implements OnInit {
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

    @Output() ProductOpened = new EventEmitter<MJOProductRow>();

    public Rows: MJOProductRow[] = [];
    public Search = '';

    public readonly Columns: MJOColumn<MJOProductRow>[] = [
        { Key: 'SKU', Label: 'SKU', Kind: 'mono', Width: '120px' },
        { Key: 'Name', Label: 'Product', Secondary: (r) => (r.ProductCategory as string) ?? null },
        { Key: 'ProductType', Label: 'Type', Width: '140px' },
        { Key: 'Company', Label: 'Company', Width: '150px', HideBelow: 1000 },
        {
            Key: 'Behaviour',
            Label: 'Behaviour',
            HideBelow: 760,
            // What this product will DO to an order, which is the reason to look at
            // this screen at all.
            Format: (r) => {
                const traits: string[] = [];
                if (r.SubscriptionTypeID) traits.push('subscription');
                return traits.length ? traits.join(' · ') : '—';
            },
        },
        {
            Key: 'Status',
            Label: 'Status',
            Kind: 'chip',
            Width: '100px',
            ChipClass: (r) =>
                r.Status === 'Active'
                    ? 'mj-chip--success'
                    : r.Status === 'Draft'
                      ? ''
                      : 'mj-chip--outline',
        },
    ];

    public async ngOnInit(): Promise<void> {
        await this.load();
        this.cdr.detectChanges();
    }

    public async OnSearch(text: string): Promise<void> {
        this.Search = text;
        await this.load();
        this.cdr.detectChanges();
    }

    private async load(): Promise<void> {
        const rows = await this.data.GetProducts({ Search: this.Search });
        this.Rows = rows as MJOProductRow[];
        this.cdr.detectChanges();
    }
}

/**
 * `mjo-charges-tax-page` — shipping, handling and tax as one mechanism.
 *
 * TAX IS A CHARGE. Modelling it that way means multi-layer tax — state plus county
 * plus city — is several rows rather than a special case, so ordering, allocation,
 * override and GL treatment are written once instead of twice.
 *
 * SEQUENCE IS WHAT MAKES LAYERING WORK, and the table leads with it. Non-tax
 * charges run first and ENLARGE the taxable base; tax charges run after and never
 * do. That single flag is why tax-on-shipping works with no code that knows the
 * word "shipping", and why county tax is never charged on state tax.
 *
 * ## Example
 *
 * ```html
 * <mjo-charges-tax-page />
 * ```
 */
@Component({
    selector: 'mjo-charges-tax-page',
    standalone: true,
    imports: [CommonModule, MJOWorklistTableComponent],
    template: `
        <div class="mj-banner mj-banner--info mjo-cat__note">
            <i class="fa-solid fa-layer-group" aria-hidden="true"></i>
            <div class="body">
                <strong>Tax is a charge.</strong>
                State plus county plus city is three rows rather than a special case — so ordering,
                allocation, override and GL treatment are written once. A charge's <b>sequence</b> decides
                when it computes and its <b>basis</b> decides what it computes on.
            </div>
        </div>

        <mjo-worklist-table
            [Columns]="Columns"
            [Rows]="Rows"
            [Presets]="[]"
            [Searchable]="false"
            RowKey="ID"
            EmptyIcon="fa-solid fa-receipt"
            EmptyTitle="No charge types configured"
            EmptyHint="Shipping, handling and each tax jurisdiction are charge types."
            FootNote="Non-tax charges enlarge the taxable base; tax charges never do. That is what stops county tax being charged on state tax." />
    `,
    styles: [
        `
            :host {
                display: block;
                height: 100%;
                overflow: auto;
                padding: var(--mj-space-6);
            }
            .mjo-cat__note { margin-bottom: var(--mj-space-4); }
            @media (max-width: 760px) {
                :host { padding: var(--mj-space-4); }
            }
        `,
    ],
})
export class MJOChargesTaxPageComponent implements OnInit {
    private readonly data = inject(MJOOrdersDataService);

    public Rows: Array<Record<string, unknown>> = [];

    public readonly Columns: MJOColumn[] = [
        { Key: 'Sequence', Label: 'Seq', Kind: 'number', Width: '70px' },
        { Key: 'Name', Label: 'Charge type', Secondary: (r) => (r['Description'] as string) ?? null },
        { Key: 'Basis', Label: 'Basis', Width: '190px' },
        {
            Key: 'IsTax',
            Label: 'Kind',
            Kind: 'chip',
            Width: '100px',
            Format: (r) => (r['IsTax'] ? 'tax' : 'charge'),
            ChipClass: (r) => (r['IsTax'] ? 'mj-chip--info' : 'mj-chip--outline'),
        },
        {
            Key: 'EnlargesBase',
            Label: 'Enlarges tax base',
            Width: '160px',
            HideBelow: 760,
            // The single most consequential flag on this screen.
            Format: (r) => (r['IsTax'] ? 'no — never compounds' : 'yes'),
        },
        {
            Key: 'IsActive',
            Label: 'Active',
            Kind: 'chip',
            Width: '96px',
            Format: (r) => (r['IsActive'] === false ? 'Off' : 'Active'),
            ChipClass: (r) => (r['IsActive'] === false ? '' : 'mj-chip--success'),
        },
    ];

    public async ngOnInit(): Promise<void> {
        const rows = await this.data.GetChargeTypes();
        this.Rows = rows;
    }
}
