import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import { MJConfirmService } from '@memberjunction/ng-ui-components';
import { OrdersResolveChargeExceptionOperation, type OrdersResolveChargeExceptionOutput } from '@mj-biz-apps/orders-entities';
import type { mjBizAppsAccountingFinanceExceptionEntity } from '@mj-biz-apps/accounting-entities';
import { GetCatalogOptions, SearchCustomers, type MJOCustomerOption, type MJOProductOption } from '../data/orders-queries';
import { FormatMoney } from '../panels/money-format';
import { CanBookChargeAsOrder, CanSubmitBooking, ChargeWithoutPaymentChargeID } from '../panels/charge-exception-view';
import { LoadOverviewRows } from './overview-load';

const FINANCE_EXCEPTION_TYPE_ENTITY = 'MJ_BizApps_Accounting: Finance Exception Types';

/**
 * `mjo-charge-exception-order-panel` — book a charge-without-payment exception as a paid order (#567).
 *
 * WHY THIS EXISTS. Reconciliation raises a gateway charge with nothing in Orders behind it as a finance
 * exception, and `Orders.CreateOrderFromProviderPayment` can book it, but only through the API. A
 * reviewer working the exception had no way to run it. This panel sits on accounting's Finance
 * Exception form, asks for what the charge cannot say (the product and the buyer), and calls
 * `Orders.ResolveChargeException`, which books the order and clears the exception in one call.
 *
 * IT HIDES ITSELF on every other exception: another type, another kind of mismatch, a charge Orders
 * opened itself, or one already cleared. The server checks the same things again.
 *
 * @module @mj-biz-apps/orders-ng
 */
@Component({
    standalone: false,
    selector: 'mjo-charge-exception-order-panel',
    template: `
        @if (Visible) {
            <mj-collapsible-panel
                SectionKey="chargeExceptionOrder"
                SectionName="Book this charge as an order"
                Icon="fa-solid fa-file-invoice-dollar"
                [Form]="FormComponent"
                [FormContext]="FormContext"
                [DefaultExpanded]="true">
                @if (Notice) {
                    <mj-alert [Variant]="Notice.Tone" Icon="fa-solid fa-circle-info" class="mjo-cx__note">{{ Notice.Text }}</mj-alert>
                }
                @if (Result?.Success) {
                    <dl class="mjo-cx__result">
                        <dt>Order</dt><dd class="mono">{{ Result!.OrderNumber }}</dd>
                        <dt>Payment</dt><dd class="mono">{{ Result!.PaymentNumber ?? '—' }}</dd>
                        <dt>Amount</dt><dd class="num">{{ Result!.Amount != null ? money(Result!.Amount!) : '—' }}</dd>
                    </dl>
                } @else {
                    <p class="mjo-cx__lead">
                        Charge <span class="mono">{{ ChargeID }}</span> for {{ AmountText }} has no order in Orders.
                        Name the product and the buyer, and it is booked as a paid order in the payment provider's company.
                        The exception is then cleared as Corrected, with the order and payment in its note.
                    </p>
                    <div class="mjo-cx__fields">
                        <label class="mjo-cx__field">
                            <span>Product</span>
                            <mj-combobox
                                [Data]="Products"
                                TextField="Label"
                                ValueField="ID"
                                [ValuePrimitive]="true"
                                [Filterable]="true"
                                [Disabled]="Busy"
                                Placeholder="Choose the product"
                                (ValueChange)="ProductID = $any($event)">
                            </mj-combobox>
                        </label>
                        <label class="mjo-cx__field">
                            <span>Buyer</span>
                            <mj-combobox
                                [Data]="People"
                                TextField="Label"
                                ValueField="ID"
                                [ValuePrimitive]="true"
                                [Filterable]="true"
                                [Disabled]="Busy"
                                Placeholder="Type two letters of a name or e-mail"
                                (FilterChange)="SearchPeople($event)"
                                (ValueChange)="PersonID = $any($event)">
                            </mj-combobox>
                        </label>
                        <label class="mjo-cx__field">
                            <span>Organization <span class="muted">(optional)</span></span>
                            <mj-combobox
                                [Data]="Organizations"
                                TextField="Label"
                                ValueField="ID"
                                [ValuePrimitive]="true"
                                [Filterable]="true"
                                [Disabled]="Busy"
                                Placeholder="Bill the person's organization"
                                (FilterChange)="SearchOrganizations($event)"
                                (ValueChange)="OrganizationID = $any($event) || null">
                            </mj-combobox>
                        </label>
                    </div>
                    <div class="row mjo-cx__actions">
                        <button type="button" mjButton variant="primary" [disabled]="Busy || !Submittable" (click)="Book()">
                            <i class="fa-solid fa-file-invoice-dollar" aria-hidden="true"></i>
                            {{ Busy ? 'Booking…' : 'Book order and clear exception' }}
                        </button>
                    </div>
                }
            </mj-collapsible-panel>
        }
    `,
    styles: [
        `
            .mjo-cx__note { margin-bottom: var(--mj-space-3); display: block; }
            .mjo-cx__lead { margin: 0 0 var(--mj-space-3); color: var(--mj-color-text-secondary, inherit); }
            .mjo-cx__fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); gap: var(--mj-space-3); margin-bottom: var(--mj-space-3); }
            .mjo-cx__field { display: flex; flex-direction: column; gap: var(--mj-space-1); font-size: 0.85rem; font-weight: 600; }
            .mjo-cx__actions { align-items: center; gap: var(--mj-space-3); }
            .mjo-cx__result { display: grid; grid-template-columns: max-content 1fr; gap: var(--mj-space-1) var(--mj-space-4); margin: 0; }
            .mjo-cx__result dt { color: var(--mj-color-text-muted); }
            .mjo-cx__result dd { margin: 0; }
        `,
    ],
})
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:FinanceExceptions:chargeExceptionOrder',
    metadata: {
        entity: 'MJ_BizApps_Accounting: Finance Exceptions',
        slot: 'after-fields' as const,
        sortKey: 100,
        contributionKey: 'chargeExceptionOrder',
        inclusion: 'Primary' as const,
    },
})
export class ChargeExceptionOrderPanel extends BaseFormPanel<mjBizAppsAccountingFinanceExceptionEntity> implements OnInit {
    private readonly cdr = inject(ChangeDetectorRef);
    private readonly confirm = inject(MJConfirmService);

