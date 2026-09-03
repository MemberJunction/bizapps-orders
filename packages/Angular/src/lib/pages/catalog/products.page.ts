import { ChangeDetectorRef, Component, EventEmitter, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MJOWorklistTableComponent, type MJOColumn } from '../../panels/worklist-table.component';
import { EntityViewerModule, type RecordOpenedEvent } from '@memberjunction/ng-entity-viewer';
import { Metadata, type EntityInfo } from '@memberjunction/core';
import { FormatDate, FormatMoney } from '../../panels/money-format';
import { MJAlertComponent } from '@memberjunction/ng-ui-components';
import {
    GetChargeTypes,
    GetProductCategories,
    GetProducts,
    GetProductTypes,
    GetTaxExemptions,
    GetTaxJurisdictions,
    GetTaxNexus,
    GetTaxRates,
} from '../../data/orders-queries';
import { MJO_ENTITIES } from '../../data/entity-names';
import {
    IsBefore,
    Today,
    type mjBizAppsOrdersChargeTypeEntity,
    type mjBizAppsOrdersCustomerTaxExemptionEntity,
    type mjBizAppsOrdersProductEntity,
} from '@mj-biz-apps/orders-entities';

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
    imports: [CommonModule, MJAlertComponent, EntityViewerModule],
    template: `
        <mj-alert Variant="info" Icon="fa-solid fa-sitemap" class="mjo-cat__note">
                <strong>The catalog is the behaviour root.</strong>
                A product's type decides recognition, taxability, fulfillment and recurrence, and every
                order line inherits those answers — which is why an order screen never asks for them
                again.
        </mj-alert>

        <div class="mjo-products-viewer-container">
            @if (ProductEntityInfo) {
                <mj-entity-viewer
                    [Entity]="ProductEntityInfo"
                    (RecordOpened)="OnRecordOpened($event)">
                </mj-entity-viewer>
            } @else {
                <div class="small muted" style="padding: 24px;">Loading products...</div>
            }
        </div>

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
            .mjo-products-viewer-container {
                height: 600px;
                min-height: 500px;
                background: var(--mj-bg-surface);
                border: 1px solid var(--mj-border-default);
                border-radius: var(--mj-radius-md);
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
    private readonly cdr = inject(ChangeDetectorRef);

    @Output() ProductOpened = new EventEmitter<mjBizAppsOrdersProductEntity>();

    public ProductEntityInfo: EntityInfo | null = null;
    public Categories: Array<Record<string, unknown>> = [];
    public Types: Array<Record<string, unknown>> = [];

    public async ngOnInit(): Promise<void> {
        const md = new Metadata();
        this.ProductEntityInfo = md.Entities.find((e) => e.Name === MJO_ENTITIES.Product) || null;
        // `GetProductTypes` and `GetProductCategories` existed, were exported, and nothing called
        // them -- so both panels rendered their empty state over a database that had rows.
        const [types, categories] = await Promise.all([GetProductTypes(), GetProductCategories()]);
        this.Types = types as unknown as Array<Record<string, unknown>>;
        this.Categories = categories as unknown as Array<Record<string, unknown>>;
        this.cdr.detectChanges();
    }

    public OnRecordOpened(event: RecordOpenedEvent): void {
        const id = (event.compositeKey?.GetValueByFieldName('ID') ?? event.record?.['ID']) as string | undefined;
        if (id) {
            const surrogate = { ID: id } as mjBizAppsOrdersProductEntity;
            this.ProductOpened.emit(surrogate);
        }
    }

    /** 'MJ_BizApps_Orders: Event Products' → 'Event Products'. */
    protected shortEntity(name: unknown): string {
        return String(name ?? '').split(':').pop()?.trim() ?? '';
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
    imports: [CommonModule, EntityViewerModule, MJAlertComponent],
    template: `
        <mj-alert Variant="info" Icon="fa-solid fa-layer-group" class="mjo-cat__note">
                <strong>Tax is a charge.</strong>
                State plus county plus city is three rows rather than a special case — so ordering,
                allocation, override and GL treatment are written once. A charge's <b>sequence</b> decides
                when it computes and its <b>basis</b> decides what it computes on.
        </mj-alert>

        <div class="mjo-tax__viewer-host">
            @if (ChargeTypeEntityInfo) {
                <mj-entity-viewer
                    [Entity]="ChargeTypeEntityInfo">
                </mj-entity-viewer>
            } @else {
                <div class="small muted" style="padding: 24px;">Loading charge types...</div>
            }
        </div>

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
                                <td class="small">{{ jurisdictionOf(row) }}</td>
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
            .mjo-tax__viewer-host {
                height: 520px;
                min-height: 450px;
                background: var(--mj-bg-surface);
                border: 1px solid var(--mj-border-default);
                border-radius: var(--mj-radius-md);
                overflow: hidden;
                margin-bottom: var(--mj-space-4);
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
    private readonly cdr = inject(ChangeDetectorRef);

    public ChargeTypeEntityInfo: EntityInfo | null = null;
    public Rows: mjBizAppsOrdersChargeTypeEntity[] = [];

    public Jurisdictions: Array<Record<string, unknown>> = [];
    public Rates: Array<Record<string, unknown>> = [];
    public Nexus: Array<Record<string, unknown>> = [];
    public Exemptions: mjBizAppsOrdersCustomerTaxExemptionEntity[] = [];

    public async ngOnInit(): Promise<void> {
        const md = new Metadata();
        this.ChargeTypeEntityInfo = md.Entities.find((e) => e.Name === MJO_ENTITIES.ChargeType) || null;
        const [rows, jurisdictions, rates, nexus, exemptions] = await Promise.all([
            GetChargeTypes(),
            GetTaxJurisdictions(),
            GetTaxRates(),
            GetTaxNexus(),
            GetTaxExemptions(),
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
    /**
     * The jurisdiction a certificate covers, or 'all' when it genuinely covers everything.
     *
     * This read `row['TaxJurisdiction']` — a field `CustomerTaxExemption` does not have, since the
     * base view joins no jurisdiction. Every row therefore fell through to the `?? 'all'` default,
     * so a certificate scoped to ONE state was displayed as exempting the customer EVERYWHERE. That
     * is not a blank cell; it is a wrong claim about tax scope, on the screen a tax admin uses to
     * check exactly that. The jurisdiction names are already loaded for the table above, so the
     * answer costs nothing but the lookup.
     */
    protected jurisdictionOf(row: mjBizAppsOrdersCustomerTaxExemptionEntity): string {
        if (!row.TaxJurisdictionID) return 'all';
        const key = String(row.TaxJurisdictionID).toLowerCase();
        const match = this.Jurisdictions.find((j) => String(j['ID'] ?? '').toLowerCase() === key);
        return String(match?.['Name'] ?? row.TaxJurisdictionID);
    }

    protected exemptionClass(row: mjBizAppsOrdersCustomerTaxExemptionEntity): string {
        // Read through the helper rather than String(...).slice(): `CertificateExpiresAt` is a Date
        // on the entity, and the bracket access here means the compiler never saw the mismatch. The
        // old form produced 'Mon Aug 10', which is never less than an ISO day, so an EXPIRED
        // certificate kept its ordinary chip and nobody was told to collect a new one.
        if (IsBefore(row.CertificateExpiresAt, Today())) return 'mj-chip--warning';
        return row['Status'] === 'Active' ? 'mj-chip--success' : 'mj-chip--outline';
    }
}
