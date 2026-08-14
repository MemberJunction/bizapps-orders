import { Component } from '@angular/core';
import { CompositeKey } from '@memberjunction/core';
import type { RunViewParams } from '@memberjunction/core';
import { UserInfoEngine } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import type { TabConfig } from '@memberjunction/ng-ui-components';
import { OrderHeaderEntity } from '@mj-biz-apps/orders-entities';
import { MJO_COMMON_ENTITIES, MJO_ENTITIES } from '../../data/entity-names';
import { GetSellingCompanies, JournalEntryViewParams, SubscriptionViewParams } from '../../data/orders-queries';
import { FormatMoney } from '../../panels/money-format';
import { mjBizAppsOrdersOrderHeaderFormComponent } from '../../generated/Entities/mjBizAppsOrdersOrderHeader/mjbizappsordersorderheader.form.component';
import type { MJOPricingState } from '../../services/pricing-scheduler.service';

/** Tabs that exist while the order is still being composed. */
export type OrderFormNewTab = 'payment' | 'details';

/** Extra tabs that only have data after the order exists. */
export type OrderFormSavedTab = 'charges' | 'accounting' | 'subs';

export type OrderFormContextTab = OrderFormNewTab | OrderFormSavedTab;

export type OrderFormParty = 'bill' | 'ship';

const CONTEXT_TAB_SETTING = 'mj.orders.orderForm.contextTab';
const EXPANDED_PARTY_SETTING = 'mj.orders.orderForm.expandedParty';

export const ORDER_FORM_NEW_TABS: TabConfig[] = [
    { key: 'payment', label: 'Payment', icon: 'fa-solid fa-money-check-dollar' },
    { key: 'details', label: 'Details', icon: 'fa-solid fa-sliders' },
];

export const ORDER_FORM_SAVED_TABS: TabConfig[] = [
    { key: 'charges', label: 'Charges', icon: 'fa-solid fa-receipt' },
    { key: 'accounting', label: 'Accounting', icon: 'fa-solid fa-book' },
    { key: 'subs', label: 'Subscriptions', icon: 'fa-solid fa-rotate' },
];

/** Header tabs for a new vs saved order. Charges / journals / subs are confirm-side. */
export function OrderFormTabs(saved: boolean): TabConfig[] {
    return saved ? [...ORDER_FORM_NEW_TABS, ...ORDER_FORM_SAVED_TABS] : [...ORDER_FORM_NEW_TABS];
}

/**
 * Custom Order Header form — one surface for composing and editing an order.
 *
 * Lines are children of the header (`Lines.Create`) and save with it. There is
 * no "save first" step. Bill-to / ship-to are header bubbles. Extra fields live
 * on Details. Charges / accounting / subscriptions appear after save.
 */
@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Order Headers')
@Component({
    standalone: false,
    selector: 'bizapps-order-header-form',
    templateUrl: './order-header-form.component.html',
    styleUrls: ['./order-header-form.component.css'],
})
export class BizAppsOrderHeaderFormComponent extends mjBizAppsOrdersOrderHeaderFormComponent {
    public declare record: OrderHeaderEntity;

    public ActiveTab: OrderFormContextTab | null = null;
    public ExpandedParty: OrderFormParty | null = null;
    public Pricing: MJOPricingState = { Result: null, Loading: false, Error: null };

    public get ContextTabs(): TabConfig[] {
        return OrderFormTabs(!!this.record?.IsSaved);
    }

