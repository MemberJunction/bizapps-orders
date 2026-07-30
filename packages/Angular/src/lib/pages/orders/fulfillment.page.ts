import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MJOWorklistTableComponent, type MJOColumn, type MJOPreset } from '../../panels/worklist-table.component';
import { MJOOrdersDataService } from '../../services/orders-data.service';
import { DaysSince, FormatDate } from '../../panels/money-format';

/** A line waiting to ship. */
interface MJOFulfillmentRow extends Record<string, unknown> {
    ID: string;
    OrderNumber: string;
    LineNumber: number;
    Product: string;
    Quantity: number;
    Customer: string;
    RequestedDeliveryDate: string | null;
    PostedAt: string | null;
    FulfillmentStatus: string;
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
    imports: [CommonModule, MJOWorklistTableComponent],
    template: `
        <div class="mj-banner mj-banner--neutral mjo-fq__note">
            <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
            <div class="body">
                <strong>Marking a line fulfilled writes no journal entry.</strong>
                Revenue was settled by the product's recognition shape when the order booked. What this
                queue controls is the order's stage — an order with nothing to ship auto-advances past
                Posted, and one with a physical line waits here.
            </div>
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
            (PresetChanged)="OnPreset($event)" />
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
            @media (max-width: 760px) {
                :host {
                    padding: var(--mj-space-4);
                }
            }
        `,
    ],
})
export class MJOFulfillmentPageComponent implements OnInit {
    private readonly data = inject(MJOOrdersDataService);

    public Rows: MJOFulfillmentRow[] = [];
    public Preset = 'pending';

    public readonly Presets: MJOPreset[] = [
        { Key: 'pending', Label: 'Pending' },
        { Key: 'late', Label: 'Past requested date', Icon: 'fa-solid fa-triangle-exclamation' },
        { Key: 'done', Label: 'Fulfilled' },
        { Key: 'all', Label: 'All' },
    ];

    public readonly Columns: MJOColumn<MJOFulfillmentRow>[] = [
        { Key: 'OrderNumber', Label: 'Order', Kind: 'mono', Width: '112px', Secondary: (r) => `line ${r.LineNumber}` },
        { Key: 'Product', Label: 'Item', Secondary: (r) => r.Customer },
        { Key: 'Quantity', Label: 'Qty', Kind: 'number', Width: '70px' },
        {
            Key: 'RequestedDeliveryDate',
            Label: 'Requested',
            Width: '120px',
            Format: (r) => (r.RequestedDeliveryDate ? FormatDate(r.RequestedDeliveryDate, { Short: true }) : '—'),
            Secondary: (r) => {
                if (!r.RequestedDeliveryDate || r.FulfillmentStatus === 'Fulfilled') return null;
                const late = DaysSince(r.RequestedDeliveryDate, new Date().toISOString().slice(0, 10));
                return late > 0 ? `${late}d past` : null;
            },
        },
        {
            Key: 'PostedAt',
            Label: 'Posted',
            Width: '100px',
            HideBelow: 760,
            Format: (r) => (r.PostedAt ? FormatDate(r.PostedAt, { Short: true }) : '—'),
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
    }

    private isLate(row: MJOFulfillmentRow): boolean {
        if (row.FulfillmentStatus !== 'Pending' || !row.RequestedDeliveryDate) return false;
        return DaysSince(row.RequestedDeliveryDate, new Date().toISOString().slice(0, 10)) > 0;
    }

    /**
     * Lines carrying a fulfillment status, joined to their order for context.
     *
     * A line only HAS a fulfillment status when its product type requires
     * fulfillment, so the presence of the column is itself the filter — there is
     * no need to ask the catalog what ships.
     */
    private async load(): Promise<void> {
        const orders = await this.data.GetOrders({ Preset: 'all' });
        const posted = orders.filter((o) => ['Posted', 'Fulfilled'].includes(o.Status));

        const rows: MJOFulfillmentRow[] = [];
        for (const order of posted) {
            const lines = await this.data.GetOrderLines(order.ID);
            for (const line of lines) {
                const status = line['FulfillmentStatus'] as string | null;
                if (!status) continue;
                rows.push({
                    ID: String(line['ID']),
                    OrderNumber: order.OrderNumber,
                    LineNumber: Number(line['LineNumber'] ?? 0),
                    Product: String(line['Product'] ?? ''),
                    Quantity: Number(line['Quantity'] ?? 0),
                    Customer: (order.BillToOrganization ?? order.BillToPerson ?? '—') as string,
                    RequestedDeliveryDate: (order['RequestedDeliveryDate'] as string) ?? null,
                    PostedAt: (order['PostedAt'] as string) ?? null,
                    FulfillmentStatus: status,
                });
            }
        }

        this.Rows = rows.filter((r) => {
            switch (this.Preset) {
                case 'pending':
                    return r.FulfillmentStatus === 'Pending';
                case 'late':
                    return this.isLate(r);
                case 'done':
                    return r.FulfillmentStatus === 'Fulfilled';
                default:
                    return true;
            }
        });
    }
}
