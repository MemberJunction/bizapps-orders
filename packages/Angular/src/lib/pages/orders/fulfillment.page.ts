import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MJOWorklistTableComponent, type MJOColumn, type MJOPreset } from '../../panels/worklist-table.component';
import {
    OrdersFulfillOrderLinesOperation,
    OrdersGetFulfillmentQueueOperation,
    type FulfillmentQueueOrder,
} from '@mj-biz-apps/orders-entities';
import { DaysSince, FormatDate } from '../../panels/money-format';
import { MJAlertComponent, MJButtonDirective } from '@memberjunction/ng-ui-components';

/**
 * One pickable line, flattened from the queue's order/line nesting.
 *
 * The queue nests lines under orders because that is how they are filed; a picker
 * works a flat list because that is how a shelf is walked. Each row therefore
 * carries its order's identity alongside the line's own.
 */
interface MJOFulfillmentRow extends Record<string, unknown> {
    ID: string;
    OrderHeaderID: string;
    OrderNumber: string;
    LineNumber: number;
    Product: string;
    SKU: string | null;
    Quantity: number;
    Customer: string;
    /** Where this LINE goes, which may differ from the order's. Null follows the header. */
    ShipTo: string | null;
    /** "2 of 5" — how much of this order is still outstanding. */
    Remaining: string;
    ConfirmedAt: string | null;
    FulfillmentStatus: string;
    /** A component from a bundle; keep it with its siblings. */
    FromBundle: boolean;
}

/**
 * `mjo-fulfillment-page` — physical lines waiting to ship.
 *
 * FULFILLMENT AND REVENUE ARE DISCONNECTED. Marking something shipped fires NO
 * journal entry — it is a logistics fact. Revenue was settled by the product's
 * recognition shape when the order booked; when the box leaves the building is a
 * different question with a different answer.
 *
 * What fulfillment does control is the order's stage: an order with nothing to
 * ship auto-advances from Posted straight to Fulfilled, and one with a physical
 * line waits here instead. That is the whole reason this queue exists.
 *
 * ## Example
 *
 * ```html
 * <mjo-fulfillment-page />
 * ```
 */
@Component({
    selector: 'mjo-fulfillment-page',
    standalone: true,
    imports: [MJButtonDirective, CommonModule, MJOWorklistTableComponent, MJAlertComponent],
    template: `
        <mj-alert Variant="info" Icon="fa-solid fa-circle-info" class="mjo-fq__note">
                <strong>Marking a line fulfilled writes no journal entry.</strong>
                Revenue was settled by the product's recognition shape when the order booked. What this
                queue controls is the order's stage — an order with nothing to ship auto-advances past
                Posted, and one with a physical line waits here.
        </mj-alert>

        @if (Result) {
            <mj-alert
                class="mjo-fq__note"
                [Variant]="Result.RefusedCount ? 'warning' : 'success'"
                Icon="fa-solid fa-truck-fast"
                Role="status">
                <strong>{{ Result.FulfilledCount }} marked fulfilled.</strong>
                @if (Result.AdvancedCount) {
                    {{ Result.AdvancedCount }}
                    {{ Result.AdvancedCount === 1 ? 'order' : 'orders' }} advanced to Fulfilled.
                }
                @if (Result.RefusedCount) {
                    {{ Result.RefusedCount }} refused — those lines were already shipped or are
                    not fulfillable. The rest went through, so a picker who scans one
                    already-shipped item does not lose the other nine scans.
                }
            </mj-alert>
        }

        @if (Error) {
            <mj-alert Variant="error" Icon="fa-solid fa-triangle-exclamation" class="mjo-fq__note" role="alert">
<strong>Nothing was marked.</strong> {{ Error }}
            </mj-alert>
        }

        <mj-alert Variant="info" Icon="fa-solid fa-box-open" class="mjo-fq__note">
                <strong>Orders held only by fulfillment.</strong>
                Everything here has already been paid for and booked — the money and the revenue
                moved when the order confirmed. What is outstanding is the goods, which is why
                nothing on this screen writes a journal entry.
        </mj-alert>

        <div class="mjo-fq__actions">
            <button
                type="button"
                mjButton variant="primary"
                [disabled]="!SelectedCount || Busy"
                (click)="FulfillSelected()">
                <i class="fa-solid fa-check" aria-hidden="true"></i>
                {{ Busy ? 'Marking…' : 'Mark ' + SelectedCount + ' fulfilled' }}
            </button>
            <button
                type="button"
                mjButton variant="outline"
                [disabled]="!Rows.length"
                (click)="ToggleAll()">
                <!-- Guarded on a NON-EMPTY selection: with no rows, 0 === 0 read
                     as "everything is selected" and offered to clear nothing. -->
                {{ SelectedCount && SelectedCount === Rows.length ? 'Clear selection' : 'Select all' }}
            </button>
            @if (Truncated) {
                <span class="small muted">
                    Showing the first {{ Rows.length }} lines — the queue is longer than this page.
                </span>
            }
        </div>

        <mjo-worklist-table
            [Columns]="Columns"
            [Rows]="Rows"
            [Presets]="Presets"
            [ActivePreset]="Preset"
            [Searchable]="false"
            RowKey="ID"
            EmptyIcon="fa-solid fa-box-open"
            EmptyTitle="Nothing waiting to ship"
            EmptyHint="Every physical line on a posted order has gone out."
            (PresetChanged)="OnPreset($event)"
            (RowClicked)="ToggleRow($any($event))" />
    `,
    styles: [
        `
            :host {
                display: block;
                height: 100%;
                overflow: auto;
                padding: var(--mj-space-6);
            }
            .mjo-fq__note {
                margin-bottom: var(--mj-space-4);
            }
            .mjo-fq__actions {
                display: flex;
                align-items: center;
                gap: var(--mj-space-2);
                margin-bottom: var(--mj-space-3);
            }
            @media (max-width: 760px) {
                :host {
                    padding: var(--mj-space-4);
                }
            }
        `,
    ],
})
export class MJOFulfillmentPageComponent implements OnInit {
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

