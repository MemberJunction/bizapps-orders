import { Component } from '@angular/core';
import { RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import type { mjBizAppsOrdersPaymentHeaderEntity } from '@mj-biz-apps/orders-entities';
import {
    IsPaymentReversal,
    PaymentAvatarIcon,
    PaymentMoney,
    PaymentStatusChipClass,
} from './document-form.helpers';

/**
 * Payment Header identity strip (used when custom form is not active).
 */
@Component({
    standalone: false,
    selector: 'mjo-payment-header-panel',
    templateUrl: './payment-header.panel.html',
    styleUrls: ['./document-hero.css'],
})
export class PaymentHeaderPanel extends BaseFormPanel<mjBizAppsOrdersPaymentHeaderEntity> {
    public get Title(): string {
        const number = this.Record.PaymentNumber || 'New payment';
        return `${number} · ${this.Money.Gross}`;
    }

    public get AvatarIcon(): string {
        return PaymentAvatarIcon(this.Record);
    }

    public get IsReversal(): boolean {
        return IsPaymentReversal(this.Record);
    }

    public get StatusClass(): string {
        return PaymentStatusChipClass(this.Record.Status);
    }

    public get Money(): { Gross: string; Fee: string; Net: string } {
        return PaymentMoney(this.Record);
    }

    public get Payer(): string {
        return this.Record.BillToOrganization || this.Record.BillToPerson || '—';
    }
}