    public Visible = false;
    public Busy = false;
    public Notice: { Tone: 'success' | 'error' | 'warning'; Text: string } | null = null;
    public Result: OrdersResolveChargeExceptionOutput | null = null;

    public Products: Array<{ ID: string; Label: string }> = [];
    public People: Array<{ ID: string; Label: string }> = [];
    public Organizations: Array<{ ID: string; Label: string }> = [];
    public ProductID: string | null = null;
    public PersonID: string | null = null;
    public OrganizationID: string | null = null;

    public readonly money = (n: number): string => FormatMoney(n);

    public get ChargeID(): string {
        return ChargeWithoutPaymentChargeID(this.Record?.DedupeKey) ?? '';
    }

    public get AmountText(): string {
        return this.Record?.Amount != null ? FormatMoney(Number(this.Record.Amount)) : 'an unstated amount';
    }

    public get Submittable(): boolean {
        return CanSubmitBooking(this.ProductID, this.PersonID);
    }

    public async ngOnInit(): Promise<void> {
        this.Visible = CanBookChargeAsOrder(this.Record, await this.loadTypeCode());
        if (this.Visible) {
            this.Products = (await GetCatalogOptions()).map((p) => ({ ID: p.ID, Label: productLabel(p) }));
        }
        this.cdr.detectChanges();
    }

    public async SearchPeople(text: string): Promise<void> {
        this.People = (await SearchCustomers(text)).filter((c) => !c.IsOrganization).map(partyOption);
        this.cdr.detectChanges();
    }

    public async SearchOrganizations(text: string): Promise<void> {
        this.Organizations = (await SearchCustomers(text)).filter((c) => c.IsOrganization).map(partyOption);
        this.cdr.detectChanges();
    }

    /** Books the order and clears the exception. Asks first: it writes an order, a payment and the ledger. */
    public async Book(): Promise<void> {
        if (this.Busy || !this.Submittable) return;
        const proceed = await this.confirm.Confirm({
            title: `Book charge ${this.ChargeID} as an order?`,
            message: `A paid order for ${this.AmountText} is created and confirmed, and the charge is captured against it.`,
            detail: 'The order and the payment post to the ledger, and this exception is cleared as Corrected.',
            type: 'warning',
            confirmText: 'Book it',
            cancelText: 'Not yet',
        });
        if (!proceed) return;

        this.Busy = true;
        this.Notice = null;
        this.cdr.detectChanges();
        try {
            const result = await new OrdersResolveChargeExceptionOperation().Execute({
                FinanceExceptionID: this.Record.ID,
                ProductID: this.ProductID!,
                BillToPersonID: this.PersonID!,
                BillToOrganizationID: this.OrganizationID,
            });
            const out = result.Output;
            if (!result.Success || !out?.Success) {
                this.Notice = {
                    Tone: out?.Code === 'ClearRefused' ? 'warning' : 'error',
                    Text: out?.Message?.trim() || result.ErrorMessage?.trim() || 'The charge could not be booked.',
                };
                return;
            }
            this.Result = out;
            this.Notice = { Tone: 'success', Text: out.Message };
            // The exception is now Corrected: reload so the form shows its status and note.
            await this.Record.Load(this.Record.ID);
        } finally {
            this.Busy = false;
            this.cdr.detectChanges();
        }
    }

    /** The exception type's Code. The record carries only the type's name. */
    private async loadTypeCode(): Promise<string | null> {
        if (!this.Record?.FinanceExceptionTypeID) return null;
        const rows = await LoadOverviewRows<{ Code: string }>(
            this.FormComponent.ProviderToUse,
            FINANCE_EXCEPTION_TYPE_ENTITY,
            `ID='${this.Record.FinanceExceptionTypeID}'`,
            ['Code'],
            1,
        );
        return rows[0]?.Code ?? null;
    }
}

function productLabel(p: MJOProductOption): string {
    return p.SKU ? `${p.Name} (${p.SKU})` : p.Name;
}

function partyOption(c: MJOCustomerOption): { ID: string; Label: string } {
    return { ID: c.ID, Label: c.Email ? `${c.Name} · ${c.Email}` : c.Name };
}
