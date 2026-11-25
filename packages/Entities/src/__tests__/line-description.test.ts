import { describe, expect, it } from 'vitest';
import type { mjBizAppsOrdersOrderLineEntity } from '../generated/entities/__mj_BizAppsOrders';
import { NormalizeLineDescription, ORDER_LINE_DESCRIPTION_MAX_LENGTH, SetLineDescription } from '../line-description';

/** A line that counts how often Description is assigned, so a no-op is visible. */
function lineWith(description: string | null): { line: mjBizAppsOrdersOrderLineEntity; writes: () => number } {
    let value = description;
    let writes = 0;
    const stub = {
        get Description(): string | null {
            return value;
        },
        set Description(next: string | null) {
            value = next;
            writes += 1;
        },
    };
    return { line: stub as unknown as mjBizAppsOrdersOrderLineEntity, writes: () => writes };
}

describe('order line description', () => {
    it('stores the trimmed text', () => {
        const { line } = lineWith(null);
        SetLineDescription(line, '  Support, November 2026 ');
        expect(line.Description).toBe('Support, November 2026');
    });

    it('stores blank text as no description', () => {
        const { line } = lineWith('Support');
        SetLineDescription(line, '   ');
        expect(line.Description).toBeNull();
    });

    it('does not write when nothing changed', () => {
        const held = lineWith('Support');
        SetLineDescription(held.line, 'Support ');
        expect(held.writes(), 'the same text with a trailing space').toBe(0);
        const empty = lineWith(null);
        SetLineDescription(empty.line, '   ');
        expect(empty.writes(), 'a blank field on a line with no description').toBe(0);
    });

    it('stores one line: a line break or a run of spaces becomes a single space', () => {
        const { line } = lineWith(null);
        SetLineDescription(line, 'Support,\n  November   2026');
        expect(line.Description).toBe('Support, November 2026');
    });

    it('does not truncate: the input enforces the column length', () => {
        const long = 'x'.repeat(ORDER_LINE_DESCRIPTION_MAX_LENGTH + 10);
        expect(NormalizeLineDescription(long)).toBe(long);
    });
});
