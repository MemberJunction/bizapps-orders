import { Component, OnInit } from '@angular/core';
import { RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import type {
    mjBizAppsOrdersEntitlementGrantEntity,
    mjBizAppsOrdersPaymentHeaderEntity,
    mjBizAppsOrdersPaymentLineEntity,
    mjBizAppsOrdersPaymentProviderEntity,
    mjBizAppsOrdersPaymentTypeEntity,
    mjBizAppsOrdersStoredValueAccountEntity,
    mjBizAppsOrdersStoredValueTransactionEntity,
    mjBizAppsOrdersSubscriptionEntity,
    mjBizAppsOrdersSubscriptionEventEntity,
    mjBizAppsOrdersSubscriptionTermEntity,
} from '@mj-biz-apps/orders-entities';
import { MJO_ENTITIES } from '../data/entity-names';
import { FormatMoney } from '../panels/money-format';
import { FormatCoverageWindow, FormatShortDate, YesNo } from './document-form.helpers';
import type { MJOOverviewCard } from './overview-cards.component';
import { CountOverviewRows, LoadOverviewRows } from './overview-load';

const OVERVIEW_META = {
    slot: 'after-fields' as const,
    sortKey: 200,
    contributionKey: 'overview',
    inclusion: 'Primary' as const,
};

@Component({
    standalone: false,
    selector: 'mjo-payment-overview-panel',
    template: `
        @if (Record.IsSaved) {
            <mj-collapsible-panel SectionKey="overview" SectionName="Overview" Icon="fa-solid fa-chart-pie"
                [Form]="FormComponent" [FormContext]="FormContext" [DefaultExpanded]="true">
                <mjo-overview-cards [Cards]="Cards"></mjo-overview-cards>
            </mj-collapsible-panel>
        }
    `,
    styleUrls: ['./document-hero.css'],
})
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:PaymentHeaders:overview',
    metadata: { entity: 'MJ_BizApps_Orders: Payment Headers', ...OVERVIEW_META },
})
export class PaymentOverviewPanel extends BaseFormPanel<mjBizAppsOrdersPaymentHeaderEntity> implements OnInit {
    public Cards: MJOOverviewCard[] = [];

    public async ngOnInit(): Promise<void> {
        if (!this.Record?.IsSaved) return;
        const lines = await LoadOverviewRows<Pick<mjBizAppsOrdersPaymentLineEntity, 'OrderHeader' | 'Amount'>>(
            this.FormComponent.ProviderToUse,
            MJO_ENTITIES.PaymentLine,
            `PaymentHeaderID='${this.Record.ID}'`,
            ['OrderHeader', 'Amount'],
        );
        this.Cards = [
            {
                Title: 'Applied to',
                Icon: 'fa-solid fa-diagram-next',
                Headers: ['Order', 'Amount'],
                Rows: lines.map((l) => [l.OrderHeader || '—', FormatMoney(l.Amount)]),
            },
            {
                Title: 'Receipt',
                Icon: 'fa-solid fa-passport',
                Facts: [
                    { Label: 'Type', Value: this.Record.PaymentType || '—' },
                    { Label: 'Payer', Value: this.Record.BillToOrganization || this.Record.BillToPerson || '—' },
                    { Label: 'Company', Value: this.Record.ReceivingCompany || '—' },
                    { Label: 'Date', Value: FormatShortDate(this.Record.PaymentDate) || '—' },
                    { Label: 'Provider', Value: this.Record.PaymentProvider || '—' },
                    { Label: 'Status', Value: this.Record.Status || '—' },
                ],
            },
            {
                Title: 'Why header ≠ application',
                Icon: 'fa-solid fa-circle-info',
                Span: 2,
                Note: 'The header is the receipt. PaymentLine rows are how it was applied. One cheque, three invoices = one header, three lines. A refund is a new header that reverses this one — not a negative amount.',
            },
        ];
        this.FormComponent.cdr.detectChanges();
    }
}

@Component({
    standalone: false,
    selector: 'mjo-subscription-overview-panel',
    template: `
        @if (Record.IsSaved) {
            <mj-collapsible-panel SectionKey="overview" SectionName="Overview" Icon="fa-solid fa-chart-pie"
                [Form]="FormComponent" [FormContext]="FormContext" [DefaultExpanded]="true">
                <mjo-overview-cards [Cards]="Cards"></mjo-overview-cards>
            </mj-collapsible-panel>
        }
    `,
    styleUrls: ['./document-hero.css'],
})
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:Subscriptions:overview',
    metadata: { entity: 'MJ_BizApps_Orders: Subscriptions', ...OVERVIEW_META },
})
export class SubscriptionOverviewPanel extends BaseFormPanel<mjBizAppsOrdersSubscriptionEntity> implements OnInit {
    public Cards: MJOOverviewCard[] = [];

