import { ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Metadata, RunView } from '@memberjunction/core';
import { MJButtonDirective, MJDialogActionsComponent, MJDialogComponent } from '@memberjunction/ng-ui-components';
import { OrdersEngine, Today, type mjBizAppsOrdersProductEntity } from '@mj-biz-apps/orders-entities';

import { CustomFormsModule } from '../../custom/custom-forms.module';
import { BizAppsProductEffectiveGLAccountsComponent } from '../../custom/Product/widgets/product-effective-gl-accounts.component';
import { GetProductCategories, GetProductTypes } from '../../data/orders-queries';
import { MJO_ENTITIES } from '../../data/entity-names';
import { CheckProductReadiness } from '../../form-panels/product-readiness-check';
import {
    ApplyNewProductDraft,
    EmptyNewProductDraft,
    RevenueRecognitionForType,
    ValidateNewProductDraft,
    type NewProductDraft,
} from './new-product-draft';

/** One choice in a select. */
interface Option {
    ID: string;
    Name: string;
}

/** Which part of the dialog is showing. */
type Step = 'details' | 'accounts';

const COMPANY_ENTITY = 'MJ: Companies';

/**
 * `mjo-new-product-dialog` — the guided way to create a sellable product (golive#434).
 *
 * Step 1 asks for the record and its base price and saves both as one unit, with the product in
 * Draft. Step 2 shows the GL accounts the saved product books to (inherited from its category,
 * product type or company where it has none of its own), lets the user link one for any role that has
 * none, then activates it after the same readiness check the product header runs.
 *
 * Closing after step 1 leaves a Draft product with its price, which the product form's Draft banner
 * picks up. `Created` fires once the product exists, with its ID, whether or not it was activated.
 *
 * ## Example
 *
 * ```html
 * <mjo-new-product-dialog [Visible]="open" (Created)="openProduct($event)" (Closed)="open = false" />
 * ```
 */
