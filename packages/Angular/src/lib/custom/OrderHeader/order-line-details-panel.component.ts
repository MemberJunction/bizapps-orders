import { ChangeDetectorRef, Component, EventEmitter, HostListener, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UUIDsEqual } from '@memberjunction/global';
import type { mjBizAppsOrdersOrderLineEntity } from '@mj-biz-apps/orders-entities';
import type { MJODimensionOption } from '../../data/orders-queries';
import { DefaultReplacedBy, StampedOn, type MJOStampedTag } from './line-stamped-tags';

/**
 * The details a line has but the line card should not carry.
 *
 * THE GL DIMENSION IS WHY THIS EXISTS (golive #236). `OrderJournalEntryFactory` has ridden dimension
 * tags onto every journal entry line an order line produces since the baseline, but an order line
 * was never tagged, so order-originated entries reached the ledger carrying none. This is where the
 * tag is stated.
 *
 * ONE TAG PER LINE. `OrderLine.DimensionID` / `.DimensionValueID` hold a single axis and a single
 * point on it. A line can therefore be filed under Venture OR Product OR ARR-Type, not all of them
 * — the chart-of-accounts design asks for five axes on a revenue line, and this shape carries one.
 *
 * A PANEL RATHER THAN A ROW ON THE CARD. The card is already dense — product, quantity, price, the
 * override editor, consequence chips, term start and the extension disclosure — and the tag is
 * looked at rarely. The panel shows on request and covers nothing until then.
 *
 * THE TAGS THE LINE BOOKS ARE LISTED ABOVE THE PICKER. The picker holds the one tag set by hand;
 * the server stamps the product's defaults as separate rows on save, and those are what the line
 * books alongside it. Listing them is what lets someone see a default is already there, and the
 * picker asks before a hand-set value replaces one.
 *
 * NOTHING HERE SAVES. The pickers write to the line entity in memory; the ORDER's save persists it
 * with everything else, so a line added in the browser and tagged before its first save is written
 * once, in one transaction, like any other field on the line.
 */
@Component({
    standalone: true,
    selector: 'mjo-order-line-details-panel',
    imports: [CommonModule, FormsModule],
    templateUrl: './order-line-details-panel.component.html',
    styleUrls: ['./order-line-details-panel.component.css'],
})
export class MJOOrderLineDetailsPanelComponent {
    private readonly cdr = inject(ChangeDetectorRef);

    /** The line whose details are shown. Null closes the panel. */
    @Input() public Line: mjBizAppsOrdersOrderLineEntity | null = null;

    /** What the header calls the line. Passed in because the catalog lives on the editor. */
    @Input() public ProductName = '';
    @Input() public ProductSKU = '';
    @Input() public ProductType = '';

    /** Every dimension a line may be tagged with, each with the values it permits. */
    @Input() public Dimensions: MJODimensionOption[] = [];

    @Input() public EditMode = true;

    /**
     * The tags the line books as last saved. Null for a line not yet saved: its defaults are
     * assigned by the server on the order's first save, so there is nothing to show until then.
     */
    @Input() public StampedTags: MJOStampedTag[] | null = null;

    /**
     * The values the order's company books under, lower-cased: those its own Dimension Defaults use.
     * Null or empty means no scoping is available and every value is offered.
     */
    @Input() public CompanyValueIDs: ReadonlySet<string> | null = null;

    /** Offer every value of the axis rather than only the company's. */
    public ShowAllValues = false;

    /** A choice waiting on "replace the default?" — held here, not written to the line, until answered. */
    public PendingReplace: { DimensionID: string; ValueID: string; ValueLabel: string; Replaces: MJOStampedTag } | null =
        null;

    @Output() public Closed = new EventEmitter<void>();

    public get IsOpen(): boolean {
        return this.Line !== null;
    }

    /**
     * A booked line is frozen — trigger 51003 refuses edits once the order is Confirmed, and the
     * entry its tag produced has already been written. Showing the value read-only is honest;
     * offering pickers that cannot be saved is not.
     */
    public get IsBooked(): boolean {
        return !!this.Line?.JournalEntryID;
    }

    public get CanEdit(): boolean {
        return this.EditMode && !this.IsBooked;
    }

    public Close(): void {
        this.PendingReplace = null;
        this.ShowAllValues = false;
        this.Closed.emit();
    }

    @HostListener('document:keydown.escape')
    public OnEscape(): void {
        if (this.IsOpen) this.Close();
    }

    public get SelectedDimensionID(): string {
        return this.Line?.DimensionID ?? '';
    }

    public get SelectedValueID(): string {
        return this.Line?.DimensionValueID ?? '';
    }

    /**
     * The values selectable right now — those of the chosen dimension the order's company uses, or
     * all of them when "show all" is on.
     *
     * The value already on the line and the one stamped on the axis are always kept, or the picker
     * would show a blank for a tag the line really carries. An axis the company uses no value of
     * offers everything: an empty list would leave nothing to pick and no reason shown.
     */
    public get ValuesForSelectedDimension(): Array<{ ID: string; Code: string; Name: string }> {
        const all = this.SelectedDimension?.Values ?? [];
        const scoped = this.companyScoped(all);
        return scoped ?? all;
    }