    public async ngOnInit(): Promise<void> {
        if (!this.Record?.IsSaved) return;
        const p = this.FormComponent.ProviderToUse;
        const [terms, grants, events] = await Promise.all([
            LoadOverviewRows<Pick<mjBizAppsOrdersSubscriptionTermEntity, 'TermNumber' | 'StartDate' | 'EndDate' | 'Amount' | 'Status' | 'IsProrated'>>(
                p, MJO_ENTITIES.SubscriptionTerm, `SubscriptionID='${this.Record.ID}'`,
                ['TermNumber', 'StartDate', 'EndDate', 'Amount', 'Status', 'IsProrated'],
            ),
            LoadOverviewRows<Pick<mjBizAppsOrdersEntitlementGrantEntity, 'Status' | 'BeneficiaryPerson' | 'ValidTo'>>(
                p, MJO_ENTITIES.EntitlementGrant, `SubscriptionID='${this.Record.ID}'`,
                ['Status', 'BeneficiaryPerson', 'ValidTo'],
            ),
            LoadOverviewRows<Pick<mjBizAppsOrdersSubscriptionEventEntity, 'EventType' | 'OccurredAt'>>(
                p, MJO_ENTITIES.SubscriptionEvent, `SubscriptionID='${this.Record.ID}'`,
                ['EventType', 'OccurredAt'],
            ),
        ]);
        const current = [...terms].sort((a, b) => b.TermNumber - a.TermNumber)[0];
        this.Cards = [
            {
                Title: 'Current term',
                Icon: 'fa-solid fa-clock-rotate-left',
                Facts: current
                    ? [
                        { Label: 'Term', Value: `#${current.TermNumber}` },
                        { Label: 'Window', Value: FormatCoverageWindow(current.StartDate, current.EndDate) },
                        { Label: 'Amount', Value: FormatMoney(current.Amount) },
                        { Label: 'Prorated', Value: YesNo(current.IsProrated) },
                        { Label: 'Status', Value: current.Status },
                    ]
                    : [{ Label: 'Terms', Value: 'None yet' }],
            },
            {
                Title: 'Holder & coverage',
                Icon: 'fa-solid fa-id-card',
                Facts: [
                    { Label: 'Holder', Value: this.Record.HolderOrganization || '—' },
                    { Label: 'Beneficiary', Value: this.Record.BeneficiaryPerson || '—' },
                    { Label: 'Product', Value: this.Record.Product || '—' },
                    { Label: 'Coverage', Value: FormatCoverageWindow(this.Record.StartDate, this.Record.EndDate) },
                    { Label: 'Auto-renew', Value: YesNo(this.Record.AutoRenew) },
                    { Label: 'Status', Value: this.Record.Status || '—' },
                ],
            },
            {
                Title: 'Grants',
                Icon: 'fa-solid fa-key',
                Items: grants.map((g) => ({
                    Title: g.BeneficiaryPerson || 'Grant',
                    Detail: g.ValidTo ? `Valid through ${FormatShortDate(g.ValidTo)}` : 'Open-ended',
                    Badge: g.Status,
                    BadgeKind: g.Status === 'Active' ? 'ok' : 'muted',
                })),
            },
            {
                Title: 'Events',
                Icon: 'fa-solid fa-bolt',
                Items: events.map((e) => ({
                    Title: e.EventType,
                    Detail: FormatShortDate(e.OccurredAt) || '',
                })),
            },
        ];
        this.FormComponent.cdr.detectChanges();
    }
}

@Component({
    standalone: false,
    selector: 'mjo-subscription-term-overview-panel',
    template: `
        @if (Record.IsSaved) {
            <mj-collapsible-panel SectionKey="overview" SectionName="Overview" Icon="fa-solid fa-chart-pie"
                [Form]="FormComponent" [FormContext]="FormContext" [DefaultExpanded]="true">
                <mjo-overview-cards [Cards]="Cards"></mjo-overview-cards>
            </mj-collapsible-panel>
        }
    `,
    styleUrls: ['./document-hero.css'],
})
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:SubscriptionTerms:overview',
    metadata: { entity: 'MJ_BizApps_Orders: Subscription Terms', ...OVERVIEW_META },
})
export class SubscriptionTermOverviewPanel extends BaseFormPanel<mjBizAppsOrdersSubscriptionTermEntity> implements OnInit {
    public Cards: MJOOverviewCard[] = [];

