import { Component, inject } from '@angular/core';
import type { RunViewParams } from '@memberjunction/core';
import { UserInfoEngine } from '@memberjunction/core-entities';
import type { FormNavigationEvent } from '@memberjunction/ng-base-forms';
import { NavigationService } from '@memberjunction/ng-shared';
import { DispatchFormNavigation } from '../form-navigation-helper';
import {
    mjBizAppsOrdersPaymentHeaderEntity,
    mjBizAppsOrdersOrderHeaderEntity,
    mjBizAppsOrdersOrderLineEntity,
    mjBizAppsOrdersPaymentLineEntity,
} from '@mj-biz-apps/orders-entities';
import { mjBizAppsOrdersPaymentHeaderFormComponent } from '../../generated/Entities/mjBizAppsOrdersPaymentHeader/mjbizappsorderspaymentheader.form.component';
import { FormatMoney, FormatDate } from '../../panels/money-format';
import {
    BuildPaymentJournalFilter,
    GetPaymentJournalRollup,
    GetOrders,
    GetOrderLinesForOrders,
    type OrderJournalCard,
} from '../../data/orders-queries';
import { MJO_ACCOUNTING_ENTITIES } from '../../data/entity-names';

const ACCOUNTING_VIEW_SETTING = 'mj.orders.paymentHeader.accountingView';

