import { Component } from '@angular/core';
import type { RunViewParams } from '@memberjunction/core';
import { RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import type { AfterDataLoadEventArgs } from '@memberjunction/ng-entity-viewer';
import type { mjBizAppsOrdersPaymentHeaderEntity } from '@mj-biz-apps/orders-entities';
import { MJO_ACCOUNTING_ENTITIES } from '../data/entity-names';

const SECTION_KEY = 'journals';

/**
 * Linked journal entries for a payment (JournalEntryID or LinkedRecordID).
 */
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:PaymentHeaders:journals',
    metadata: {
        entity: 'MJ_BizApps_Orders: Payment Headers',
        slot: 'after-fields',
        sortKey: 80,
        contributionKey: SECTION_KEY,
    },
})
@Component({
    standalone: false,
    selector: 'mjo-payment-journals-panel',
    template: `
        <mj-collapsible-panel
            SectionKey="journals"
            SectionName="Journal Entries"
            Icon="fa-solid fa-scale-balanced"
            [Form]="FormComponent"
            [FormContext]="FormContext"
            [DefaultExpanded]="true">
            @if (Record.IsSaved && Params) {
                <mj-explorer-entity-data-grid
                    [Params]="Params"
                    [AllowLoad]="FormComponent.IsSectionExpanded(SectionKey)"
                    [ShowToolbar]="true"
                    (Navigate)="FormComponent.OnFormNavigate($event)"
                    (AfterDataLoad)="OnDataLoad($event)">
                </mj-explorer-entity-data-grid>
            }
        </mj-collapsible-panel>
    `,
})
export class PaymentJournalsPanel extends BaseFormPanel<mjBizAppsOrdersPaymentHeaderEntity> {
    public readonly SectionKey = SECTION_KEY;

    public get Params(): RunViewParams | null {
        if (!this.Record.IsSaved || !this.Record.ID) return null;
        const filters: string[] = [`LinkedRecordID = '${this.Record.ID}'`];
        if (this.Record.JournalEntryID) {
            filters.push(`ID = '${this.Record.JournalEntryID}'`);
        }
        return {
            EntityName: MJO_ACCOUNTING_ENTITIES.JournalEntry,
            ExtraFilter: filters.join(' OR '),
            OrderBy: '__mj_CreatedAt DESC',
            ResultType: 'entity_object',
        };
    }

    public OnDataLoad(event: AfterDataLoadEventArgs): void {
        this.FormComponent.SetSectionRowCount(SECTION_KEY, event.totalRowCount);
    }
}
