import { Component, inject } from '@angular/core';
import type { RunViewParams } from '@memberjunction/core';
import type { FormNavigationEvent } from '@memberjunction/ng-base-forms';
import { NavigationService } from '@memberjunction/ng-shared';
import { DispatchFormNavigation } from '../form-navigation-helper';
import {
    mjBizAppsOrdersPaymentHeaderEntity,
} from '@mj-biz-apps/orders-entities';
import { mjBizAppsOrdersPaymentHeaderFormComponent } from '../../generated/Entities/mjBizAppsOrdersPaymentHeader/mjbizappsorderspaymentheader.form.component';
import { FormatMoney } from '../../panels/money-format';

/**
 * Custom Payment Header form component overriding the CodeGen-generated form.
 *
 * Extends the generated form component so it wins @RegisterClass priority in
 * MemberJunction's ClassFactory.
 *
 * User-centric layout order:
 * 1. Payment Details & Money Breakdown: Payment date, tender, gross amount, processor fee, and net settlement cash.
 * 2. Payment Allocations (Order Lines Settled): Which orders and invoice lines this payment settled.
 * 3. Payer & Receiving Account: Paying party (Org / Person) and receiving company bank account.
 * 4. Accounting & Linked Journal Entries: General ledger journal entries balancing Cash and Accounts Receivable.
 * 5. Processing & Gateway Settlement: Payment provider, gateway reference, authorization code, and charge/refund IDs.
 * 6. Reversal & Refund Linking: Dynamic section explaining refunds/reversals when applicable.
 * 7. Stored Value & Account Credit: Stored value / credit account transactions.
 * 8. Memo & Internal Notes: Customer-facing memo and internal audit notes.
 * 9. Subscription Billing Events: Events triggered by recurring billing.
 * 10. System Metadata: Record IDs and audit timestamps.
 */
@Component({
    standalone: false,
    selector: 'bizapps-payment-header-form',
    templateUrl: './payment-header-form.component.html',
    styleUrls: ['./payment-header-form.component.css'],
})
export class BizAppsPaymentHeaderFormComponent extends mjBizAppsOrdersPaymentHeaderFormComponent {
    public declare record: mjBizAppsOrdersPaymentHeaderEntity;

    protected navigationService = inject(NavigationService, { optional: true });

    override OnFormNavigate(event: FormNavigationEvent): void {
        this.Navigate.emit(event);
        DispatchFormNavigation(event, this.navigationService);
    }

