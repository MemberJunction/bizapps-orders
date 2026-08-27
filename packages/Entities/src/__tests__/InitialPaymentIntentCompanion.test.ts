import { describe, expect, it } from 'vitest';
import { InitialPaymentIntentCompanion } from '../InitialPaymentIntentCompanion.js';

describe('InitialPaymentIntentCompanion', () => {
    it('trims and treats blank as absent', () => {
        const c = new InitialPaymentIntentCompanion({} as never);
        c.Reference = '  abc  ';
        expect(c.Reference).toBe('abc');
        c.Reference = '   ';
        expect(c.Reference).toBeNull();
    });

    it('serializes only when a reference is present', async () => {
        const c = new InitialPaymentIntentCompanion({} as never);
        expect(await c.Serialize()).toBeNull();
        expect(c.Dirty).toBe(false);
        c.Reference = '1001';
        expect(await c.Serialize()).toEqual({ Reference: '1001' });
        expect(c.Dirty).toBe(true);
    });

    it('deserializes a wire payload', async () => {
        const c = new InitialPaymentIntentCompanion({} as never);
        await c.Deserialize({ Reference: 'WT-9' }, 'replace');
        expect(c.Reference).toBe('WT-9');
    });
});
