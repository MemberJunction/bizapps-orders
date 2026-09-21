import { ChangeDetectorRef, Component, EventEmitter, HostListener, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UUIDsEqual } from '@memberjunction/global';
import type { mjBizAppsOrdersOrderLineEntity } from '@mj-biz-apps/orders-entities';
import type { MJODimensionOption } from '../../data/orders-queries';

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

    /** The values selectable right now — those of the chosen dimension, or none until one is chosen. */
    public get ValuesForSelectedDimension(): Array<{ ID: string; Code: string; Name: string }> {
        return this.SelectedDimension?.Values ?? [];
    }

    public get SelectedDimension(): MJODimensionOption | undefined {
        const id = this.SelectedDimensionID;
        return id ? this.Dimensions.find((d) => UUIDsEqual(d.ID, id)) : undefined;
    }

    /** Display text for the read-only rendering of a booked line. */
    public get SelectedValueLabel(): string {
        const valueID = this.SelectedValueID;
        if (!valueID) return '';
        const hit = this.ValuesForSelectedDimension.find((v) => UUIDsEqual(v.ID, valueID));
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
        this.cdr.detectChanges();
    }

    public SetValue(event: Event): void {
        if (!this.CanEdit || !this.Line) return;
        const target = event.target;
        if (!(target instanceof HTMLSelectElement)) return;

        this.Line.DimensionValueID = target.value || null;
        this.cdr.detectChanges();
    }

    /** Clear the tag entirely — both columns, so the pair check holds. */
    public ClearTag(): void {
        if (!this.CanEdit || !this.Line) return;
        this.Line.DimensionID = null;
        this.Line.DimensionValueID = null;
        this.cdr.detectChanges();
    }
}
