import { ChangeDetectorRef, Component, EventEmitter, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EntityViewerModule } from '@memberjunction/ng-entity-viewer';
import { Metadata, type EntityInfo } from '@memberjunction/core';
import { type mjBizAppsOrdersPaymentHeaderEntity } from '@mj-biz-apps/orders-entities';
import { MJO_ENTITIES } from '../../data/entity-names';

/**
 * The payload `mj-view-workspace` emits from `OpenRecordRequested`. The workspace declares it inline
 * rather than exporting a named type, so it is restated here.
 */
type OpenRecordRequest = { entity: EntityInfo; record: Record<string, unknown> };

/**
 * `mjo-payments-list-page` — All Payments view, hosted in MemberJunction's `<mj-view-workspace>` so saved views and "Manage columns" work.
 */
@Component({
    selector: 'mjo-payments-list-page',
    standalone: true,
    imports: [CommonModule, EntityViewerModule],
    template: `
        <div class="mjo-list-page-container">
            <div class="mjo-viewer-wrapper">
                @if (PaymentEntityInfo) {
                    <mj-view-workspace
                        [Entity]="PaymentEntityInfo"
                        [AutoSaveView]="true"
                        (OpenRecordRequested)="OnRecordOpened($event)">
                    </mj-view-workspace>
                } @else {
                    <div class="small muted" style="padding: 24px;">Loading payment metadata...</div>
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
            }
            @media (max-width: 760px) {
                .mjo-list-page-container { padding: var(--mj-space-4); }
            }
        `,
    ],
})
export class MJOPaymentsListPageComponent implements OnInit {
    private readonly cdr = inject(ChangeDetectorRef);

    @Output() PaymentOpened = new EventEmitter<mjBizAppsOrdersPaymentHeaderEntity>();

    public PaymentEntityInfo: EntityInfo | null = null;

    public ngOnInit(): void {
        const md = new Metadata();
        this.PaymentEntityInfo = md.Entities.find((e) => e.Name === MJO_ENTITIES.PaymentHeader) || null;
        this.cdr.detectChanges();
    }

    /** The workspace hands back the opened row; Payment's key is `ID`, so the row carries it. */
    public OnRecordOpened(event: OpenRecordRequest): void {
        const id = event.record['ID'] as string | undefined;
        if (id) {
            const surrogate = { ID: id } as mjBizAppsOrdersPaymentHeaderEntity;
            this.PaymentOpened.emit(surrogate);
        }
    }
}