    public Rows: MJOFulfillmentRow[] = [];
    public Preset = 'pending';

    /** Line ids the picker has ticked. */
    public Selected = new Set<string>();
    public Busy = false;
    public Error: string | null = null;
    public Truncated = false;

    /** What the last flip did. Kept on screen so a partial result is legible. */
    public Result: { FulfilledCount: number; RefusedCount: number; AdvancedCount: number } | null = null;

    public get SelectedCount(): number {
        return this.Selected.size;
    }

    /** Clicking a row toggles it — the whole page is a picking list. */
    public ToggleRow(row: MJOFulfillmentRow): void {
        const id = String(row.ID);
        if (this.Selected.has(id)) this.Selected.delete(id);
        else this.Selected.add(id);
    }

    public ToggleAll(): void {
        if (this.Selected.size === this.Rows.length) this.Selected.clear();
        else this.Rows.forEach((r) => this.Selected.add(String(r.ID)));
    }

    /**
     * Drop selections for lines that are no longer in the queue.
     *
     * Without this, a reload after a partial fulfilment leaves ids selected that
     * the next call would refuse — the picker would see a count that does not
     * match what is on screen.
     */
    private pruneSelection(): void {
        const present = new Set(this.Rows.map((r) => String(r.ID)));
        for (const id of [...this.Selected]) if (!present.has(id)) this.Selected.delete(id);
    }

    /**
     * Mark the ticked lines fulfilled.
     *
     * `AllOrNothing` is deliberately left false. A picker who scans one
     * already-shipped item should not lose the other nine scans — the operation
     * does what it can and reports the rest, and the banner says so.
     */
    public async FulfillSelected(): Promise<void> {
        if (!this.Selected.size || this.Busy) return;
        this.Busy = true;
        this.Error = null;
        try {
            const op = new OrdersFulfillOrderLinesOperation();
            const result = await op.Execute({ OrderLineIDs: [...this.Selected] });
            const output = result.Output;

            if (!output?.Success) {
                this.Error = output?.Message ?? result.ErrorMessage ?? 'The lines were not marked.';
                return;
            }

            this.Result = {
                FulfilledCount: output.FulfilledCount,
                RefusedCount: output.RefusedCount,
                AdvancedCount: output.AdvancedCount,
            };
            this.Selected.clear();
            await this.load();
        } catch (e) {
            this.Error = e instanceof Error ? e.message : String(e);
        } finally {
            this.Busy = false;
            this.cdr.detectChanges();
        }
    }

    public readonly Presets: MJOPreset[] = [
        { Key: 'pending', Label: 'Pending' },
        { Key: 'late', Label: 'Waiting over a week', Icon: 'fa-solid fa-triangle-exclamation' },
        { Key: 'done', Label: 'Fulfilled' },
        { Key: 'all', Label: 'All' },
    ];

