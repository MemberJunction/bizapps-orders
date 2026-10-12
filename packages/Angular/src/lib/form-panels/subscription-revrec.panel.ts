import { Component, OnInit } from '@angular/core';
import { CompositeKey } from '@memberjunction/core';
import { RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import type { mjBizAppsAccountingJournalEntryEntity } from '@mj-biz-apps/accounting-entities';
import type { mjBizAppsOrdersSubscriptionEntity } from '@mj-biz-apps/orders-entities';
import { MJO_ACCOUNTING_ENTITIES } from '../data/entity-names';
import { LoadSubscriptionRevRec, type SubscriptionTermLookup } from '../data/orders-queries';

const SECTION_KEY = 'revRec';

/**
 * Deferred revenue waterfall + journal grid for a subscription.
 */
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:Subscriptions:revRec',
    metadata: {
        entity: 'MJ_BizApps_Orders: Subscriptions',
        slot: 'after-fields',
        sortKey: 80,
        contributionKey: SECTION_KEY,
    },
})
@Component({
    standalone: false,
    selector: 'mjo-subscription-revrec-panel',
    templateUrl: './subscription-revrec.panel.html',
    styleUrls: ['./document-hero.css'],
})
export class SubscriptionRevRecPanel extends BaseFormPanel<mjBizAppsOrdersSubscriptionEntity> implements OnInit {
    public readonly SectionKey = SECTION_KEY;
    public View: 'waterfall' | 'grid' = 'waterfall';
    public Loading = false;
    public Entries: mjBizAppsAccountingJournalEntryEntity[] = [];
    public TermLookup: SubscriptionTermLookup = {};
    public TermIDs: string[] = [];

    public async ngOnInit(): Promise<void> {
        await this.loadSchedule();
    }

    public get JournalParams() {
        if (!this.Record.IsSaved) return null;
        const ids = [...this.TermIDs, this.Record.ID];
        if (this.Record.OrderLineID) ids.push(this.Record.OrderLineID);
        const quoted = ids.map((id) => `'${id}'`).join(',');
        return {
            EntityName: MJO_ACCOUNTING_ENTITIES.JournalEntry,
            ExtraFilter: `LinkedRecordID IN (${quoted})`,
            OrderBy: 'EffectiveDate ASC',
            ResultType: 'entity_object' as const,
        };
    }

    public OpenJournal(entry: mjBizAppsAccountingJournalEntryEntity): void {
        this.FormComponent.OnFormNavigate({
            Kind: 'record',
            EntityName: MJO_ACCOUNTING_ENTITIES.JournalEntry,
            PrimaryKey: CompositeKey.FromID(entry.ID),
        });
    }

    private async loadSchedule(): Promise<void> {
        if (!this.Record.IsSaved) return;
        this.Loading = true;
        try {
            const loaded = await LoadSubscriptionRevRec(this.Record, this.FormComponent.ProviderToUse);
            this.Entries = loaded.Entries;
            this.TermLookup = loaded.TermLookup;
            this.TermIDs = loaded.TermIDs;
            this.FormComponent.SetSectionRowCount(SECTION_KEY, this.Entries.length);
        } finally {
            this.Loading = false;
            this.FormComponent.cdr.detectChanges();
        }
    }
}
