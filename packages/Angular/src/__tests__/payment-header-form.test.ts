import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { BaseFormComponent, BaseFormPanel } from '@memberjunction/ng-base-forms';
import type { mjBizAppsOrdersPaymentHeaderEntity } from '@mj-biz-apps/orders-entities';
import { mjBizAppsOrdersPaymentHeaderFormComponent } from '../lib/generated/Entities/mjBizAppsOrdersPaymentHeader/mjbizappsorderspaymentheader.form.component';
import { BizAppsPaymentHeaderFormComponent } from '../lib/custom/PaymentHeader/payment-header-form.component';
import { PaymentHeaderPanel } from '../lib/form-panels/payment-header.panel';
import '../public-api';

describe('BizAppsPaymentHeaderFormComponent Custom Form Registration & Getters', () => {
    it('subclasses the generated mjBizAppsOrdersPaymentHeaderFormComponent', () => {
        expect(BizAppsPaymentHeaderFormComponent.prototype instanceof mjBizAppsOrdersPaymentHeaderFormComponent).toBe(true);
    });

    it('leaves the generated Payment Header form as the registered form', () => {
        const activeReg = MJGlobal.Instance.ClassFactory.GetRegistration(
            BaseFormComponent,
            'MJ_BizApps_Orders: Payment Headers'
        );
        expect(activeReg?.SubClass).toBe(mjBizAppsOrdersPaymentHeaderFormComponent);
        const customReg = MJGlobal.Instance.ClassFactory.GetAllRegistrations(
            BaseFormComponent,
            'MJ_BizApps_Orders: Payment Headers'
        ).find(r => r.SubClass === BizAppsPaymentHeaderFormComponent);
        expect(customReg).toBeUndefined();
    });

    it('registers the identity header as a form contribution', () => {
        const regs = MJGlobal.Instance.ClassFactory.GetAllRegistrations(BaseFormPanel);
        expect(regs.some(r => r.SubClass === PaymentHeaderPanel)).toBe(true);
    });

    it('computes tender-tailored avatar icons accurately', () => {
        const instance = Object.create(BizAppsPaymentHeaderFormComponent.prototype) as BizAppsPaymentHeaderFormComponent;

        // Card
        instance.record = { PaymentType: 'Credit Card', ReversesPaymentHeaderID: null, Amount: 100 } as unknown as mjBizAppsOrdersPaymentHeaderEntity;
        expect(instance.PaymentAvatarIcon).toBe('fa-solid fa-credit-card');

        // Check
        instance.record = { PaymentType: 'Check', ReversesPaymentHeaderID: null, Amount: 100 } as unknown as mjBizAppsOrdersPaymentHeaderEntity;
        expect(instance.PaymentAvatarIcon).toBe('fa-solid fa-money-check');

        // ACH
        instance.record = { PaymentType: 'ACH', ReversesPaymentHeaderID: null, Amount: 100 } as unknown as mjBizAppsOrdersPaymentHeaderEntity;
        expect(instance.PaymentAvatarIcon).toBe('fa-solid fa-building-columns');

        // Wallet / Stored Value
        instance.record = { PaymentType: 'Account Credit', ReversesPaymentHeaderID: null, Amount: 100 } as unknown as mjBizAppsOrdersPaymentHeaderEntity;
        expect(instance.PaymentAvatarIcon).toBe('fa-solid fa-piggy-bank');

        // Reversal
        instance.record = { PaymentType: 'Credit Card', ReversesPaymentHeaderID: 'pay-orig-123', Amount: -100 } as unknown as mjBizAppsOrdersPaymentHeaderEntity;
        expect(instance.PaymentAvatarIcon).toBe('fa-solid fa-rotate-left');
    });

    it('formats gross amount, fee, and net amount properly', () => {
        const instance = Object.create(BizAppsPaymentHeaderFormComponent.prototype) as BizAppsPaymentHeaderFormComponent;
        instance.record = {
            Amount: 7076.77,
            ProcessingFeeAmount: 145.2,
            NetAmount: 6931.57,
        } as unknown as mjBizAppsOrdersPaymentHeaderEntity;

        expect(instance.FormattedGrossAmount).toBe('$7,076.77');
        expect(instance.FormattedFee).toBe('$145.20');
        expect(instance.FormattedNetAmount).toBe('$6,931.57');
    });

    it('computes settlement status text and status badge classes', () => {
        const instance = Object.create(BizAppsPaymentHeaderFormComponent.prototype) as BizAppsPaymentHeaderFormComponent;
        instance.record = {
            Status: 'Captured',
            BillToOrganization: 'Meridian Association',
        } as unknown as mjBizAppsOrdersPaymentHeaderEntity;

        expect(instance.SettlementStatusText).toContain('Captured');
        expect(instance.StatusBadgeClass).toContain('mjo-status-chip--active');
        expect(instance.PayerDisplayName).toBe('Meridian Association');

        instance.record = {
            Status: 'Pending',
            BillToPerson: 'John Smith',
        } as unknown as mjBizAppsOrdersPaymentHeaderEntity;

        expect(instance.SettlementStatusText).toBe('Pending Capture');
        expect(instance.StatusBadgeClass).toContain('mjo-status-chip--draft');
        expect(instance.PayerDisplayName).toBe('John Smith');

        instance.record = {
            Status: 'Refunded',
            BillToOrganization: 'Acme Corp',
        } as unknown as mjBizAppsOrdersPaymentHeaderEntity;

        expect(instance.SettlementStatusText).toContain('Refunded');
        expect(instance.StatusBadgeClass).toContain('mjo-status-chip--purple');
    });
});
