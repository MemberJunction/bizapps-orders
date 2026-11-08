import { describe, expect, it } from 'vitest';
import {
    ClassifyRenewalPromotionCodes,
    NO_DISCOUNT_ON_RENEWAL,
    RenewalPromotionNote,
    SelectRenewalPromotionCodes,
} from '../RenewalPromotions.js';

describe('SelectRenewalPromotionCodes', () => {
    it('keeps only codes whose promotion carries into renewals, in recorded order', () => {
        expect(
            SelectRenewalPromotionCodes([
                { Code: 'LOYAL20', AppliesToRenewals: true },
                { Code: 'WELCOME10', AppliesToRenewals: false },
                { Code: 'MEMBER5', AppliesToRenewals: true },
            ]),
        ).toEqual(['LOYAL20', 'MEMBER5']);
    });

    it('presents a code once, however many adjustment rows recorded it, ignoring case', () => {
        expect(
            SelectRenewalPromotionCodes([
                { Code: 'LOYAL20', AppliesToRenewals: true },
                { Code: 'loyal20', AppliesToRenewals: true },
                { Code: ' LOYAL20 ', AppliesToRenewals: true },
            ]),
        ).toEqual(['LOYAL20']);
    });

    it('returns nothing when no code is flagged or none was recorded', () => {
        expect(SelectRenewalPromotionCodes([{ Code: 'WELCOME10', AppliesToRenewals: false }])).toEqual([]);
        expect(SelectRenewalPromotionCodes([])).toEqual([]);
    });

    it('skips blank codes', () => {
        expect(SelectRenewalPromotionCodes([{ Code: '  ', AppliesToRenewals: true }])).toEqual([]);
    });
});

describe('ClassifyRenewalPromotionCodes', () => {
    it('reports a code the engine discounted as applied', () => {
        expect(ClassifyRenewalPromotionCodes(['LOYAL20'], [], ['LOYAL20'])).toEqual({ Applied: ['LOYAL20'], Unusable: [] });
    });

    it("reports the engine's reason for a code it refused", () => {
        expect(
            ClassifyRenewalPromotionCodes(['LOYAL20'], [{ Code: 'loyal20', Reason: 'the promotion is not currently running' }], []),
        ).toEqual({ Applied: [], Unusable: [{ Code: 'LOYAL20', Reason: 'the promotion is not currently running' }] });
    });

    it('reports a code the engine accepted but that discounted nothing', () => {
        expect(ClassifyRenewalPromotionCodes(['LOYAL20'], [], [])).toEqual({
            Applied: [],
            Unusable: [{ Code: 'LOYAL20', Reason: NO_DISCOUNT_ON_RENEWAL }],
        });
    });

    it("prefers the engine's reason over the applied list when both name a code", () => {
        const outcome = ClassifyRenewalPromotionCodes(['LOYAL20'], [{ Code: 'LOYAL20', Reason: 'the code is Expired' }], ['LOYAL20']);
        expect(outcome.Applied).toEqual([]);
        expect(outcome.Unusable).toEqual([{ Code: 'LOYAL20', Reason: 'the code is Expired' }]);
    });

    it('sorts a mix and keeps the presented order and spelling', () => {
        expect(
            ClassifyRenewalPromotionCodes(
                ['LOYAL20', 'PAUSED15', 'TARGETED5'],
                [{ Code: 'PAUSED15', Reason: 'the promotion is not currently running' }],
                ['loyal20'],
            ),
        ).toEqual({
            Applied: ['LOYAL20'],
            Unusable: [
                { Code: 'PAUSED15', Reason: 'the promotion is not currently running' },
                { Code: 'TARGETED5', Reason: NO_DISCOUNT_ON_RENEWAL },
            ],
        });
    });

    it('ignores engine verdicts on codes it was not given', () => {
        expect(ClassifyRenewalPromotionCodes(['LOYAL20'], [{ Code: 'OTHER', Reason: 'no such code' }], ['LOYAL20'])).toEqual({
            Applied: ['LOYAL20'],
            Unusable: [],
        });
    });
});

describe('RenewalPromotionNote', () => {
    it('is empty when nothing was presented', () => {
        expect(RenewalPromotionNote({ Applied: [], Unusable: [] })).toBe('');
    });

    it('names what carried and what did not, with the reason', () => {
        expect(
            RenewalPromotionNote({
                Applied: ['LOYAL20'],
                Unusable: [{ Code: 'PAUSED15', Reason: 'the promotion is not currently running' }],
            }),
        ).toBe('Promotion LOYAL20 carried into this renewal. Promotion PAUSED15 not applied: the promotion is not currently running.');
    });
});
