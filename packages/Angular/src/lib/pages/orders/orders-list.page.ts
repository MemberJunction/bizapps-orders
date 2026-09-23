import { ChangeDetectorRef, Component, EventEmitter, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EntityViewerModule } from '@memberjunction/ng-entity-viewer';
import { Metadata, type EntityInfo } from '@memberjunction/core';
import { type MJUserViewEntityExtended } from '@memberjunction/core-entities';
import { MJAlertComponent } from '@memberjunction/ng-ui-components';
import { type mjBizAppsOrdersOrderHeaderEntity } from '@mj-biz-apps/orders-entities';
import { MJO_ENTITIES } from '../../data/entity-names';
import { LoadOrdersWorkingView } from '../../data/order-views';

/**
 * The payload `mj-view-workspace` emits from `OpenRecordRequested`.
 *
 * The workspace declares this shape inline rather than exporting a named type, so it is restated
 * here instead of widening the handler to `any` — the compiler still checks the binding.
 */
type OpenRecordRequest = { entity: EntityInfo; record: Record<string, unknown> };

/**
 * `mjo-orders-list-page` — All Orders, hosted in MemberJunction's `<mj-view-workspace>`.
 *
 * The workspace, not a bare `mj-entity-viewer`, because it owns the column-config panel the grid's
 * "Manage columns" item opens. It opens on the shared "Orders: Working" view, which carries the
 * column set and money formatting (see `data/order-views.ts`).
 */
@Component({
    selector: 'mjo-orders-list-page',
    standalone: true,
    imports: [CommonModule, EntityViewerModule, MJAlertComponent],
    template: `
        <div class="mjo-list-page-container">
            <div class="mjo-viewer-wrapper">
                @if (ViewError) {
                    <mj-alert Variant="error" Icon="fa-solid fa-triangle-exclamation" role="alert">{{ ViewError }}</mj-alert>
                } @else if (OrderEntityInfo && WorkingView) {
                    <mj-view-workspace
                        [Entity]="OrderEntityInfo"
                        [SelectedView]="WorkingView"
                        [AutoSaveView]="true"
                        (OpenRecordRequested)="OnRecordOpened($event)">
                    </mj-view-workspace>
                } @else {
                    <div class="small muted" style="padding: 24px;">Loading order metadata...</div>
                }
            </div>
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
            }
            .mjo-list-page-container {
                height: 100%;
                width: 100%;
                min-height: 0;
                display: flex;
                flex-direction: column;
                padding: var(--mj-space-6);
                box-sizing: border-box;
            }
            .mjo-viewer-wrapper {
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
            mj-view-workspace {
                display: flex;
                flex-direction: column;
                flex: 1 1 auto;
                height: 100%;
                width: 100%;
                min-height: 0;
            }
            @media (max-width: 760px) {
                .mjo-list-page-container {
                    padding: var(--mj-space-4);
                }
            }
        `,
    ],
})
export class MJOOrdersListPageComponent implements OnInit {
    private readonly cdr = inject(ChangeDetectorRef);

    @Output() OrderOpened = new EventEmitter<mjBizAppsOrdersOrderHeaderEntity>();

    public OrderEntityInfo: EntityInfo | null = null;
    public WorkingView: MJUserViewEntityExtended | null = null;
    public ViewError: string | null = null;

    public async ngOnInit(): Promise<void> {
        const md = new Metadata();
        this.OrderEntityInfo = md.Entities.find((e) => e.Name === MJO_ENTITIES.OrderHeader) || null;
        try {
            this.WorkingView = await LoadOrdersWorkingView();
        } catch (e) {
            this.ViewError = e instanceof Error ? e.message : String(e);
        }
        this.cdr.detectChanges();
    }

    /**
     * The workspace hands back the row it opened, not a composite key — Order Header's key is `ID`,
     * so the row carries it. A row without an `ID` is not openable and is dropped.
     */
    public OnRecordOpened(event: OpenRecordRequest): void {
        const id = event.record['ID'] as string | undefined;
        if (id) {
            const surrogate = { ID: id } as mjBizAppsOrdersOrderHeaderEntity;
            this.OrderOpened.emit(surrogate);
        }
    }
}
