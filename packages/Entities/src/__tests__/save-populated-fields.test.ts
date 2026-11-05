import { describe, expect, it } from 'vitest';
import { DocumentNumberingEngine, EntityInfo } from '@memberjunction/core';
import {
    IsSavePopulatedFieldError,
    ORDER_NUMBER_POLICY,
    PAYMENT_NUMBER_POLICY,
    SUBSCRIPTION_NUMBER_POLICY,
    registerOrdersDocumentNumberingPolicies,
} from '../save-populated-fields.js';

describe('IsSavePopulatedFieldError', () => {
    const noneSaved = () => false;
    const allSaved = () => true;

    it('drops OrderNumber, SubscriptionNumber, and PaymentNumber on a new header', () => {
        expect(IsSavePopulatedFieldError('OrderNumber', false, noneSaved)).toBe(true);
        expect(IsSavePopulatedFieldError('SubscriptionNumber', false, noneSaved)).toBe(true);
        expect(IsSavePopulatedFieldError('PaymentNumber', false, noneSaved)).toBe(true);
    });

    it('keeps OrderNumber, SubscriptionNumber, and PaymentNumber once the header is saved', () => {
        expect(IsSavePopulatedFieldError('OrderNumber', true, noneSaved)).toBe(false);
        expect(IsSavePopulatedFieldError('SubscriptionNumber', true, noneSaved)).toBe(false);
        expect(IsSavePopulatedFieldError('PaymentNumber', true, noneSaved)).toBe(false);
    });

    it('registers OrderNumber, SubscriptionNumber, and PaymentNumber on DocumentNumberingEngine', () => {
        registerOrdersDocumentNumberingPolicies();
        const orderInfo = new EntityInfo({ Name: 'MJ_BizApps_Orders: Order Headers' });
        const subInfo = new EntityInfo({ Name: 'MJ_BizApps_Orders: Subscriptions' });
        const paymentInfo = new EntityInfo({ Name: 'MJ_BizApps_Orders: Payment Headers' });

        expect(DocumentNumberingEngine.Instance.ResolvePolicies(orderInfo)).toEqual([ORDER_NUMBER_POLICY]);
        expect(DocumentNumberingEngine.Instance.ResolvePolicies(subInfo)).toEqual([SUBSCRIPTION_NUMBER_POLICY]);
        expect(DocumentNumberingEngine.Instance.ResolvePolicies(paymentInfo)).toEqual([PAYMENT_NUMBER_POLICY]);

        expect(DocumentNumberingEngine.Instance.WillAutoPopulateOnCreate(orderInfo, 'OrderNumber')).toBe(true);
        expect(DocumentNumberingEngine.Instance.WillAutoPopulateOnCreate(subInfo, 'SubscriptionNumber')).toBe(true);
        expect(DocumentNumberingEngine.Instance.WillAutoPopulateOnCreate(paymentInfo, 'PaymentNumber')).toBe(true);
    });

    it('delegates to DocumentNumberingEngine when custom headerEntityInfo policy is registered', () => {
        const customEntityInfo = new EntityInfo({ Name: 'MJ_BizApps_Orders: Custom Document' });
        DocumentNumberingEngine.Instance.RegisterPolicy('MJ_BizApps_Orders: Custom Document', {
            targetField: 'CustomDocumentNumber',
            pattern: 'DOC-{SEQ:6}',
        });
        expect(IsSavePopulatedFieldError('CustomDocumentNumber', false, noneSaved, customEntityInfo)).toBe(true);
        expect(IsSavePopulatedFieldError('CustomDocumentNumber', true, noneSaved, customEntityInfo)).toBe(false);
        DocumentNumberingEngine.Instance.UnregisterPolicy('MJ_BizApps_Orders: Custom Document');
    });

    it('drops UnitPrice / CompanyID / LineNumber on a new line', () => {
        expect(IsSavePopulatedFieldError('Lines[0].UnitPrice', false, noneSaved)).toBe(true);
        expect(IsSavePopulatedFieldError('Lines[2].CompanyID', true, noneSaved)).toBe(true);
        expect(IsSavePopulatedFieldError('Lines[1].LineNumber', false, noneSaved)).toBe(true);
    });

    it('keeps those line fields once that line is saved', () => {
        expect(IsSavePopulatedFieldError('Lines[0].UnitPrice', false, allSaved)).toBe(false);
        expect(IsSavePopulatedFieldError('Lines[0].CompanyID', true, allSaved)).toBe(false);
    });

    it('never drops a field the user actually authors', () => {
        expect(IsSavePopulatedFieldError('Quantity', false, noneSaved)).toBe(false);
        expect(IsSavePopulatedFieldError('Lines[0].Quantity', false, noneSaved)).toBe(false);
        expect(IsSavePopulatedFieldError('BillToOrganizationID', false, noneSaved)).toBe(false);
        expect(IsSavePopulatedFieldError('CompanyID', false, noneSaved)).toBe(false);
    });
});