/**
 * Custom Payment Header form component overriding the CodeGen-generated form.
 *
 * Extends the generated form component so it wins @RegisterClass priority in
 * MemberJunction's ClassFactory.
 *
 * Provides a unified creation, editing, allocation, and review experience directly
 * within the standard MemberJunction entity form.
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

    public AccountingView: 'summary' | 'detail' = 'summary';
    public RollupCards: OrderJournalCard[] = [];
    public RollupLoading = false;
    public RollupError: string | null = null;
    public RollupJournalCount = 0;

    // ── Allocation State for New / Uncaptured Payments ───────────────────────
    public OpenOrders: mjBizAppsOrdersOrderHeaderEntity[] = [];
    public OrderLinesMap = new Map<string, mjBizAppsOrdersOrderLineEntity[]>();
    public OrderAllocations: Record<string, number> = {};
    public LineAllocations: Record<string, number> = {};
    public ExpandedOrderIDs = new Set<string>();
    public LoadingOpenOrders = false;
    public AllocationError: string | null = null;

    override OnFormNavigate(event: FormNavigationEvent): void {
        this.Navigate.emit(event);
        DispatchFormNavigation(event, this.navigationService);
    }

    override async ngOnInit(): Promise<void> {
        await super.ngOnInit();

        const savedView = UserInfoEngine.Instance.GetSetting(ACCOUNTING_VIEW_SETTING);
        if (savedView === 'summary' || savedView === 'detail') {
            this.AccountingView = savedView;
        }

        this.initSections([
            { sectionKey: 'paymentInformation', sectionName: 'Payment Details & Money Breakdown', isExpanded: true },
            { sectionKey: 'mJBizAppsOrdersPaymentLines', sectionName: 'Payment Allocations (Order Lines Settled)', isExpanded: true },
            { sectionKey: 'relationships', sectionName: 'Payer & Receiving Account', isExpanded: true },
            { sectionKey: 'accounting', sectionName: 'Accounting', isExpanded: true },
            { sectionKey: 'processingDetails', sectionName: 'Processing & Gateway Settlement', isExpanded: true },
            { sectionKey: 'reversalInformation', sectionName: 'Reversal & Refund Linking', isExpanded: true },
            { sectionKey: 'mJBizAppsOrdersStoredValueTransactions', sectionName: 'Stored Value & Account Credit Transactions', isExpanded: false },
            { sectionKey: 'notesAndMetadata', sectionName: 'Memo & Internal Notes', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersSubscriptionEvents', sectionName: 'Subscription Billing Events', isExpanded: false },
        ]);

        if (this.IsCaptured) {
            void this.loadPaymentJournalRollup();
        } else {
            await this.loadOpenOrdersForCustomer();
            this.populateExistingAllocations();
        }
    }

    /**
     * Determines whether the payment has been captured and locked.
     */
    public get IsCaptured(): boolean {
        const status = this.record?.Status;
        return status === 'Captured' || status === 'Refunded';
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
        if (this.record?.Amount == null) return '$0.00';
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
     */
    public get PaymentJournalEntryParams(): RunViewParams | null {
        if (!this.record?.IsSaved || !this.record?.ID) return null;
        return {
            EntityName: MJO_ACCOUNTING_ENTITIES.JournalEntry,
            ExtraFilter: BuildPaymentJournalFilter(this.record),
            OrderBy: '__mj_CreatedAt DESC',
            ResultType: 'entity_object',
        };
    }

    public SetAccountingView(view: 'summary' | 'detail'): void {
        if (this.AccountingView === view) return;
        this.AccountingView = view;
        UserInfoEngine.Instance.SetSettingDebounced(ACCOUNTING_VIEW_SETTING, view);
        if (view === 'summary') void this.loadPaymentJournalRollup();
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

    public async loadPaymentJournalRollup(): Promise<void> {
        if (!this.record?.IsSaved || !this.record?.ID) {
            this.RollupCards = [];
            this.RollupJournalCount = 0;
            return;
        }
        this.RollupLoading = true;
        this.RollupError = null;
        this.cdr?.detectChanges?.();
        try {
            const rollup = await GetPaymentJournalRollup(this.record, this.ProviderToUse?.CurrentUser);
            this.RollupCards = rollup.Cards;
            this.RollupJournalCount = rollup.JournalCount;
        } catch (error) {
            this.RollupCards = [];
            this.RollupJournalCount = 0;
            this.RollupError = error instanceof Error ? error.message : 'Could not roll up the journals.';
        } finally {
            this.RollupLoading = false;
            this.cdr?.detectChanges?.();
        }
    }

    // ── Allocation Matrix & Workbench Methods ───────────────────────────────

    /**
     * Loads open unpaid orders for the selected payer.
     */
    public async loadOpenOrdersForCustomer(): Promise<void> {
        const orgID = this.record?.BillToOrganizationID;
        const personID = this.record?.BillToPersonID;

        if (!orgID && !personID) {
            this.OpenOrders = [];
            this.OrderLinesMap.clear();
            return;
        }

        this.LoadingOpenOrders = true;
        this.cdr?.detectChanges?.();

        try {
            const orders = await GetOrders({
                BillToOrganizationID: orgID ?? undefined,
                BillToPersonID: personID ?? undefined,
                Preset: 'unpaid',
                User: this.ProviderToUse?.CurrentUser,
            });

            this.OpenOrders = orders;
            const orderIDs = orders.map((o) => o.ID).filter((id): id is string => Boolean(id));

            if (orderIDs.length > 0) {
                const linesMap = await GetOrderLinesForOrders(orderIDs, this.ProviderToUse?.CurrentUser);
                this.OrderLinesMap = linesMap;
            } else {
                this.OrderLinesMap.clear();
            }
        } catch (err) {
            this.AllocationError = err instanceof Error ? err.message : 'Failed to load open orders for customer';
        } finally {
            this.LoadingOpenOrders = false;
            this.cdr?.detectChanges?.();
        }
    }

    /**
     * Populates in-memory allocations from existing draft/pending record lines.
     */
    private populateExistingAllocations(): void {
        if (!this.record?.Lines?.Items?.length) return;

        this.OrderAllocations = {};
        this.LineAllocations = {};

        for (const line of this.record.Lines.Items) {
            if (line.OrderLineID) {
                this.LineAllocations[String(line.OrderLineID).toLowerCase()] = line.Amount ?? 0;
                if (line.OrderHeaderID) {
                    this.ExpandedOrderIDs.add(String(line.OrderHeaderID).toLowerCase());
                }
            } else if (line.OrderHeaderID) {
                this.OrderAllocations[String(line.OrderHeaderID).toLowerCase()] = line.Amount ?? 0;
            }
        }
    }

    /**
     * Toggles line-level expansion for a given order row.
     */
    public ToggleOrderExpanded(orderID: string): void {
        const key = orderID.toLowerCase();
        if (this.ExpandedOrderIDs.has(key)) {
            this.ExpandedOrderIDs.delete(key);
        } else {
            this.ExpandedOrderIDs.add(key);
        }
        this.cdr?.detectChanges?.();
    }

    public IsOrderExpanded(orderID: string): boolean {
        return this.ExpandedOrderIDs.has(orderID.toLowerCase());
    }

    public GetOrderLines(orderID: string): mjBizAppsOrdersOrderLineEntity[] {
        return this.OrderLinesMap.get(orderID.toLowerCase()) || this.OrderLinesMap.get(orderID) || [];
    }

    public GetOrderAllocation(orderID: string): number {
        return this.OrderAllocations[orderID.toLowerCase()] ?? 0;
    }

    public GetLineAllocation(orderLineID: string): number {
        return this.LineAllocations[orderLineID.toLowerCase()] ?? 0;
    }

    public SetOrderAllocation(orderID: string, value: string | number): void {
        const amount = typeof value === 'number' ? value : parseFloat(value) || 0;
        this.OrderAllocations[orderID.toLowerCase()] = Math.max(0, amount);
        this.cdr?.detectChanges?.();
    }

    public SetLineAllocation(orderLineID: string, value: string | number): void {
        const amount = typeof value === 'number' ? value : parseFloat(value) || 0;
        this.LineAllocations[orderLineID.toLowerCase()] = Math.max(0, amount);
        this.cdr?.detectChanges?.();
    }

    /**
     * Total amount currently allocated across orders and lines.
     */
    public get TotalAllocated(): number {
        let total = 0;
        for (const amt of Object.values(this.OrderAllocations)) {
            total += amt;
        }
        for (const amt of Object.values(this.LineAllocations)) {
            total += amt;
        }
        return Math.round(total * 100) / 100;
    }

    /**
     * Remaining unallocated cash on the payment.
     */
    public get UnallocatedRemainder(): number {
        const gross = this.record?.Amount ?? 0;
        return Math.round((gross - this.TotalAllocated) * 100) / 100;
    }

    /**
     * True when the allocations exactly match the gross payment amount.
     */
    public get IsAllocationBalanced(): boolean {
        return Math.abs(this.UnallocatedRemainder) < 0.005 && this.TotalAllocated > 0;
    }

    /**
     * Automatically applies cash to open orders starting from oldest due date.
     */
    public AutoApplyOldestFirst(): void {
        this.OrderAllocations = {};
        this.LineAllocations = {};

        let remainingCash = this.record?.Amount ?? 0;
        if (remainingCash <= 0) return;

        // Sort orders oldest first by DueDate / OrderDate
        const sorted = [...this.OpenOrders].sort((a, b) => {
            const dateA = new Date(a.DueDate || a.OrderDate || 0).getTime();
            const dateB = new Date(b.DueDate || b.OrderDate || 0).getTime();
            return dateA - dateB;
        });

        for (const order of sorted) {
            if (remainingCash <= 0) break;
            const openBal = Math.max(0, order.Balance ?? order.TotalGross ?? 0);
            const applyAmount = Math.min(openBal, remainingCash);

            if (applyAmount > 0 && order.ID) {
                this.OrderAllocations[order.ID.toLowerCase()] = Math.round(applyAmount * 100) / 100;
                remainingCash = Math.round((remainingCash - applyAmount) * 100) / 100;
            }
        }

        // If cash still remains (over-applying to oldest order)
        if (remainingCash > 0 && sorted.length > 0 && sorted[0].ID) {
            const firstKey = sorted[0].ID.toLowerCase();
            const current = this.OrderAllocations[firstKey] ?? 0;
            this.OrderAllocations[firstKey] = Math.round((current + remainingCash) * 100) / 100;
        }

        this.cdr?.detectChanges?.();
    }

    /**
     * Clears all allocation entries.
     */
    public ClearAllocations(): void {
        this.OrderAllocations = {};
        this.LineAllocations = {};
        this.cdr?.detectChanges?.();
    }

    /**
     * Calculates the projected remaining balance for an order.
     */
    public CalculateLeavesBalance(order: mjBizAppsOrdersOrderHeaderEntity): number {
        const orderID = (order.ID ?? '').toLowerCase();
        const baseBal = order.Balance ?? order.TotalGross ?? 0;
        const orderApplied = this.OrderAllocations[orderID] ?? 0;

        let lineApplied = 0;
        const lines = this.GetOrderLines(orderID);
        for (const l of lines) {
            if (l.ID) {
                lineApplied += this.LineAllocations[l.ID.toLowerCase()] ?? 0;
            }
        }

        return Math.round((baseBal - (orderApplied + lineApplied)) * 100) / 100;
    }

    /**
     * Formats due date for table display.
     */
    public FormatOrderDueDate(order: mjBizAppsOrdersOrderHeaderEntity): string {
        if (!order.DueDate) return '—';
        return FormatDate(order.DueDate);
    }

    /**
     * Calculates days overdue relative to current time.
     */
    public GetOrderDaysOverdue(order: mjBizAppsOrdersOrderHeaderEntity): number {
        if (!order.DueDate) return 0;
        const due = new Date(order.DueDate).getTime();
        const now = Date.now();
        if (now <= due) return 0;
        return Math.floor((now - due) / (1000 * 60 * 60 * 24));
    }

    /**
     * Synchronizes in-memory allocations into this.record.Lines collection.
     */
    public async SyncAllocationsToRecord(): Promise<void> {
        if (!this.record?.Lines) return;

        // Clear existing unbooked lines
        const existing = [...this.record.Lines.Items];
        for (const line of existing) {
            if (!line.BookedAt) {
                this.record.Lines.Remove(line);
            }
        }

        // Add order-level allocations
        for (const [orderID, amount] of Object.entries(this.OrderAllocations)) {
            if (amount > 0) {
                const line = await this.record.Lines.Create();
                line.OrderHeaderID = orderID;
                line.OrderLineID = null;
                line.Amount = amount;
                line.AllocatedAt = new Date();
            }
        }

        // Add line-level targeted allocations
        for (const [orderLineID, amount] of Object.entries(this.LineAllocations)) {
            if (amount > 0) {
                let parentOrderID: string | null = null;
                for (const [orderID, lines] of this.OrderLinesMap.entries()) {
                    if (lines.some((l) => (l.ID ?? '').toLowerCase() === orderLineID.toLowerCase())) {
                        parentOrderID = orderID;
                        break;
                    }
                }

                if (parentOrderID) {
                    const line = await this.record.Lines.Create();
                    line.OrderHeaderID = parentOrderID;
                    line.OrderLineID = orderLineID;
                    line.Amount = amount;
                    line.AllocatedAt = new Date();
                }
            }
        }
    }

    /**
     * Captures and books the payment immediately.
     */
    public async CapturePayment(): Promise<void> {
        if (!this.IsAllocationBalanced) {
            this.AllocationError = `Payment amount (${this.FormattedGrossAmount}) must equal total allocations (${FormatMoney(this.TotalAllocated)}) to capture.`;
            this.cdr?.detectChanges?.();
            return;
        }

        this.AllocationError = null;
        this.record.Status = 'Captured';
        await this.SyncAllocationsToRecord();
        await this.SaveRecord(false);
    }

    /**
     * Saves the payment as a pending draft.
     */
    public async SaveAsDraft(): Promise<void> {
        this.AllocationError = null;
        this.record.Status = 'Pending';
        await this.SyncAllocationsToRecord();
        await this.SaveRecord(false);
    }

    /**
     * Called when a child record or related widget mutates data.
     */
    public async OnWidgetDataChanged(): Promise<void> {
        if (!this.record.Dirty) {
            await this.record.InnerLoad(this.record.PrimaryKey);
            if (this.IsCaptured) {
                await this.loadPaymentJournalRollup();
            } else {
                await this.loadOpenOrdersForCustomer();
            }
            this.cdr?.detectChanges?.();
        }
    }
}

/** Tree-shaking prevention anchor function */
export function LoadPaymentHeaderFormComponent(): void {
    // Anchors BizAppsPaymentHeaderFormComponent in bundlers
}