    override async ngOnInit(): Promise<void> {
        await super.ngOnInit();

        this.initSections([
            { sectionKey: 'paymentInformation', sectionName: 'Payment Details & Money Breakdown', isExpanded: true },
            { sectionKey: 'mJBizAppsOrdersPaymentLines', sectionName: 'Payment Allocations (Order Lines Settled)', isExpanded: true },
            { sectionKey: 'relationships', sectionName: 'Payer & Receiving Account', isExpanded: true },
            { sectionKey: 'accountingAndJournalEntries', sectionName: 'Accounting & Linked Journal Entries', isExpanded: true },
            { sectionKey: 'processingDetails', sectionName: 'Processing & Gateway Settlement', isExpanded: true },
            { sectionKey: 'reversalInformation', sectionName: 'Reversal & Refund Linking', isExpanded: true },
            { sectionKey: 'mJBizAppsOrdersStoredValueTransactions', sectionName: 'Stored Value & Account Credit Transactions', isExpanded: false },
            { sectionKey: 'notesAndMetadata', sectionName: 'Memo & Internal Notes', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersSubscriptionEvents', sectionName: 'Subscription Billing Events', isExpanded: false },
        ]);
    }

    /**
     * Determines whether the payment represents a reversal or refund.
     */
    public get IsReversal(): boolean {
        return Boolean(this.record?.ReversesPaymentHeaderID || (this.record?.Amount != null && this.record.Amount < 0) || this.record?.ProviderRefundID);
    }

    /**
     * FontAwesome icon based on tender type or reversal.
     */
    public get PaymentAvatarIcon(): string {
        if (this.IsReversal) {
            return 'fa-solid fa-rotate-left';
        }
        const tender = (this.record?.PaymentType ?? '').toLowerCase();
        if (tender.includes('card') || tender.includes('credit card') || tender.includes('debit')) {
            return 'fa-solid fa-credit-card';
        }
        if (tender.includes('check')) {
            return 'fa-solid fa-money-check';
        }
        if (tender.includes('wire') || tender.includes('ach') || tender.includes('bank')) {
            return 'fa-solid fa-building-columns';
        }
        if (tender.includes('credit') || tender.includes('stored') || tender.includes('wallet')) {
            return 'fa-solid fa-piggy-bank';
        }
        return 'fa-solid fa-hand-holding-dollar';
    }

    /**
     * Returns the status chip CSS class reflecting payment capture and settlement state.
     */
    public get StatusBadgeClass(): string {
        const status: mjBizAppsOrdersPaymentHeaderEntity['Status'] | undefined = this.record?.Status;
        switch (status) {
            case 'Captured':
                return 'mjo-status-chip mjo-status-chip--active';
            case 'Pending':
                return 'mjo-status-chip mjo-status-chip--draft';
            case 'Failed':
                return 'mjo-status-chip mjo-status-chip--error';
            case 'Refunded':
                return 'mjo-status-chip mjo-status-chip--purple';
            case 'Disputed':
                return 'mjo-status-chip mjo-status-chip--warning';
            default:
                return 'mjo-status-chip';
        }
    }

    /**
     * Formatted gross payment amount.
     */
    public get FormattedGrossAmount(): string {
        if (this.record?.Amount == null) return '—';
        return FormatMoney(this.record.Amount);
    }

    /**
     * Formatted processing fee.
     */
    public get FormattedFee(): string {
        if (this.record?.ProcessingFeeAmount == null) return '$0.00';
        return FormatMoney(this.record.ProcessingFeeAmount);
    }

    /**
     * Formatted net settlement amount.
     */
    public get FormattedNetAmount(): string {
        if (this.record?.NetAmount != null) {
            return FormatMoney(this.record.NetAmount);
        }
        if (this.record?.Amount != null) {
            const net = this.record.Amount - (this.record.ProcessingFeeAmount || 0);
            return FormatMoney(net);
        }
        return '—';
    }

    /**
     * Settlement or gateway status summary text.
     */
    public get SettlementStatusText(): string {
        const status: mjBizAppsOrdersPaymentHeaderEntity['Status'] | undefined = this.record?.Status;
        switch (status) {
            case 'Captured':
                return 'Captured (Financials Locked)';
            case 'Refunded':
                return 'Refunded / Reversed';
            case 'Disputed':
                return 'Disputed / Chargeback';
            case 'Failed':
                return 'Payment Failed';
            case 'Pending':
            default:
                return 'Pending Capture';
        }
    }

    /**
     * Resolves the primary bill-to payer organization or individual.
     */
    public get PayerDisplayName(): string {
        return this.record?.BillToOrganization || this.record?.BillToPerson || this.record?.BillToOrganizationID || this.record?.BillToPersonID || '—';
    }

    /**
     * View parameters for the linked Journal Entries grid.
     * Matches by JournalEntryID or LinkedRecordID = record.ID.
     */
    public get PaymentJournalEntryParams(): RunViewParams | null {
        if (!this.record?.IsSaved || !this.record?.ID) return null;
        const filters: string[] = [];
        if (this.record.JournalEntryID) {
            filters.push(`ID = '${this.record.JournalEntryID}'`);
        }
        filters.push(`LinkedRecordID = '${this.record.ID}'`);
        return {
            EntityName: 'MJ_BizApps_Accounting: Journal Entries',
            ExtraFilter: filters.join(' OR '),
            OrderBy: '__mj_CreatedAt DESC',
            ResultType: 'entity_object',
        };
    }

    /**
     * Called when a child record or related widget mutates data.
     */
    public async OnWidgetDataChanged(): Promise<void> {
        if (!this.record.Dirty) {
            await this.record.InnerLoad(this.record.PrimaryKey);
            this.cdr.detectChanges();
        }
    }
}

/** Tree-shaking prevention anchor function */
export function LoadPaymentHeaderFormComponent(): void {
    // Anchors BizAppsPaymentHeaderFormComponent in bundlers
}
