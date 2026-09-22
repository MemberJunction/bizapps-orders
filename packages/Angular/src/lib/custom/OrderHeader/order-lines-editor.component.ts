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
    isEnginePrice,
    loadApplicabilityContext,
    moneyEqual,
    priceOverrideCatalogInstalled,
    userPriceOverrideKind,
    type ApplicablePrice,
    type PriceOverrideKind,
    type mjBizAppsOrdersOrderAdjustmentEntity,
    type mjBizAppsOrdersOrderLineEntity,
} from '@mj-biz-apps/orders-entities';
import { MJOConsequenceChipComponent, MJOPriceSourceBadgeComponent } from '../../panels/chips.component';
import { FormatMoney, MJOMoneyPipe } from '../../panels/money-format';
import { MJO_ENTITIES } from '../../data/entity-names';
import {
    ContinuationStartFrom,
    GetCatalogOptions,
    GetDimensionOptions,
    GetDiscountAuthority,
    GetSubscriptionContinuation,
    RankCatalogMatches,
    type MJODimensionOption,
    type MJODiscountAuthority,
    type MJOProductOption,
} from '../../data/orders-queries';
import { MJOOrderLineDetailsPanelComponent } from './order-line-details-panel.component';
import { MJOPricingScheduler, type MJOEngineDefault, type MJOLinePrice, type MJOPricingState } from '../../services/pricing-scheduler.service';

/**
 * The picker's option values that are not ProductPrice ids.
 *
 * `Default` used to be the empty string, and that is what golive #253 item 1 was: a `<select>`
 * whose bound value names an option that is not in the DOM yet falls back to its first option, and
 * an option whose value is `""` is indistinguishable from "nothing selected". The DOM then showed
 * Default while the component believed the line was on a custom amount, so choosing Default fired
 * no change event and nothing ran. A real sentinel cannot be mistaken for absence.
 */
export const PRICE_PICK_DEFAULT = '__default__';
export const PRICE_PICK_CUSTOM = '__custom__';

import {
    ExtensionCollapsedHint,
    ExtensionToggleLabel,
} from './line-extension-fields';
import { CachedExtensionEntityInfo, CachedExtensionFormConfig } from './line-extension-cache';
import { anyFieldIsDirty } from '@mj-biz-apps/orders-entities';

/**
 * Just enough of an RxJS subscription to release one.
 *
 * Structural rather than imported: `rxjs` is Angular's own peer and this package does not declare
 * it, and pnpm resolves only what a package declares. One method is all this file uses.
 */
type MJOReleasable = { unsubscribe(): void };

/** How a discount was expressed. The two are one concession — see `ManualDiscountAmount`. */
export type MJODiscountMode = 'percent' | 'amount';

/** A discount being composed on a line, before it is complete enough to stage. */
export interface MJODiscountDraft {
    Mode: MJODiscountMode;
    Value: number | null;
    Reason: string;
}

/**
 * The draft a line has when nobody has typed anything.
 *
 * SHARED AND NEVER WRITTEN TO. The template reads a draft for every line on every change-detection
 * pass, and a getter that created one on demand would mutate component state from inside change
 * detection. Editing goes through `mutableDiscountDraft`, which is the only thing that stores one.
 */
const EMPTY_DISCOUNT_DRAFT: Readonly<MJODiscountDraft> = Object.freeze({
    Mode: 'percent' as MJODiscountMode,
    Value: null,
    Reason: '',
});

