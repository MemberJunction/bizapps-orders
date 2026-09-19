import { ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, OnDestroy, Output, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
    BaseEntity,
    CompositeKey,
    Metadata,
    RunView,
    type IMetadataProvider,
    type UserInfo,
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
    ListApplicablePrices,
    LoadOrdersEngine,
    OrdersEngine,
    loadApplicabilityContext,
    moneyEqual,
    priceOverrideCatalogInstalled,
    userPriceOverrideKind,
    type ApplicablePrice,
    type PriceOverrideKind,
    type mjBizAppsOrdersOrderLineDimensionEntity,
    type mjBizAppsOrdersOrderLineEntity,
} from '@mj-biz-apps/orders-entities';
import { MJOConsequenceChipComponent, MJOPriceSourceBadgeComponent } from '../../panels/chips.component';
import { FormatMoney, MJOMoneyPipe } from '../../panels/money-format';
import { MJO_ENTITIES } from '../../data/entity-names';
import {
    ContinuationStartFrom,
    GetCatalogOptions,
    GetDimensionOptions,
    GetLineDimensionsForOrder,
    GetSubscriptionContinuation,
    RankCatalogMatches,
    type MJODimensionOption,
    type MJOProductOption,
} from '../../data/orders-queries';
import { MJOOrderLineDetailsPanelComponent } from './order-line-details-panel.component';
import { MJOPricingScheduler, type MJOLinePrice, type MJOPricingState } from '../../services/pricing-scheduler.service';
import {
    ExtensionCollapsedHint,
    ExtensionToggleLabel,
} from './line-extension-fields';
import { CachedExtensionEntityInfo, CachedExtensionFormConfig } from './line-extension-cache';
import { anyFieldIsDirty } from '@mj-biz-apps/orders-entities';

/**
 * How many catalog rows the picker offers at once.
 *
 * The list is capped for the READER, not for the search — the search runs over the whole active
 * catalog. Bounded because the drop-down scrolls inside 240px and a list nobody scrolls to the end
 * of is a list that stopped helping; the ranking is what puts the right row inside this window.
 */
