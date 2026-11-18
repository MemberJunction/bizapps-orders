/**
 * Discard puts a saved line's edit back on screen (golive #393). `BaseEntity.Revert` reverts the
 * header's own fields only; the order's `Revert` also reverts each saved line that changed, and the
 * line's IS-A child.
 */
import { describe, expect, it, vi } from 'vitest';
import { OrderHeaderEntity } from '../OrderHeaderEntity.js';

function header(lines: unknown[]) {
    const h = Object.create(OrderHeaderEntity.prototype) as OrderHeaderEntity;
    Object.defineProperty(h, 'Lines', { value: { Items: lines } });
    // The header itself is clean, so `BaseEntity.Revert` has no field of its own to put back.
    Object.defineProperty(h, 'Dirty', { value: false });
    Object.defineProperty(h, 'discardJSONFieldObjects', { value: () => undefined });
    return h;
}

describe('OrderHeaderEntity.Revert', () => {
    it('reverts a saved line that changed, and its IS-A child', () => {
        const child = { Revert: vi.fn() };
        const line = { IsSaved: true, Dirty: true, Revert: vi.fn(), ISAChild: child };
        expect(header([line]).Revert()).toBe(true);
        expect(line.Revert).toHaveBeenCalledTimes(1);
        expect(child.Revert).toHaveBeenCalledTimes(1);
    });

    it('leaves a clean saved line and an unsaved line alone', () => {
        const clean = { IsSaved: true, Dirty: false, Revert: vi.fn(), ISAChild: null };
        const added = { IsSaved: false, Dirty: true, Revert: vi.fn(), ISAChild: null };
        header([clean, added]).Revert();
        expect(clean.Revert).not.toHaveBeenCalled();
        expect(added.Revert).not.toHaveBeenCalled();
    });
});
