import { Component, inject } from '@angular/core';
import type { RunViewParams } from '@memberjunction/core';
import { CompositeKey } from '@memberjunction/core';
import { UserInfoEngine } from '@memberjunction/core-entities';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { BaseFormComponent, type FormNavigationEvent } from '@memberjunction/ng-base-forms';
import { NavigationService } from '@memberjunction/ng-shared';
import type { TabConfig } from '@memberjunction/ng-ui-components';
import {
    PaymentHeaderEntity,
    mjBizAppsOrdersPaymentHeaderEntity,
    mjBizAppsOrdersPaymentDetailEntity,
    mjBizAppsOrdersOrderHeaderEntity,
    mjBizAppsOrdersOrderLineEntity,
    type mjBizAppsOrdersPaymentTypeEntity,
} from '@mj-biz-apps/orders-entities';
import { mjBizAppsOrdersPaymentHeaderFormComponent } from '../../generated/Entities/mjBizAppsOrdersPaymentHeader/mjbizappsorderspaymentheader.form.component';
import { FormatMoney, FormatDate } from '../../panels/money-format';
import {
    BuildPaymentJournalFilter,
    GetPaymentJournalRollup,
    GetOrders,
    GetOrderLinesForOrders,
    GetPaymentTypes,
    GetSellingCompanies,
    type OrderJournalCard,
    type MJOCompanyOption,
} from '../../data/orders-queries';
import { MJO_ACCOUNTING_ENTITIES, MJO_ENTITIES } from '../../data/entity-names';
import { DispatchFormNavigation } from '../form-navigation-helper';

const ACCOUNTING_VIEW_SETTING = 'mj.orders.paymentHeader.accountingView';
const PAYMENT_TAB_SETTING = 'mj.orders.paymentHeader.activeTab';

export const PAYMENT_FORM_TABS: TabConfig[] = [
    { key: 'payment', label: 'Payment & Allocation', icon: 'fa-solid fa-money-bill-transfer' },
    { key: 'accounting', label: 'Accounting & Ledger', icon: 'fa-solid fa-book' },
    { key: 'details', label: 'Details & Notes', icon: 'fa-solid fa-sliders' },
    { key: 'related', label: 'Related Records', icon: 'fa-solid fa-layer-group' },
];

/**
 * Custom Payment Header form component overriding the CodeGen-generated form.
 *
 * Registered with priority 2 to override mjBizAppsOrdersPaymentHeaderFormComponent in ClassFactory.
 * Provides a unified creation, editing, allocation, and review experience directly
 * within the standard MemberJunction entity form.
 */
@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Payment Headers', 2)
@Component({
    standalone: false,
    selector: 'bizapps-payment-header-form',
    templateUrl: './payment-header-form.component.html',
    styleUrls: ['./payment-header-form.component.css'],
})
export class BizAppsPaymentHeaderFormComponent extends mjBizAppsOrdersPaymentHeaderFormComponent {
    public declare record: PaymentHeaderEntity;

    protected navigationService = inject(NavigationService, { optional: true });

    public readonly Math = Math;

    public ActiveTab: 'payment' | 'accounting' | 'details' | 'related' = 'payment';

    public PaymentTypes: mjBizAppsOrdersPaymentTypeEntity[] = [];
    public SellingCompanies: MJOCompanyOption[] = [];

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
    public SearchQuery = '';

    public Saving = false;
    public Capturing = false;
    public CaptureError: string | null = null;
    public AmountManuallySet = false;

    private lastLoadedCustomerKey: string | null = null;

    public get ContextTabs(): TabConfig[] {
        if (!this.record?.IsSaved || !this.IsCaptured) {
            return [
                { key: 'payment', label: 'Payment & Allocation', icon: 'fa-solid fa-money-bill-transfer' },
                { key: 'details', label: 'Details & Notes', icon: 'fa-solid fa-sliders' },
            ];
        }
        return PAYMENT_FORM_TABS;
    }

    override OnFormNavigate(event: FormNavigationEvent): void {
        this.Navigate.emit(event);
        DispatchFormNavigation(event, this.navigationService);
    }

