import { ChangeDetectorRef, Component, EventEmitter, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
    OrdersFulfillOrderLinesOperation,
    Today,
    type DateCell,
} from '@mj-biz-apps/orders-entities';
import { DaysSince, FormatDate } from '../../panels/money-format';
import { MJAlertComponent, MJButtonDirective, MJTabNavComponent, type TabConfig } from '@memberjunction/ng-ui-components';
import { EntityViewerModule, type RecordOpenedEvent, type RecordSelectedEvent } from '@memberjunction/ng-entity-viewer';
import { Metadata, type EntityInfo } from '@memberjunction/core';
import { type MJUserViewEntityExtended } from '@memberjunction/core-entities';
import { MJO_ENTITIES } from '../../data/entity-names';

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
    imports: [MJButtonDirective, CommonModule, EntityViewerModule, MJAlertComponent, MJTabNavComponent],
    template: `
        <!-- A standing explanation of how a screen works is not an ALERT — an alert is for
             something that happened or needs attention. These were two info cards saying the same
             thing ("writes no journal entry") in different words, permanently, above the work. -->
        <p class="mjo-note mjo-fq__note">
            <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
            Everything here is already paid for and booked — nothing on this screen writes a journal
            entry. What is outstanding is the goods, and what this queue controls is the order's
            stage: one with nothing to ship auto-advances past Posted, one with a physical line waits
            here.
        </p>

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
                    not fulfillable.
                }
            </mj-alert>
        }

        @if (Error) {
            <mj-alert Variant="error" Icon="fa-solid fa-triangle-exclamation" class="mjo-fq__note" role="alert">
                <strong>Nothing was marked.</strong> {{ Error }}
            </mj-alert>
        }

        <div class="mjo-fq__actions">
            <button
                type="button"
                mjButton variant="primary"
                [disabled]="!SelectedCount || Busy"
                (click)="FulfillSelected()">
                <i class="fa-solid fa-check" aria-hidden="true"></i>
                {{ Busy ? 'Marking…' : 'Mark ' + SelectedCount + ' fulfilled' }}
            </button>
            <div class="mjo-fq__tabs">
                <mj-tab-nav [Tabs]="Tabs" [ActiveKey]="Preset" (TabChange)="OnPreset($event)"></mj-tab-nav>
            </div>
        </div>

        <div class="mjo-fq__viewer-host">
            @if (OrderLineEntityInfo) {
                <mj-entity-viewer
                    [Entity]="OrderLineEntityInfo"
                    [ViewEntity]="FulfillmentQueueView"
                    (RecordSelected)="OnRecordSelected($event)"
                    (RecordOpened)="OnRecordOpened($event)">
                </mj-entity-viewer>
            } @else {
                <div class="small muted" style="padding: 24px;">Loading fulfillment queue...</div>
            }
        </div>
    `,
    styles: [
        `
            :host {
                display: flex;
                flex-direction: column;
                height: 100%;
                width: 100%;
                min-height: 0;
                overflow: hidden;
                padding: var(--mj-space-6);
                box-sizing: border-box;
            }
            .mjo-fq__note {
                margin-bottom: var(--mj-space-4);
                flex-shrink: 0;
            }
            .mjo-fq__actions {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: var(--mj-space-3);
                margin-bottom: var(--mj-space-3);
                flex-shrink: 0;
            }
            .mjo-fq__viewer-host {
                flex: 1 1 auto;
                height: 100%;
                min-height: 500px;
                background: var(--mj-bg-surface);
                border: 1px solid var(--mj-border-default);
                border-radius: var(--mj-radius-md);
                overflow: hidden;
                display: flex;
                flex-direction: column;
            }
            mj-entity-viewer {
                display: flex;
                flex-direction: column;
                flex: 1 1 auto;
                height: 100%;
                width: 100%;
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
    private readonly cdr = inject(ChangeDetectorRef);

    @Output() OrderOpened = new EventEmitter<string>();

    public OrderLineEntityInfo: EntityInfo | null = null;
    public Preset = 'pending';

    public readonly Tabs: TabConfig[] = [
        { key: 'pending', label: 'Pending Fulfillment' },
        { key: 'done', label: 'Fulfilled' },
        { key: 'all', label: 'All Lines' },
    ];

    public get FulfillmentQueueView(): MJUserViewEntityExtended | null {
        if (!this.OrderLineEntityInfo) return null;
        let whereClause = `FulfillmentStatus IN ('Pending', 'PartiallyFulfilled', 'Unfulfilled')`;
        if (this.Preset === 'done') {
            whereClause = `FulfillmentStatus = 'Fulfilled'`;
        } else if (this.Preset === 'all') {
            whereClause = '';
        }
        return {
            EntityID: this.OrderLineEntityInfo.ID,
            Entity: this.OrderLineEntityInfo.Name,
            WhereClause: whereClause,
            ID: `preset-fulfillment-${this.Preset}`,
            Name: 'Fulfillment Queue'
        } as unknown as MJUserViewEntityExtended;
    }

    /** Line ids the picker has ticked. */
    public Selected = new Set<string>();
    public Busy = false;
    public Error: string | null = null;

    /** What the last flip did. Kept on screen so a partial result is legible. */
    public Result: { FulfilledCount: number; RefusedCount: number; AdvancedCount: number } | null = null;

    public get SelectedCount(): number {
        return this.Selected.size;
    }

    public OnRecordSelected(event: RecordSelectedEvent): void {
        const id = (event.compositeKey?.GetValueByFieldName('ID') ?? (event.record as Record<string, unknown> | null)?.['ID']) as string | undefined;
        if (!id) return;
        if (this.Selected.has(id)) this.Selected.delete(id);
        else this.Selected.add(id);
        this.cdr.detectChanges();
    }

    public OnRecordOpened(event: RecordOpenedEvent): void {
        const orderId = (event.record as Record<string, unknown> | null)?.['OrderHeaderID'] as string | undefined;
        if (orderId) {
            this.OrderOpened.emit(orderId);
        }
    }

    /**
     * Mark the ticked lines fulfilled.
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
        } catch (e) {
            this.Error = e instanceof Error ? e.message : String(e);
        } finally {
            this.Busy = false;
            this.cdr.detectChanges();
        }
    }

    public ngOnInit(): void {
        const md = new Metadata();
        this.OrderLineEntityInfo = md.Entities.find((e) => e.Name === MJO_ENTITIES.OrderLine) || null;
        this.cdr.detectChanges();
    }

    public OnPreset(preset: string): void {
        this.Preset = preset;
        this.Selected.clear();
        this.cdr.detectChanges();
    }
}
