import { describe, expect, it } from 'vitest';
import { IsSavePopulatedFieldError } from '../save-populated-fields.js';

describe('IsSavePopulatedFieldError', () => {
    const noneSaved = () => false;
    const allSaved = () => true;

    it('drops OrderNumber and PaymentNumber on a new header', () => {
        expect(IsSavePopulatedFieldError('OrderNumber', false, noneSaved)).toBe(true);
        expect(IsSavePopulatedFieldError('PaymentNumber', false, noneSaved)).toBe(true);
    });

    it('keeps OrderNumber and PaymentNumber once the header is saved', () => {
        expect(IsSavePopulatedFieldError('OrderNumber', true, noneSaved)).toBe(false);
        expect(IsSavePopulatedFieldError('PaymentNumber', true, noneSaved)).toBe(false);
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
