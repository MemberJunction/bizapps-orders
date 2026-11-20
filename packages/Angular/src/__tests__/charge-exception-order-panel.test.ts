import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import '../public-api';
import { MJGlobal } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import { ChargeExceptionOrderPanel } from '../lib/form-panels/charge-exception-order.panel';

describe('ChargeExceptionOrderPanel registration (#567)', () => {
    it("contributes to accounting's Finance Exception form, after its fields", () => {
        const reg = MJGlobal.Instance.ClassFactory.GetAllRegistrations(BaseFormPanel).find((r) => r.SubClass === ChargeExceptionOrderPanel);
        expect(reg).toBeDefined();
        expect(reg?.Key).toBe('form-panel:FinanceExceptions:chargeExceptionOrder');
        expect(reg?.Metadata?.['entity']).toBe('MJ_BizApps_Accounting: Finance Exceptions');
        expect(reg?.Metadata?.['slot']).toBe('after-fields');
    });
});