    public async ngOnInit(): Promise<void> {
        if (!this.Record?.IsSaved) return;
        const grants = await LoadOverviewRows<Pick<mjBizAppsOrdersEntitlementGrantEntity, 'Status' | 'BeneficiaryPerson' | 'ValidTo'>>(
            this.FormComponent.ProviderToUse,
            MJO_ENTITIES.EntitlementGrant,
            `SubscriptionTermID='${this.Record.ID}'`,
            ['Status', 'BeneficiaryPerson', 'ValidTo'],
        );
        this.Cards = [
            {
                Title: 'This slice',
                Icon: 'fa-solid fa-scissors',
                Facts: [
                    { Label: 'Start', Value: FormatShortDate(this.Record.StartDate) || '—' },
                    { Label: 'End', Value: FormatShortDate(this.Record.EndDate) || '—' },
                    { Label: 'Amount', Value: FormatMoney(this.Record.Amount) },
                    { Label: 'Prorated', Value: YesNo(this.Record.IsProrated) },
                    { Label: 'Rev-rec', Value: this.Record.RevenueRecognitionType || '—' },
                    { Label: 'Subscription', Value: this.Record.Subscription || '—' },
                ],
            },
            {
                Title: 'Grants tied to this term',
                Icon: 'fa-solid fa-key',
                Headers: ['Beneficiary', 'Valid to', 'Status'],
                Rows: grants.map((g) => [g.BeneficiaryPerson || '—', FormatShortDate(g.ValidTo) || '—', g.Status]),
            },
        ];
        this.FormComponent.cdr.detectChanges();
    }
}

@Component({
    standalone: false,
    selector: 'mjo-stored-value-overview-panel',
    template: `
        @if (Record.IsSaved) {
            <mj-collapsible-panel SectionKey="overview" SectionName="Overview" Icon="fa-solid fa-chart-pie"
                [Form]="FormComponent" [FormContext]="FormContext" [DefaultExpanded]="true">
                <mjo-overview-cards [Cards]="Cards"></mjo-overview-cards>
            </mj-collapsible-panel>
        }
    `,
    styleUrls: ['./document-hero.css'],
})
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:StoredValueAccounts:overview',
    metadata: { entity: 'MJ_BizApps_Orders: Stored Value Accounts', ...OVERVIEW_META },
})
export class StoredValueOverviewPanel extends BaseFormPanel<mjBizAppsOrdersStoredValueAccountEntity> implements OnInit {
    public Cards: MJOOverviewCard[] = [];

    public async ngOnInit(): Promise<void> {
        if (!this.Record?.IsSaved) return;
        const txns = await LoadOverviewRows<Pick<mjBizAppsOrdersStoredValueTransactionEntity, 'TransactionType' | 'Amount' | 'BalanceAfter' | 'OccurredAt'>>(
            this.FormComponent.ProviderToUse,
            MJO_ENTITIES.StoredValueTransaction,
            `StoredValueAccountID='${this.Record.ID}'`,
            ['TransactionType', 'Amount', 'BalanceAfter', 'OccurredAt'],
        );
        this.Cards = [
            {
                Title: 'Ledger',
                Icon: 'fa-solid fa-right-left',
                Headers: ['When', 'Type', 'Amount', 'Balance'],
                Rows: txns.map((t) => [
                    FormatShortDate(t.OccurredAt) || '—',
                    t.TransactionType,
                    FormatMoney(t.Amount),
                    FormatMoney(t.BalanceAfter),
                ]),
            },
            {
                Title: 'Origin',
                Icon: 'fa-solid fa-receipt',
                Facts: [
                    { Label: 'Issuing company', Value: this.Record.IssuingCompany || '—' },
                    { Label: 'Beneficiary', Value: this.Record.BeneficiaryPerson || this.Record.BeneficiaryOrganization || '—' },
                    { Label: 'Expires', Value: this.Record.ExpiresAt ? FormatShortDate(this.Record.ExpiresAt) : 'Never' },
                    { Label: 'Status', Value: this.Record.Status || '—' },
                ],
            },
        ];
        this.FormComponent.cdr.detectChanges();
    }
}

