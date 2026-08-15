import { Component, OnInit } from '@angular/core';
import { CompositeKey, RunView } from '@memberjunction/core';
import { RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import type { AfterDataLoadEventArgs } from '@memberjunction/ng-entity-viewer';
import type {
    mjBizAppsOrdersSubscriptionEntity,
    mjBizAppsOrdersSubscriptionTermEntity,
} from '@mj-biz-apps/orders-entities';
import { MJO_ENTITIES } from '../data/entity-names';
import { FormatMoney } from '../panels/money-format';
import { FormatCoverageWindow, TermColorClass, TermStatusChipClass } from './document-form.helpers';

const SECTION_KEY = 'terms';

/**
 * Coverage terms: card deck plus the stock grid. Replaces the baked Terms grid.
 */
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:Subscriptions:terms',
    metadata: {
        entity: 'MJ_BizApps_Orders: Subscriptions',
        slot: 'after-related',
        sortKey: 90,
        relatedEntity: 'MJ_BizApps_Orders: Subscription Terms',
        relatedJoinField: 'SubscriptionID',
        contributionKey: SECTION_KEY,
    },
})
@Component({
    standalone: false,
    selector: 'mjo-subscription-terms-panel',
    templateUrl: './subscription-terms.panel.html',
    styleUrls: ['./subscription-terms.css', './document-hero.css'],
})
export class SubscriptionTermsPanel extends BaseFormPanel<mjBizAppsOrdersSubscriptionEntity> implements OnInit {
    public readonly SectionKey = SECTION_KEY;
    public readonly TermEntity = MJO_ENTITIES.SubscriptionTerm;
    public ViewMode: 'cards' | 'grid' = 'cards';
    public Terms: mjBizAppsOrdersSubscriptionTermEntity[] = [];

    public async ngOnInit(): Promise<void> {
        await this.loadTerms();
    }

    public TermStatusClass(status: string | null | undefined): string {
        return TermStatusChipClass(status);
    }

    public TermTone(index: number): string {
        return TermColorClass(index);
    }

    public TermAmount(amount: number | null | undefined): string {
        return FormatMoney(amount);
    }

    public TermDates(
        start: Date | string | null | undefined,
        end: Date | string | null | undefined,
    ): string {
        return FormatCoverageWindow(start, end);
    }

    public OpenTerm(term: mjBizAppsOrdersSubscriptionTermEntity): void {
        this.FormComponent.OnFormNavigate({
            Kind: 'record',
            EntityName: this.TermEntity,
            PrimaryKey: CompositeKey.FromID(term.ID),
        });
    }

    public OnDataLoad(event: AfterDataLoadEventArgs): void {
        this.FormComponent.SetSectionRowCount(SECTION_KEY, event.totalRowCount);
    }

    private async loadTerms(): Promise<void> {
        if (!this.Record.IsSaved) {
            this.Terms = [];
            return;
        }
        const rv = RunView.FromMetadataProvider(this.FormComponent.ProviderToUse);
        const result = await rv.RunView<mjBizAppsOrdersSubscriptionTermEntity>({
            EntityName: this.TermEntity,
            ExtraFilter: `SubscriptionID = '${this.Record.ID}'`,
            OrderBy: 'TermNumber ASC',
            ResultType: 'entity_object',
            MaxRows: 200,
        }, this.FormComponent.ProviderToUse.CurrentUser);
        this.Terms = result.Success && result.Results ? result.Results : [];
        this.FormComponent.SetSectionRowCount(SECTION_KEY, this.Terms.length);
        this.FormComponent.cdr.detectChanges();
    }
}
