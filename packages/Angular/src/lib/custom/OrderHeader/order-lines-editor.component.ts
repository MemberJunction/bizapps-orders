import { ChangeDetectorRef, Component, EventEmitter, Input, OnDestroy, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
    BaseEntity,
    CompositeKey,
    Metadata,
    type IMetadataProvider,
} from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import {
    BaseFormComponent,
    BaseFormsModule,
    type EntityFormConfig,
    type FormNavigationEvent,
} from '@memberjunction/ng-base-forms';
import {
    OrderHeaderEntity,
    OrderLineEntity,
    ClampLineQuantity,
    type mjBizAppsOrdersOrderLineEntity,
} from '@mj-biz-apps/orders-entities';
import { MJOConsequenceChipComponent, MJOPriceSourceBadgeComponent } from '../../panels/chips.component';
import { MJOMoneyPipe } from '../../panels/money-format';
import { MJO_ENTITIES } from '../../data/entity-names';
import {
    ContinuationStartFrom,
    GetCatalogOptions,
    GetSubscriptionContinuation,
    type MJOProductOption,
} from '../../data/orders-queries';
import { MJOPricingScheduler, type MJOLinePrice, type MJOPricingState } from '../../services/pricing-scheduler.service';
import {
    ExtensionCollapsedHint,
    ExtensionToggleLabel,
} from './line-extension-fields';
import { CachedExtensionEntityInfo, CachedExtensionFormConfig } from './line-extension-cache';

/**
 * Inline catalog picker + line cards for an order header.
 *
 * Lines are `Order.Lines.Create()` children. When the product type declares an
 * `OrderLineExtensionEntity`, the extension is managed by `line.Extension` as a
 * `BaseEntity` companion and persists atomically on the server inside the order's
 * transaction. Newly added lines start expanded; existing lines stay collapsed
 * behind a disclosure.
 */
@Component({
    standalone: true,
    selector: 'mjo-order-lines-editor',
    imports: [
        CommonModule,
        FormsModule,
        BaseFormsModule,
        MJOConsequenceChipComponent,
        MJOPriceSourceBadgeComponent,
        MJOMoneyPipe,
    ],
    templateUrl: './order-lines-editor.component.html',
    styleUrls: ['./order-lines-editor.component.css'],
})
export class MJOOrderLinesEditorComponent implements OnDestroy {
    private readonly pricing = inject(MJOPricingScheduler);
    private readonly cdr = inject(ChangeDetectorRef);

    private _order: OrderHeaderEntity | null = null;
    private readonly expandedLineIds = new Set<string>();

    @Input() public Provider: IMetadataProvider | null = null;
    @Input() public EditMode = true;

    @Input()
    public set Order(value: OrderHeaderEntity | null) {
        this.unbindOrder();
        this._order = value;
        if (value) void this.onOrderBound();
    }
    public get Order(): OrderHeaderEntity | null {
        return this._order;
    }

    @Output() public PricingChanged = new EventEmitter<MJOPricingState>();
    @Output() public Navigate = new EventEmitter<FormNavigationEvent>();

    public Catalog: MJOProductOption[] = [];
    public Pricing: MJOPricingState = { Result: null, Loading: false, Error: null };
    public ProductQuery = '';
    public PickerCursor = 0;
    public PickerOpen = false;
    public CatalogError: string | null = null;

    public get Lines(): mjBizAppsOrdersOrderLineEntity[] {
        return [...(this._order?.Lines.Items ?? [])];
    }

    public get PickerResults(): MJOProductOption[] {
        const q = this.ProductQuery.trim().toLowerCase();
        const matches = this.Catalog.filter(
            (p) => !q || p.Name.toLowerCase().includes(q) || p.SKU.toLowerCase().includes(q),
        );
        return matches.slice(0, 8);
    }

    public OpenPicker(): void {
        this.PickerOpen = true;
        this.PickerCursor = 0;
    }

    public ClosePickerSoon(): void {
        setTimeout(() => {
            this.PickerOpen = false;
            this.cdr.detectChanges();
        }, 140);
    }

    public OnPickerKey(event: KeyboardEvent): void {
        const results = this.PickerResults;
        switch (event.key) {
            case 'ArrowDown':
                this.PickerCursor = Math.min(this.PickerCursor + 1, Math.max(results.length - 1, 0));
                event.preventDefault();
                break;
            case 'ArrowUp':
                this.PickerCursor = Math.max(this.PickerCursor - 1, 0);
                event.preventDefault();
                break;
            case 'Enter':
                if (results[this.PickerCursor]) {
                    void this.AddProduct(results[this.PickerCursor]);
                    event.preventDefault();
                }
                break;
            case 'Escape':
                this.PickerOpen = false;
                break;
            default:
                break;
        }
    }