@Component({
    selector: 'mjo-new-product-dialog',
    standalone: true,
    imports: [CommonModule, FormsModule, MJButtonDirective, MJDialogComponent, MJDialogActionsComponent, CustomFormsModule],
    template: `
        <mj-dialog [Visible]="Visible" [Title]="Step === 'details' ? 'New product' : 'GL accounts for ' + (Product?.Name ?? 'the product')" Size="lg" (Close)="Close()">
            @if (Step === 'details') {
                <p class="mjo-np__lede">
                    The product is saved as Draft with its base price. The next step checks its GL accounts, then activates it.
                </p>
                <div class="mjo-np__grid" (input)="Errors = []" (change)="Errors = []">
                    <label class="mjo-np__field mjo-np__field--wide">
                        <span>Name</span>
                        <input type="text" maxlength="255" [(ngModel)]="Draft.Name" aria-label="Name" />
                    </label>
                    <label class="mjo-np__field">
                        <span>SKU <span class="muted">(optional)</span></span>
                        <input type="text" maxlength="100" [(ngModel)]="Draft.SKU" aria-label="SKU" />
                    </label>
                    <label class="mjo-np__field">
                        <span>Company</span>
                        <select [(ngModel)]="Draft.CompanyID" aria-label="Company">
                            <option value="">Choose…</option>
                            @for (o of Companies; track o.ID) { <option [value]="o.ID">{{ o.Name }}</option> }
                        </select>
                    </label>
                    <label class="mjo-np__field">
                        <span>Category</span>
                        <select [(ngModel)]="Draft.ProductCategoryID" aria-label="Category">
                            <option value="">Choose…</option>
                            @for (o of Categories; track o.ID) { <option [value]="o.ID">{{ o.Name }}</option> }
                        </select>
                    </label>
                    <label class="mjo-np__field">
                        <span>Product type</span>
                        <select [ngModel]="Draft.ProductTypeID" (ngModelChange)="OnTypeChanged($event)" aria-label="Product type">
                            <option value="">Choose…</option>
                            @for (o of Types; track o.ID) { <option [value]="o.ID">{{ o.Name }}</option> }
                        </select>
                    </label>
                    <label class="mjo-np__field">
                        <span>Revenue recognition</span>
                        <select [(ngModel)]="Draft.RevenueRecognitionTypeID" aria-label="Revenue recognition">
                            <option value="">Choose…</option>
                            @for (o of RevenueRecognitionTypes; track o.ID) { <option [value]="o.ID">{{ o.Name }}</option> }
                        </select>
                    </label>
                    <label class="mjo-np__field">
                        <span>Base price</span>
                        <input type="number" min="0" step="0.01" inputmode="decimal" [(ngModel)]="Draft.BasePrice" aria-label="Base price" />
                    </label>
                    <label class="mjo-np__field">
                        <span>Price applies from</span>
                        <input type="date" [(ngModel)]="Draft.PriceEffectiveFrom" aria-label="Price applies from" />
                    </label>
                </div>
                <p class="small muted mjo-np__hint">
                    Every product needs a base price, even when each deal enters its own amount; zero is fine. Orders dated
                    before the price's start date cannot use it.
                </p>
            } @else if (Product) {
                <div class="mjo-np__accounts">
                    <section class="mjo-acct-card">
                        <bizapps-product-effective-gl-accounts
                            #effective
                            [Product]="Product"
                            [RevenueRecognitionTypeID]="Product.RevenueRecognitionTypeID"
                            [CompanyID]="Product.CompanyID">
                        </bizapps-product-effective-gl-accounts>
                    </section>
                    <section class="mjo-acct-card">
                        <bizapps-product-gl-links [Product]="Product" [EditMode]="true" (LinksChanged)="OnLinksChanged()"></bizapps-product-gl-links>
                    </section>
                </div>
                @if (Missing.length) {
                    <div class="mjo-np__missing" role="status">
                        <strong>Not ready to sell yet:</strong>
                        <ul>
                            @for (m of Missing; track m) { <li>{{ m }}</li> }
                        </ul>
                    </div>
                }
            }

            @if (Errors.length) {
                <ul class="mjo-np__errors" role="alert">
                    @for (e of Errors; track e) { <li>{{ e }}</li> }
                </ul>
            }

            <mj-dialog-actions>
                @if (Step === 'details') {
                    <button type="button" mjButton variant="outline" [disabled]="Busy" (click)="Close()">Cancel</button>
                    <button type="button" mjButton variant="primary" [disabled]="Busy" (click)="SaveDetails()">
                        {{ Busy ? 'Saving…' : 'Save and continue' }}
                    </button>
                } @else {
                    <button type="button" mjButton variant="outline" [disabled]="Busy" (click)="Close()">Leave as Draft</button>
                    @if (Missing.length) {
                        <button type="button" mjButton variant="outline" [disabled]="Busy" (click)="Activate(true)">Activate anyway</button>
                    }
                    <button type="button" mjButton variant="primary" [disabled]="Busy" (click)="Activate(false)">
                        {{ Busy ? 'Checking…' : 'Activate' }}
                    </button>
                }
            </mj-dialog-actions>
        </mj-dialog>
    `,
    // The GL panels' card chrome, shared with the product form's Accounting tab.
    styleUrls: ['../../custom/Product/widgets/product-gl-cards.css'],
    styles: [
        `
            .mjo-np__accounts {
                display: flex;
                flex-direction: column;
                gap: var(--mj-space-4);
                font-size: 14px;
                line-height: 1.5;
            }
            .mjo-np__lede { margin: 0 0 var(--mj-space-4); color: var(--mj-text-secondary); }
            .mjo-np__grid {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: var(--mj-space-3) var(--mj-space-4);
            }
            .mjo-np__field { display: flex; flex-direction: column; gap: var(--mj-space-1); font-size: var(--mj-text-sm); }
            .mjo-np__field--wide { grid-column: 1 / -1; }
            .mjo-np__field input,
            .mjo-np__field select {
                padding: var(--mj-space-2);
                border: 1px solid var(--mj-border-default);
                border-radius: var(--mj-radius-sm);
                background: var(--mj-bg-surface);
                color: var(--mj-text-primary);
                font: inherit;
            }
            .mjo-np__hint { margin: var(--mj-space-3) 0 0; }
            .mjo-np__missing {
                margin-top: var(--mj-space-4);
                padding: var(--mj-space-3);
                border: 1px solid var(--mj-status-warning);
                border-radius: var(--mj-radius-sm);
                background: var(--mj-status-warning-bg);
            }
            .mjo-np__missing ul,
            .mjo-np__errors { margin: var(--mj-space-2) 0 0; padding-left: var(--mj-space-5); }
            .mjo-np__errors { color: var(--mj-status-error); }
            @media (max-width: 640px) {
                .mjo-np__grid { grid-template-columns: 1fr; }
            }
        `,
    ],
})
export class MJONewProductDialogComponent implements OnChanges {
    private readonly cdr = inject(ChangeDetectorRef);

    @Input() Visible = false;
    /** The saved product's ID, once step 1 has saved it. */
    @Output() Created = new EventEmitter<string>();
    @Output() Closed = new EventEmitter<void>();

    @ViewChild('effective') private effective?: BizAppsProductEffectiveGLAccountsComponent;

