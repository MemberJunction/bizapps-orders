import { Component, OnInit } from '@angular/core';
import { CompositeKey, RunView, type IMetadataProvider, type RunViewParams } from '@memberjunction/core';
import { RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import type { mjBizAppsAccountingJournalEntryEntity } from '@mj-biz-apps/accounting-entities';
import type { mjBizAppsOrdersSubscriptionTermEntity } from '@mj-biz-apps/orders-entities';
import { MJO_ACCOUNTING_ENTITIES } from '../data/entity-names';

const SECTION_KEY = 'revRec';

@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:SubscriptionTerms:revRec',
    metadata: {
        entity: 'MJ_BizApps_Orders: Subscription Terms',
        slot: 'after-fields',
        sortKey: 80,
        contributionKey: SECTION_KEY,
    },
})
@Component({
    standalone: false,
    selector: 'mjo-subscription-term-revrec-panel',
    templateUrl: './subscription-term-revrec.panel.html',
    styleUrls: ['./document-hero.css'],
})
export class SubscriptionTermRevRecPanel extends BaseFormPanel<mjBizAppsOrdersSubscriptionTermEntity> implements OnInit {
    public readonly SectionKey = SECTION_KEY;
    public View: 'waterfall' | 'grid' = 'waterfall';
    public Loading = false;
    public Entries: mjBizAppsAccountingJournalEntryEntity[] = [];

    public async ngOnInit(): Promise<void> {
        await this.loadEntries();
    }

    public get JournalParams(): RunViewParams | null {
        if (!this.Record.IsSaved) return null;
        return {
            EntityName: MJO_ACCOUNTING_ENTITIES.JournalEntry,
            ExtraFilter: `LinkedRecordID = '${this.Record.ID}'`,
            OrderBy: 'EffectiveDate ASC',
            ResultType: 'entity_object',
        };
    }

    public get TermLookup(): Record<string, { TermNumber: number; Label: string }> {
        const num = this.Record.TermNumber ?? 1;
        const label = `Term ${num}`;
        return {
            [this.Record.ID.toLowerCase()]: { TermNumber: num, Label: label },
            [this.Record.ID.toUpperCase()]: { TermNumber: num, Label: label },
        };
    }

    public OpenJournal(entry: mjBizAppsAccountingJournalEntryEntity): void {
        this.FormComponent.OnFormNavigate({
            Kind: 'record',
            EntityName: MJO_ACCOUNTING_ENTITIES.JournalEntry,
            PrimaryKey: CompositeKey.FromID(entry.ID),
        });
    }

    private async loadEntries(): Promise<void> {
        if (!this.Record.IsSaved) return;
        this.Loading = true;
        try {
            this.Entries = await LoadTermJournals(this.Record.ID, this.FormComponent.ProviderToUse);
            this.FormComponent.SetSectionRowCount(SECTION_KEY, this.Entries.length);
        } finally {
            this.Loading = false;
            this.FormComponent.cdr.detectChanges();
        }
    }
}

async function LoadTermJournals(
    termId: string,
    provider: IMetadataProvider,
): Promise<mjBizAppsAccountingJournalEntryEntity[]> {
    const rv = RunView.FromMetadataProvider(provider);
    const res = await rv.RunView<mjBizAppsAccountingJournalEntryEntity>({
        EntityName: MJO_ACCOUNTING_ENTITIES.JournalEntry,
        ExtraFilter: `LinkedRecordID = '${termId}'`,
        OrderBy: 'EffectiveDate ASC',
        ResultType: 'entity_object',
        MaxRows: 200,
    }, provider.CurrentUser);
    const rows = res.Success && res.Results ? res.Results : [];
    await Promise.all(rows.map(async (je) => {
        try {
            if (je.Lines && typeof je.Lines.Load === 'function') {
                await je.Lines.Load();
            }
        } catch {
            // Waterfall still renders the header without lines.
        }
    }));
    return rows;
}
