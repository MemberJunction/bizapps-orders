import { Component, OnInit } from '@angular/core';
import { CompositeKey, RunView, type IMetadataProvider } from '@memberjunction/core';
import { RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import type { mjBizAppsAccountingJournalEntryEntity } from '@mj-biz-apps/accounting-entities';
import type { mjBizAppsOrdersSubscriptionEntity } from '@mj-biz-apps/orders-entities';
import { MJO_ACCOUNTING_ENTITIES, MJO_ENTITIES } from '../data/entity-names';

const SECTION_KEY = 'revRec';

export type TermLookup = Record<string, { TermNumber: number; Label: string }>;

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
    public TermLookup: TermLookup = {};
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

async function LoadSubscriptionRevRec(
    record: mjBizAppsOrdersSubscriptionEntity,
    provider: IMetadataProvider,
): Promise<{
    Entries: mjBizAppsAccountingJournalEntryEntity[];
    TermLookup: TermLookup;
    TermIDs: string[];
}> {
    const rv = RunView.FromMetadataProvider(provider);
    const user = provider.CurrentUser;
    const termsRes = await rv.RunView<{ ID: string; TermNumber?: number }>({
        EntityName: MJO_ENTITIES.SubscriptionTerm,
        ExtraFilter: `SubscriptionID = '${record.ID}'`,
        OrderBy: 'TermNumber ASC',
        Fields: ['ID', 'TermNumber'],
        ResultType: 'simple',
        MaxRows: 200,
    }, user);
    const terms = termsRes.Success && termsRes.Results ? termsRes.Results : [];
    const termIds = terms.map((t) => t.ID);
    const lookup: TermLookup = {};
    terms.forEach((term, index) => {
        const num = term.TermNumber ?? index + 1;
        const label = `Term ${num}`;
        lookup[term.ID.toLowerCase()] = { TermNumber: num, Label: label };
        lookup[term.ID.toUpperCase()] = { TermNumber: num, Label: label };
    });

    const targets = [...termIds, record.ID];
    if (record.OrderLineID) targets.push(record.OrderLineID);
    const quoted = targets.map((id) => `'${id}'`).join(',');
    const jeRes = await rv.RunView<mjBizAppsAccountingJournalEntryEntity>({
        EntityName: MJO_ACCOUNTING_ENTITIES.JournalEntry,
        ExtraFilter: `LinkedRecordID IN (${quoted})`,
        OrderBy: 'EffectiveDate ASC',
        ResultType: 'entity_object',
        MaxRows: 500,
    }, user);
    const all = jeRes.Success && jeRes.Results ? jeRes.Results : [];
    await Promise.all(all.map((je) => LoadJournalLines(je)));
    const recognized = FilterRecognitionEntries(all, termIds);
    return {
        Entries: recognized.length > 0 ? recognized : all,
        TermLookup: lookup,
        TermIDs: termIds,
    };
}

async function LoadJournalLines(entry: mjBizAppsAccountingJournalEntryEntity): Promise<void> {
    try {
        if (entry.Lines && typeof entry.Lines.Load === 'function') {
            await entry.Lines.Load();
        }
    } catch {
        // Waterfall still renders the header without lines.
    }
}

function FilterRecognitionEntries(
    entries: mjBizAppsAccountingJournalEntryEntity[],
    termIds: string[],
): mjBizAppsAccountingJournalEntryEntity[] {
    return entries.filter((je) => {
        const desc = (je.Description || '').toLowerCase();
        const type = (je.EntryType || '').toLowerCase();
        const isTerm = termIds.some((id) => id.toLowerCase() === String(je.LinkedRecordID).toLowerCase());
        return isTerm || desc.includes('recognize') || type.includes('recognition');
    });
}
