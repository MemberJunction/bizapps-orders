import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { ParseCurrencyInput } from '../lib/custom/currency-input.directive';

describe('ParseCurrencyInput', () => {
    it('reads money as typed, with or without the symbol and separators', () => {
        expect(ParseCurrencyInput('$12,500.00')).toBe(12500);
        expect(ParseCurrencyInput('12500')).toBe(12500);
        expect(ParseCurrencyInput(' 1,250.5 ')).toBe(1250.5);
        expect(ParseCurrencyInput('$0')).toBe(0);
    });

    it('treats an empty or unreadable field as no value', () => {
        expect(ParseCurrencyInput('')).toBeNull();
        expect(ParseCurrencyInput('$')).toBeNull();
        expect(ParseCurrencyInput('abc')).toBeNull();
        expect(ParseCurrencyInput('.')).toBeNull();
    });
});