@Component({
    standalone: false,
    selector: 'mjo-payment-provider-overview-panel',
    template: `
        @if (Record.IsSaved) {
            <mj-collapsible-panel SectionKey="overview" SectionName="Overview" Icon="fa-solid fa-chart-pie"
                [Form]="FormComponent" [FormContext]="FormContext" [DefaultExpanded]="true">
                <mjo-overview-cards [Cards]="Cards"></mjo-overview-cards>
            </mj-collapsible-panel>
        }
    `,
    styleUrls: ['./document-hero.css'],
})
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:PaymentProviders:overview',
    metadata: { entity: 'MJ_BizApps_Orders: Payment Providers', ...OVERVIEW_META },
})
export class PaymentProviderOverviewPanel extends BaseFormPanel<mjBizAppsOrdersPaymentProviderEntity> implements OnInit {
    public Cards: MJOOverviewCard[] = [];

    public async ngOnInit(): Promise<void> {
        if (!this.Record?.IsSaved) return;
        const p = this.FormComponent.ProviderToUse;
        const [payments, intents] = await Promise.all([
            LoadOverviewRows<{ PaymentNumber: string; Amount: number; Status: string }>(
                p, MJO_ENTITIES.PaymentHeader, `PaymentProviderID='${this.Record.ID}'`, ['PaymentNumber', 'Amount', 'Status'],
            ),
            CountOverviewRows(p, MJO_ENTITIES.PaymentIntent, `PaymentProviderID='${this.Record.ID}'`),
        ]);
        this.Cards = [
            {
                Title: 'This account',
                Icon: 'fa-solid fa-shield-halved',
                Facts: [
                    { Label: 'Type', Value: this.Record.PaymentProviderType || '—' },
                    { Label: 'Mode', Value: this.Record.IsLiveMode ? 'Live' : 'Test' },
                    { Label: 'Company', Value: this.Record.Company || '—' },
                    { Label: 'Active', Value: YesNo(this.Record.IsActive) },
                ],
            },
            {
                Title: 'Recent charges',
                Icon: 'fa-solid fa-building-columns',
                Headers: ['Payment', 'Amount', 'Status'],
                Rows: payments.map((row) => [row.PaymentNumber, FormatMoney(row.Amount), row.Status]),
            },
            {
                Title: 'Open intents',
                Icon: 'fa-solid fa-hourglass-half',
                Span: 2,
                Note: 'An abandoned intent leaves no payment behind. Intents age out without writing a header.',
                Facts: [{ Label: 'Intents on this provider', Value: String(intents) }],
            },
        ];
        this.FormComponent.cdr.detectChanges();
    }
}

@Component({
    standalone: false,
    selector: 'mjo-payment-type-overview-panel',
    template: `
        @if (Record.IsSaved) {
            <mj-collapsible-panel SectionKey="overview" SectionName="Overview" Icon="fa-solid fa-chart-pie"
                [Form]="FormComponent" [FormContext]="FormContext" [DefaultExpanded]="true">
                <mjo-overview-cards [Cards]="Cards"></mjo-overview-cards>
            </mj-collapsible-panel>
        }
    `,
    styleUrls: ['./document-hero.css'],
})
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:PaymentTypes:overview',
    metadata: { entity: 'MJ_BizApps_Orders: Payment Types', ...OVERVIEW_META },
})
export class PaymentTypeOverviewPanel extends BaseFormPanel<mjBizAppsOrdersPaymentTypeEntity> implements OnInit {
    public Cards: MJOOverviewCard[] = [];

    public async ngOnInit(): Promise<void> {
        if (!this.Record?.IsSaved) return;
        const used = await CountOverviewRows(
            this.FormComponent.ProviderToUse,
            MJO_ENTITIES.PaymentHeader,
            `PaymentTypeID='${this.Record.ID}'`,
        );
        this.Cards = [
            {
                Title: 'What this type demands',
                Icon: 'fa-solid fa-list-check',
                Facts: [
                    { Label: 'Is reversal', Value: YesNo(this.Record.IsReversal) },
                    { Label: 'Requires provider', Value: YesNo(this.Record.RequiresProvider) },
                    { Label: 'Requires instrument', Value: YesNo(this.Record.RequiresInstrument) },
                    { Label: 'Requires reference', Value: YesNo(this.Record.RequiresReference) },
                    { Label: 'Fee booked inline', Value: YesNo(this.Record.BookProcessingFeeInline) },
                    { Label: 'Detail extension', Value: this.Record.DetailExtensionEntity || '—' },
                ],
            },
            {
                Title: 'Volume',
                Icon: 'fa-solid fa-chart-column',
                Facts: [{ Label: 'Payments of this type', Value: String(used) }],
                Note: this.Record.Description || undefined,
            },
        ];
        this.FormComponent.cdr.detectChanges();
    }
}
