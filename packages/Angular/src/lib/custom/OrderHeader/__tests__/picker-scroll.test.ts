import { describe, expect, it, vi } from 'vitest';
import { ScrollPickerCursorIntoView } from '../picker-scroll';

describe('ScrollPickerCursorIntoView (#796)', () => {
    it('scrolls the highlighted row into view with the smallest movement', () => {
        const scrollIntoView = vi.fn();
        const querySelector = vi.fn().mockReturnValue({ scrollIntoView });
        ScrollPickerCursorIntoView({ querySelector } as unknown as ParentNode);
        expect(querySelector).toHaveBeenCalledWith('.mj-typeahead-item.is-cursor');
        expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
    });

    it('does nothing when the list is not rendered', () => {
        const querySelector = vi.fn().mockReturnValue(null);
        expect(() => ScrollPickerCursorIntoView({ querySelector } as unknown as ParentNode)).not.toThrow();
        expect(() => ScrollPickerCursorIntoView(undefined)).not.toThrow();
    });
});