    public readonly Columns: MJOColumn<MJOFulfillmentRow>[] = [
        { Key: 'OrderNumber', Label: 'Order', Kind: 'mono', Width: '112px', Secondary: (r) => `line ${r.LineNumber}` },
        {
            Key: 'Product',
            Label: 'Item',
            Secondary: (r) => (r.SKU ? `${r.SKU} · ${r.Customer}` : r.Customer),
        },
        { Key: 'Quantity', Label: 'Qty', Kind: 'number', Width: '70px' },
        {
            // Where the LINE goes, which is not always where the order goes — a
            // seat bought for a colleague, a gift shipped elsewhere. Blank means
            // it follows the header, which is the common case.
            Key: 'ShipTo',
            Label: 'Ship to',
            Width: '160px',
            HideBelow: 1000,
            Format: (r) => (r.ShipTo as string) ?? '—',
        },
        {
            Key: 'Remaining',
            Label: 'Of order',
            Width: '90px',
            HideBelow: 760,
            // "1 of 3" rather than "1", so a nearly-finished order is legible.
            Format: (r) => r.Remaining as string,
        },
        {
            Key: 'ConfirmedAt',
            Label: 'Waiting',
            Width: '120px',
            Format: (r) => (r.ConfirmedAt ? FormatDate(String(r.ConfirmedAt), { Short: true }) : '—'),
            Secondary: (r) => {
                if (!r.ConfirmedAt || r.FulfillmentStatus === 'Fulfilled') return null;
                const days = DaysSince(String(r.ConfirmedAt), new Date().toISOString().slice(0, 10));
                return days > 0 ? `${days}d waiting` : null;
            },
        },
        {
            Key: 'FulfillmentStatus',
            Label: 'Status',
            Kind: 'chip',
            Width: '110px',
            ChipClass: (r) =>
                r.FulfillmentStatus === 'Fulfilled'
                    ? 'mj-chip--success'
                    : this.isLate(r)
                      ? 'mj-chip--error'
                      : 'mj-chip--warning',
            Format: (r) => (r.FulfillmentStatus === 'Pending' && this.isLate(r) ? 'Late' : r.FulfillmentStatus),
        },
    ];

    public async ngOnInit(): Promise<void> {
        await this.load();
    }

    public async OnPreset(preset: string): Promise<void> {
        this.Preset = preset;
        await this.load();
        this.cdr.detectChanges();
    }

    /**
     * Waiting longer than a working week.
     *
     * Measured from CONFIRMATION, because that is when the promise was made. The
     * queue carries no requested-delivery date — that lives on the order and is
     * not what a warehouse queue is sorted by.
     */
    private isLate(row: MJOFulfillmentRow): boolean {
        if (row.FulfillmentStatus !== 'Pending' || !row.ConfirmedAt) return false;
        return DaysSince(String(row.ConfirmedAt), new Date().toISOString().slice(0, 10)) > 5;
    }

    /**
     * The backlog, as the server computes it.
     *
     * COMPUTED AT READ TIME, not stored. "Awaiting fulfilment" depends on the
     * order's stage and each line's status together, and a stored flag would need
     * a job to keep it honest — the day that job fails the warehouse works from a
     * stale list. `Orders.GetFulfillmentQueue` derives it per call.
     *
     * This replaces a client-side reconstruction that read every posted order,
     * fetched their lines, and filtered for a fulfilment status. That worked, but
     * it decided what "awaiting" means in the browser, which is the second place
     * for a definition to live.
     */
    private async load(): Promise<void> {
        const op = new OrdersGetFulfillmentQueueOperation();
        const result = await op.Execute({ IncludeCompleted: this.Preset === 'all' });
        const output = result.Output;

        if (!output?.Success) {
            // An empty queue and a failed one both render "Nothing waiting to
            // ship", which is the most reassuring sentence on a warehouse screen.
            this.Error =
                output?.Message ?? result.ErrorMessage ?? 'The fulfillment queue could not be read.';
            this.Rows = [];
            this.Truncated = false;
            return;
        }

        this.Error = null;
        this.Truncated = output.Truncated;

        // The queue already narrows to what is fulfillable; the presets narrow
        // further, and those are cheap over rows this page is holding.
        const rows = this.flatten(output.Orders);
        this.Rows = rows.filter((row) => {
            switch (this.Preset) {
                case 'pending':
                    return row.FulfillmentStatus === 'Pending';
                case 'late':
                    return this.isLate(row);
                case 'done':
                    return row.FulfillmentStatus === 'Fulfilled';
                default:
                    return true;
            }
        });
        this.pruneSelection();
        this.cdr.detectChanges();
    }

    /**
     * One row per LINE, carrying its order for context.
     *
     * A picker works a shelf, not an order, so the line is the unit of work — but
     * the order number is what everything else is filed under, so each row keeps
     * it. `FulfillableCount` lets a row say "1 of 3 remaining" rather than
     * implying the order is nearly done when it is not.
     */
    private flatten(orders: FulfillmentQueueOrder[]): MJOFulfillmentRow[] {
        const rows: MJOFulfillmentRow[] = [];
        for (const order of orders) {
            for (const line of order.Lines) {
                rows.push({
                    ID: line.OrderLineID,
                    OrderHeaderID: order.OrderHeaderID,
                    OrderNumber: order.OrderNumber,
                    LineNumber: line.LineNumber,
                    Product: line.ProductName,
                    SKU: line.SKU ?? null,
                    Quantity: line.Quantity,
                    Customer: order.CustomerName,
                    ShipTo: line.ShipToName ?? null,
                    Remaining: `${order.Lines.length} of ${order.FulfillableCount}`,
                    ConfirmedAt: order.ConfirmedAt ?? null,
                    FulfillmentStatus: line.FulfillmentStatus,
                    // A component from a bundle: the picker should keep it with
                    // its siblings rather than treat it as a loose item.
                    FromBundle: !!line.ParentOrderLineID,
                });
            }
        }
        return rows;
    }
}
