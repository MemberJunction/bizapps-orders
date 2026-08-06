import { ChangeDetectorRef, Component, EventEmitter, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MJOWorklistTableComponent, type MJOColumn } from '../../panels/worklist-table.component';
import { MJOOrdersDataService } from '../../services/orders-data.service';
import { FormatDate, FormatMoney } from '../../panels/money-format';
import { MJAlertComponent } from '@memberjunction/ng-ui-components';

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
    imports: [CommonModule, MJOWorklistTableComponent, MJAlertComponent],
    template: `
        <mj-alert Variant="info" Icon="fa-solid fa-sitemap" class="mjo-cat__note">
                <strong>The catalog is the behaviour root.</strong>
                A product's type decides recognition, taxability, fulfillment and recurrence, and every
                order line inherits those answers — which is why an order screen never asks for them
                again.
        </mj-alert>

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

        <div class="mjo-cat__grid">
            <div class="mj-card">
                <div class="mj-card-head">
                    <i class="fa-solid fa-layer-group" aria-hidden="true"></i>
                    <h3>Product types</h3>
                    <span class="right small muted">{{ Types.length }}</span>
                </div>
                <div class="mj-table-wrap">
                    <table class="mj-table mj-table--compact">
                        <thead>
                            <tr>
                                <th>Type</th>
                                <th>Ships</th>
                                <th>Recognition</th>
                                <th>Taxable</th>
                            </tr>
                        </thead>
                        <tbody>
                            @for (type of Types; track type['ID']) {
                                <tr>
                                    <td>
                                        {{ type['Name'] }}
                                        @if (type['ProductExtensionEntity']) {
                                            <div class="secondary">extends {{ shortEntity(type['ProductExtensionEntity']) }}</div>
                                        }
                                    </td>
                                    <td class="small">{{ type['RequiresFulfillment'] ? 'yes' : 'no' }}</td>
                                    <td class="small">{{ type['DefaultRevenueRecognitionType'] ?? '—' }}</td>
                                    <td class="small">
                                        {{ type['DefaultIsTaxable'] ? (type['DefaultTaxCategory'] ?? 'yes') : 'no' }}
                                    </td>
                                </tr>
                            } @empty {
                                <tr><td colspan="4" class="small muted">No product types.</td></tr>
                            }
                        </tbody>
                    </table>
                </div>
                <div class="mj-card-pad small muted">
                    <b>What a type decides:</b> whether a line ships, how its revenue is recognised,
                    whether it is taxable, and whether it recurs. A product inherits all four and may
                    override any — so a line never has to be asked.
                </div>
            </div>

            <div class="mj-card">
                <div class="mj-card-head">
                    <i class="fa-solid fa-folder-tree" aria-hidden="true"></i>
                    <h3>Categories</h3>
                    <span class="right small muted">{{ Categories.length }}</span>
                </div>
                <div class="mj-table-wrap">
                    <table class="mj-table mj-table--compact">
                        <thead>
                            <tr><th>Category</th><th>Within</th><th>Default tax</th></tr>
                        </thead>
                        <tbody>
                            @for (category of Categories; track category['ID']) {
                                <tr>
                                    <td>{{ category['Name'] }}</td>
                                    <td class="small muted">{{ category['ParentProductCategory'] ?? '—' }}</td>
                                    <td class="small">
                                        {{ category['DefaultIsTaxable'] ? (category['DefaultTaxCategory'] ?? 'taxable') : 'exempt' }}
                                    </td>
                                </tr>
                            } @empty {
                                <tr><td colspan="3" class="small muted">No categories.</td></tr>
                            }
                        </tbody>
                    </table>
                </div>
                <div class="mj-card-pad small muted">
                    Categories group for reporting and supply defaults. They do NOT decide
                    behaviour — that is the type's job. Keeping the two apart is what stops a
                    reporting change from altering how something is taxed.
                </div>
            </div>
        </div>

        <mj-alert Variant="info" Icon="fa-solid fa-puzzle-piece" class="mjo-cat__block">
                <strong>Type extensions carry what only that type needs.</strong>
                An event has a venue and a date; a subscription has a term length. Rather than a
                products table with columns most rows leave null, a type names an extension entity
                and the extra facts live there. The order line gets a matching extension, so a line
                selling a ticket can hold ticket facts without every other line pretending to.
        </mj-alert>
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
            .mjo-cat__grid {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: var(--mj-space-4);
                margin-top: var(--mj-space-4);
            }
            .mjo-cat__block { margin-top: var(--mj-space-4); }
            @media (max-width: 1000px) {
                .mjo-cat__grid { grid-template-columns: 1fr; }
            }
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

    public Categories: Array<Record<string, unknown>> = [];
    public Types: Array<Record<string, unknown>> = [];

    /** 'MJ_BizApps_Orders: Event Products' → 'Event Products'. */
    protected shortEntity(name: unknown): string {
        return String(name ?? '').split(':').pop()?.trim() ?? '';
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
    imports: [CommonModule, MJOWorklistTableComponent, MJAlertComponent],
    template: `
        <mj-alert Variant="info" Icon="fa-solid fa-layer-group" class="mjo-cat__note">
                <strong>Tax is a charge.</strong>
                State plus county plus city is three rows rather than a special case — so ordering,
                allocation, override and GL treatment are written once. A charge's <b>sequence</b> decides
                when it computes and its <b>basis</b> decides what it computes on.
        </mj-alert>

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

        <div class="mjo-tax__grid">
            <div class="mj-card">
                <div class="mj-card-head">
                    <i class="fa-solid fa-percent" aria-hidden="true"></i>
                    <h3>Jurisdiction layers</h3>
                    <span class="right small muted">{{ Jurisdictions.length }} active</span>
                </div>
                <div class="mj-table-wrap">
                    <table class="mj-table mj-table--compact">
                        <thead>
                            <tr>
                                <th>Jurisdiction</th>
                                <th>Where</th>
                                <th>Category</th>
                                <th class="num">Rate</th>
                            </tr>
                        </thead>
                        <tbody>
                            @for (row of JurisdictionRates; track row.Key) {
                                <tr>
                                    <td>
                                        {{ row.Name }}
                                        @if (row.Parent) {
                                            <div class="secondary">within {{ row.Parent }}</div>
                                        }
                                    </td>
                                    <td class="small">{{ row.Where }}</td>
                                    <td class="small">{{ row.Category }}</td>
                                    <td class="num">{{ row.Rate }}</td>
                                </tr>
                            } @empty {
                                <tr><td colspan="4" class="small muted">No jurisdictions configured.</td></tr>
                            }
                        </tbody>
                    </table>
                </div>
                <div class="mj-card-pad small muted">
                    State, county and city are three ROWS, not one blended rate. Layering them
                    separately is what lets a return be filed per authority — a single 8.25% cannot
                    be split back apart afterwards.
                </div>
            </div>

            <div class="mj-card">
                <div class="mj-card-head">
                    <i class="fa-solid fa-building-columns" aria-hidden="true"></i>
                    <h3>Nexus — where we must collect</h3>
                </div>
                <div class="mj-table-wrap">
                    <table class="mj-table mj-table--compact">
                        <thead>
                            <tr>
                                <th>Company</th>
                                <th>Jurisdiction</th>
                                <th>Type</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            @for (row of Nexus; track row['ID']) {
                                <tr>
                                    <td class="small">{{ row['Company'] ?? '—' }}</td>
                                    <td class="small">{{ row['TaxJurisdiction'] ?? '—' }}</td>
                                    <td class="small">{{ row['NexusType'] ?? '—' }}</td>
                                    <td>
                                        <span class="mj-chip" [class]="nexusClass(row)">
                                            {{ row['Status'] ?? '—' }}
                                        </span>
                                    </td>
                                </tr>
                            } @empty {
                                <tr><td colspan="4" class="small muted">No registrations.</td></tr>
                            }
                        </tbody>
                    </table>
                </div>
                <div class="mj-card-pad small muted">
                    A rate without a registration is a rate we must <b>not</b> charge. Nexus decides
                    whether tax applies at all; the rate only decides how much.
                </div>
            </div>
        </div>

        <div class="mj-card mjo-tax__block">
            <div class="mj-card-head">
                <i class="fa-solid fa-file-shield" aria-hidden="true"></i>
                <h3>Customer exemptions</h3>
                <span class="right small muted">{{ Exemptions.length }} on file</span>
            </div>
            <div class="mj-table-wrap">
                <table class="mj-table mj-table--compact">
                    <thead>
                        <tr>
                            <th>Customer</th>
                            <th>Jurisdiction</th>
                            <th>Category</th>
                            <th>Certificate</th>
                            <th>Expires</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        @for (row of Exemptions; track row['ID']) {
                            <tr>
                                <td class="small">{{ row['Organization'] ?? row['Person'] ?? '—' }}</td>
                                <td class="small">{{ row['TaxJurisdiction'] ?? 'all' }}</td>
                                <td class="small">{{ row['TaxCategory'] ?? 'all' }}</td>
                                <td class="small mono">{{ row['CertificateRef'] ?? '—' }}</td>
                                <td class="small">{{ dateOf(row['CertificateExpiresAt']) }}</td>
                                <td>
                                    <span class="mj-chip" [class]="exemptionClass(row)">
                                        {{ row['Status'] ?? '—' }}
                                    </span>
                                </td>
                            </tr>
                        } @empty {
                            <tr><td colspan="6" class="small muted">No exemption certificates.</td></tr>
                        }
                    </tbody>
                </table>
            </div>
            <div class="mj-card-pad small muted">
                An exemption is scoped: a certificate can cover one jurisdiction, one category, or
                everything. An EXPIRED certificate stops exempting on its own date — nobody has to
                remember to switch it off, which is the only way this stays correct.
            </div>
        </div>

        <div class="mjo-tax__grid mjo-tax__block">
            <mj-alert Variant="info" Icon="fa-solid fa-sitemap">
                    <strong>Taxability inherits down one chain.</strong>
                    A product's tax category comes from its type unless the product overrides it, and
                    the order line takes whatever the product resolved to. One chain, one override
                    point — so "why was this taxed?" has a single answer rather than a search.
            </mj-alert>

            <mj-alert Variant="info" Icon="fa-solid fa-pen">
                    <strong>Computed, but overridable.</strong>
                    A charge computes from its basis, and a person may replace the amount — with a
                    reason, which the database itself requires. An override without a reason is a
                    number nobody can explain a year later.
            </mj-alert>
        </div>

        <mj-alert Variant="info" Icon="fa-solid fa-check-double" class="mjo-tax__block">
                <strong>Both must hold.</strong>
                Tax is charged only where there is nexus AND the customer is not exempt for that
                jurisdiction and category. Either one alone is not enough, and treating them as
                interchangeable is how a business ends up collecting tax it must refund.
        </mj-alert>
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
            .mjo-tax__grid {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: var(--mj-space-4);
                margin-top: var(--mj-space-4);
            }
            .mjo-tax__block { margin-top: var(--mj-space-4); }
            @media (max-width: 1000px) {
                .mjo-tax__grid { grid-template-columns: 1fr; }
            }
            @media (max-width: 760px) {
                :host { padding: var(--mj-space-4); }
            }
        `,
    ],
})
export class MJOChargesTaxPageComponent implements OnInit {
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
        { Key: 'Sequence', Label: 'Seq', Kind: 'number', Width: '70px' },
        { Key: 'Name', Label: 'Charge type', Secondary: (r) => (r['Description'] as string) ?? null },
        { Key: 'Basis', Label: 'Basis', Width: '190px' },
        {
            // Tax-ness is the CATEGORY, not a boolean. `IsTax` is not a column on
            // this entity, so both this chip and the column below read undefined
            // and every row claimed to be an ordinary charge that enlarges the tax
            // base — the exact opposite of the truth for the tax rows.
            Key: 'Category',
            Label: 'Kind',
            Kind: 'chip',
            Width: '100px',
            Format: (r) => (r['Category'] === 'Tax' ? 'tax' : 'charge'),
            ChipClass: (r) => (r['Category'] === 'Tax' ? 'mj-chip--info' : 'mj-chip--outline'),
        },
        {
            Key: 'EnlargesBase',
            Label: 'Enlarges tax base',
            Width: '160px',
            HideBelow: 760,
            // The single most consequential flag on this screen: a tax never
            // enlarges the base another tax is computed on, so taxes cannot compound.
            Format: (r) => (r['Category'] === 'Tax' ? 'no — never compounds' : 'yes'),
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

    public Jurisdictions: Array<Record<string, unknown>> = [];
    public Rates: Array<Record<string, unknown>> = [];
    public Nexus: Array<Record<string, unknown>> = [];
    public Exemptions: Array<Record<string, unknown>> = [];

    public async ngOnInit(): Promise<void> {
        // Four independent reads, so they go together rather than in sequence —
        // none of them needs another's answer.
        const [rows, jurisdictions, rates, nexus, exemptions] = await Promise.all([
            this.data.GetChargeTypes(),
            this.data.GetTaxJurisdictions(),
            this.data.GetTaxRates(),
            this.data.GetTaxNexus(),
            this.data.GetTaxExemptions(),
        ]);
        this.Rows = rows;
        this.Jurisdictions = jurisdictions;
        this.Rates = rates;
        this.Nexus = nexus;
        this.Exemptions = exemptions;
        this.cdr.detectChanges();
    }

    /**
     * Jurisdictions joined to their CURRENT rate, one row per category.
     *
     * A jurisdiction with no live rate still appears, showing "—". It is a real
     * layer that happens to charge nothing today, and hiding it would make the
     * stack look shorter than it is.
     */
    public get JurisdictionRates(): Array<{
        Key: string;
        Name: string;
        Parent: string | null;
        Where: string;
        Category: string;
        Rate: string;
    }> {
        const today = new Date().toISOString().slice(0, 10);
        const live = (rate: Record<string, unknown>): boolean => {
            const from = rate['EffectiveFrom'] ? String(rate['EffectiveFrom']).slice(0, 10) : null;
            const to = rate['EffectiveTo'] ? String(rate['EffectiveTo']).slice(0, 10) : null;
            return (!from || from <= today) && (!to || to >= today);
        };

        const out: Array<{ Key: string; Name: string; Parent: string | null; Where: string; Category: string; Rate: string }> = [];
        for (const j of this.Jurisdictions) {
            const id = String(j['ID']);
            const where = [j['CityName'], j['RegionCode'], j['CountryCode']].filter(Boolean).join(', ');
            const mine = this.Rates.filter((r) => String(r['TaxJurisdictionID']) === id && live(r));
            if (!mine.length) {
                out.push({
                    Key: id,
                    Name: String(j['Name'] ?? ''),
                    Parent: (j['ParentTaxJurisdiction'] as string) ?? null,
                    Where: where || '—',
                    Category: '—',
                    Rate: '—',
                });
                continue;
            }
            for (const rate of mine) {
                out.push({
                    Key: `${id}:${String(rate['ID'])}`,
                    Name: String(j['Name'] ?? ''),
                    Parent: (j['ParentTaxJurisdiction'] as string) ?? null,
                    Where: where || '—',
                    Category: String(rate['TaxCategory'] ?? 'all'),
                    Rate: `${(Number(rate['Rate'] ?? 0) * 100).toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}%`,
                });
            }
        }
        return out;
    }

    protected dateOf(value: unknown): string {
        return value ? FormatDate(String(value), { Short: true }) : '—';
    }

    protected nexusClass(row: Record<string, unknown>): string {
        return row['Status'] === 'Active' ? 'mj-chip--success' : 'mj-chip--outline';
    }

    /** An expired certificate stops exempting on its own date. */
    protected exemptionClass(row: Record<string, unknown>): string {
        const expires = row['CertificateExpiresAt'] ? String(row['CertificateExpiresAt']).slice(0, 10) : null;
        if (expires && expires < new Date().toISOString().slice(0, 10)) return 'mj-chip--warning';
        return row['Status'] === 'Active' ? 'mj-chip--success' : 'mj-chip--outline';
    }
}