const PICKER_RESULT_LIMIT = 12;

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
        MJOOrderLineDetailsPanelComponent,
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
    /** Bumped whenever `Catalog` is replaced, so `PickerResults` knows its cache is stale. */
    private catalogVersion = 0;
    private pickerCache: { Key: string; Results: MJOProductOption[] } | null = null;
    public Pricing: MJOPricingState = { Result: null, Loading: false, Error: null };
    public ProductQuery = '';
    public PickerCursor = 0;
    public PickerOpen = false;
    /** True when the catalog list would overflow the viewport below the search box. */
    public PickerOpensUp = false;
    public CatalogError: string | null = null;
    @ViewChild('pickerHost') private pickerHost?: ElementRef<HTMLElement>;
    /** 'none' hides the picker; 'list' is named prices only; 'any' also types an amount. */
    public OverrideKind: PriceOverrideKind = 'none';
    private readonly applicableByLine = new Map<string, ApplicablePrice[]>();
    private readonly overrideEditorLineIds = new Set<string>();
    private readonly customAmountLineIds = new Set<string>();
    private readonly defaultUnitByLine = new Map<string, number | null>();

    public get Lines(): mjBizAppsOrdersOrderLineEntity[] {
        return [...(this._order?.Lines.Items ?? [])];
    }

    /**
     * The rows the picker shows, ranked by `RankCatalogMatches`.
     *
     * MEMOISED, and that is not premature. This is a getter the template reads, so Angular calls it
     * on every change-detection pass — and it now ranks the ENTIRE active catalog rather than the
     * first 500 rows, because the 500-row cap is what made products past it unfindable. Re-sorting
     * every product on every keystroke's worth of change detection is the cost of removing the cap;
     * the cache key is the only thing that can change the answer, so nothing goes stale.
     */
    public get PickerResults(): MJOProductOption[] {
        const query = this.ProductQuery.trim().toLowerCase();
        const companyID = String(this._order?.CompanyID ?? '');
        const key = `${this.catalogVersion}|${companyID}|${query}`;
        if (this.pickerCache?.Key !== key) {
            this.pickerCache = {
                Key: key,
                Results: RankCatalogMatches(this.Catalog, query, companyID || null).slice(
                    0,
                    PICKER_RESULT_LIMIT,
                ),
            };
        }
        return this.pickerCache.Results;
    }

    public OpenPicker(): void {
        this.PickerOpen = true;
        this.PickerCursor = 0;
        this.updatePickerFlip();
    }

    public OnProductQueryChange(): void {
        // Back to the top on every edit. The list is RANKED now, so row 0 is the best match for what
        // was just typed — leaving the cursor where it was points it at whatever happens to occupy
        // that position in a different result set, which is what Enter would then add.
        this.PickerCursor = 0;
        if (this.PickerOpen) this.updatePickerFlip();
    }

    public ClosePickerSoon(): void {
        setTimeout(() => {
            this.PickerOpen = false;
            this.PickerOpensUp = false;
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
        void this.refreshAllApplicable();
        this.cdr.detectChanges();
    }

    public Bump(line: mjBizAppsOrdersOrderLineEntity, delta: number): void {
        if (!this.EditMode) return;
        line.Quantity = this.clampQuantity(line, Number(line.Quantity ?? 0) + delta);
        void this.refreshApplicable(line);
        this.schedulePricing();
    }

    public SetQuantity(line: mjBizAppsOrdersOrderLineEntity, event: Event): void {
        if (!this.EditMode) return;
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) return;
        line.Quantity = this.clampQuantity(line, Number.parseFloat(target.value));
        void this.refreshApplicable(line);
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
        this.overrideEditorLineIds.delete(line.ID);
        this.customAmountLineIds.delete(line.ID);
        this._order?.Lines.Remove(line);
        this.schedulePricing();
    }

    public ProductFor(line: mjBizAppsOrdersOrderLineEntity): MJOProductOption | undefined {
        return this.Catalog.find((p) => UUIDsEqual(p.ID, line.ProductID));
    }

    /**
     * True when this product belongs to a different company than the order's selling company.
     *
     * Selling another company's product is INTENDED — BCC sells SoundPost products — so this marks
     * a row, it never hides one. It is the same test for a picker row and for a line already added,
     * which is the point of it being one function: the label a user chose by must still be there
     * after they chose it.
     */
    public IsForeignCompany(product: MJOProductOption): boolean {
        if (!product.CompanyName) return false;
        const sellingID = this._order?.CompanyID;
        if (product.CompanyID && sellingID) return !UUIDsEqual(product.CompanyID, sellingID);
        const sellingName = this._order?.Company;
        if (!sellingName) return true;
        return product.CompanyName.trim().toLowerCase() !== String(sellingName).trim().toLowerCase();
    }

    /** True when the line books to a different company than the order's selling company. */
    public ShowsForeignRevenue(line: mjBizAppsOrdersOrderLineEntity): boolean {
        const product = this.ProductFor(line);
        return product ? this.IsForeignCompany(product) : false;
    }

    public PricedLine(line: mjBizAppsOrdersOrderLineEntity): MJOLinePrice | undefined {
        return this.Pricing.Result?.Lines.find((priced) => UUIDsEqual(priced.ClientKey, line.ID));
    }

    public get CanOverride(): boolean {
        return this.EditMode && this.OverrideKind !== 'none';
    }

    public ApplicableFor(line: mjBizAppsOrdersOrderLineEntity): ApplicablePrice[] {
        return this.applicableByLine.get(line.ID) ?? [];
    }

    public SelectedPriceID(line: mjBizAppsOrdersOrderLineEntity): string {
        if (this.customAmountLineIds.has(line.ID)) return '__custom__';
        if (!this.IsOverridden(line)) return '';
        if (line.ProductPriceID) return String(line.ProductPriceID);
        return this.OverrideKind === 'any' ? '__custom__' : '';
    }

    public DisplayUnit(line: mjBizAppsOrdersOrderLineEntity): number | null {
        if (this.IsOverridden(line)) return Number(line.UnitPrice ?? 0);
        return this.PricedLine(line)?.UnitPrice ?? null;
    }

    /**
     * The `Default` row of the price picker — which rule is in force, and for how much.
     *
     * It read `Default · 195.00`, which answered neither question a user opening this
     * dropdown has: every other option names its rule and carries a currency symbol, so
     * the one entry that is ACTUALLY APPLIED was the only one that said nothing about
     * itself. The name comes from `PriceSource`, which is the same `priceLabel()` output
     * `ApplicablePrice.Name` carries, so the default and its twin in the list below read
     * identically. `FormatMoney` rather than `toFixed` for the symbol and the separators.
     */
    public DefaultLabel(line: mjBizAppsOrdersOrderLineEntity): string {
        const unit = this.DefaultUnit(line);
        if (unit == null) return 'Default price';
        const rule = this.PricedLine(line)?.PriceSource;
        const amount = FormatMoney(unit);
        // 'stated' is not a rule name — it means the user typed this price, and saying
        // "Default (stated)" would present their own entry back to them as a resolution.
        return rule && rule !== 'stated' ? `Default (${rule}) · ${amount}` : `Default · ${amount}`;
    }

    public ShowCustomAmount(line: mjBizAppsOrdersOrderLineEntity): boolean {
        return this.OverrideKind === 'any' && this.SelectedPriceID(line) === '__custom__';
    }

    public CanExplainOverride(line: mjBizAppsOrdersOrderLineEntity): boolean {
        const picked = this.SelectedPriceID(line);
        if (picked && picked !== '__custom__') return true;
        if (picked === '__custom__') {
            const typed = this.DisplayUnit(line);
            const def = this.DefaultUnit(line);
            if (typed == null || def == null) return typed != null;
            return !moneyEqual(typed, def);
        }
        return false;
    }

    public DefaultUnit(line: mjBizAppsOrdersOrderLineEntity): number | null {
        if (this.defaultUnitByLine.has(line.ID)) return this.defaultUnitByLine.get(line.ID) ?? null;
        return this.IsOverridden(line) ? null : (this.PricedLine(line)?.UnitPrice ?? null);
    }

    public PickNamedPrice(line: mjBizAppsOrdersOrderLineEntity, event: Event): void {
        if (!this.CanOverride) return;
        const target = event.target;
        if (!(target instanceof HTMLSelectElement)) return;
        const id = target.value;
        if (!id) {
            this.ResetOverride(line);
            return;
        }
        if (id === '__custom__') {
            this.customAmountLineIds.add(line.ID);
            this.stamp(line, 'ProductPriceID', null);
            this.markOverridden(line);
            this.cdr.detectChanges();
            return;
        }
        this.customAmountLineIds.delete(line.ID);
        const hit = this.ApplicableFor(line).find((p) => UUIDsEqual(p.ID, id));
        if (!hit) return;
        this.stamp(line, 'ProductPriceID', hit.ID);
        this.stamp(line, 'UnitPrice', hit.UnitPrice);
        this.markOverridden(line);
        this.schedulePricing();
        this.cdr.detectChanges();
    }

    public TypeAmount(line: mjBizAppsOrdersOrderLineEntity, event: Event): void {
        if (!this.CanOverride || this.OverrideKind !== 'any') return;
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) return;
        const amount = Number.parseFloat(target.value);
        if (!Number.isFinite(amount) || amount < 0) return;
        this.customAmountLineIds.add(line.ID);
        this.stamp(line, 'ProductPriceID', null);
        this.stamp(line, 'UnitPrice', amount);
        this.markOverridden(line);
        this.schedulePricing();
    }

    public IsOverrideEditorOpen(line: mjBizAppsOrdersOrderLineEntity): boolean {
        return this.overrideEditorLineIds.has(line.ID);
    }

    public ToggleOverrideEditor(line: mjBizAppsOrdersOrderLineEntity): void {
        if (!this.CanOverride) return;
        if (this.overrideEditorLineIds.has(line.ID)) {
            this.overrideEditorLineIds.delete(line.ID);
            return;
        }
        this.overrideEditorLineIds.add(line.ID);
        if (this.OverrideKind === 'any' && this.IsOverridden(line) && !line.ProductPriceID) {
            this.customAmountLineIds.add(line.ID);
        }
        void this.refreshApplicable(line);
    }

    public DoneOverrideEditor(line: mjBizAppsOrdersOrderLineEntity): void {
        this.overrideEditorLineIds.delete(line.ID);
    }

    public ResetOverride(line: mjBizAppsOrdersOrderLineEntity): void {
        this.clearOverride(line);
        this.customAmountLineIds.delete(line.ID);
        this.overrideEditorLineIds.delete(line.ID);
        this.schedulePricing();
    }

    public IsOverridden(line: mjBizAppsOrdersOrderLineEntity): boolean {
        const flag = line.GetFieldByName('PriceOverridden');
        if (flag && (flag.Value === true || flag.Value === 1 || flag.Value === '1')) return true;
        return anyFieldIsDirty(line, ['UnitPrice', 'ProductPriceID']);
    }

    public OverrideReasonText(line: mjBizAppsOrdersOrderLineEntity): string {
        const field = line.GetFieldByName('PriceOverrideReason');
        return field?.Value == null ? '' : String(field.Value);
    }

    public SetOverrideReason(line: mjBizAppsOrdersOrderLineEntity, event: Event): void {
        if (!this.CanExplainOverride(line)) return;
        const target = event.target;
        if (!(target instanceof HTMLTextAreaElement)) return;
        const reason = target.value.trim();
        this.stamp(line, 'PriceOverridden', true);
        this.stamp(line, 'PriceOverrideReason', reason === '' ? null : reason);
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
        if (line.ISAChild) {
            return line.ISAChild;
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

    /* ── Line details (golive #236) ──────────────────────────────────────────
     *
     * GL dimensions are per-line and there can be five of them, so they live behind a panel rather
     * than on the card. The card is already carrying product, quantity, price, the override editor,
     * consequence chips, term start and the extension disclosure; five more pickers on every row
     * would charge every reader for something most of them never open.
     */

    /** The line whose details panel is open, or null. One at a time — the panel is modal. */
    public DetailsLine: mjBizAppsOrdersOrderLineEntity | null = null;

    /** Every dimension a line may be tagged with, read once per bound order. */
    public DimensionCatalog: MJODimensionOption[] = [];

    public OpenDetails(line: mjBizAppsOrdersOrderLineEntity, event: Event): void {
        event.preventDefault();
        event.stopPropagation();
        this.DetailsLine = line;
    }

    public CloseDetails(): void {
        this.DetailsLine = null;
        // The panel edited `line.Dimensions` in memory, so the summary on the card is already stale
        // by the time it closes.
        this.cdr.detectChanges();
    }

    /**
     * What the card's details button reports without opening anything.
     *
     * Says nothing until the tags are actually loaded. A count read off an unloaded collection is
     * zero, and "No dimensions" on a line that is in fact tagged is the one answer this button must
     * never give — an untagged line is the defect, so a false negative reads as a problem that is
     * not there and a false positive hides one that is.
     */
    public DimensionSummary(line: mjBizAppsOrdersOrderLineEntity): string {
        if (!this.DimensionCatalog.length) return 'Details';
        if (line.IsSaved && !line.Dimensions.IsLoaded) return 'Details';
        const tagged = line.Dimensions.Items.length;
        return tagged === 0 ? 'No dimensions' : `${tagged} of ${this.DimensionCatalog.length} tagged`;
    }

    /**
     * Fill every saved line's `Dimensions` collection from ONE query.
     *
     * Per-line `Load()` would be a query per row on an order that may carry dozens. The collection
     * exposes `SetLoadedItems` for exactly this — the same distribution accounting does when it
     * reads a journal entry's lines and their dimension tags together.
     *
     * KEYED CASE-INSENSITIVELY. SQL Server returns `UNIQUEIDENTIFIER` uppercased while a
     * browser-minted id is lower case, so a case-sensitive map silently hands every line an empty
     * set — which would look exactly like the untagged state this work exists to fix.
     */
    private async hydrateLineDimensions(): Promise<void> {
        const saved = (this._order?.Lines.Items ?? []).filter((line) => line.IsSaved);
        if (!saved.length) return;

        const tags = await GetLineDimensionsForOrder(saved.map((line) => line.ID));
        const byLine = new Map<string, mjBizAppsOrdersOrderLineDimensionEntity[]>();
        for (const tag of tags) {
            const key = tag.OrderLineID.toLowerCase();
            const list = byLine.get(key) ?? [];
            list.push(tag);
            byLine.set(key, list);
        }
        for (const line of saved) {
            if (line.Dimensions.IsLoaded) continue;
            line.Dimensions.SetLoadedItems(byLine.get(line.ID.toLowerCase()) ?? []);
        }
    }

    /**
     * Read the dimension catalog for the order's own date.
     *
     * The order date, not today's: `DimensionValue` is effective-dated, and a back-dated order has
     * to offer the values that were live when it was placed. Failure leaves the catalog empty, and
     * the panel says so rather than rendering an empty picker list that reads as "no dimensions
     * exist".
     */
    private async loadDimensionCatalog(): Promise<void> {
        const asOf = this._order?.OrderDate ? new Date(this._order.OrderDate) : new Date();
        this.DimensionCatalog = await GetDimensionOptions(asOf);
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
        if (this.DimensionCatalog.length === 0) await this.loadDimensionCatalog();
        if (this._order && !this._order.Lines.IsLoaded && this._order.IsSaved) {
            await this._order.Lines.Load();
        }
        await this.hydrateExtensions();
        await this.hydrateLineDimensions();
        await this.resolveOverrideKind();
        this.schedulePricing();
        void this.refreshAllApplicable();
        this.cdr.detectChanges();
    }

    private unbindOrder(): void {
        this.DetailsLine = null;
        // Dropped rather than kept across orders, unlike the product catalog: dimension values are
        // effective-dated and this list was filtered against the PREVIOUS order's date, so reusing
        // it would offer one order the values that were live for another.
        this.DimensionCatalog = [];
        this.expandedLineIds.clear();
        this.hydratingLineIds.clear();
        // Dropped on rebind rather than kept: coverage moves when any renewal confirms anywhere, so
        // a cached continuation date is only trustworthy for as long as one order is open.
        this.continuationStarts.clear();
        this.applicableByLine.clear();
        this.overrideEditorLineIds.clear();
        this.customAmountLineIds.clear();
        this.defaultUnitByLine.clear();
        this.OverrideKind = 'none';
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
        await line.EnsureISAChild(product.OrderLineExtensionEntity);
        this.expandedLineIds.add(line.ID);
    }

    private async hydrateSingleLine(line: OrderLineEntity, extName: string): Promise<void> {
        if (this.hydratingLineIds.has(line.ID)) return;
        this.hydratingLineIds.add(line.ID);
        try {
            CachedExtensionEntityInfo(this.metadata, extName);
            await line.EnsureISAChild(extName);
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
        this.catalogVersion++;
    }

    private updatePickerFlip(): void {
        // Measure after the list is in the DOM so max-height (240px) is the right budget.
        requestAnimationFrame(() => {
            const host = this.pickerHost?.nativeElement;
            if (!host || !this.PickerOpen) {
                this.PickerOpensUp = false;
                return;
            }
            const rect = host.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            const spaceAbove = rect.top;
            const listHeight = 240;
            this.PickerOpensUp = spaceBelow < listHeight && spaceAbove > spaceBelow;
            this.cdr.detectChanges();
        });
    }

    private schedulePricing(): void {
        if (!this._order) return;
        this.pricing.SchedulePricing(this._order, (state) => {
            this.Pricing = state;
            this.PricingChanged.emit(state);
            for (const line of this.Lines) {
                if (!this.IsOverridden(line)) {
                    this.defaultUnitByLine.set(line.ID, this.PricedLine(line)?.UnitPrice ?? null);
                }
            }
            this.cdr.detectChanges();
        });
    }

    private stamp(line: mjBizAppsOrdersOrderLineEntity, fieldName: string, value: unknown): void {
        const field = line.GetFieldByName(fieldName);
        if (!field) return;
        const baseline = field.OldValue;
        field.Value = value;
        if (!field.Dirty) field.RestoreOldValue(baseline);
    }

    private clearOverride(line: mjBizAppsOrdersOrderLineEntity): void {
        const unit = line.GetFieldByName('UnitPrice');
        const named = line.GetFieldByName('ProductPriceID');
        if (unit) unit.Value = unit.OldValue;
        if (named) named.Value = named.OldValue;
        this.stamp(line, 'PriceOverridden', false);
        this.stamp(line, 'PriceOverrideReason', null);
    }

    private markOverridden(line: mjBizAppsOrdersOrderLineEntity): void {
        this.stamp(line, 'PriceOverridden', true);
    }

    private async resolveOverrideKind(): Promise<void> {
        const user = this.metadata.CurrentUser as UserInfo | null;
        this.OverrideKind = userPriceOverrideKind(user, this.metadata);
        if (this.OverrideKind !== 'none') return;
        if (!priceOverrideCatalogInstalled(this.metadata)) return;
        this.OverrideKind = await this.overrideKindFromLiveRoles(user);
    }

    private async overrideKindFromLiveRoles(user: UserInfo | null): Promise<PriceOverrideKind> {
        const roleIDs = (user?.UserRoles ?? []).map((r) => r.RoleID).filter(Boolean);
        if (!roleIDs.length) return 'none';
        const quoted = roleIDs.map((id) => `'${String(id).replace(/'/g, "''")}'`).join(',');
        const rv = new RunView();
        const res = await rv.RunView<{ Authorization: string; Type: string }>({
            EntityName: 'MJ: Authorization Roles',
            // [Authorization] must be bracketed: it is a RESERVED T-SQL keyword, so an unbracketed
            // reference makes SQL Server reject the whole statement with "Incorrect syntax near
            // the keyword 'Authorization'" — the select list brackets it, this filter did not.
            ExtraFilter: `[RoleID] IN (${quoted}) AND [Type] LIKE 'Allow%' AND [Authorization] LIKE 'MJ.BizApps.Orders.Price.Override%'`,
            ResultType: 'simple',
        });
        const names = (res.Success ? res.Results : [])
            .map((row) => String(row.Authorization ?? ''))
            .filter(Boolean);
        if (names.some((n) => n === 'MJ.BizApps.Orders.Price.OverrideAny' || n === 'MJ.BizApps.Orders.Price.Override')) {
            return 'any';
        }
        if (names.includes('MJ.BizApps.Orders.Price.OverrideList')) return 'list';
        return 'none';
    }

    private async refreshAllApplicable(): Promise<void> {
        if (!this.CanOverride) return;
        await Promise.all(this.Lines.map((line) => this.refreshApplicable(line)));
        this.cdr.detectChanges();
    }

    private async refreshApplicable(line: mjBizAppsOrdersOrderLineEntity): Promise<void> {
        if (!this.CanOverride || !this._order || !line.ProductID) return;
        const user = this.metadata.CurrentUser as UserInfo | null;
        if (!user) return;
        try {
            await LoadOrdersEngine(this.metadata, user);
            const product = OrdersEngine.Instance.ProductByID(line.ProductID);
            const companyID = product?.CompanyID ?? this._order.CompanyID;
            if (!companyID) return;
            const ctx = {
                ProductID: line.ProductID,
                ProductCategoryID: product?.ProductCategoryID ?? null,
                CompanyID: companyID,
                Quantity: Number(line.Quantity ?? 0),
                AsOf: this._order.OrderDate ? new Date(this._order.OrderDate) : new Date(),
                OrganizationID: this._order.BillToOrganizationID ?? null,
                PersonID: this._order.BillToPersonID ?? null,
                ApplicabilityContext: await loadApplicabilityContext(
                    {
                        OrderHeaderID: this._order.ID ?? null,
                        ProductID: line.ProductID,
                        BillToPersonID: this._order.BillToPersonID ?? null,
                        BillToOrganizationID: this._order.BillToOrganizationID ?? null,
                        ShipToPersonID: this._order.ShipToPersonID ?? null,
                        ShipToOrganizationID: this._order.ShipToOrganizationID ?? null,
                        BillToAddressID: this._order.BillToAddressID ?? null,
                        ShipToAddressID: this._order.ShipToAddressID ?? null,
                    },
                    this.metadata,
                    user,
                ),
            };
            this.applicableByLine.set(line.ID, await ListApplicablePrices(ctx, this.metadata, user));
        } catch {
            this.applicableByLine.set(line.ID, []);
        }
    }
}
