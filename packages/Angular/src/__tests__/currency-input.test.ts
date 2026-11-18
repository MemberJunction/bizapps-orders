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
        expect(ParseCurrencyInput('-')).toBeNull();
    });

    it('reads a minus sign or accounting parentheses as negative', () => {
        expect(ParseCurrencyInput('(1,250.00)')).toBe(-1250);
        expect(ParseCurrencyInput('-$5')).toBe(-5);
        expect(ParseCurrencyInput('$-5')).toBe(-5);
        expect(ParseCurrencyInput('($5)')).toBe(-5);
    });

    it('refuses input with stray characters or foreign separators instead of guessing', () => {
        expect(ParseCurrencyInput('12k')).toBeNull();
        expect(ParseCurrencyInput('1.250,00')).toBeNull();
        expect(ParseCurrencyInput('1,25')).toBeNull();
        expect(ParseCurrencyInput('12 500')).toBeNull();
        expect(ParseCurrencyInput('1.2.3')).toBeNull();
        expect(ParseCurrencyInput('USD 12')).toBeNull();
    });

    it('accepts the partial forms someone types through', () => {
        expect(ParseCurrencyInput('12.')).toBe(12);
        expect(ParseCurrencyInput('.5')).toBe(0.5);
        expect(ParseCurrencyInput('1,250,000')).toBe(1_250_000);
    });
});
