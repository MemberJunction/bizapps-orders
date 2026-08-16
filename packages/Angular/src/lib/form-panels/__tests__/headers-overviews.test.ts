import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import '../../../public-api';
import { ProductTypeHeaderPanel, ChargeTypeHeaderPanel, PaymentTypeHeaderPanel } from '../lookup-headers.panels';
import { ProductTypeOverviewPanel, ProductOverviewPanel } from '../catalog-overviews.panels';
import { PriceListOverviewPanel, PromotionOverviewPanel } from '../commercial-overviews.panels';
import { PaymentOverviewPanel, SubscriptionOverviewPanel } from '../document-overviews.panels';
import { ActiveChipLabel, FormatPercentFraction, YesNo } from '../document-form.helpers';

describe('Orders header + overview contributions', () => {
    it('registers identity headers for catalogue and pay-config entities', () => {
        const regs = MJGlobal.Instance.ClassFactory.GetAllRegistrations(BaseFormPanel);
        expect(regs.some((r) => r.SubClass === ProductTypeHeaderPanel)).toBe(true);
        expect(regs.some((r) => r.SubClass === ChargeTypeHeaderPanel)).toBe(true);
        expect(regs.some((r) => r.SubClass === PaymentTypeHeaderPanel)).toBe(true);
    });

    it('registers Overview as a Primary contribution on the major entities', () => {
        const regs = MJGlobal.Instance.ClassFactory.GetAllRegistrations(BaseFormPanel);
        expect(regs.some((r) => r.SubClass === ProductTypeOverviewPanel)).toBe(true);
        expect(regs.some((r) => r.SubClass === ProductOverviewPanel)).toBe(true);
        expect(regs.some((r) => r.SubClass === PriceListOverviewPanel)).toBe(true);
        expect(regs.some((r) => r.SubClass === PromotionOverviewPanel)).toBe(true);
        expect(regs.some((r) => r.SubClass === PaymentOverviewPanel)).toBe(true);
        expect(regs.some((r) => r.SubClass === SubscriptionOverviewPanel)).toBe(true);
    });

    it('does not register an Order Header overview in this pass', () => {
        const regs = MJGlobal.Instance.ClassFactory.GetAllRegistrations(BaseFormPanel);
        expect(regs.some((r) => r.Key === 'form-panel:OrderHeaders:overview')).toBe(false);
    });
});

describe('header helper labels', () => {
    it('labels active flags and percent fractions', () => {
        expect(ActiveChipLabel(true)).toBe('Active');
        expect(ActiveChipLabel(false)).toBe('Inactive');
        expect(YesNo(true)).toBe('Yes');
        expect(FormatPercentFraction(0.15)).toBe('15%');
        expect(FormatPercentFraction(null)).toBe('—');
    });
});