    override async ngOnInit(): Promise<void> {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'mJBizAppsOrdersOrderLines', sectionName: 'Lines', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
        ]);
        this.restorePrefs();
        this.clampPrefsToVisibleTabs();
        if (!this.record?.IsSaved) {
            // Compose the order, don't reopen last session's payment pane over the catalog.
            this.ActiveTab = null;
            this.ExpandedParty = null;
        }
        await this.ensureLinesLoaded();
        await this.defaultSellingCompany();
        this.cdr.detectChanges();
    }

    public SelectTab(key: string): void {
        if (!this.isVisibleTab(key)) return;
        this.ActiveTab = this.ActiveTab === key ? null : key;
        UserInfoEngine.Instance.SetSettingDebounced(CONTEXT_TAB_SETTING, this.ActiveTab ?? '');
    }

    public ToggleParty(party: OrderFormParty): void {
        this.ExpandedParty = this.ExpandedParty === party ? null : party;
        UserInfoEngine.Instance.SetSettingDebounced(EXPANDED_PARTY_SETTING, this.ExpandedParty ?? '');
    }

    public JumpToBill(): void {
        this.ExpandedParty = 'bill';
    }

    public get HeaderTitle(): string {
        return this.record?.OrderNumber || 'New order';
    }

    public get HeaderSubtitle(): string {
        const bits = [
            this.record?.BillToOrganization || this.record?.BillToPerson,
            this.record?.Company,
        ].filter((value): value is string => !!value);
        if (bits.length) return bits.join(' · ');
        return this.record?.IsSaved ? '' : 'Who is buying, and what';
    }

    public get ShowStatusChip(): boolean {
        return !!this.record?.IsSaved;
    }

    public get StatusChipClass(): string {
        switch (this.record?.Status) {
            case 'Confirmed':
            case 'Posted':
            case 'Fulfilled':
                return 'mjo-oh-chip mjo-oh-chip--ok';
            case 'Voided':
                return 'mjo-oh-chip mjo-oh-chip--void';
            default:
                return 'mjo-oh-chip';
        }
    }

    public get BillToName(): string {
        return this.record?.BillToOrganization || this.record?.BillToPerson || 'Choose who pays';
    }

    public get BillToDetail(): string {
        const bits = [this.record?.BillToPerson, this.record?.PaymentTermsType, this.record?.BillToAddress]
            .filter((value): value is string => !!value);
        return bits.length ? bits.join(' · ') : 'Person or organization';
    }

    public get ShipToName(): string {
        if (!this.record) return 'Same as bill to';
        return this.record.ShipToOrganization || this.record.ShipToPerson || 'Same as bill to';
    }

    public get ShipToDetail(): string {
        return this.record?.ShipToAddress || 'Header default — override when it ships elsewhere';
    }

    public get ShipToIsSame(): boolean {
        if (!this.record) return true;
        return !this.record.ShipToOrganizationID && !this.record.ShipToPersonID && !this.record.ShipToAddressID;
    }

    public get hasBillTo(): boolean {
        return !!(this.record?.BillToOrganizationID || this.record?.BillToPersonID);
    }

    public get NeedsBillTo(): boolean {
        return !this.hasBillTo;
    }

    public get NeedsLine(): boolean {
        return (this.record?.Lines.Items.length ?? 0) === 0;
    }

    public get LineBadge(): number | undefined {
        const count = this.record?.Lines.Items.length ?? 0;
        return count > 0 ? count : undefined;
    }

    public get TotalLabel(): string {
        return this.record?.IsSaved ? 'Total' : 'Subtotal';
    }

    public Money(kind: 'total' | 'paid' | 'balance'): string {
        if (kind === 'paid') {
            if (!this.record?.IsSaved) return '—';
            return FormatMoney(this.record.AmountPaid);
        }
        if (kind === 'balance') {
            if (!this.record?.IsSaved) return '—';
            return FormatMoney(this.record.Balance);
        }
        const preview = this.Pricing.Result?.Totals;
        if (preview) return FormatMoney(this.record?.IsSaved ? preview.GrossTotal : preview.NetTotal);
        if (!this.record?.IsSaved) return this.Pricing.Loading ? '…' : '—';
        return FormatMoney(this.record.TotalGross);
    }

    public OnPricingChanged(state: MJOPricingState): void {
        this.Pricing = state;
        this.cdr.detectChanges();
    }

    public OpenBillTo(event: Event): void {
        event.stopPropagation();
        if (this.record?.BillToOrganizationID) {
            this.openRecord(MJO_COMMON_ENTITIES.Organization, this.record.BillToOrganizationID);
            return;
        }
        if (this.record?.BillToPersonID) {
            this.openRecord(MJO_COMMON_ENTITIES.Person, this.record.BillToPersonID);
        }
    }

    public OpenShipTo(event: Event): void {
        event.stopPropagation();
        if (this.record?.ShipToOrganizationID) {
            this.openRecord(MJO_COMMON_ENTITIES.Organization, this.record.ShipToOrganizationID);
            return;
        }
        if (this.record?.ShipToPersonID) {
            this.openRecord(MJO_COMMON_ENTITIES.Person, this.record.ShipToPersonID);
            return;
        }
        this.OpenBillTo(event);
    }

    public OpenProduct(id: string): void {
        this.openRecord(MJO_ENTITIES.Product, id);
    }

    public get PaymentParams(): RunViewParams | null {
        if (!this.record?.IsSaved) return null;
        return this.BuildRelationshipViewParamsByEntityName(MJO_ENTITIES.PaymentDetail, 'SourceOrderHeaderID');
    }

    public get ChargeParams(): RunViewParams | null {
        if (!this.record?.IsSaved) return null;
        return this.BuildRelationshipViewParamsByEntityName(MJO_ENTITIES.OrderCharge, 'OrderHeaderID');
    }

    public get JournalParams(): RunViewParams | null {
        return JournalEntryViewParams(this.lineIDs);
    }

    public get SubscriptionParams(): RunViewParams | null {
        return SubscriptionViewParams(this.lineIDs);
    }

    private get lineIDs(): string[] {
        if (!this.record?.Lines?.IsLoaded) return [];
        return this.record.Lines.Items.map((line) => line.ID).filter((id): id is string => !!id);
    }

    private restorePrefs(): void {
        const tab = UserInfoEngine.Instance.GetSetting(CONTEXT_TAB_SETTING);
        if (tab && this.isVisibleTab(tab)) this.ActiveTab = tab;
        if (this.record?.IsSaved) {
            const party = UserInfoEngine.Instance.GetSetting(EXPANDED_PARTY_SETTING);
            if (party === 'bill' || party === 'ship') this.ExpandedParty = party;
        } else {
            this.ExpandedParty = null;
        }
    }

    private clampPrefsToVisibleTabs(): void {
        if (this.ActiveTab && !this.isVisibleTab(this.ActiveTab)) this.ActiveTab = null;
    }

    private isVisibleTab(key: string): key is OrderFormContextTab {
        return this.ContextTabs.some((tab) => tab.key === key);
    }

    private async ensureLinesLoaded(): Promise<void> {
        if (!this.record?.IsSaved || this.record.Lines.IsLoaded) return;
        await this.record.Lines.Load();
    }

    private async defaultSellingCompany(): Promise<void> {
        if (this.record?.IsSaved || this.record?.CompanyID) return;
        const companies = await GetSellingCompanies();
        if (companies.length === 0) return;
        this.record.CompanyID = companies[0].ID;
    }

    private openRecord(entityName: string, id: string): void {
        this.Navigate.emit({
            Kind: 'record',
            EntityName: entityName,
            PrimaryKey: CompositeKey.FromID(id),
        });
    }
}

/** Tree-shaking prevention anchor. */
export function LoadOrderHeaderFormComponent(): void {
    void BizAppsOrderHeaderFormComponent;
}
