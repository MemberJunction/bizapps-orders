/**
 * @fileoverview `mjo-line-price-picker` — the price choice for one order line.
 *
 * One control for every screen that states intent on an `OrderLine`: the order lines editor and
 * the deal line editor in bizapps-sales (golive #270). Two copies would be two answers to "which
 * price is this line on?", and the order side's picker has already needed four fixes (golive #253)
 * that a copy would have had to receive separately.
 *
 * WHAT IT OFFERS. The Default row (the rule the engine chose, named and priced), the product's other
 * applicable named prices, and — only where the host allows it and the user holds
 * `MJ.BizApps.Orders.Price.OverrideAny` — a typed custom amount. Any pick that leaves the default
 * asks for a reason.
 *
 * WHAT IT DOES NOT DO. It prices nothing: the default and the named prices are inputs, from
 * `Orders.PriceOrder` and `ListApplicablePrices`. It writes only the line's own price fields, through
 * the rules in `@mj-biz-apps/orders-entities` (`linePricePick`), and emits {@link PriceChanged} so the
 * host re-prices. The host decides whether the picker is shown at all.
 *
 * @module @mj-biz-apps/orders-ng
 */
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UUIDsEqual } from '@memberjunction/global';
import {
    IsLinePriceOverridden,
    LineNeedsOverrideReason,
    LinePriceOverrideReason,
    NamedPricesBesideDefault,
    PinLineToAmount,
    PinLineToNamedPrice,
    PRICE_PICK_CUSTOM,
    PRICE_PICK_DEFAULT,
    RestoreLineDefault,
    SetLinePriceOverrideReason,
    CanRestoreLineDefault,
    type ApplicablePrice,
    type LineEngineDefault,
    type LinePriceChange,
    type PriceOverrideKind,
    type mjBizAppsOrdersOrderLineEntity,
} from '@mj-biz-apps/orders-entities';
import { FormatMoney, MJOMoneyPipe } from './money-format';

@Component({
    standalone: true,
    selector: 'mjo-line-price-picker',
    imports: [CommonModule, MJOMoneyPipe],
    template: `
        @if (Line && OverrideKind !== 'none') {
            <div class="mjo-lpp__row">
                <!--
                    Selection is bound PER OPTION, not as [value] on the select: the select's value is
                    applied before its @if/@for options exist, so a value naming one of them fell
                    through to the first row — Default — while the component still thought the line
                    was on a custom amount. Choosing Default then changed nothing, because it was
                    already the DOM's choice (golive #253).
                -->
                <select class="mjo-lpp__pick" (change)="PickNamedPrice(Line, $event)" aria-label="Named price">
                    <option value="__default__" [selected]="IsPicked(Line, '__default__')" [disabled]="!CanRestoreDefault(Line)">{{ DefaultLabel() }}</option>
                    @if (ShowCustomRow(Line)) {
                        <option value="__custom__" [selected]="IsPicked(Line, '__custom__')" [disabled]="!CustomAmountOffered">{{ CustomRowLabel(Line) }}</option>
                    }
                    @for (price of NamedPricesFor(); track price.ID) {
                        <option [value]="price.ID" [selected]="IsPicked(Line, price.ID)">{{ price.Name }} · {{ price.UnitPrice | mjoMoney }}</option>
                    }
                </select>
                @if (ShowCustomAmount(Line)) {
                    <input
                        class="mjo-lpp__amt"
                        type="number"
                        step="0.01"
                        min="0"
                        [value]="DisplayUnit(Line)"
                        (change)="TypeAmount(Line, $event)"
                        aria-label="Custom unit price">
                }
            </div>
            <label class="mjo-lpp__reason" [class.is-off]="!CanExplainOverride(Line)" [class.is-required]="NeedsOverrideReason(Line)">
                <span>Override Explanation @if (CanExplainOverride(Line)) {<em class="mjo-lpp__req" aria-hidden="true">*</em>}</span>
                <textarea
                    rows="2"
                    [disabled]="!CanExplainOverride(Line)"
                    [required]="CanExplainOverride(Line)"
                    [attr.aria-required]="CanExplainOverride(Line)"
                    [value]="OverrideReasonText(Line)"
                    (input)="SetOverrideReason(Line, $event)"
                    placeholder="Required — why this price differs from the default"></textarea>
            </label>
        }
    `,
    styles: [
        `
            :host {
                display: flex;
                flex-direction: column;
                gap: var(--mj-space-2);
            }
            .mjo-lpp__row {
                display: flex;
                align-items: center;
                gap: var(--mj-space-2);
            }
            .mjo-lpp__pick,
            .mjo-lpp__amt,
            .mjo-lpp__reason textarea {
                display: block;
                width: 100%;
                box-sizing: border-box;
                border: 1px solid var(--mj-border-strong);
                border-radius: var(--mj-radius-sm);
                background: var(--mj-bg-surface);
                color: inherit;
                font: inherit;
                font-size: var(--mj-text-xs);
                font-variant-numeric: tabular-nums;
            }
            .mjo-lpp__pick {
                height: 28px;
                padding: 0 6px;
                text-align: left;
                flex: 1 1 180px;
                max-width: 240px;
                width: auto;
            }
            .mjo-lpp__amt {
                height: 28px;
                padding: 0 8px;
                text-align: right;
                font-weight: var(--mj-font-semibold);
                width: 108px;
                flex: none;
            }
            .mjo-lpp__reason span {
                display: block;
                font-size: var(--mj-text-xs);
                color: var(--mj-text-muted);
                margin-bottom: 4px;
            }
            .mjo-lpp__reason.is-off {
                opacity: 0.55;
            }
            .mjo-lpp__req {
                font-style: normal;
                color: var(--mj-status-error-text);
                margin-left: 2px;
            }
            .mjo-lpp__reason.is-required textarea {
                border-color: var(--mj-status-error-text);
            }
            .mjo-lpp__reason textarea {
                resize: vertical;
                min-height: 48px;
                padding: 6px 8px;
                text-align: left;
                font-variant-numeric: normal;
            }
            .mjo-lpp__reason textarea:disabled {
                cursor: not-allowed;
                background: var(--mj-bg-surface-subtle, var(--mj-bg-surface));
            }
        `,
    ],
})
export class MJOLinePricePickerComponent implements OnInit {
    /** The line whose price is chosen. The picker writes its price fields and nothing else. */
    @Input() public Line: mjBizAppsOrdersOrderLineEntity | null = null;