    /** True when the list is narrowed to the company's values and "show all" would add more. */
    public get IsValueListScoped(): boolean {
        return this.companyScoped(this.SelectedDimension?.Values ?? []) !== null;
    }

    /** True when the toggle has something to switch between. */
    public get CanToggleValueScope(): boolean {
        return this.IsValueListScoped || this.ShowAllValues;
    }

    public ToggleShowAllValues(): void {
        this.ShowAllValues = !this.ShowAllValues;
        this.cdr.detectChanges();
    }

    /** The company's values on this axis, or null when scoping does not apply or removes nothing. */
    private companyScoped(
        all: Array<{ ID: string; Code: string; Name: string }>,
    ): Array<{ ID: string; Code: string; Name: string }> | null {
        const scope = this.CompanyValueIDs;
        if (this.ShowAllValues || !scope?.size || !all.length) return null;
        const keep = new Set([...scope]);
        if (this.SelectedValueID) keep.add(this.SelectedValueID.toLowerCase());
        const stamped = this.StampedOnSelected;
        if (stamped) keep.add(stamped.ValueID.toLowerCase());
        const scoped = all.filter((v) => keep.has(v.ID.toLowerCase()));
        if (!scoped.length || scoped.length === all.length) return null;
        return scoped;
    }

    /** The value already stamped on the chosen axis, shown under the value picker. */
    public get StampedOnSelected(): MJOStampedTag | null {
        return StampedOn(this.StampedTags ?? [], this.SelectedDimensionID);
    }

    public get SelectedDimension(): MJODimensionOption | undefined {
        const id = this.SelectedDimensionID;
        return id ? this.Dimensions.find((d) => UUIDsEqual(d.ID, id)) : undefined;
    }

    /** Display text for the read-only rendering of a booked line. */
    public get SelectedValueLabel(): string {
        const valueID = this.SelectedValueID;
        if (!valueID) return '';
        const hit = (this.SelectedDimension?.Values ?? []).find((v) => UUIDsEqual(v.ID, valueID));
        return hit ? `${hit.Code} — ${hit.Name}` : valueID;
    }

    /**
     * True when an axis has been chosen but no point on it.
     *
     * `CK_OrderLine_DimensionPair` refuses that row, so the panel says so here rather than letting
     * the order's save come back with a constraint violation naming neither the line nor the field.
     * `OrderLineEntityServer.ValidateAsync` enforces the same rule for every other caller.
     */
    public get NeedsValue(): boolean {
        return !!this.SelectedDimensionID && !this.SelectedValueID;
    }

    /**
     * Choose the axis.
     *
     * Clearing it clears the value too, and so does CHANGING it: a value belongs to exactly one
     * dimension, so the one already chosen is not a point on the new axis. Leaving it would write a
     * pair that passes the both-or-neither check and is still wrong.
     */
    public SetDimension(event: Event): void {
        if (!this.CanEdit || !this.Line) return;
        const target = event.target;
        if (!(target instanceof HTMLSelectElement)) return;

        this.Line.DimensionID = target.value || null;
        this.Line.DimensionValueID = null;
        this.PendingReplace = null;
        this.ShowAllValues = false;
        this.cdr.detectChanges();
    }

    /**
     * Choose the value. A value that would replace a stamped default is held as `PendingReplace`
     * and written only once the person confirms, so a default is never replaced without them
     * seeing which one.
     */
    public SetValue(event: Event): void {
        if (!this.CanEdit || !this.Line) return;
        const target = event.target;
        if (!(target instanceof HTMLSelectElement)) return;

        const valueID = target.value || '';
        const replaces = DefaultReplacedBy(this.StampedTags ?? [], this.SelectedDimensionID, valueID);
        if (replaces) {
            const option = (this.SelectedDimension?.Values ?? []).find((v) => UUIDsEqual(v.ID, valueID));
            this.PendingReplace = {
                DimensionID: this.SelectedDimensionID,
                ValueID: valueID,
                ValueLabel: option ? `${option.Code} — ${option.Name}` : valueID,
                Replaces: replaces,
            };
            // The select already shows the new value; put it back until the answer is in.
            target.value = this.SelectedValueID;
            this.cdr.detectChanges();
            return;
        }

        this.PendingReplace = null;
        this.Line.DimensionValueID = valueID || null;
        this.cdr.detectChanges();
    }

    public ConfirmReplace(): void {
        if (!this.CanEdit || !this.Line || !this.PendingReplace) return;
        this.Line.DimensionID = this.PendingReplace.DimensionID;
        this.Line.DimensionValueID = this.PendingReplace.ValueID;
        this.PendingReplace = null;
        this.cdr.detectChanges();
    }

    /** Keep the default: drop the pending choice and leave the line's own tag as it was. */
    public KeepDefault(): void {
        this.PendingReplace = null;
        this.cdr.detectChanges();
    }

    /** Clear the tag entirely — both columns, so the pair check holds. */
    public ClearTag(): void {
        if (!this.CanEdit || !this.Line) return;
        this.Line.DimensionID = null;
        this.Line.DimensionValueID = null;
        this.PendingReplace = null;
        this.cdr.detectChanges();
    }
}
