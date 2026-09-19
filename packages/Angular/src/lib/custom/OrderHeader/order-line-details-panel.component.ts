import { ChangeDetectorRef, Component, EventEmitter, HostListener, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UUIDsEqual } from '@memberjunction/global';
import type {
    mjBizAppsOrdersOrderLineDimensionEntity,
    mjBizAppsOrdersOrderLineEntity,
} from '@mj-biz-apps/orders-entities';
import type { MJODimensionOption } from '../../data/orders-queries';

/**
 * The details a line has but the line card should not carry.
 *
 * GL DIMENSIONS ARE WHY THIS EXISTS (golive #236). `OrderLineDimension` has been read at booking
 * since the baseline — `OrderJournalEntryFactory` rides every tag onto every journal entry line the
 * order line produces — but nothing ever wrote a row, so order-originated entries reached the ledger
 * carrying no dimensions at all. This is the write path.
 *
 * A PANEL RATHER THAN A ROW ON THE CARD. Under the chart-of-accounts design a revenue line can carry
 * five axes (Venture, Product, ARR-Type, Event, Vintage). Five pickers on every line card would cost
 * every reader screen space to serve the minority of moments when anyone looks at them, and the card
 * is already dense — product, quantity, price, override, consequence chips, term start, and the
 * extension disclosure. The panel shows on request and covers nothing until then.
 *
 * NOTHING HERE SAVES. Edits land on `line.Dimensions`, the related-record collection declared by the
 * 'Order Lines -> Order Line Dimensions' relationship metadata, and persist when the ORDER saves:
 * `OrderEntityServer.savePendingLines` saves each line with the caller's plain options, so each
 * line contributes its own collection work to that save plan. That is also what lets an unsaved line
 * carry tags — a line added in the browser has no ID until the order saves, and the collection
 * stamps `OrderLineID` at save time.
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
    private _line: mjBizAppsOrdersOrderLineEntity | null = null;

    /** The line whose details are shown. Null closes the panel. */
    @Input()
    public set Line(value: mjBizAppsOrdersOrderLineEntity | null) {
        this._line = value;
        this.LoadError = null;
        if (value) void this.loadDimensions(value);
    }
    public get Line(): mjBizAppsOrdersOrderLineEntity | null {
        return this._line;
    }

    /** What the header calls the line. Passed in because the catalog lives on the editor. */
    @Input() public ProductName = '';
    @Input() public ProductSKU = '';
    @Input() public ProductType = '';

    /** Every dimension a line may be tagged with, each with the values it permits. */
    @Input() public Dimensions: MJODimensionOption[] = [];

    @Input() public EditMode = true;

    @Output() public Closed = new EventEmitter<void>();

    /** Set when the tags could not be read, so the panel says so instead of showing an empty set. */
    public LoadError: string | null = null;
    private loading = false;

    public get IsOpen(): boolean {
        return this._line !== null;
    }

    /**
     * A booked line is frozen — trigger 51003 refuses edits once the order is Confirmed, and the
     * entry its tags produced has already been written. Showing the values read-only is honest;
     * offering pickers that cannot be saved is not.
     */
    public get IsBooked(): boolean {
        return !!this._line?.JournalEntryID;
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

    /** The value currently tagged for a dimension, or '' when the line carries none. */
    public SelectedValueID(dimension: MJODimensionOption): string {
        return this.tagFor(dimension.ID)?.DimensionValueID ?? '';
    }

    /** The value's display text, for the read-only rendering of a booked line. */
    public SelectedValueLabel(dimension: MJODimensionOption): string {
        const valueID = this.SelectedValueID(dimension);
        if (!valueID) return '';
        const hit = dimension.Values.find((v) => UUIDsEqual(v.ID, valueID));
        return hit ? `${hit.Code} — ${hit.Name}` : valueID;
    }

    /**
     * Point a dimension at a value, or clear it.
     *
     * Clearing REMOVES the row rather than nulling it: `OrderLineDimension.DimensionValueID` is NOT
     * NULL, so "this line is not tagged on this axis" is the absence of a row, not a row holding
     * nothing. `OnRemove: delete` on the collection turns the removal into a delete at save.
     */
    public async SetValue(dimension: MJODimensionOption, event: Event): Promise<void> {
        if (!this.CanEdit || !this._line) return;
        const target = event.target;
        if (!(target instanceof HTMLSelectElement)) return;

        const valueID = target.value;
        const existing = this.tagFor(dimension.ID);

        if (!valueID) {
            if (existing) this._line.Dimensions.Remove(existing);
        } else if (existing) {
            existing.DimensionValueID = valueID;
        } else {
            const tag = await this._line.Dimensions.Create();
            tag.DimensionID = dimension.ID;
            tag.DimensionValueID = valueID;
        }
        this.cdr.detectChanges();
    }

    /** How many axes this line is tagged on — the count the collapsed row reports. */
    public get TaggedCount(): number {
        return this._line?.Dimensions.Items.length ?? 0;
    }

    private tagFor(dimensionID: string): mjBizAppsOrdersOrderLineDimensionEntity | undefined {
        return this._line?.Dimensions.Items.find((tag) => UUIDsEqual(tag.DimensionID, dimensionID));
    }

    /**
     * Read the line's existing tags.
     *
     * An UNSAVED line has nothing to read — there are no rows pointing at an id the database has
     * never seen — and `Load()` on one would be a query for a key that does not exist. Its
     * collection starts empty and correct, so the load is skipped rather than guarded downstream.
     */
    private async loadDimensions(line: mjBizAppsOrdersOrderLineEntity): Promise<void> {
        if (!line.IsSaved || line.Dimensions.IsLoaded || this.loading) return;
        this.loading = true;
        try {
            await line.Dimensions.Load();
        } catch (error) {
            // NEVER fail into an empty set. An untagged line and a line whose tags could not be read
            // look identical on screen, and one of them is a journal entry about to post with no
            // dimensions — which is the defect this panel exists to close.
            this.LoadError =
                `The dimensions already on this line could not be read, so what is shown below may be ` +
                `incomplete. Reopen the order before editing them. (${error instanceof Error ? error.message : String(error)})`;
        } finally {
            this.loading = false;
            this.cdr.detectChanges();
        }
    }
}