    /** The signed-in user's override grant. `'none'` renders nothing. */
    @Input() public OverrideKind: PriceOverrideKind = 'none';

    /**
     * Whether this screen offers a typed amount at all, whatever the user's grant.
     *
     * False on the deal line editor: bizapps-sales D-DL2 keeps any price field out of the rep's
     * hands, and choosing one of orders' own named rules is not entering a price. A line already on
     * a typed amount still SAYS so there — the row is shown disabled rather than hidden, because a
     * picker reading "Default" over a concession would be the misstatement golive #253 fixed.
     */
    @Input() public AllowCustomAmount = true;

    /** The product's applicable named prices, from `ListApplicablePrices`. */
    @Input() public Applicable: readonly ApplicablePrice[] = [];

    /** The engine's default for this line, from the last pricing pass. Undefined until one reports it. */
    @Input() public EngineDefault: LineEngineDefault | null | undefined = undefined;

    /** The default unit price, which a host may know from an earlier pass before `EngineDefault` arrives. */
    @Input() public DefaultUnit: number | null = null;

    /** The price source the last pass named, used when the engine default carries no rule name. */
    @Input() public PriceSource: string | null = null;

    /** The unit price the last pass priced this line at. */
    @Input() public PricedUnit: number | null = null;

    /** Emitted after the line's price changed, so the host can re-price. Not emitted for a reason edit. */
    @Output() public PriceChanged = new EventEmitter<LinePriceChange>();

    /** True while the Custom amount row is chosen, including before anything has been typed into it. */
    private customAmountOpen = false;

    public ngOnInit(): void {
        // A line already on a typed amount opens on that amount, not on the Default row.
        if (this.Line && this.CustomAmountOffered && this.IsOverridden(this.Line) && !this.Line.ProductPriceID) {
            this.customAmountOpen = true;
        }
    }

    public get CustomAmountOffered(): boolean {
        return this.AllowCustomAmount && this.OverrideKind === 'any';
    }

    public IsOverridden(line: mjBizAppsOrdersOrderLineEntity): boolean {
        return IsLinePriceOverridden(line, this.EngineDefault);
    }

    /** True when the line is on a typed price rather than a named rule. */
    private isOnTypedAmount(line: mjBizAppsOrdersOrderLineEntity): boolean {
        return this.IsOverridden(line) && !line.ProductPriceID;
    }

    public SelectedPriceID(line: mjBizAppsOrdersOrderLineEntity): string {
        if (this.customAmountOpen) return PRICE_PICK_CUSTOM;
        if (!this.IsOverridden(line)) return PRICE_PICK_DEFAULT;
        if (line.ProductPriceID) return String(line.ProductPriceID);
        return this.ShowCustomRow(line) ? PRICE_PICK_CUSTOM : PRICE_PICK_DEFAULT;
    }