    public async AddProduct(product: MJOProductOption): Promise<void> {
        if (!this.EditMode || !this._order) return;
        if (product.OrderLineExtensionEntity) {
            await this.addExtendedLine(product);
        } else {
            await this.addPlainLine(product);
        }
        this.ProductQuery = '';
        this.PickerCursor = 0;
        this.PickerOpen = false;
        this.schedulePricing();
        this.cdr.detectChanges();
    }

    public Bump(line: mjBizAppsOrdersOrderLineEntity, delta: number): void {
        if (!this.EditMode) return;
        line.Quantity = this.clampQuantity(line, Number(line.Quantity ?? 0) + delta);
        this.schedulePricing();
    }

    public SetQuantity(line: mjBizAppsOrdersOrderLineEntity, event: Event): void {
        if (!this.EditMode) return;
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) return;
        line.Quantity = this.clampQuantity(line, Number.parseFloat(target.value));
        this.schedulePricing();
    }

    public QuantityAtMax(line: mjBizAppsOrdersOrderLineEntity): boolean {
        const max = this.ProductFor(line)?.MaxQuantityPerLine;
        return max != null && max > 0 && Number(line.Quantity ?? 0) >= max;
    }

    public QuantityCappedToOne(line: mjBizAppsOrdersOrderLineEntity): boolean {
        return this.ProductFor(line)?.MaxQuantityPerLine === 1;
    }

    /* ── Term start (D-TERMSTART) ───────────────────────────────────────────
     *
     * Only a subscription line has a term, so only a subscription line shows the field. The rest
     * of the card is about the sale; this is about the coverage the sale buys, and the two dates
     * genuinely differ — an order booked 8/27 can sell a membership running 8/1–7/31.
     *
     * The stored value is `OrderLine.ServicePeriodStart`, which the server treats as an INPUT to
     * the term rather than the settled window (see `decideSubscriptions`). NULL means "follow the
     * order date", which is why clearing writes null rather than writing today.
     */

    public IsSubscriptionLine(line: mjBizAppsOrdersOrderLineEntity): boolean {
        return !!this.ProductFor(line)?.SubscriptionTypeID;
    }

    /**
     * What the date input shows: the stated start, or the order date as a DEFAULT when nothing is
     * stated. Rendering an empty field instead would misreport the outcome — an untouched line
     * still gets a term, and it starts on the order date.
     */
    public TermStartValue(line: mjBizAppsOrdersOrderLineEntity): string {
        return this.dateInputValue(line.ServicePeriodStart ?? this._order?.OrderDate ?? null);
    }

    /** True while the field is only showing the default, which is what the hint explains. */
    public TermStartFollowsOrderDate(line: mjBizAppsOrdersOrderLineEntity): boolean {
        return !line.ServicePeriodStart;
    }

    /* ── Renewal lines: the start is dictated, so it is shown rather than asked ──
     *
     * A line naming `RenewsSubscriptionID` whose target is LIVE will extend that coverage, and an
     * extension has to begin the day after the current term ends — coverage may neither overlap
     * nor gap. Offering an editable field there invites an input that will be ignored, so the field
     * goes read-only and shows the date the rules will actually use.
     *
     * The gate is deliberately narrower than "the line names a subscription": on the server,
     * `ComputeAction` only forces `ExtendExisting` for an `Active`/`Trialing` target, and an
     * extension with no prior term end falls through to the ordinary start rules. A lapsed target
     * REACTIVATES, which honors a stated start — so on those lines the field stays editable,
     * because there the input is not ignored. `ContinuationStartFrom` holds that rule.
     *
     * An ordinary subscription line stays editable even though it may turn out to be an implicit
     * extension at confirm. The client cannot detect that case — the server dedupes by subscriber
     * and product — which is what the `StartOverrideIgnored` notice exists for.
     */

    /** Continuation dates by subscription id. A present key with `null` means "nothing dictated". */
    private readonly continuationStarts = new Map<string, Date | null>();
    private readonly loadingContinuations = new Set<string>();

    /**
     * The date a renewal line's term will begin, or null when nothing dictates it.
     *
     * Sync because the template asks per line on every change detection, so the lookup is fired
     * once per subscription and cached — the same shape `ExtensionFor` uses. A cached `null` is a
     * real answer and is NOT retried; only an unseen id starts a read.
     */
    public ContinuationStartFor(line: mjBizAppsOrdersOrderLineEntity): Date | null {
        const subscriptionID = line.RenewsSubscriptionID;
        if (!subscriptionID) return null;

        if (this.continuationStarts.has(subscriptionID)) {
            return this.continuationStarts.get(subscriptionID) ?? null;
        }
        void this.loadContinuation(subscriptionID);
        return null;
    }

    /**
     * True once the term start is known to be the rules' to decide, which is when the field stops
     * being an input.
     *
     * False while the lookup is still in flight, so the field renders editable for that moment
     * rather than read-only-and-blank. An edit landing in that window is harmless: it writes the
     * same column, and the server would ignore it exactly as it ignores any other stated start on
     * a live extension.
     */
    public TermStartIsDictated(line: mjBizAppsOrdersOrderLineEntity): boolean {
        return this.ContinuationStartFor(line) !== null;
    }

    /** What the read-only field shows on a renewal line. */
    public ContinuationStartValue(line: mjBizAppsOrdersOrderLineEntity): string {
        return this.dateInputValue(this.ContinuationStartFor(line));
    }

    private async loadContinuation(subscriptionID: string): Promise<void> {
        if (this.loadingContinuations.has(subscriptionID)) return;
        this.loadingContinuations.add(subscriptionID);
        try {
            let start: Date | null = null;
            try {
                start = ContinuationStartFrom(await GetSubscriptionContinuation(subscriptionID));
            } finally {
                // Cached even when the read failed. Leaving the key absent would restart the read
                // on the next change detection, and a failing read would then loop for as long as
                // the card is on screen. A failure means the field stays editable — the server
                // still applies the rule, so the outcome is right either way.
                this.continuationStarts.set(subscriptionID, start);
            }
            this.cdr.detectChanges();
        } finally {
            this.loadingContinuations.delete(subscriptionID);
        }
    }

    public SetTermStart(line: mjBizAppsOrdersOrderLineEntity, event: Event): void {
        if (!this.EditMode) return;
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) return;

        // An emptied field is a RESET, not a date of zero — the same rule the button applies, so
        // clearing by keyboard and clearing by button agree.
        if (!target.value) {
            this.ResetTermStart(line);
            return;
        }

        // Parsed as UTC midnight from the input's own `yyyy-MM-dd`. `new Date('2026-08-01')` is
        // already UTC, but building from parts states it rather than relying on that, and keeps the
        // browser's zone from moving a date the user typed as a calendar day.
        const [year, month, day] = target.value.split('-').map(Number);
        if (!year || !month || !day) return;
        line.ServicePeriodStart = new Date(Date.UTC(year, month - 1, day));

        // NOT priced again: the term start moves no money on the client. A CalendarAnchored type
        // can prorate a partial first period, but that is settled inside the confirm transaction
        // and was never part of the client's price preview.
    }

    /** Hand the line back to the order date — the term start stops being stated at all. */
    public ResetTermStart(line: mjBizAppsOrdersOrderLineEntity): void {
        if (!this.EditMode) return;
        line.ServicePeriodStart = null;
    }

    /** `<input type="date">` speaks `yyyy-MM-dd` and nothing else. */
    private dateInputValue(value: Date | null): string {
        if (!value) return '';
        const date = value instanceof Date ? value : new Date(value);
        return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
    }

    public Remove(line: mjBizAppsOrdersOrderLineEntity): void {
        if (!this.EditMode) return;
        this.expandedLineIds.delete(line.ID);
        this._order?.Lines.Remove(line);
        this.schedulePricing();
    }

    public ProductFor(line: mjBizAppsOrdersOrderLineEntity): MJOProductOption | undefined {
        return this.Catalog.find((p) => UUIDsEqual(p.ID, line.ProductID));
    }

    public PricedLine(line: mjBizAppsOrdersOrderLineEntity): MJOLinePrice | undefined {
        return this.Pricing.Result?.Lines.find((priced) => UUIDsEqual(priced.ClientKey, line.ID));
    }

    public OpenProduct(line: mjBizAppsOrdersOrderLineEntity, event: Event): void {
        event.preventDefault();
        event.stopPropagation();
        if (!line.ProductID) return;
        this.Navigate.emit({
            Kind: 'record',
            EntityName: MJO_ENTITIES.Product,
            PrimaryKey: CompositeKey.FromID(line.ProductID),
        });
    }

    public OnExtensionNavigate(event: FormNavigationEvent): void {
        this.Navigate.emit(event);
    }

    public OnExtensionFormCreated(form: BaseFormComponent): void {
        form.showEmptyFields = true;
        this.cdr.detectChanges();
    }

    private readonly hydratingLineIds = new Set<string>();

    public ExtensionFor(line: mjBizAppsOrdersOrderLineEntity): BaseEntity | null {
        if (line.EntityInfo?.Name !== MJO_ENTITIES.OrderLine) {
            return line;
        }
        if (line instanceof OrderLineEntity) {
            if (line.Extension?.Entity) {
                return line.Extension.Entity;
            }
            if (line.IsSaved && !this.hydratingLineIds.has(line.ID)) {
                const extName = this.ProductFor(line)?.OrderLineExtensionEntity;
                if (extName) {
                    void this.hydrateSingleLine(line, extName);
                }
            }
            return null;
        }
        return (line as unknown as OrderLineEntity).Extension?.Entity ?? null;
    }

    public ExtensionFormConfigFor(line: mjBizAppsOrdersOrderLineEntity): EntityFormConfig {
        return CachedExtensionFormConfig(this.extensionEntityName(line));
    }

    public IsExtensionOpen(line: mjBizAppsOrdersOrderLineEntity): boolean {
        return this.expandedLineIds.has(line.ID);
    }

    public ToggleExtension(line: mjBizAppsOrdersOrderLineEntity): void {
        if (this.expandedLineIds.has(line.ID)) this.expandedLineIds.delete(line.ID);
        else this.expandedLineIds.add(line.ID);
    }

    public ExtensionLabel(line: mjBizAppsOrdersOrderLineEntity): string {
        return ExtensionToggleLabel(this.extensionEntityName(line));
    }

    public ExtensionHint(line: mjBizAppsOrdersOrderLineEntity): string {
        return ExtensionCollapsedHint(this.extensionEntityName(line));
    }

    public ngOnDestroy(): void {
        this.unbindOrder();
        this.pricing.CancelPending();
    }

    private get metadata(): IMetadataProvider {
        return this.Provider ?? Metadata.Provider;
    }

    private async onOrderBound(): Promise<void> {
        if (this.Catalog.length === 0) await this.loadCatalog();
        if (this._order && !this._order.Lines.IsLoaded && this._order.IsSaved) {
            await this._order.Lines.Load();
        }
        await this.hydrateExtensions();
        this.schedulePricing();
        this.cdr.detectChanges();
    }

    private unbindOrder(): void {
        this.expandedLineIds.clear();
        this.hydratingLineIds.clear();
        // Dropped on rebind rather than kept: coverage moves when any renewal confirms anywhere, so
        // a cached continuation date is only trustworthy for as long as one order is open.
        this.continuationStarts.clear();
    }

    private async addPlainLine(product: MJOProductOption): Promise<void> {
        if (!this._order) return;
        const line = await this._order.Lines.Create();
        line.ProductID = product.ID;
        line.Quantity = ClampLineQuantity(1, product.MaxQuantityPerLine);
    }

    private async addExtendedLine(product: MJOProductOption): Promise<void> {
        if (!this._order || !product.OrderLineExtensionEntity) return;
        CachedExtensionEntityInfo(this.metadata, product.OrderLineExtensionEntity);
        const line = (await this._order.Lines.Create()) as OrderLineEntity;
        line.ProductID = product.ID;
        line.Quantity = ClampLineQuantity(1, product.MaxQuantityPerLine);
        if (line instanceof OrderLineEntity) {
            await line.Extension.EnsureEntity(product.OrderLineExtensionEntity);
        }
        this.expandedLineIds.add(line.ID);
    }

    private async hydrateSingleLine(line: OrderLineEntity, extName: string): Promise<void> {
        if (this.hydratingLineIds.has(line.ID)) return;
        this.hydratingLineIds.add(line.ID);
        try {
            CachedExtensionEntityInfo(this.metadata, extName);
            await line.Extension.EnsureEntity(extName);
            this.cdr.detectChanges();
        } finally {
            this.hydratingLineIds.delete(line.ID);
        }
    }

    private async hydrateExtensions(): Promise<void> {
        if (!this._order) return;
        if (this.Catalog.length === 0) await this.loadCatalog();
        for (const line of this.Lines) {
            const extName = this.ProductFor(line)?.OrderLineExtensionEntity;
            if (extName && line.IsSaved) {
                if (line instanceof OrderLineEntity) {
                    await this.hydrateSingleLine(line, extName);
                } else if ((line as unknown as OrderLineEntity).Extension) {
                    await this.hydrateSingleLine(line as unknown as OrderLineEntity, extName);
                }
            }
        }
    }

    private clampQuantity(line: mjBizAppsOrdersOrderLineEntity, quantity: number): number {
        return ClampLineQuantity(quantity, this.ProductFor(line)?.MaxQuantityPerLine);
    }

    private extensionEntityName(line: mjBizAppsOrdersOrderLineEntity): string {
        return (
            this.ExtensionFor(line)?.EntityInfo.Name ??
            this.ProductFor(line)?.OrderLineExtensionEntity ??
            ''
        );
    }

    private async loadCatalog(): Promise<void> {
        try {
            this.Catalog = await GetCatalogOptions(this.metadata.CurrentUser);
            this.CatalogError = null;
        } catch (error) {
            this.Catalog = [];
            this.CatalogError = error instanceof Error ? error.message : String(error);
        }
    }

    private schedulePricing(): void {
        if (!this._order) return;
        this.pricing.SchedulePricing(this._order, (state) => {
            this.Pricing = state;
            this.PricingChanged.emit(state);
            this.cdr.detectChanges();
        });
    }
}
