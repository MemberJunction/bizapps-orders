import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import type { RunViewParams } from '@memberjunction/core';
import { UserInfoEngine } from '@memberjunction/core-entities';
import { RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import type { AfterDataLoadEventArgs } from '@memberjunction/ng-entity-viewer';
import type { mjBizAppsOrdersPaymentHeaderEntity } from '@mj-biz-apps/orders-entities';
import { MJO_ACCOUNTING_ENTITIES } from '../data/entity-names';
import {
    BuildPaymentJournalFilter,
    GetPaymentJournalRollup,
    type OrderJournalCard,
} from '../data/orders-queries';
import { FormatMoney } from '../panels/money-format';

const SECTION_KEY = 'accounting';
const ACCOUNTING_VIEW_SETTING = 'mj.orders.paymentHeader.accountingView';

/**
 * Linked journal entries for a payment (JournalEntryID, LinkedRecordID, or allocation line links).
 * Provides rolled-up company ledger view and individual journal entry drill-in.
 */
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:PaymentHeaders:accounting',
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
    templateUrl: './payment-journals.panel.html',
    styleUrls: ['./payment-journals.panel.css'],
})
export class PaymentJournalsPanel extends BaseFormPanel<mjBizAppsOrdersPaymentHeaderEntity> implements OnInit {
    public readonly SectionKey = SECTION_KEY;
    protected cdr = inject(ChangeDetectorRef);

    public AccountingView: 'summary' | 'detail' = 'summary';
    public RollupCards: OrderJournalCard[] = [];
    public RollupLoading = false;
    public RollupError: string | null = null;
    public RollupJournalCount = 0;

    public async ngOnInit(): Promise<void> {
        const savedView = UserInfoEngine.Instance.GetSetting(ACCOUNTING_VIEW_SETTING);
        if (savedView === 'summary' || savedView === 'detail') {
            this.AccountingView = savedView;
        }
        await this.loadRollup();
    }

    public get Params(): RunViewParams | null {
        if (!this.Record.IsSaved || !this.Record.ID) return null;
        return {
            EntityName: MJO_ACCOUNTING_ENTITIES.JournalEntry,
            ExtraFilter: BuildPaymentJournalFilter(this.Record),
            OrderBy: '__mj_CreatedAt DESC',
            ResultType: 'entity_object',
        };
    }

    public get BadgeCount(): number {
        return this.RollupJournalCount || (this.FormComponent ? (this.FormComponent.GetSectionRowCount(SECTION_KEY) ?? 0) : 0);
    }

    public SetAccountingView(view: 'summary' | 'detail'): void {
        if (this.AccountingView === view) return;
        this.AccountingView = view;
        UserInfoEngine.Instance.SetSettingDebounced(ACCOUNTING_VIEW_SETTING, view);
        if (view === 'summary') void this.loadRollup();
    }

    public CardIsBalanced(card: OrderJournalCard): boolean {
        return Math.abs(card.TotalDebit - card.TotalCredit) < 0.005;
    }

    public RollupAmount(amount: number): string {
        return FormatMoney(amount);
    }

    public SourceLineLabel(count: number): string {
        return count === 1 ? '1 allocation' : `${count} allocations`;
    }

    public async loadRollup(): Promise<void> {
        if (!this.Record.IsSaved || !this.Record.ID) {
            this.RollupCards = [];
            this.RollupJournalCount = 0;
            return;
        }
        this.RollupLoading = true;
        this.RollupError = null;
        this.cdr.detectChanges();
        try {
            const rollup = await GetPaymentJournalRollup(this.Record, this.FormComponent?.ProviderToUse?.CurrentUser);
            this.RollupCards = rollup.Cards;
            this.RollupJournalCount = rollup.JournalCount;
        } catch (error) {
            this.RollupCards = [];
            this.RollupJournalCount = 0;
            this.RollupError = error instanceof Error ? error.message : 'Could not roll up the journals.';
        } finally {
            this.RollupLoading = false;
            this.cdr.detectChanges();
        }
    }

    public OnDataLoad(event: AfterDataLoadEventArgs): void {
        if (this.FormComponent) {
            this.FormComponent.SetSectionRowCount(SECTION_KEY, event.totalRowCount);
        }
        if (!this.RollupJournalCount && event.totalRowCount) {
            this.RollupJournalCount = event.totalRowCount;
        }
    }
}