    /**
     * Whether this option is the one in force — bound per option rather than as `[value]` on the
     * select, because an option knows whether it is selected as soon as it is created.
     */
    public IsPicked(line: mjBizAppsOrdersOrderLineEntity, value: string): boolean {
        return this.SelectedPriceID(line) === value;
    }

    /** Offered when the user may type an amount; shown, disabled, when the line is already on one. */
    public ShowCustomRow(line: mjBizAppsOrdersOrderLineEntity): boolean {
        return this.CustomAmountOffered || this.isOnTypedAmount(line);
    }

    public CustomRowLabel(line: mjBizAppsOrdersOrderLineEntity): string {
        if (this.CustomAmountOffered) return 'Custom amount';
        return `Custom amount · ${FormatMoney(Number(line.UnitPrice ?? 0))}`;
    }

    public ShowCustomAmount(line: mjBizAppsOrdersOrderLineEntity): boolean {
        return this.CustomAmountOffered && this.SelectedPriceID(line) === PRICE_PICK_CUSTOM;
    }

    public DisplayUnit(line: mjBizAppsOrdersOrderLineEntity): number | null {
        if (this.IsOverridden(line)) return Number(line.UnitPrice ?? 0);
        return this.PricedUnit;
    }

    /**
     * The `Default` row — which rule is in force, and for how much.
     *
     * Every other option names its rule and carries a currency symbol, so the one entry that is
     * ACTUALLY APPLIED must as well (golive #194). The engine default names its own rule even while
     * the line is pinned; `PriceSource` says 'stated' for a pinned line, and 'stated' is not a rule
     * name — "Default (stated)" would present the user's own entry back to them as a resolution.
     */
    public DefaultLabel(): string {
        const unit = this.DefaultUnit;
        if (unit == null) return 'Default price';
        const rule = this.EngineDefault?.PriceName ?? this.PriceSource;
        const amount = FormatMoney(unit);
        return rule && rule !== 'stated' ? `Default (${rule}) · ${amount}` : `Default · ${amount}`;
    }

    public NamedPricesFor(): ApplicablePrice[] {
        return NamedPricesBesideDefault(this.Applicable, this.EngineDefault);
    }

    public CanRestoreDefault(line: mjBizAppsOrdersOrderLineEntity): boolean {
        return CanRestoreLineDefault(line, this.EngineDefault);
    }

    /** The explanation is for a line that actually left its default. */
    public CanExplainOverride(line: mjBizAppsOrdersOrderLineEntity): boolean {
        return this.IsOverridden(line);
    }

    public NeedsOverrideReason(line: mjBizAppsOrdersOrderLineEntity): boolean {
        return LineNeedsOverrideReason(line, this.EngineDefault);
    }

    public OverrideReasonText(line: mjBizAppsOrdersOrderLineEntity): string {
        return LinePriceOverrideReason(line);
    }

    public PickNamedPrice(line: mjBizAppsOrdersOrderLineEntity, event: Event): void {
        if (this.OverrideKind === 'none') return;
        const target = event.target;
        if (!(target instanceof HTMLSelectElement)) return;
        const id = target.value;
        if (id === PRICE_PICK_DEFAULT) {
            this.applied(RestoreLineDefault(line, this.EngineDefault) ? 'restored' : null);
            return;
        }
        if (id === PRICE_PICK_CUSTOM) {
            // Choosing the row is not yet an override: nothing has been typed, so the amount box
            // opens on the default and the flag waits for an amount that differs from it.
            if (this.CustomAmountOffered) this.customAmountOpen = true;
            return;
        }
        const hit = this.Applicable.find((p) => UUIDsEqual(p.ID, id));
        if (!hit) return;
        this.customAmountOpen = false;
        this.applied(PinLineToNamedPrice(line, hit, this.EngineDefault));
    }

    public TypeAmount(line: mjBizAppsOrdersOrderLineEntity, event: Event): void {
        if (!this.CustomAmountOffered) return;
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) return;
        const amount = Number.parseFloat(target.value);
        if (!Number.isFinite(amount) || amount < 0) return;
        this.customAmountOpen = true;
        this.applied(PinLineToAmount(line, amount, this.DefaultUnit, this.EngineDefault));
    }

    public SetOverrideReason(line: mjBizAppsOrdersOrderLineEntity, event: Event): void {
        if (!this.CanExplainOverride(line)) return;
        const target = event.target;
        if (!(target instanceof HTMLTextAreaElement)) return;
        SetLinePriceOverrideReason(line, target.value);
    }

    /** A restore closes the amount box; a change the line could not be given yet does nothing. */
    private applied(change: LinePriceChange | null): void {
        if (!change) return;
        if (change === 'restored') this.customAmountOpen = false;
        this.PriceChanged.emit(change);
    }
}