    override async ngOnInit(): Promise<void> {
        await super.ngOnInit();

        this.AmountManuallySet = Boolean(this.record?.Amount && this.record.Amount > 0 && this.record.IsSaved);

        this.Config = { ...(this.Config ?? {}), ShowRelatedEntities: false };

        const savedView = UserInfoEngine.Instance.GetSetting(ACCOUNTING_VIEW_SETTING);
        if (savedView === 'summary' || savedView === 'detail') {
            this.AccountingView = savedView;
        }

        const savedTab = UserInfoEngine.Instance.GetSetting(PAYMENT_TAB_SETTING);
        if (savedTab === 'payment' || savedTab === 'accounting' || savedTab === 'details' || savedTab === 'related') {
            this.ActiveTab = savedTab;
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

        await this.loadPaymentTypes();
        await this.loadSellingCompanies();

        if (this.IsCaptured) {
            void this.loadPaymentJournalRollup();
        } else {
            if (this.record?.IsSaved && !this.record.Lines.IsLoaded) {
                await this.record.Lines.Load();
            }
            await this.loadOpenOrdersForCustomer();
            this.populateExistingAllocations();
        }

        this.RegisterToolbarItem({
            Key: 'save-draft-toolbar',
            Text: 'Save draft',
            Icon: 'fa-solid fa-floppy-disk',
            Variant: 'secondary',
            Mode: 'both',
            Order: 5,
            Visible: () => !this.IsCaptured,
            Disabled: () => (this.Saving || this.Capturing ? 'Saving…' : false),
            OnClick: async () => this.SaveAsDraft(),
        });

        this.RegisterToolbarItem({
            Key: 'capture-payment-toolbar',
            Text: 'Capture & Book',
            Icon: 'fa-solid fa-check-double',
            Variant: 'primary',
            Mode: 'both',
            Order: 6,
            Visible: () => !this.IsCaptured,
            Disabled: () => {
                if (this.Capturing) return 'Capturing & booking…';
                if (!this.record?.Amount || this.record.Amount <= 0) return 'Payment amount must be greater than zero.';
                if (!this.hasPayer) return 'Choose who is paying (Bill-To customer).';
                if (!this.IsAllocationBalanced) return `Allocations do not tie: $${Math.abs(this.UnallocatedRemainder).toFixed(2)} ${this.UnallocatedRemainder > 0 ? 'unallocated remaining' : 'over-allocated'}.`;
                return false;
            },
            OnClick: async () => this.CapturePayment(),
        });

        this.cdr?.detectChanges?.();
    }

    public SelectTab(key: string): void {
        this.ActiveTab = key as 'payment' | 'accounting' | 'details' | 'related';
        UserInfoEngine.Instance.SetSettingDebounced(PAYMENT_TAB_SETTING, key);
        if (key === 'accounting') {
            void this.loadPaymentJournalRollup();
        }
    }

    public get ComposeMode(): boolean {
        if (!this.record) return false;
        if (this.IsCaptured) return false;
        return !this.record.IsSaved || this.EditMode;
    }

    public ngDoCheck(): void {
        const currentKey = `${this.record?.BillToOrganizationID || ''}|${this.record?.BillToPersonID || ''}`;
        if (currentKey !== this.lastLoadedCustomerKey) {
            this.lastLoadedCustomerKey = currentKey;
            void this.loadOpenOrdersForCustomer();
        }
    }

    // ── Payment Facts & Status Getters ──────────────────────────────────────

    public get IsCaptured(): boolean {
        const status = this.record?.Status;
        return status === 'Captured' || status === 'Refunded';
    }

    public get IsReversal(): boolean {
        return Boolean(this.record?.ReversesPaymentHeaderID || (this.record?.Amount != null && this.record.Amount < 0) || this.record?.ProviderRefundID);
    }

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

    public get FormattedGrossAmount(): string {
        if (this.record?.Amount == null) return '$0.00';
        return FormatMoney(this.record.Amount);
    }

    public get FormattedFee(): string {
        if (this.record?.ProcessingFeeAmount == null) return '$0.00';
        return FormatMoney(this.record.ProcessingFeeAmount);
    }

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

    public get hasPayer(): boolean {
        return Boolean(this.record?.BillToOrganizationID || this.record?.BillToPersonID);
    }

    public get PayerDisplayName(): string {
        return this.record?.BillToOrganization || this.record?.BillToPerson || (this.hasPayer ? 'Customer Selected' : 'Choose who pays');
    }

    public get PayerSubtext(): string {
        const parts = [this.record?.BillToOrganization, this.record?.BillToPerson].filter(Boolean);
        if (parts.length > 1) return `Bill-To Person: ${this.record.BillToPerson}`;
        return this.hasPayer ? 'Payer confirmed' : 'Select an organization or person';
    }

    public get HeaderSubtitle(): string {
        const dateStr = this.record?.PaymentDate ? FormatDate(this.record.PaymentDate) : '';
        const tenderStr = this.record?.PaymentType || 'Direct Payment';
        const parts = [dateStr, tenderStr, this.PayerDisplayName !== 'Choose who pays' ? this.PayerDisplayName : ''].filter(Boolean);
        return parts.join(' · ') || 'New payment entry and order allocation';
    }

    // ── Payment Detail & Instrument Accessors ───────────────────────────────

    public get SelectedPaymentType(): mjBizAppsOrdersPaymentTypeEntity | undefined {
        if (!this.record?.PaymentTypeID) return undefined;
        return this.PaymentTypes.find(t => UUIDsEqual(t.ID, this.record?.PaymentTypeID));
    }

    public get PaymentTypeCode(): string {
        const type = this.SelectedPaymentType;
        if (type?.Code) return type.Code.toLowerCase();
        const name = (type?.Name || this.record?.PaymentType || '').toLowerCase();
        if (name.includes('check')) return 'check';
        if (name.includes('card') || name.includes('credit') || name.includes('debit')) return 'card';
        if (name.includes('ach') || name.includes('bank') || name.includes('direct debit')) return 'ach';
        if (name.includes('wire')) return 'wire';
        return '';
    }

    public get RequiresReference(): boolean {
        return Boolean(this.SelectedPaymentType?.RequiresReference || this.PaymentTypeCode === 'check' || this.PaymentTypeCode === 'wire' || this.PaymentTypeCode === 'ach');
    }

    public get RequiresInstrument(): boolean {
        return Boolean(this.SelectedPaymentType?.RequiresInstrument || this.PaymentTypeCode === 'card' || this.PaymentTypeCode === 'ach');
    }

    public EnsurePaymentDetail(): mjBizAppsOrdersPaymentDetailEntity | null {
        if (!this.record) return null;
        const detail = this.record.PaymentDetailID_EnsureObject();
        if (!detail.CompanyID && this.record.ReceivingCompanyID) {
            detail.CompanyID = this.record.ReceivingCompanyID;
        }
        if (!detail.PaymentTypeID && this.record.PaymentTypeID) {
            detail.PaymentTypeID = this.record.PaymentTypeID;
        }
        return detail;
    }

    public isPaymentDetailEmpty(detail: mjBizAppsOrdersPaymentDetailEntity): boolean {
        return (
            !detail.ReferenceNumber?.trim() &&
            !detail.Brand?.trim() &&
            !detail.Last4?.trim() &&
            !detail.HolderName?.trim() &&
            !detail.BankName?.trim() &&
            !detail.RoutingLast4?.trim() &&
            !detail.AccountLast4?.trim() &&
            !detail.BankAccountType &&
            !detail.ExpiryMonth &&
            !detail.ExpiryYear &&
            !detail.Notes?.trim() &&
            !detail.ProviderInstrumentRef?.trim() &&
            !detail.ProviderCustomerRef?.trim() &&
            !detail.StoredValueAccountID
        );
    }

    public get ReferenceNumber(): string {
        return this.record?.PaymentDetailID_Object?.ReferenceNumber ?? '';
    }
    public set ReferenceNumber(val: string) {
        const trimmed = (val ?? '').trim();
        if (trimmed) {
            const detail = this.EnsurePaymentDetail();
            if (detail) detail.ReferenceNumber = trimmed;
        } else if (this.record?.PaymentDetailID_Object) {
            this.record.PaymentDetailID_Object.ReferenceNumber = null;
            if (this.isPaymentDetailEmpty(this.record.PaymentDetailID_Object)) {
                this.record.ClearPaymentDetail();
            }
        }
    }

    public get InstrumentDateInput(): string {
        const d = this.record?.PaymentDetailID_Object?.InstrumentDate;
        if (!d) return '';
        return new Date(d).toISOString().split('T')[0];
    }
    public set InstrumentDateInput(val: string) {
        if (val) {
            const detail = this.EnsurePaymentDetail();
            if (detail) detail.InstrumentDate = new Date(val);
        } else if (this.record?.PaymentDetailID_Object) {
            this.record.PaymentDetailID_Object.InstrumentDate = null;
            if (this.isPaymentDetailEmpty(this.record.PaymentDetailID_Object)) {
                this.record.ClearPaymentDetail();
            }
        }
    }

    public get CardBrand(): string {
        return this.record?.PaymentDetailID_Object?.Brand ?? '';
    }
    public set CardBrand(val: string) {
        const trimmed = (val ?? '').trim();
        if (trimmed) {
            const detail = this.EnsurePaymentDetail();
            if (detail) detail.Brand = trimmed;
        } else if (this.record?.PaymentDetailID_Object) {
            this.record.PaymentDetailID_Object.Brand = null;
            if (this.isPaymentDetailEmpty(this.record.PaymentDetailID_Object)) {
                this.record.ClearPaymentDetail();
            }
        }
    }

    public get CardLast4(): string {
        return this.record?.PaymentDetailID_Object?.Last4 ?? '';
    }
    public set CardLast4(val: string) {
        const trimmed = (val ?? '').trim().slice(-4);
        if (trimmed) {
            const detail = this.EnsurePaymentDetail();
            if (detail) detail.Last4 = trimmed;
        } else if (this.record?.PaymentDetailID_Object) {
            this.record.PaymentDetailID_Object.Last4 = null;
            if (this.isPaymentDetailEmpty(this.record.PaymentDetailID_Object)) {
                this.record.ClearPaymentDetail();
            }
        }
    }

    public get CardHolderName(): string {
        return this.record?.PaymentDetailID_Object?.HolderName ?? '';
    }
    public set CardHolderName(val: string) {
        const trimmed = (val ?? '').trim();
        if (trimmed) {
            const detail = this.EnsurePaymentDetail();
            if (detail) detail.HolderName = trimmed;
        } else if (this.record?.PaymentDetailID_Object) {
            this.record.PaymentDetailID_Object.HolderName = null;
            if (this.isPaymentDetailEmpty(this.record.PaymentDetailID_Object)) {
                this.record.ClearPaymentDetail();
            }
        }
    }

    public get CardExpMonth(): number | null {
        return this.record?.PaymentDetailID_Object?.ExpiryMonth ?? null;
    }
    public set CardExpMonth(val: number | string | null) {
        const num = val != null && val !== '' ? Number(val) : null;
        if (num && num >= 1 && num <= 12) {
            const detail = this.EnsurePaymentDetail();
            if (detail) detail.ExpiryMonth = num;
        } else if (this.record?.PaymentDetailID_Object) {
            this.record.PaymentDetailID_Object.ExpiryMonth = null;
            if (this.isPaymentDetailEmpty(this.record.PaymentDetailID_Object)) {
                this.record.ClearPaymentDetail();
            }
        }
    }

    public get CardExpYear(): number | null {
        return this.record?.PaymentDetailID_Object?.ExpiryYear ?? null;
    }
    public set CardExpYear(val: number | string | null) {
        const num = val != null && val !== '' ? Number(val) : null;
        if (num && num >= 2020) {
            const detail = this.EnsurePaymentDetail();
            if (detail) detail.ExpiryYear = num;
        } else if (this.record?.PaymentDetailID_Object) {
            this.record.PaymentDetailID_Object.ExpiryYear = null;
            if (this.isPaymentDetailEmpty(this.record.PaymentDetailID_Object)) {
                this.record.ClearPaymentDetail();
            }
        }
    }

    public get BankName(): string {
        return this.record?.PaymentDetailID_Object?.BankName ?? '';
    }
    public set BankName(val: string) {
        const trimmed = (val ?? '').trim();
        if (trimmed) {
            const detail = this.EnsurePaymentDetail();
            if (detail) detail.BankName = trimmed;
        } else if (this.record?.PaymentDetailID_Object) {
            this.record.PaymentDetailID_Object.BankName = null;
            if (this.isPaymentDetailEmpty(this.record.PaymentDetailID_Object)) {
                this.record.ClearPaymentDetail();
            }
        }
    }

    public get BankAccountType(): 'Checking' | 'Savings' | null {
        return this.record?.PaymentDetailID_Object?.BankAccountType ?? null;
    }
    public set BankAccountType(val: 'Checking' | 'Savings' | '' | null) {
        if (val === 'Checking' || val === 'Savings') {
            const detail = this.EnsurePaymentDetail();
            if (detail) detail.BankAccountType = val;
        } else if (this.record?.PaymentDetailID_Object) {
            this.record.PaymentDetailID_Object.BankAccountType = null;
            if (this.isPaymentDetailEmpty(this.record.PaymentDetailID_Object)) {
                this.record.ClearPaymentDetail();
            }
        }
    }

    public get RoutingLast4(): string {
        return this.record?.PaymentDetailID_Object?.RoutingLast4 ?? '';
    }
    public set RoutingLast4(val: string) {
        const trimmed = (val ?? '').trim().slice(-4);
        if (trimmed) {
            const detail = this.EnsurePaymentDetail();
            if (detail) detail.RoutingLast4 = trimmed;
        } else if (this.record?.PaymentDetailID_Object) {
            this.record.PaymentDetailID_Object.RoutingLast4 = null;
            if (this.isPaymentDetailEmpty(this.record.PaymentDetailID_Object)) {
                this.record.ClearPaymentDetail();
            }
        }
    }

    public get AccountLast4(): string {
        return this.record?.PaymentDetailID_Object?.AccountLast4 ?? '';
    }
    public set AccountLast4(val: string) {
        const trimmed = (val ?? '').trim().slice(-4);
        if (trimmed) {
            const detail = this.EnsurePaymentDetail();
            if (detail) detail.AccountLast4 = trimmed;
        } else if (this.record?.PaymentDetailID_Object) {
            this.record.PaymentDetailID_Object.AccountLast4 = null;
            if (this.isPaymentDetailEmpty(this.record.PaymentDetailID_Object)) {
                this.record.ClearPaymentDetail();
            }
        }
    }

    public OnPaymentTypeSelected(paymentTypeID: string | null): void {
        if (!this.record) return;
        this.record.PaymentTypeID = paymentTypeID || '';
        if (paymentTypeID && this.record.PaymentDetailID_Object) {
            this.record.PaymentDetailID_Object.PaymentTypeID = paymentTypeID;
        }
        this.cdr?.detectChanges?.();
    }

    // ── Payment Inputs & Changes ────────────────────────────────────────────

    public OnAmountChanged(val: number | string): void {
        if (!this.record) return;
        this.AmountManuallySet = true;
        const num = typeof val === 'number' ? val : parseFloat(val) || 0;
        this.record.Amount = num;
        this.record.NetAmount = Math.max(0, num - (this.record.ProcessingFeeAmount || 0));
        this.cdr?.detectChanges?.();
    }

    public OnFeeChanged(val: number | string): void {
        if (!this.record) return;
        this.record.ProcessingFeeAmount = typeof val === 'number' ? val : parseFloat(val) || 0;
        this.record.NetAmount = Math.max(0, (this.record.Amount || 0) - this.record.ProcessingFeeAmount);
        this.cdr?.detectChanges?.();
    }

    public get PaymentDateInput(): string {
        if (!this.record?.PaymentDate) return '';
        const d = new Date(this.record.PaymentDate);
        return d.toISOString().split('T')[0];
    }

    public set PaymentDateInput(val: string) {
        if (!this.record) return;
        this.record.PaymentDate = val ? new Date(val) : new Date();
    }

    public async OnPayerSelectionChanged(): Promise<void> {
        const currentKey = `${this.record?.BillToOrganizationID || ''}:${this.record?.BillToPersonID || ''}`;
        if (currentKey !== this.lastLoadedCustomerKey) {
            this.lastLoadedCustomerKey = currentKey;
            await this.loadOpenOrdersForCustomer();
        }
    }

    // ── GL Books Impact Breakdown ───────────────────────────────────────────

    public get ReceivingCompanyName(): string {
        if (!this.record?.ReceivingCompanyID) return 'Primary Company';
        const found = this.SellingCompanies.find(c => UUIDsEqual(c.ID, this.record.ReceivingCompanyID));
        return found?.Name || this.record.ReceivingCompanyID;
    }

    // ── Allocation Matrix & Workbench Methods ───────────────────────────────

    public get FilteredOpenOrders(): mjBizAppsOrdersOrderHeaderEntity[] {
        const q = (this.SearchQuery || '').trim().toLowerCase();
        if (!q) return this.OpenOrders;
        return this.OpenOrders.filter(
            (o) =>
                (o.OrderNumber && o.OrderNumber.toLowerCase().includes(q)) ||
                (o.Description && o.Description.toLowerCase().includes(q)) ||
                (o.Company && o.Company.toLowerCase().includes(q))
        );
    }

    public async loadOpenOrdersForCustomer(): Promise<void> {
        const orgID = this.record?.BillToOrganizationID;
        const personID = this.record?.BillToPersonID;

        this.LoadingOpenOrders = true;
        this.AllocationError = null;
        this.cdr?.detectChanges?.();

        try {
            const orders = await GetOrders({
                BillToOrganizationID: orgID ?? undefined,
                BillToPersonID: personID ?? undefined,
                Preset: 'unpaid',
                MaxRows: 100,
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
            this.AllocationError = err instanceof Error ? err.message : 'Failed to load open orders';
        } finally {
            this.LoadingOpenOrders = false;
            this.cdr?.detectChanges?.();
        }
    }

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
        if (!this.OrderLinesMap) return [];
        return this.OrderLinesMap.get(orderID.toLowerCase()) || this.OrderLinesMap.get(orderID) || [];
    }

    public GetTotalLineAllocationsForOrder(orderID: string): number {
        const lines = this.GetOrderLines(orderID);
        let sum = 0;
        for (const l of lines) {
            if (l.ID) {
                sum += (this.LineAllocations || {})[l.ID.toLowerCase()] ?? 0;
            }
        }
        return Math.round(sum * 100) / 100;
    }

    public HasLineAllocations(orderID: string): boolean {
        return this.GetTotalLineAllocationsForOrder(orderID) > 0;
    }

    public GetEffectiveOrderAllocation(orderID: string): number {
        const key = (orderID || '').toLowerCase();
        if (this.HasLineAllocations(key)) {
            return this.GetTotalLineAllocationsForOrder(key);
        }
        return (this.OrderAllocations || {})[key] ?? 0;
    }

    public GetOrderAllocation(orderID: string): number {
        return this.GetEffectiveOrderAllocation(orderID);
    }

    public GetLineAllocation(orderLineID: string): number {
        return (this.LineAllocations || {})[orderLineID.toLowerCase()] ?? 0;
    }

    public SetOrderAllocation(orderID: string, value: string | number): void {
        const key = (orderID || '').toLowerCase();
        if (this.HasLineAllocations(key)) return;

        const amount = typeof value === 'number' ? value : parseFloat(value) || 0;
        if (!this.OrderAllocations) this.OrderAllocations = {};
        this.OrderAllocations[key] = Math.max(0, amount);

        if (this.record && !this.record.BillToOrganizationID && !this.record.BillToPersonID && this.OpenOrders) {
            const order = this.OpenOrders.find(o => UUIDsEqual(o.ID, orderID));
            if (order) {
                if (order.BillToOrganizationID) this.record.BillToOrganizationID = order.BillToOrganizationID;
                if (order.BillToPersonID) this.record.BillToPersonID = order.BillToPersonID;
            }
        }

        if (!this.AmountManuallySet && this.record) {
            this.record.Amount = this.TotalAllocated;
            this.record.NetAmount = Math.max(0, (this.record.Amount || 0) - (this.record.ProcessingFeeAmount || 0));
        }

        this.cdr?.detectChanges?.();
    }

    public SetLineAllocation(orderLineID: string, value: string | number, parentOrderID?: string): void {
        const key = (orderLineID || '').toLowerCase();
        const amount = typeof value === 'number' ? value : parseFloat(value) || 0;
        if (!this.LineAllocations) this.LineAllocations = {};
        this.LineAllocations[key] = Math.max(0, amount);

        let pID = parentOrderID;
        if (!pID && this.OrderLinesMap) {
            for (const [oID, lines] of this.OrderLinesMap.entries()) {
                if (lines.some(l => (l.ID || '').toLowerCase() === key)) {
                    pID = oID;
                    break;
                }
            }
        }

        if (pID) {
            if (!this.OrderAllocations) this.OrderAllocations = {};
            this.OrderAllocations[pID.toLowerCase()] = 0;
            if (this.record && !this.record.BillToOrganizationID && !this.record.BillToPersonID && this.OpenOrders) {
                const order = this.OpenOrders.find(o => UUIDsEqual(o.ID, pID));
                if (order) {
                    if (order.BillToOrganizationID) this.record.BillToOrganizationID = order.BillToOrganizationID;
                    if (order.BillToPersonID) this.record.BillToPersonID = order.BillToPersonID;
                }
            }
        }

        if (!this.AmountManuallySet && this.record) {
            this.record.Amount = this.TotalAllocated;
            this.record.NetAmount = Math.max(0, (this.record.Amount || 0) - (this.record.ProcessingFeeAmount || 0));
        }

        this.cdr?.detectChanges?.();
    }

    public FullPayOrder(order: mjBizAppsOrdersOrderHeaderEntity): void {
        if (!order.ID) return;
        const key = order.ID.toLowerCase();
        const lines = this.GetOrderLines(key);
        for (const l of lines) {
            if (l.ID) {
                delete this.LineAllocations[l.ID.toLowerCase()];
            }
        }
        const openBal = Math.max(0, order.Balance ?? order.TotalGross ?? 0);
        this.SetOrderAllocation(order.ID, openBal);
    }

    public FullPayLine(order: mjBizAppsOrdersOrderHeaderEntity, line: mjBizAppsOrdersOrderLineEntity): void {
        if (!line.ID) return;
        const lineGross = Math.max(0, line.LineTotalGross ?? (line.UnitPrice || 0) * (line.Quantity || 1));
        this.SetLineAllocation(line.ID, lineGross, order.ID);
    }

    public get TotalAllocated(): number {
        let total = 0;
        const openOrders = this.OpenOrders || [];
        for (const order of openOrders) {
            if (order.ID) {
                total += this.GetEffectiveOrderAllocation(order.ID);
            }
        }
        const openOrderKeys = new Set(openOrders.map(o => (o.ID || '').toLowerCase()));
        for (const [orderID, amt] of Object.entries(this.OrderAllocations || {})) {
            if (!openOrderKeys.has(orderID)) {
                total += amt;
            }
        }
        for (const [lineID, amt] of Object.entries(this.LineAllocations || {})) {
            let lineFound = false;
            if (this.OrderLinesMap) {
                for (const lines of this.OrderLinesMap.values()) {
                    if (lines.some(l => (l.ID || '').toLowerCase() === lineID)) {
                        lineFound = true;
                        break;
                    }
                }
            }
            if (!lineFound) {
                total += amt;
            }
        }
        return Math.round(total * 100) / 100;
    }

    public get UnallocatedRemainder(): number {
        const gross = this.record?.Amount ?? 0;
        return Math.round((gross - this.TotalAllocated) * 100) / 100;
    }

    public get IsAllocationBalanced(): boolean {
        return Math.abs(this.UnallocatedRemainder) < 0.005 && this.TotalAllocated > 0;
    }

    public AutoApplyOldestFirst(): void {
        this.OrderAllocations = {};
        this.LineAllocations = {};

        let remainingCash = this.record?.Amount ?? 0;
        if (remainingCash <= 0) return;

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

        if (remainingCash > 0 && sorted.length > 0 && sorted[0].ID) {
            const firstKey = sorted[0].ID.toLowerCase();
            const current = this.OrderAllocations[firstKey] ?? 0;
            this.OrderAllocations[firstKey] = Math.round((current + remainingCash) * 100) / 100;
        }

        this.cdr?.detectChanges?.();
    }

    public ClearAllocations(): void {
        this.OrderAllocations = {};
        this.LineAllocations = {};
        if (!this.AmountManuallySet && this.record) {
            this.record.Amount = 0;
            this.record.NetAmount = 0;
        }
        this.cdr?.detectChanges?.();
    }

    public CalculateLeavesBalance(order: mjBizAppsOrdersOrderHeaderEntity): number {
        const baseBal = order.Balance ?? order.TotalGross ?? 0;
        const applied = this.GetEffectiveOrderAllocation(order.ID || '');
        return Math.max(0, Math.round((baseBal - applied) * 100) / 100);
    }

    public FormatOrderDueDate(order: mjBizAppsOrdersOrderHeaderEntity): string {
        if (!order.DueDate) return '—';
        return FormatDate(order.DueDate);
    }

    public GetOrderDaysOverdue(order: mjBizAppsOrdersOrderHeaderEntity): number {
        if (!order.DueDate) return 0;
        const due = new Date(order.DueDate).getTime();
        const now = Date.now();
        if (now <= due) return 0;
        return Math.floor((now - due) / (1000 * 60 * 60 * 24));
    }

    public OpenOrderRecord(order: mjBizAppsOrdersOrderHeaderEntity, event: MouseEvent): void {
        event.stopPropagation();
        if (order.ID && this.navigationService) {
            this.navigationService.OpenEntityRecord(MJO_ENTITIES.OrderHeader, CompositeKey.FromID(order.ID));
        }
    }

    public async SyncAllocationsToRecord(): Promise<void> {
        if (!this.record?.Lines) return;

        if (this.record.IsSaved && !this.record.Lines.IsLoaded) {
            await this.record.Lines.Load();
        }

        const activeOrderAllocs = new Map<string, number>();
        for (const [orderID, amount] of Object.entries(this.OrderAllocations)) {
            if (amount > 0 && !this.HasLineAllocations(orderID)) {
                activeOrderAllocs.set(orderID.toLowerCase(), amount);
            }
        }

        const activeLineAllocs = new Map<string, number>();
        for (const [lineID, amount] of Object.entries(this.LineAllocations)) {
            if (amount > 0) {
                activeLineAllocs.set(lineID.toLowerCase(), amount);
            }
        }

        for (const item of [...this.record.Lines.Items]) {
            if (item.BookedAt) continue;

            if (item.OrderLineID) {
                const key = item.OrderLineID.toLowerCase();
                if (activeLineAllocs.has(key)) {
                    item.Amount = activeLineAllocs.get(key)!;
                    activeLineAllocs.delete(key);
                } else {
                    this.record.Lines.Remove(item);
                }
            } else if (item.OrderHeaderID) {
                const key = item.OrderHeaderID.toLowerCase();
                if (activeOrderAllocs.has(key)) {
                    item.Amount = activeOrderAllocs.get(key)!;
                    activeOrderAllocs.delete(key);
                } else {
                    this.record.Lines.Remove(item);
                }
            } else {
                this.record.Lines.Remove(item);
            }
        }

        for (const [orderID, amount] of activeOrderAllocs.entries()) {
            const line = await this.record.Lines.Create();
            line.OrderHeaderID = orderID;
            line.OrderLineID = null;
            line.Amount = amount;
            line.AllocatedAt = new Date();
        }

        for (const [orderLineID, amount] of activeLineAllocs.entries()) {
            let parentOrderID: string | undefined;
            for (const [ordID, lines] of this.OrderLinesMap.entries()) {
                if (lines.some((l) => l.ID?.toLowerCase() === orderLineID)) {
                    parentOrderID = ordID;
                    break;
                }
            }

            const line = await this.record.Lines.Create();
            line.OrderLineID = orderLineID;
            if (parentOrderID) {
                line.OrderHeaderID = parentOrderID;
            }
            line.Amount = amount;
            line.AllocatedAt = new Date();
        }
    }

    // ── Save & Capture Execution ────────────────────────────────────────────

    public async SaveAsDraft(): Promise<void> {
        if (this.Saving || this.Capturing) return;
        this.Saving = true;
        this.AllocationError = null;
        this.CaptureError = null;
        try {
            this.record.Status = 'Pending';
            await this.SyncAllocationsToRecord();
            await this.SaveRecord(false);
        } catch (err) {
            this.AllocationError = err instanceof Error ? err.message : String(err);
        } finally {
            this.Saving = false;
            this.cdr?.detectChanges?.();
        }
    }

    public async CapturePayment(): Promise<void> {
        if (this.Capturing || this.Saving) return;
        this.Capturing = true;
        this.CaptureError = null;
        this.AllocationError = null;

        try {
            if (!this.record.Amount || this.record.Amount <= 0) {
                throw new Error('Payment amount must be greater than zero.');
            }
            if (!this.hasPayer) {
                throw new Error('Please select who is paying (Bill-To Customer) before capturing.');
            }
            if (!this.IsAllocationBalanced) {
                throw new Error(
                    `Allocations must exactly match payment amount. Remainder: $${this.UnallocatedRemainder.toFixed(2)}`
                );
            }

            await this.SyncAllocationsToRecord();
            this.record.Status = 'Captured';

            const saved = await this.record.Save();
            if (!saved) {
                throw new Error(this.record.LatestResult?.Message || 'Failed to capture and book payment.');
            }

            this.ActiveTab = 'accounting';
            await this.loadPaymentJournalRollup();
        } catch (err) {
            this.CaptureError = err instanceof Error ? err.message : String(err);
        } finally {
            this.Capturing = false;
            this.cdr?.detectChanges?.();
        }
    }

    // ── Accounting Journal Rollup ───────────────────────────────────────────

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

    // ── Reference Data Loaders ──────────────────────────────────────────────

    private async loadPaymentTypes(): Promise<void> {
        try {
            this.PaymentTypes = await GetPaymentTypes(this.ProviderToUse?.CurrentUser);
        } catch {
            this.PaymentTypes = [];
        }
    }

    private async loadSellingCompanies(): Promise<void> {
        try {
            this.SellingCompanies = await GetSellingCompanies(this.ProviderToUse?.CurrentUser);
        } catch {
            this.SellingCompanies = [];
        }
    }
}

/** Tree-shaking prevention anchor function */
export function LoadPaymentHeaderFormComponent(): void {
    // Anchors BizAppsPaymentHeaderFormComponent in bundlers
}
