import { describe, expect, it } from 'vitest';
import { ComputePredictivePaymentRiskBand, OrderEntityServer } from '../OrderEntityServer.js';

describe('ComputePredictivePaymentRiskBand', () => {
    it('returns null for null, undefined, or NaN', () => {
        expect(ComputePredictivePaymentRiskBand(null)).toBeNull();
        expect(ComputePredictivePaymentRiskBand(undefined)).toBeNull();
        expect(ComputePredictivePaymentRiskBand(NaN)).toBeNull();
    });

    it('classifies probability < 0.10 as Low', () => {
        expect(ComputePredictivePaymentRiskBand(0)).toBe('Low');
        expect(ComputePredictivePaymentRiskBand(0.05)).toBe('Low');
        expect(ComputePredictivePaymentRiskBand(0.0999)).toBe('Low');
    });

    it('classifies probability between 0.10 and 0.25 as Medium', () => {
        expect(ComputePredictivePaymentRiskBand(0.10)).toBe('Medium');
        expect(ComputePredictivePaymentRiskBand(0.18)).toBe('Medium');
        expect(ComputePredictivePaymentRiskBand(0.2499)).toBe('Medium');
    });

    it('classifies probability between 0.25 and 0.50 as High', () => {
        expect(ComputePredictivePaymentRiskBand(0.25)).toBe('High');
        expect(ComputePredictivePaymentRiskBand(0.35)).toBe('High');
        expect(ComputePredictivePaymentRiskBand(0.4999)).toBe('High');
    });

    it('classifies probability >= 0.50 as Critical', () => {
        expect(ComputePredictivePaymentRiskBand(0.50)).toBe('Critical');
        expect(ComputePredictivePaymentRiskBand(0.75)).toBe('Critical');
        expect(ComputePredictivePaymentRiskBand(1.0)).toBe('Critical');
    });
});

describe('OrderEntityServer.syncPredictivePaymentFieldsPreSave', () => {
    it('synchronizes risk band when probability is set and risk band is missing', () => {
        const mockOrder: {
            PredictedLatePaymentProbability: number | null;
            PredictedPaymentRiskBand: 'Critical' | 'High' | 'Low' | 'Medium' | null;
            GetFieldByName: (name: string) => { Dirty: boolean } | null;
        } = {
            PredictedLatePaymentProbability: 0.35,
            PredictedPaymentRiskBand: null,
            GetFieldByName: () => ({ Dirty: false }),
        };

        OrderEntityServer.prototype.syncPredictivePaymentFieldsPreSave.call(mockOrder);
        expect(mockOrder.PredictedPaymentRiskBand).toBe('High');
    });

    it('synchronizes risk band when probability is dirty even if risk band already exists', () => {
        const mockOrder: {
            PredictedLatePaymentProbability: number | null;
            PredictedPaymentRiskBand: 'Critical' | 'High' | 'Low' | 'Medium' | null;
            GetFieldByName: (name: string) => { Dirty: boolean } | null;
        } = {
            PredictedLatePaymentProbability: 0.65,
            PredictedPaymentRiskBand: 'Low',
            GetFieldByName: () => ({ Dirty: true }),
        };

        OrderEntityServer.prototype.syncPredictivePaymentFieldsPreSave.call(mockOrder);
        expect(mockOrder.PredictedPaymentRiskBand).toBe('Critical');
    });

    it('clears risk band when probability is cleared and dirty', () => {
        const mockOrder: {
            PredictedLatePaymentProbability: number | null;
            PredictedPaymentRiskBand: 'Critical' | 'High' | 'Low' | 'Medium' | null;
            GetFieldByName: (name: string) => { Dirty: boolean } | null;
        } = {
            PredictedLatePaymentProbability: null,
            PredictedPaymentRiskBand: 'High',
            GetFieldByName: () => ({ Dirty: true }),
        };

        OrderEntityServer.prototype.syncPredictivePaymentFieldsPreSave.call(mockOrder);
        expect(mockOrder.PredictedPaymentRiskBand).toBeNull();
    });

    it('leaves risk band alone when probability is not dirty and risk band is present', () => {
        const mockOrder: {
            PredictedLatePaymentProbability: number | null;
            PredictedPaymentRiskBand: 'Critical' | 'High' | 'Low' | 'Medium' | null;
            GetFieldByName: (name: string) => { Dirty: boolean } | null;
        } = {
            PredictedLatePaymentProbability: 0.05,
            PredictedPaymentRiskBand: 'High',
            GetFieldByName: () => ({ Dirty: false }),
        };

        OrderEntityServer.prototype.syncPredictivePaymentFieldsPreSave.call(mockOrder);
        expect(mockOrder.PredictedPaymentRiskBand).toBe('High');
    });
});