/** Cents, the way the pricing engine rounds them, so the screen never disagrees by a penny. */
function round(value: number): number {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

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
    /** The authority the signed-in user discounts under; null once looked up and none was found. */
    public DiscountAuthority: MJODiscountAuthority | null = null;
    public DiscountAuthorityLoaded = false;
    private readonly discountDrafts = new Map<string, MJODiscountDraft>();
    private readonly stagedDiscounts = new Map<string, mjBizAppsOrdersOrderAdjustmentEntity>();
    /** One in-flight sync per line — see {@link syncStagedDiscount}. */
    private readonly discountSyncQueue = new Map<string, Promise<void>>();
    private orderEvents: MJOReleasable | null = null;

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
        if (this.customAmountLineIds.has(line.ID)) return PRICE_PICK_CUSTOM;
        if (!this.IsOverridden(line)) return PRICE_PICK_DEFAULT;
        if (line.ProductPriceID) return String(line.ProductPriceID);
        return this.OverrideKind === 'any' ? PRICE_PICK_CUSTOM : PRICE_PICK_DEFAULT;
    }

    /**
     * Whether this option is the one in force — bound per option rather than as `[value]` on the
     * select. The select's value is applied before its `@if`/`@for` options exist, so a value naming
     * one of them lands on nothing and the browser falls back to the first row (see
     * {@link PRICE_PICK_DEFAULT}). An option knows whether it is selected as soon as it is created.
     */
    public IsPicked(line: mjBizAppsOrdersOrderLineEntity, value: string): boolean {
        return this.SelectedPriceID(line) === value;
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
        const priced = this.PricedLine(line);
        // The engine default names its own rule even while the line is pinned; `PriceSource` says
        // 'stated' for a pinned line, which is not the rule's name.
        const rule = priced?.Default?.PriceName ?? priced?.PriceSource;
        const amount = FormatMoney(unit);
        // 'stated' is not a rule name — it means the user typed this price, and saying
        // "Default (stated)" would present their own entry back to them as a resolution.
        return rule && rule !== 'stated' ? `Default (${rule}) · ${amount}` : `Default · ${amount}`;
    }

    public ShowCustomAmount(line: mjBizAppsOrdersOrderLineEntity): boolean {
        return this.OverrideKind === 'any' && this.SelectedPriceID(line) === PRICE_PICK_CUSTOM;
    }

    /**
     * The explanation is for a line that actually left its default — which, now that every pick
     * and typed amount is compared against the engine default before the flag is set, is exactly
     * what {@link IsOverridden} says.
     */
    public CanExplainOverride(line: mjBizAppsOrdersOrderLineEntity): boolean {
        return this.IsOverridden(line);
    }

    /**
     * True while the line is overridden and nobody has said why (golive #253 item 4). Done stays
     * disabled until this is false; the server refuses the save on the same rule, so closing the
     * editor another way does not get around it.
     */
    public NeedsOverrideReason(line: mjBizAppsOrdersOrderLineEntity): boolean {
        return this.IsOverridden(line) && this.OverrideReasonText(line).trim() === '';
    }

    /**
     * What the rules say this line costs, whether or not it is currently pinned.
     *
     * The pricing pass reports the engine default alongside the priced amount, so a pinned line
     * still knows what it would have been. The per-line cache remains as the fallback for a
     * result that predates that field.
     */
    public DefaultUnit(line: mjBizAppsOrdersOrderLineEntity): number | null {
        const priced = this.PricedLine(line);
        if (priced?.Default !== undefined) return priced.Default?.UnitPrice ?? null;
        if (this.defaultUnitByLine.has(line.ID)) return this.defaultUnitByLine.get(line.ID) ?? null;
        return this.IsOverridden(line) ? null : (priced?.UnitPrice ?? null);
    }

    /** The engine default in full — rule id and name as well as the amount — when the pass reported it. */
    public EngineDefault(line: mjBizAppsOrdersOrderLineEntity): MJOEngineDefault | null {
        return this.PricedLine(line)?.Default ?? null;
    }

    /**
     * The named rules the picker offers BESIDES the default (golive #253 item 3).
     *
     * The rule the engine already chose is not listed: the Default row is that rule, named and
     * priced, and a second option that means the same thing is what made the picker ambiguous. A
     * product with one applicable rule therefore offers Default (and Custom amount) alone.
     */
    public NamedPricesFor(line: mjBizAppsOrdersOrderLineEntity): ApplicablePrice[] {
        const applicable = this.ApplicableFor(line);
        const engine = this.EngineDefault(line);
        if (!engine?.ProductPriceID) return applicable;
        return applicable.filter((p) => !UUIDsEqual(p.ID, engine.ProductPriceID ?? ''));
    }

    public PickNamedPrice(line: mjBizAppsOrdersOrderLineEntity, event: Event): void {
        if (!this.CanOverride) return;
        const target = event.target;
        if (!(target instanceof HTMLSelectElement)) return;
        const id = target.value;
        if (id === PRICE_PICK_DEFAULT) {
            this.restoreDefault(line);
            return;
        }
        if (id === PRICE_PICK_CUSTOM) {
            // Choosing the row is not yet an override: nothing has been typed, so the amount box
            // opens on the default and the flag waits for an amount that differs from it.
            this.customAmountLineIds.add(line.ID);
            this.cdr.detectChanges();
            return;
        }
        this.customAmountLineIds.delete(line.ID);
        const hit = this.ApplicableFor(line).find((p) => UUIDsEqual(p.ID, id));
        if (!hit) return;
        const engine = this.EngineDefault(line);
        // A named rule that IS the default restates the rules rather than overriding them (item 2).
        if (engine && isEnginePrice({ UnitPrice: hit.UnitPrice, ProductPriceID: hit.ID }, engine)) {
            this.restoreDefault(line);
            return;
        }
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
        const def = this.DefaultUnit(line);
        // Typing the default back in is a return to the rules, not an override of them (item 2).
        // Through `restoreDefault`, NOT `clearOverride`: on a saved line the baseline is the
        // stored override, so clearing would keep the old price while dropping its flag and reason.
        if (def != null && moneyEqual(amount, def)) {
            this.restoreDefault(line);
            return;
        }
        this.stamp(line, 'ProductPriceID', null);
        this.stamp(line, 'UnitPrice', amount);
        this.markOverridden(line);
        this.schedulePricing();
    }

    public IsOverrideEditorOpen(line: mjBizAppsOrdersOrderLineEntity): boolean {
        return this.overrideEditorLineIds.has(line.ID);
    }

    public ToggleOverrideEditor(line: mjBizAppsOrdersOrderLineEntity): void {
        // Either authority opens the panel. Gating it on price-override rights alone is what kept
        // the discount control out of reach of a user who may discount but may not re-price.
        if (!this.CanOverride && !this.CanDiscount) return;
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

    /** The "Use Default Price" button: back to the rules, and the editor closes. */
    public ResetOverride(line: mjBizAppsOrdersOrderLineEntity): void {
        if (!this.CanRestoreDefault(line)) return;
        this.restoreDefault(line);
        this.overrideEditorLineIds.delete(line.ID);
    }

    /**
     * Whether "back to the rules" is an answer this line can be given right now.
     *
     * An unsaved line always can: its baseline is "unpriced" and the engine fills it at save. A
     * saved line's baseline is whatever was stored — possibly the override itself — so it can only
     * be put back on the default once the pricing pass has said what that default IS. Until then
     * the Default row and the reset button are offered disabled rather than acting on a guess.
     */
    public CanRestoreDefault(line: mjBizAppsOrdersOrderLineEntity): boolean {
        return !line.IsSaved || this.EngineDefault(line) != null;
    }

    /**
     * Back to whatever the rules say, with the editor left open — the Default row of the picker.
     * The override, its reason and any custom amount all go; the flag is cleared because the price
     * is no longer a deviation, not merely hidden.
     *
     * A saved line whose default is not known is left exactly as it is, flag included: clearing the
     * flag on a price that did not change would keep the concession and erase its audit trail.
     */
    private restoreDefault(line: mjBizAppsOrdersOrderLineEntity): void {
        const engine = this.EngineDefault(line);
        if (line.IsSaved) {
            if (!engine) return;
            // A saved line's baseline is whatever was stored, which may itself be the override; the
            // rules' answer is what Default promises, so that is what is written.
            this.stamp(line, 'UnitPrice', engine.UnitPrice);
            this.stamp(line, 'ProductPriceID', engine.ProductPriceID);
            this.stamp(line, 'PriceOverridden', false);
            this.stamp(line, 'PriceOverrideReason', null);
        } else {
            // An unsaved line's baseline is "unpriced", which the engine fills at save — the purest
            // form of "whatever the rules say".
            this.clearOverride(line);
        }
        this.customAmountLineIds.delete(line.ID);
        this.schedulePricing();
        this.cdr.detectChanges();
    }

    /**
     * Whether the line's price is a deviation from the rules.
     *
     * The flag settles it when set. Otherwise a dirty price counts only when it differs from the
     * engine default — a saved line put back on its default carries a changed value that is not an
     * override, and saying "overridden" of it is the false statement golive #253 item 2 reported.
     */
    public IsOverridden(line: mjBizAppsOrdersOrderLineEntity): boolean {
        const flag = line.GetFieldByName('PriceOverridden');
        if (flag && (flag.Value === true || flag.Value === 1 || flag.Value === '1')) return true;
        if (!anyFieldIsDirty(line, ['UnitPrice', 'ProductPriceID'])) return false;
        const engine = this.EngineDefault(line);
        return engine ? !isEnginePrice(line, engine) : true;
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

    // ── LINE DISCOUNTS ────────────────────────────────────────────────────────
    //
    // A DISCOUNT IS NOT A PRICE OVERRIDE, and the two sit next to each other here because that is
    // exactly the distinction that was missing (golive #252). An override says the price was
    // different. A discount says the list price held and value was given away — it is the only one
    // of the two that is reportable as discounting, and the only one that reaches the Sales
    // Discounts leg the journal entry has always been built to produce.
    //
    // NOTHING HERE WRITES `DiscountAmount`. The control stages an unsaved row on `Order.Adjustments`
    // and lets the order's save drain it through `AuthorizeManualDiscount`, which is what makes the
    // concession gated by the user's `SalesAuthority` and leaves an adjustment row naming who
    // granted it and why. Writing the field straight from here would produce the same number on the
    // line with none of that — a discount nobody authorized and nobody can trace.

    /** The base a percentage is taken from, and the ceiling an amount is checked against. */
    public DiscountBase(line: mjBizAppsOrdersOrderLineEntity): number {
        const unit = this.DisplayUnit(line) ?? Number(line.UnitPrice ?? 0);
        const gross = round(Number(line.Quantity ?? 0) * unit);
        const pct = Number(line.DiscountPct ?? 0);
        // What the line ALREADY carries is off the table — the same remainder the engine judges a
        // second concession against, so the screen and the server agree about what is left.
        return Math.max(0, round(gross * (1 - pct) - Number(line.DiscountAmount ?? 0)));
    }

    /** Whether this user may discount at all — an authority is required, and absence is not it. */
    public get CanDiscount(): boolean {
        return this.EditMode && this.DiscountAuthority !== null;
    }

    /**
     * Why the discount control is not on offer, in the words the person needs to act on.
     *
     * Silence would be the wrong answer: a rep who cannot find a discount box has no way to learn
     * that the reason is a missing authority row rather than a missing feature, which is how this
     * defect was reported in the first place.
     */
    public get DiscountUnavailableReason(): string | null {
        if (!this.EditMode || this.CanDiscount) return null;
        if (!this.DiscountAuthorityLoaded) return 'Checking what you may discount…';
        return (
            'Recording a discount needs an active Sales Authority, and none is granted to you. ' +
            'Ask for one before discounting — the order would be refused at save otherwise.'
        );
    }

    /** The cap this user discounts under, for the label above the control. */
    public get DiscountCapLabel(): string {
        const cap = this.DiscountAuthority?.MaxDiscountPct;
        if (cap == null) return 'no cap set';
        return `up to ${round(cap * 100)}%`;
    }

    /** A booked line's money is frozen, so it is shown rather than offered. */
    public CanDiscountLine(line: mjBizAppsOrdersOrderLineEntity): boolean {
        return this.CanDiscount && !line.JournalEntryID;
    }

    public DiscountDraft(line: mjBizAppsOrdersOrderLineEntity): Readonly<MJODiscountDraft> {
        return this.discountDrafts.get(line.ID) ?? EMPTY_DISCOUNT_DRAFT;
    }

    /** What the line already carries, from the pricing pass — staged requests included. */
    public AppliedDiscount(line: mjBizAppsOrdersOrderLineEntity): number {
        return Number(this.PricedLine(line)?.DiscountAmount ?? line.DiscountAmount ?? 0);
    }

    public HasDiscount(line: mjBizAppsOrdersOrderLineEntity): boolean {
        return this.AppliedDiscount(line) > 0;
    }

    /** True while a request for this line is staged and waiting for the order to be saved. */
    public HasStagedDiscount(line: mjBizAppsOrdersOrderLineEntity): boolean {
        return this.stagedDiscounts.has(line.ID);
    }

    /** The draft as money, whichever way it was expressed. Null when nothing usable was typed. */
    public DraftDiscountAmount(line: mjBizAppsOrdersOrderLineEntity): number | null {
        const draft = this.discountDrafts.get(line.ID);
        if (!draft || draft.Value == null || !Number.isFinite(draft.Value)) return null;
        if (draft.Mode === 'amount') return round(draft.Value);
        return round(this.DiscountBase(line) * (draft.Value / 100));
    }

    /**
     * What is wrong with the draft, or null when it is ready to stage.
     *
     * Every rule here is also enforced by `AuthorizeManualDiscount`, which is the one that decides.
     * Checking them on screen too is not duplication for its own sake: an invalid request staged
     * against the pricing pass takes the whole line strip down with a refusal, so the number the
     * user is composing would blank the prices they are composing it against.
     */
    public DiscountError(line: mjBizAppsOrdersOrderLineEntity): string | null {
        const amount = this.DraftDiscountAmount(line);
        if (amount == null) return null;
        if (amount <= 0) return 'A discount has to be more than nothing.';
        const base = this.DiscountBase(line);
        if (amount > base + 0.005) {
            return `That is more than the ${FormatMoney(base)} left to discount on this line.`;
        }
        const cap = this.DiscountAuthority?.MaxDiscountPct;
        if (cap != null && base > 0 && amount / base > cap + 1e-9) {
            return (
                `${round((amount / base) * 100)}% is above the ${round(cap * 100)}% on your Sales Authority. ` +
                `Lower it, or have an approver apply it.`
            );
        }
        return null;
    }

    /** True once an amount is valid but no reason has been given — the last thing still missing. */
    public NeedsDiscountReason(line: mjBizAppsOrdersOrderLineEntity): boolean {
        const amount = this.DraftDiscountAmount(line);
        return amount != null && amount > 0 && this.DiscountError(line) === null && !this.DiscountDraft(line).Reason.trim();
    }

    public SetDiscountMode(line: mjBizAppsOrdersOrderLineEntity, mode: MJODiscountMode): void {
        if (!this.CanDiscountLine(line)) return;
        const draft = this.mutableDiscountDraft(line);
        if (draft.Mode === mode) return;
        draft.Mode = mode;
        // The number meant one thing as a rate and would mean another as money. Cleared rather than
        // converted, because a silently converted figure is one the user never typed.
        draft.Value = null;
        this.syncStagedDiscount(line);
    }

    public SetDiscountValue(line: mjBizAppsOrdersOrderLineEntity, event: Event): void {
        if (!this.CanDiscountLine(line)) return;
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) return;
        const draft = this.mutableDiscountDraft(line);
        const parsed = Number.parseFloat(target.value);
        draft.Value = Number.isFinite(parsed) ? parsed : null;
        this.syncStagedDiscount(line);
    }

    public SetDiscountReason(line: mjBizAppsOrdersOrderLineEntity, event: Event): void {
        if (!this.CanDiscountLine(line)) return;
        const target = event.target;
        if (!(target instanceof HTMLTextAreaElement)) return;
        this.mutableDiscountDraft(line).Reason = target.value;
        this.syncStagedDiscount(line);
    }

    /** Drop the request. Only a STAGED one — a discount already booked is reversed, not deleted. */
    public ClearDiscount(line: mjBizAppsOrdersOrderLineEntity): void {
        if (!this.CanDiscountLine(line)) return;
        this.discountDrafts.delete(line.ID);
        this.syncStagedDiscount(line);
    }

    private mutableDiscountDraft(line: mjBizAppsOrdersOrderLineEntity): MJODiscountDraft {
        const existing = this.discountDrafts.get(line.ID);
        if (existing) return existing;
        const created: MJODiscountDraft = { ...EMPTY_DISCOUNT_DRAFT };
        this.discountDrafts.set(line.ID, created);
        return created;
    }

    /**
     * Queue a sync for this line, so two keystrokes cannot both stage a row.
     *
     * {@link applyStagedDiscount} awaits `Adjustments.Create()`, and every input event calls it. Two
     * events arriving inside that await — realistic on the first one, which instantiates the
     * adjustment entity class — would both find no staged row and both create one, and the server
     * would then apply the concession twice. Serialising per line is the fix that does not depend on
     * how long the create happens to take.
     *
     * A rejection is swallowed rather than propagated: it must not poison the chain for the next
     * keystroke, and there is nothing here that can fail except the create itself.
     */
    private syncStagedDiscount(line: mjBizAppsOrdersOrderLineEntity): void {
        const previous = this.discountSyncQueue.get(line.ID) ?? Promise.resolve();
        const next = previous.then(
            () => this.applyStagedDiscount(line),
            () => this.applyStagedDiscount(line),
        );
        this.discountSyncQueue.set(line.ID, next.catch(() => undefined));
    }

    /**
     * Put the draft on the order, or take it off — one staged row per line, never a second.
     *
     * The row is only staged once it is COMPLETE. A request with no reason or an impossible amount
     * is refused by the engine, and the pricing pass runs on every keystroke, so staging a
     * half-typed one would replace the line prices with a refusal message while the user is still
     * typing the thing that would make it valid.
     *
     * Reached only through {@link syncStagedDiscount}, which is what guarantees one at a time.
     */
    private async applyStagedDiscount(line: mjBizAppsOrdersOrderLineEntity): Promise<void> {
        const order = this._order;
        if (!order) return;

        const draft = this.discountDrafts.get(line.ID);
        const amount = this.DraftDiscountAmount(line);
        const reason = draft?.Reason.trim() ?? '';
        const usable = amount != null && amount > 0 && reason !== '' && this.DiscountError(line) === null;
        const staged = this.stagedDiscounts.get(line.ID);

        if (!usable) {
            if (staged) {
                order.Adjustments.Remove(staged);
                this.stagedDiscounts.delete(line.ID);
                this.schedulePricing();
            }
            this.cdr.detectChanges();
            return;
        }

        const row = staged ?? (await order.Adjustments.Create());
        // The line's own key, not its position: `NewRecord()` already generated the id this line
        // will be inserted under, so a line composed moments ago names itself exactly as a saved
        // one does and the engine resolves both the same way.
        row.OrderLineID = line.ID;
        row.Amount = amount;
        row.Reason = reason;
        this.stagedDiscounts.set(line.ID, row);
        this.schedulePricing();
        this.cdr.detectChanges();
    }

    /**
     * Forget the staged rows once the order has been saved.
     *
     * The server CONSUMES them — `drainStagedPricingRequests` reads each one into a discount request
     * and removes it — but it does that to its own copy. The browser's collection still holds them,
     * and a second save would hand the same concessions over again and discount the line twice.
     *
     * ONLY THIS COMPONENT'S BOOKKEEPING IS CLEARED, deliberately: the graph response rehydrates
     * `Order.Adjustments` from the server's own drained copy, so removing the rows here as well
     * would be fighting the reload for the same result. Do not "fix" this by calling
     * `Adjustments.Remove` — the rows this map points at are already gone by the time it runs.
     */
    private onOrderSaved(): void {
        if (!this.stagedDiscounts.size) return;
        this.stagedDiscounts.clear();
        this.discountDrafts.clear();
        this.discountSyncQueue.clear();
        this.schedulePricing();
        this.cdr.detectChanges();
    }

    private async loadDiscountAuthority(): Promise<void> {
        try {
            this.DiscountAuthority = await GetDiscountAuthority(this.metadata.CurrentUser as UserInfo | undefined);
        } catch {
            // An unreadable authority table is not permission to discount, and not a reason to stop
            // the editor loading either. The control stays off and says why.
            this.DiscountAuthority = null;
        }
        this.DiscountAuthorityLoaded = true;
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
     * Read straight off the line — `DimensionID` / `DimensionValueID` are columns, so they arrive
     * with the line itself and there is nothing to load first. An unknown id still reports as
     * tagged rather than as untagged: a tag pointing at a dimension this order's date has aged out
     * is a thing to go and look at, and "No dimension" would hide it.
     */
    public DimensionSummary(line: mjBizAppsOrdersOrderLineEntity): string {
        if (!this.DimensionCatalog.length) return 'Details';
        if (!line.DimensionID) return 'No dimension';
        const dimension = this.DimensionCatalog.find((d) => UUIDsEqual(d.ID, line.DimensionID ?? ''));
        const value = dimension?.Values.find((v) => UUIDsEqual(v.ID, line.DimensionValueID ?? ''));
        if (!dimension) return 'Tagged';
        return value ? `${dimension.Code} · ${value.Code}` : dimension.Code;
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
        await this.resolveOverrideKind();
        if (!this.DiscountAuthorityLoaded) await this.loadDiscountAuthority();
        // The staged rows are consumed by the SERVER's copy of the order, so the browser has to be
        // told the save happened or it would hand the same concessions over again on the next one.
        this.orderEvents =
            this._order?.RegisterEventHandler((event) => {
                if (event.type === 'save') this.onOrderSaved();
            }) ?? null;
        this.schedulePricing();
        void this.refreshAllApplicable();
        this.cdr.detectChanges();
    }

    private unbindOrder(): void {
        this.orderEvents?.unsubscribe();
        this.orderEvents = null;
        // Drafts and staged rows belong to the order that is going away. The rows themselves live on
        // that order's own collection, so dropping the bookkeeping here is enough.
        this.discountDrafts.clear();
        this.stagedDiscounts.clear();
        this.discountSyncQueue.clear();
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