    public Step: Step = 'details';
    public Draft: NewProductDraft = EmptyNewProductDraft(Today());
    public Product: mjBizAppsOrdersProductEntity | null = null;
    public Companies: Option[] = [];
    public Categories: Option[] = [];
    public Types: Option[] = [];
    public RevenueRecognitionTypes: Option[] = [];
    public Errors: string[] = [];
    /** What the readiness check found missing, shown before the user activates anyway. */
    public Missing: string[] = [];
    public Busy = false;

    private typeDefaults: { ID: string; DefaultRevenueRecognitionTypeID: string | null }[] = [];
    private lookupsLoaded = false;

    public async ngOnChanges(changes: SimpleChanges): Promise<void> {
        if (changes['Visible']?.currentValue) {
            this.reset();
            if (!this.lookupsLoaded) await this.loadLookups();
        }
    }

    public OnTypeChanged(typeID: string): void {
        this.Draft.ProductTypeID = typeID;
        this.Draft.RevenueRecognitionTypeID = RevenueRecognitionForType(this.typeDefaults, typeID, this.Draft.RevenueRecognitionTypeID);
    }

    /** Step 1: saves the product and its base price as one unit, in Draft, then moves to step 2. */
    public async SaveDetails(): Promise<void> {
        this.Errors = ValidateNewProductDraft(this.Draft);
        if (this.Errors.length) return;
        this.Busy = true;
        try {
            const product = await new Metadata().GetEntityObject<mjBizAppsOrdersProductEntity>(MJO_ENTITIES.Product);
            await ApplyNewProductDraft(product, this.Draft);
            if (!(await product.Save())) {
                this.Errors = [product.LatestResult?.CompleteMessage || 'The product could not be saved.'];
                return;
            }
            this.Product = product;
            this.Step = 'accounts';
            this.Created.emit(product.ID);
        } catch (e: unknown) {
            this.Errors = [e instanceof Error ? e.message : String(e)];
        } finally {
            this.Busy = false;
            this.cdr.detectChanges();
        }
    }

    /** A link was added or changed: the inherited accounts and any earlier check are now stale. */
    public OnLinksChanged(): void {
        this.Missing = [];
        void this.effective?.Refresh();
    }

    /**
     * Step 2: activates the product. Without `anyway`, runs the readiness check first and stops to
     * list what is missing; the user can then link accounts, or activate anyway (golive#433's rule).
     */
    public async Activate(anyway: boolean): Promise<void> {
        const product = this.Product;
        if (!product) return;
        this.Busy = true;
        this.Errors = [];
        try {
            if (!anyway) {
                const readiness = await CheckProductReadiness(product.ID);
                this.Missing = readiness.Missing;
                if (!readiness.Ready) return;
            }
            product.Status = 'Active';
            if (!(await product.Save())) {
                product.Status = 'Draft';
                this.Errors = [product.LatestResult?.CompleteMessage || 'The product could not be activated.'];
                return;
            }
            this.Close();
        } finally {
            this.Busy = false;
            this.cdr.detectChanges();
        }
    }

    public Close(): void {
        this.Closed.emit();
    }

    private reset(): void {
        this.Step = 'details';
        this.Draft = EmptyNewProductDraft(Today());
        this.Product = null;
        this.Errors = [];
        this.Missing = [];
    }

    private async loadLookups(): Promise<void> {
        const [types, categories, companies] = await Promise.all([GetProductTypes(), GetProductCategories(), loadCompanies()]);
        this.typeDefaults = types.map((t) => ({ ID: t.ID, DefaultRevenueRecognitionTypeID: t.DefaultRevenueRecognitionTypeID }));
        this.Types = types.map((t) => ({ ID: t.ID, Name: t.Name }));
        this.Categories = categories.map((c) => ({ ID: c.ID, Name: c.Name }));
        this.Companies = companies.Rows;
        if (companies.Error) this.Errors = [companies.Error];
        // GetProductTypes has loaded the engine, which caches the recognition types too.
        this.RevenueRecognitionTypes = OrdersEngine.Instance.RevenueRecognitionTypes.filter((r) => r.IsActive)
            .sort((a, b) => a.Sequence - b.Sequence)
            .map((r) => ({ ID: r.ID, Name: r.Name }));
        this.lookupsLoaded = true;
        this.cdr.detectChanges();
    }
}

/** Every company, by name: a new product may belong to one that sells nothing yet. */
async function loadCompanies(): Promise<{ Rows: Option[]; Error: string | null }> {
    const result = await new RunView().RunView<Option>({
        EntityName: COMPANY_ENTITY,
        Fields: ['ID', 'Name'],
        OrderBy: 'Name',
        ResultType: 'simple',
    });
    return result.Success
        ? { Rows: result.Results, Error: null }
        : { Rows: [], Error: `Companies could not be loaded: ${result.ErrorMessage}` };
}
